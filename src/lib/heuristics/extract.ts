// Deterministic EN/RU chat heuristics (trucking). Used by the offline mock provider and by
// the timestamp confirmation of eta_not_forwarded. Pure functions only.
import type { TaskKind } from "@/lib/db/schema";
import { atLocalTime, localParts, zonedToUtc } from "@/lib/time";

// ── refs, trucks, lanes ────────────────────────────────────────────────────

/** Load / PO / invoice numbers: 48230, S-5512, BR-2291, 7781. */
export function extractRefs(text: string): string[] {
  const out: string[] = [];
  const re = /(?<![\d$,.:\w-])((?:[A-Z]{1,3}-)?\d{4,6})(?![\d:]|\s?(?:lbs|k\b))/g;
  for (const m of text.matchAll(re)) out.push(m[1]!);
  return [...new Set(out)];
}

/** Truck unit numbers: "truck 214", "трак 214", "#214", "118-й", "траки 402 и 415". */
export function extractTrucks(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(
    /(?:truck|трак\p{L}*|тягач\p{L}*|unit)\s*#?\s*(\d{2,4})(?:\s*(?:и|and|&)\s*#?(\d{2,4}))?/giu,
  )) {
    out.push(m[1]!);
    if (m[2]) out.push(m[2]);
  }
  for (const m of text.matchAll(/(?<![\w-])(\d{3})-?(?:й|ый|ой)(?!\p{L})/gu)) out.push(m[1]!);
  for (const m of text.matchAll(/(?<![\w$])#(\d{3})(?!\d)/g)) out.push(m[1]!);
  return [...new Set(out)];
}

export type Lane = { from: string; to: string };

const US_STATES =
  "AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY";
const CITY = String.raw`[A-ZА-ЯЁ][\p{Ll}.]+(?: [A-ZА-ЯЁ][\p{Ll}.]+)?(?:,? (?:${US_STATES})\b)?`;

export function extractLane(text: string): Lane | null {
  const arrow = new RegExp(String.raw`(${CITY})\s*(?:→|->|—>|=>|–>)\s*(${CITY})`, "u").exec(text);
  const m =
    arrow ??
    new RegExp(
      String.raw`\b(?:from|out of) (?:our )?(${CITY})(?: \p{Ll}+)?,? (?:going |headed |heading |delivering )?to (${CITY})`,
      "u",
    ).exec(text) ??
    new RegExp(String.raw`(?<!\p{L})из (${CITY}) (?:в|до) (${CITY})`, "u").exec(text) ??
    new RegExp(String.raw`\b(${CITY}) to (${CITY})\b`, "u").exec(text);
  if (!m) return null;
  const clean = (s: string) => s.replace(/[.,]$/, "").trim();
  const from = clean(m[1]!);
  const to = clean(m[2]!);
  if (/^(PU|DEL|Load|Need|Hi|Hey|Also|Нужен|Нужна|Есть)$/i.test(from.split(" ")[0]!)) return null;
  return { from, to };
}

export function laneText(l: Lane): string {
  return `${l.from} → ${l.to}`;
}

// Cross-script city matching ("Даллас" ≈ "Dallas", "Мемфис" ≈ "Memphis").
const TRANSLIT: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

export function translit(s: string): string {
  return Array.from(s.toLowerCase())
    .map((c) => TRANSLIT[c] ?? c)
    .join("");
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]!;
      dp[j] = Math.min(dp[j]! + 1, dp[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length]!;
}

/** Does `text` mention `city` in any script (including Russian case endings)? */
export function mentionsCity(text: string, city: string): boolean {
  const target = translit(city.replace(/,? [A-Z]{2}$/, "").split(" ")[0]!);
  if (target.length < 4) return false;
  for (const word of text.split(/[^\p{L}]+/u)) {
    if (word.length < 4) continue;
    const w = translit(word);
    if (w === target) return true;
    // Russian case endings: "Далласе", "Мемфисе", "Нэшвилле".
    const stem = w.replace(/(e|a|u|om|oy|y|i)$/, "");
    if (levenshtein(stem, target) <= 2 || levenshtein(w, target) <= 2) return true;
  }
  return false;
}

export function equipmentOf(text: string): "reefer" | "dry van" | "flatbed" | null {
  if (/\breefer|\bреф/i.test(text)) return "reefer";
  if (/dry ?van|\bvans?\b|(?<!\p{L})фур[аыу]/iu.test(text)) return "dry van";
  if (/flat ?bed|(?<!\p{L})площадк/iu.test(text)) return "flatbed";
  return null;
}

// ── times ──────────────────────────────────────────────────────────────────

const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  воскресенье: 0,
  понедельник: 1,
  вторник: 2,
  среду: 3,
  среда: 3,
  четверг: 4,
  пятницу: 5,
  пятница: 5,
  субботу: 6,
  суббота: 6,
};

/** Day offset implied by the text relative to the message day. */
function dayOffset(text: string, base: Date, tz: string): number {
  const t = text.toLowerCase();
  if (/\btomorrow\b|завтра/.test(t)) return 1;
  for (const [name, wd] of Object.entries(WEEKDAYS)) {
    if (new RegExp(`(?<!\\p{L})${name}(?!\\p{L})`, "u").test(t)) {
      const today = localParts(base, tz).weekday;
      const diff = (wd - today + 7) % 7;
      return diff === 0 ? 7 : diff;
    }
  }
  return 0;
}

export type FoundTime = { at: Date; raw: string; index: number };

/** Clock times in the text, anchored to the message's local day (+ tomorrow/weekday). */
export function extractTimes(text: string, base: Date, tz: string): FoundTime[] {
  const found: FoundTime[] = [];
  const offset = dayOffset(text, base, tz);
  const push = (h: number, min: number, raw: string, index: number) => {
    if (h > 23 || min > 59) return;
    found.push({ at: atLocalTime(base, tz, offset, h, min), raw, index });
  };
  for (const m of text.matchAll(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)(?![a-z])/gi)) {
    let h = Number(m[1]);
    const pm = /^p/i.test(m[3]!);
    if (pm && h < 12) h += 12;
    if (!pm && h === 12) h = 0;
    push(h, Number(m[2] ?? 0), m[0], m.index ?? 0);
  }
  for (const m of text.matchAll(
    /(?<![\d:$.,])([01]?\d|2[0-3]):([0-5]\d)(?!\s*(?:am|pm|a\.m|p\.m))/gi,
  )) {
    push(Number(m[1]), Number(m[2]), m[0], m.index ?? 0);
  }
  // Russian "к 8", "на 8 утра", "в 7 вечера"
  for (const m of text.matchAll(
    /(?<!\p{L})(?:к|на|в|до)\s+(\d{1,2})(?:\s+(утра|вечера|дня))?(?![\d:])/giu,
  )) {
    let h = Number(m[1]);
    if (m[2] && /вечера|дня/i.test(m[2]) && h < 12) h += 12;
    if (
      !m[2] &&
      !/утра|вечер|будет|буд|к \d/i.test(text.slice(m.index ?? 0, (m.index ?? 0) + 20)) &&
      !/^к/i.test(m[0])
    )
      continue;
    push(h, 0, m[0], m.index ?? 0);
  }
  return found.sort((a, b) => a.index - b.index);
}

/** A promised deadline in an employee message ("POD by 3pm", "within the hour"). */
export function parseDeadline(text: string, base: Date, tz: string): Date | null {
  const t = text.toLowerCase();
  const plus = (min: number) => new Date(base.getTime() + min * 60_000);
  let m =
    /within\s+(\d+)\s*(?:min|minutes|mins)\b/.exec(t) ??
    /\bin\s+(\d+)\s*(?:min|minutes|mins)\b/.exec(t);
  if (m) return plus(Number(m[1]));
  m = /within\s+(\d+)\s*(?:h|hr|hrs|hours?)\b/.exec(t);
  if (m) return plus(Number(m[1]) * 60);
  if (/within\s+(?:the|an|1)\s+hour|в течение часа|через час/.test(t)) return plus(60);
  m = /через\s+(\d+)\s*мин/.exec(t);
  if (m) return plus(Number(m[1]));
  if (/\bby\s+(?:end of (?:the )?day|eod|cob)\b|до конца дня/.test(t)) {
    return atLocalTime(base, tz, dayOffset(text, base, tz), 17, 0);
  }
  if (/tomorrow morning|завтра утром/.test(t) && !/\d/.test(t))
    return atLocalTime(base, tz, 1, 9, 0);
  const promise =
    /\b(?:by|before|until)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?)|(?:до|к)\s+(\d{1,2}:\d{2})/i.exec(
      text,
    );
  if (promise) {
    const times = extractTimes(promise[0]!, base, tz);
    if (times.length) {
      const offset = dayOffset(text, base, tz);
      const p = localParts(times[0]!.at, tz);
      return atLocalTime(base, tz, offset, p.h, p.min);
    }
  }
  return null;
}

// ── intents ────────────────────────────────────────────────────────────────

export type RequestMatch = { kind: TaskKind; equipment: ReturnType<typeof equipmentOf> };

const ASK =
  /\?|\b(need|needs|can you|could you|can we|could we|please|pls|plz|send|looking for|have a|any chance|want|do you have|interested)\b|(?<!\p{L})(нужен|нужна|нужно|нужны|скиньте|пришлите|отправьте|можете|сможете|подскажите|пожалуйста|возьм[её]те|закроете)(?!\p{L})/iu;

/** Customer message that opens a task (or follows up on one). */
export function detectRequest(text: string): RequestMatch | null {
  const eq = equipmentOf(text);
  const hasRef = extractRefs(text).length > 0;
  if (
    (/\b(eta|where is|where's|status on|update on|updates on|check call|tracking|location of|how far (?:out|away))\b/i.test(
      text,
    ) ||
      /\bwhen will\b.{0,40}\b(deliver|arrive|get (?:there|in)|pick ?up|be (?:there|delivered|unloaded))/i.test(text) ||
      /\b(still on (?:time|schedule)|running late)\b/i.test(text) ||
      /(?<!\p{L})(где (?:сейчас )?(?:трак|машина|водитель|груз)|когда (?:будет|приедет|доедет|доставит|выгруз)|во сколько (?:будет|приедет))/iu.test(
        text,
      )) &&
    ASK.test(text) &&
    (hasRef || /\bload\b|\btruck\b|(?<!\p{L})(груз|трак)/iu.test(text))
  )
    return { kind: "eta_update", equipment: eq };
  if (
    /\b(pod|bol|proof of delivery|bill of lading|paperwork|signed (?:docs|documents))\b|(?<!\p{L})(документ|накладн)/iu.test(
      text,
    ) &&
    ASK.test(text)
  )
    return { kind: "pod_bol", equipment: eq };
  if (
    /\b(detention|lumper|layover)\b|(?:waited|sat|held)\b.{0,30}\b\d+\s*(?:hrs?|hours)|(?<!\p{L})(простой|простоял|детеншн|ждал \d+ час)/iu.test(
      text,
    )
  )
    return { kind: "detention", equipment: eq };
  if (
    /\b(invoice|overcharg|short.?paid)\b|(?<!\p{L})(инвойс|сч[её]т)/iu.test(text) &&
    /\b(fix|wrong|incorrect|shows|resend|correct|dispute|missing|says)\b|(?<!\p{L})(исправ|неверн|ошиб|не та сумма)/iu.test(
      text,
    )
  )
    return { kind: "invoice", equipment: eq };
  if (
    /\b(move|reschedul\w*|push|change)\b.{0,40}\b(pickup|pick up|pu|appointment|appt|delivery)\b/i.test(
      text,
    )
  )
    return { kind: "reschedule", equipment: eq };
  if (/broke down|breakdown|broken down/i.test(text)) return { kind: "breakdown", equipment: eq };
  const load =
    /\b(cover|can you (?:take|do|haul|run|move)|need an? (?:\d+'?\s*)?(?:truck|reefer|van|flatbed|dry van)|need \d+ (?:trucks|reefers|vans|flatbeds)|have a (?:load|dry van|reefer|flatbed)|got a load|posting a load|hot load|rate request|looking for (?:a truck|capacity|a carrier)|do you have (?:a |any )?(?:trucks?|reefers?|vans?|flatbeds?|dry vans?)|any (?:trucks?|reefers?|vans?) available|quote)\b/i.test(
      text,
    ) ||
    /(?<!\p{L})(нуж(?:ен|на|ны) (?:\d+ )?(?:реф\p{L}*|фур\p{L}*|трак\p{L}*|машин\p{L}*|площадк\p{L}*)|есть груз|сможете взять|возьм[её]те|можете закрыть|закроете|есть свободн\p{L}* (?:трак|машин|реф|фур))/iu.test(
      text,
    );
  const availability =
    /\b(do you have|available|any trucks?)\b|(?<!\p{L})есть свободн/iu.test(text) &&
    !/\bcover\b|возьм|закро/iu.test(text);
  // Some phrasings are a request by themselves ("Rate request: …", "Hot load!").
  const implied = /\b(rate request|hot load|posting a load|looking for capacity)\b/i.test(text);
  if (
    load &&
    (extractLane(text) || eq || hasRef || availability) &&
    (ASK.test(text) || implied)
  ) {
    return { kind: availability ? "truck_availability" : "quote", equipment: eq };
  }
  return null;
}

const COMPLAINT = [
  /\b(third|second|fourth|\d+(?:st|nd|rd|th)) time\b/i,
  /chasing you/i,
  /\bno (?:response|reply|answer)\b/i,
  /\b(?:no ?one|nobody) (?:answers|responds|replies)\b/i,
  /\bnot ok\b/i,
  /unacceptable/i,
  /disappointed/i,
  /\bnot happy\b/i,
  /ridiculous/i,
  /keep (?:asking|chasing)/i,
  /every hour/i,
  /again\?!|again and again/i,
  /getting old/i,
  /asked \d+ (?:hours?|hrs) ago/i,
  /poor (?:communication|service)/i,
  /\b(?:no ?one|nobody) (?:is )?(?:answering|responding|replying)\b/i,
  /been waiting (?:for )?(?:hours|all day|since)/i,
  /still no (?:eta|update|answer|response)/i,
  /третий раз/i,
  /сколько можно/i,
  /не отвечаете/i,
  /никто не отвечает/i,
  /безобразие/i,
  /недовольн/i,
  /час(?:а|ов)? ждём|ждём ответа/i,
  /ни в какие ворота/i,
  /опять тишина/i,
  /игнорируете/i,
];
const THREAT = [
  /another carrier/i,
  /stop sending/i,
  /find someone else/i,
  /last time we/i,
  /take (?:our|my) (?:freight|business|loads) elsewhere/i,
  /(?:move|pull) (?:our|the) freight/i,
  /другого перевозчика/i,
  /больше не будем/i,
  /заберём грузы|уйдём к другим/i,
];

/** Complaint severity (4, or 5 when the customer threatens to move freight). */
export function complaintSeverity(text: string): number | null {
  if (THREAT.some((r) => r.test(text))) return 5;
  if (COMPLAINT.some((r) => r.test(text))) return 4;
  return null;
}

const RUDE = [
  /stop spamming/i,
  /stop bugging/i,
  /not my problem/i,
  /calm down/i,
  /figure it out yourself/i,
  /deal with it/i,
  /are you blind/i,
  /can'?t you read/i,
  /don'?t tell me how/i,
  /not just yours/i,
  /leave me alone/i,
  /shut up/i,
  /\bstupid\b/i,
  /\bidiot\b/i,
  /none of your business/i,
  /\bchill out\b/i,
  /отстань/i,
  /достал/i,
  /не мои проблемы/i,
  /не ваше дело/i,
  /успокойтесь/i,
  /сами разбирайтесь/i,
  /идиот/i,
  /тупой/i,
  /хватит спамить/i,
  /задолбал/i,
  /не лезь/i,
  /not my job/i,
  /when i get to it/i,
  /\byou people\b/i,
  /stop (?:texting|messaging|calling|pinging) me/i,
  /don'?t rush me/i,
  /не пишите мне/i,
  /некогда с вами/i,
  /отвяжитесь/i,
  /сами виноваты/i,
  /не торопите/i,
];

export function isRude(text: string): boolean {
  return RUDE.some((r) => r.test(text));
}

/** Employee claims to have no information yet. */
export function claimsNoInfo(text: string): boolean {
  return /when i have it|no updates? yet|don'?t have (?:an? )?(?:eta|update|info)|don'?t know yet|no info\b|no news|нет информации|пока не знаю|нет данных/i.test(
    text,
  );
}

export function isFollowUp(text: string): boolean {
  return /any (?:news|update)|update\?|following up|follow(?:ing)? up|still waiting|when will|\?\s*$|где|когда/i.test(
    text,
  );
}

/** Fleet/internal message carrying an ETA. */
export function isEtaInfo(text: string, base: Date, tz: string): boolean {
  if (!extractTimes(text, base, tz).length) return false;
  return /\beta\b|arriv|will be (?:in|at)|be there|on schedule|будет|приедет|доедет|прибудет|по плану|на месте/i.test(
    text,
  );
}

export function onSchedule(text: string): boolean {
  return /задержек нет|по плану|on schedule|on time|no delays|без задержек/i.test(text);
}

/** Internal/fleet message that shows the team is actually working on something. */
export function isInternalWork(text: string): boolean {
  return /кто свободен|кто рядом|какой eta|попроси|нужен|нужна|поставь|ставим|найди|проверить|надо проверить|who'?s free|who is free|need a (?:truck|reefer)|assign|book\b|кто выставлял/i.test(
    text,
  );
}

/** Truck-availability answer in the fleet chat ("118-й освобождается… ставим его", "могу дать 214-й"). */
export function isTruckOffer(text: string): boolean {
  return (
    extractTrucks(text).length > 0 &&
    /свобод|ставим|можно ставить|могу дать|будет в|free|available|can take/i.test(text)
  );
}

/** Does an employee message to the customer deliver the result for this kind of task? */
export function deliversResult(kind: TaskKind, text: string, base: Date, tz: string): boolean {
  switch (kind) {
    case "quote":
    case "truck_availability":
      return (
        /\b(confirmed|we can cover|we'?ll cover|covering|booked|dispatched)\b/i.test(text) &&
        (extractTrucks(text).length > 0 || /rate con/i.test(text))
      );
    case "eta_update":
      return (
        isEtaInfo(text, base, tz) ||
        (/\beta\b/i.test(text) && extractTimes(text, base, tz).length > 0)
      );
    case "pod_bol":
      return /(attached|here is|here's|sent|sending now).{0,40}\b(pod|bol)\b|\b(pod|bol)\b.{0,40}(attached|sent)|\[document/i.test(
        text,
      );
    case "invoice":
      return /(corrected|revised|updated|fixed|resent).{0,30}invoice|invoice.{0,30}(attached|resent|corrected|fixed)/i.test(
        text,
      );
    case "detention":
      return /detention.{0,40}(sent|attached|submitted)|(sent|attached|submitted).{0,40}detention/i.test(
        text,
      );
    case "reschedule":
      return /(moved|rescheduled|confirmed|updated).{0,40}\b(pickup|pu|appointment|appt|delivery)\b|new (?:pu|pickup|appt)/i.test(
        text,
      );
    default:
      return /\b(done|completed|resolved|fixed)\b/i.test(text);
  }
}

/** Keywords that tie a message to a kind of task when no load number is given. */
export function kindHint(text: string): TaskKind | null {
  if (/\b(pod|bol)\b/i.test(text)) return "pod_bol";
  if (/\beta\b|check call|where is/i.test(text)) return "eta_update";
  if (/invoice|инвойс|счёт|счет/i.test(text)) return "invoice";
  if (/detention|простой/i.test(text)) return "detention";
  if (/reefer|truck|rate|cover|\bреф|трак/i.test(text)) return "quote";
  return null;
}

export function firstName(senderName: string): string {
  const cleaned = senderName.replace(/[(|\-–].*$/, "").trim();
  return cleaned.split(/\s+/)[0] || senderName;
}

/** Local "4:30 PM" (en) or "16:30" (ru) for suggestions and explanations. */
export function clock(d: Date, tz: string, lang: "en" | "ru" = "en"): string {
  return lang === "ru"
    ? new Intl.DateTimeFormat("ru-RU", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(
        d,
      )
    : new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(
        d,
      );
}

/** A closing pleasantry that needs no answer ("Perfect, thank you!", "Got it, thanks."). */
export function isClosingRemark(text: string): boolean {
  const t = text.trim();
  if (t.length > 60 || t.includes("?")) return false;
  return /^(?:(?:perfect|great|awesome|cool|ok(?:ay)?|got it|sounds good|noted|received|rate con sent|thanks?|thank you|thx|ty|appreciate it|спасибо|ок|отлично|принято|понял)[\s,!.👍🙏]*)+(?:\p{L}+[\s!.👍🙏]*)?$/iu.test(
    t,
  );
}

/** "today" / "tomorrow" / weekday relative to now, in the company timezone. */
export function relDay(d: Date, now: Date, tz: string, lang: "en" | "ru"): string {
  const a = localParts(d, tz);
  const b = localParts(now, tz);
  const da = zonedToUtc(a.y, a.m, a.d, 12, 0, tz).getTime();
  const db = zonedToUtc(b.y, b.m, b.d, 12, 0, tz).getTime();
  const diff = Math.round((da - db) / 86_400_000);
  if (diff === 0) return lang === "ru" ? "сегодня" : "today";
  if (diff === 1) return lang === "ru" ? "завтра" : "tomorrow";
  if (diff === -1) return lang === "ru" ? "вчера" : "yesterday";
  return new Intl.DateTimeFormat(lang === "ru" ? "ru-RU" : "en-US", {
    timeZone: tz,
    weekday: "long",
  }).format(d);
}
