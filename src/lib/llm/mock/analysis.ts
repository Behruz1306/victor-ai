// Offline stand-in for the CustomerAnalysis LLM call. It reads the same structured context
// the real model gets and applies deterministic EN/RU heuristics. Output goes through the
// same zod schema and the same deterministic application code as a real model's output.
import type { TaskKind, TaskStatus } from "@/lib/db/schema";
import type { CustomerAnalysis } from "@/lib/llm/schemas";
import type { AnalysisInput, CtxChannel, CtxMessage, CtxRule } from "@/lib/pipeline/types";
import type { L10n } from "@/lib/types";
import {
  claimsNoInfo,
  clock,
  complaintSeverity,
  deliversResult,
  detectRequest,
  equipmentOf,
  extractLane,
  extractRefs,
  extractTimes,
  extractTrucks,
  firstName,
  isEtaInfo,
  isInternalWork,
  isRude,
  isTruckOffer,
  kindHint,
  laneText,
  mentionsCity,
  onSchedule,
  parseDeadline,
  relDay,
  type Lane,
} from "@/lib/heuristics/extract";
import { customerNameCore } from "@/lib/ingest/ingest";

type Update = CustomerAnalysis["task_updates"][number];
type Flag = CustomerAnalysis["quality_flags"][number];
type Suggestion = CustomerAnalysis["suggestions"][number];

const ORDER: TaskStatus[] = [
  "received",
  "acknowledged",
  "in_progress",
  "deadline_set",
  "delivered",
];
const CUSTOMER_FACING = new Set(["customer", "billing", "support"]);

type T = {
  id: string;
  isNew: boolean;
  kind: TaskKind;
  title: L10n;
  ref: string | null;
  refs: string[];
  lane: Lane | null;
  equipment: string | null;
  puAt: Date | null;
  channelId: string | null;
  status: TaskStatus;
  deadlineAt: Date | null;
  createdFromId: string | null;
  requestAt: Date;
  contact: string | null;
  trucks: string[];
  truckMsgId: string | null;
  eta: {
    msgId: string;
    at: Date;
    sentAt: Date;
    truck: string | null;
    onSchedule: boolean;
    by: string;
  } | null;
  podNote: { msgId: string; by: string } | null;
  lastCustomerAt: Date | null;
  lastCustomerMsgId: string | null;
  lastEmployeeToCustomerAt: Date | null;
  internalWorkAt: Date | null;
  fleetContact: string | null;
  price: string | null;
};

function quote(text: string, n = 90): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

function equipLabel(e: string | null, lang: "en" | "ru"): string {
  if (lang === "ru")
    return e === "reefer"
      ? "Реф"
      : e === "dry van"
        ? "Dry van"
        : e === "flatbed"
          ? "Флэтбед"
          : "Груз";
  return e === "reefer"
    ? "Reefer"
    : e === "dry van"
      ? "Dry van"
      : e === "flatbed"
        ? "Flatbed"
        : "Load";
}

function titleFor(
  kind: TaskKind,
  ref: string | null,
  lane: Lane | null,
  equipment: string | null,
): L10n {
  const lt = lane ? laneText(lane) : "";
  switch (kind) {
    case "quote":
    case "truck_availability":
      return {
        en: `${equipLabel(equipment, "en")} ${lt}${ref ? `${lt ? ", " : ""}load ${ref}` : ""}`.trim(),
        ru: `${equipLabel(equipment, "ru")} ${lt}${ref ? `${lt ? ", " : ""}груз ${ref}` : ""}`.trim(),
      };
    case "eta_update":
      return {
        en: `ETA for load ${ref ?? "?"}${lt ? ` (${lt})` : ""}`,
        ru: `ETA по грузу ${ref ?? "?"}${lt ? ` (${lt})` : ""}`,
      };
    case "pod_bol":
      return { en: `POD / BOL for load ${ref ?? "?"}`, ru: `POD / BOL по грузу ${ref ?? "?"}` };
    case "detention":
      return {
        en: `Detention request, load ${ref ?? "?"}`,
        ru: `Заявка на простой (detention), груз ${ref ?? "?"}`,
      };
    case "invoice":
      return { en: `Fix invoice ${ref ?? ""}`.trim(), ru: `Исправить счёт ${ref ?? ""}`.trim() };
    case "reschedule":
      return {
        en: `Reschedule pickup, load ${ref ?? "?"}`,
        ru: `Перенос погрузки, груз ${ref ?? "?"}`,
      };
    case "breakdown":
      return {
        en: `Replace broken-down truck${ref ? `, load ${ref}` : ""}`,
        ru: `Замена сломанного трака${ref ? `, груз ${ref}` : ""}`,
      };
    default:
      return {
        en: `Customer request${ref ? ` ${ref}` : ""}`,
        ru: `Запрос клиента${ref ? ` ${ref}` : ""}`,
      };
  }
}

/** Style directives parsed from playbook rules that apply to a chat. */
type Style = {
  tz: string | null;
  truck: boolean;
  signature: boolean;
  short: boolean;
  noApology: boolean;
  ids: Record<string, string>;
};

function styleFor(rules: CtxRule[], channel: CtxChannel): Style {
  const s: Style = {
    tz: null,
    truck: false,
    signature: false,
    short: false,
    noApology: false,
    ids: {},
  };
  for (const r of rules) {
    if (r.scope === "chat_type" && r.chatType !== channel.chatType) continue;
    if (r.scope !== "chat_type" && !CUSTOMER_FACING.has(channel.chatType)) continue;
    const tz = /\b(CST|CDT|CT|EST|EDT|ET|PST|PDT|PT|MST|MDT|MT|UTC)\b/.exec(r.text);
    if (tz) {
      s.tz = tz[1]!;
      s.ids.tz = r.id;
    } else if (/central time|центральн/i.test(r.text)) {
      s.tz = "CT";
      s.ids.tz = r.id;
    }
    if (
      /truck (?:number|#|no\.?)|truck ?#|номер\p{L}* трак|трак\p{L}* номер|with (?:the )?truck|unit number/iu.test(
        r.text,
      )
    ) {
      s.truck = true;
      s.ids.truck = r.id;
    }
    if (/sign (?:with|off)|signature|подпис/i.test(r.text)) {
      s.signature = true;
      s.ids.signature = r.id;
    }
    if (/\b(short|brief|concise|one line)\b|кратк|коротк/i.test(r.text)) {
      s.short = true;
      s.ids.short = r.id;
    }
    if (/(no|don'?t|without) apolog|без извинен|не извиня/i.test(r.text)) {
      s.noApology = true;
      s.ids.noApology = r.id;
    }
  }
  return s;
}

export function mockCustomerAnalysis(input: AnalysisInput): CustomerAnalysis {
  const tz = input.company.timezone;
  const now = input.now;
  const byId = new Map(input.messages.map((m) => [m.id, m]));
  const channelById = new Map(input.channels.map((c) => [c.id, c]));
  const nameCore = customerNameCore(input.customer.name);
  const updates: Update[] = [];
  const flags: Flag[] = [];
  const tasks: T[] = [];
  let newCounter = 0;
  let lastComplaint: { msgId: string; at: Date; name: string } | null = null;

  // Existing tasks from the DB.
  for (const t of input.tasks) {
    const src = t.createdFromId ? byId.get(t.createdFromId) : undefined;
    const text = src?.text ?? t.title.en;
    tasks.push({
      id: t.id,
      isNew: false,
      kind: t.kind,
      title: t.title,
      ref: t.ref,
      refs: [...new Set([...(t.ref ? t.ref.split("/") : []), ...extractRefs(text)])],
      lane: extractLane(text) ?? extractLane(t.title.en),
      equipment: equipmentOf(text),
      puAt: src ? (extractTimes(src.text, src.sentAt, tz)[0]?.at ?? null) : null,
      channelId: t.channelId,
      status: t.status,
      deadlineAt: t.deadlineAt,
      createdFromId: t.createdFromId,
      requestAt: src?.sentAt ?? t.createdAt,
      contact: src ? firstName(src.senderName) : null,
      trucks: [],
      truckMsgId: null,
      eta: null,
      podNote: null,
      lastCustomerAt: src?.sentAt ?? null,
      lastCustomerMsgId: src?.id ?? null,
      lastEmployeeToCustomerAt: null,
      internalWorkAt: null,
      fleetContact: null,
      price: null,
    });
  }

  const open = (t: T) => t.status !== "delivered" && t.status !== "cancelled";

  function advance(
    t: T,
    to: TaskStatus,
    m: CtxMessage,
    explanation: L10n,
    deadline: Date | null = null,
  ) {
    if (!open(t)) return;
    if (ORDER.indexOf(to) <= ORDER.indexOf(t.status)) return;
    t.status = to;
    if (deadline) t.deadlineAt = deadline;
    updates.push({
      task_ref: t.id,
      new_task: null,
      proposed_status: to,
      evidence_message_id: m.id,
      deadline_at: deadline ? deadline.toISOString() : null,
      explanation,
    });
  }

  /** Tasks a message is about: reply target, refs, trucks, lane cities, then kind hint. */
  function tasksFor(
    m: CtxMessage,
    opts: { allowKindFallback: boolean; preferFrom?: boolean },
  ): T[] {
    // A message can only speak about requests that already existed when it was sent.
    const known = tasks.filter((t) => t.requestAt.getTime() <= m.sentAt.getTime());
    if (m.replyToId) {
      const hit = known.filter((t) => t.createdFromId === m.replyToId);
      if (hit.length) return hit;
    }
    const refs = extractRefs(m.text);
    if (refs.length) {
      const hit = known.filter((t) => t.refs.some((r) => refs.includes(r)));
      if (hit.length) return hit;
    }
    const trucks = extractTrucks(m.text);
    if (trucks.length) {
      const hit = known.filter(
        (t) =>
          open(t) &&
          (t.trucks.some((x) => trucks.includes(x)) ||
            (t.eta?.truck && trucks.includes(t.eta.truck))),
      );
      if (hit.length) return hit;
    }
    const byCity = known.filter(
      (t) =>
        open(t) && t.lane && (mentionsCity(m.text, t.lane.from) || mentionsCity(m.text, t.lane.to)),
    );
    if (byCity.length) {
      if (opts.preferFrom) {
        const from = byCity.filter((t) => mentionsCity(m.text, t.lane!.from));
        if (from.length) return [from[from.length - 1]!];
      }
      return byCity.length === 1 ? byCity : [byCity[byCity.length - 1]!];
    }
    if (opts.allowKindFallback) {
      const hint = kindHint(m.text);
      const inChannel = known.filter(
        (t) =>
          open(t) &&
          (!hint || t.kind === hint || (hint === "quote" && t.kind === "truck_availability")) &&
          (t.channelId === m.channelId || !CUSTOMER_FACING.has(m.chatType)),
      );
      if (hint && inChannel.length) return [inChannel[inChannel.length - 1]!];
    }
    return [];
  }

  function relevantShared(m: CtxMessage): boolean {
    const lower = m.text.toLowerCase();
    if (nameCore.length >= 3 && lower.includes(nameCore)) return true;
    return tasksFor(m, { allowKindFallback: false }).length > 0;
  }

  const sorted = [...input.messages].sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());
  for (const m of sorted) {
    const ch = channelById.get(m.channelId);
    if (!ch) continue;
    if (ch.shared && !relevantShared(m)) continue;
    const facing = CUSTOMER_FACING.has(ch.chatType);
    const staff = m.side === "employee" || m.side === "bot";

    if (m.side === "customer" && facing) {
      const sev = complaintSeverity(m.text);
      const about = tasksFor(m, { allowKindFallback: true });
      if (sev) {
        lastComplaint = { msgId: m.id, at: m.sentAt, name: firstName(m.senderName) };
        flags.push({
          kind: "complaint",
          message_id: m.id,
          task_ref: about[0]?.id ?? null,
          severity: sev,
          reason: {
            en: `${firstName(m.senderName)} complains: “${quote(m.text)}”`,
            ru: `${firstName(m.senderName)} жалуется: «${quote(m.text)}»`,
          },
        });
      }
      const req = detectRequest(m.text);
      const refs = extractRefs(m.text);
      const lane = extractLane(m.text);
      const group = (k: TaskKind) => (k === "truck_availability" ? "quote" : k);
      const existing = req
        ? tasks.find(
            (t) =>
              t.createdFromId === m.id ||
              (group(t.kind) === group(req.kind) &&
                ((refs.length && t.refs.some((r) => refs.includes(r))) ||
                  (lane && t.lane && laneText(t.lane) === laneText(lane)))),
          )
        : undefined;
      if (req && !existing && !sev) {
        newCounter += 1;
        const ref = refs.length ? refs.join("/") : null;
        const t: T = {
          id: `n${newCounter}`,
          isNew: true,
          kind: req.kind,
          title: titleFor(req.kind, ref, lane, req.equipment),
          ref,
          refs,
          lane,
          equipment: req.equipment,
          puAt: extractTimes(m.text, m.sentAt, tz)[0]?.at ?? null,
          channelId: m.channelId,
          status: "received",
          deadlineAt: null,
          createdFromId: m.id,
          requestAt: m.sentAt,
          contact: firstName(m.senderName),
          trucks: [],
          truckMsgId: null,
          eta: null,
          podNote: null,
          lastCustomerAt: m.sentAt,
          lastCustomerMsgId: m.id,
          lastEmployeeToCustomerAt: null,
          internalWorkAt: null,
          fleetContact: null,
          price: null,
        };
        tasks.push(t);
        updates.push({
          task_ref: null,
          new_task: { temp_id: t.id, title: t.title, kind: t.kind, ref },
          proposed_status: "received",
          evidence_message_id: m.id,
          deadline_at: null,
          explanation: {
            en: `Customer asked: “${quote(m.text)}”`,
            ru: `Клиент запросил: «${quote(m.text)}»`,
          },
        });
      } else {
        const target = existing ? [existing] : about;
        for (const t of target) {
          t.lastCustomerAt = m.sentAt;
          t.lastCustomerMsgId = m.id;
          t.contact = firstName(m.senderName);
          const price = /\$\s?\d[\d,]*(?:\s*all[- ]in)?/i.exec(m.text);
          if (price) t.price = price[0];
        }
      }
      continue;
    }

    if (staff && facing) {
      const targets = (() => {
        const direct = tasksFor(m, { allowKindFallback: true });
        if (direct.length) return direct;
        const waiting = tasks.filter(
          (t) => open(t) && t.status === "received" && t.channelId === m.channelId && t.requestAt <= m.sentAt,
        );
        return waiting.length ? [waiting[waiting.length - 1]!] : [];
      })();
      if (isRude(m.text)) {
        flags.push({
          kind: "rude_tone",
          message_id: m.id,
          task_ref: targets[0]?.id ?? null,
          severity: 4,
          reason: {
            en: `${m.userName ?? m.senderName} wrote to the customer: “${quote(m.text)}” — dismissive and unprofessional.`,
            ru: `${m.userName ?? m.senderName} написал клиенту: «${quote(m.text)}» — пренебрежительно и непрофессионально.`,
          },
        });
      }
      if (claimsNoInfo(m.text)) {
        const known =
          targets.find((t) => t.eta && t.eta.sentAt < m.sentAt) ??
          tasks.find((t) => open(t) && t.eta && t.eta.sentAt < m.sentAt);
        if (known?.eta) {
          flags.push({
            kind: "context_ignored",
            message_id: m.id,
            task_ref: known.id,
            severity: 3,
            reason: {
              en: `Told the customer there is no ETA yet, but Fleet gave it at ${clock(known.eta.sentAt, tz)}: ${clock(known.eta.at, tz)}.`,
              ru: `Сказал клиенту, что ETA пока нет, хотя флот сообщил его в ${clock(known.eta.sentAt, tz, "ru")}: ${clock(known.eta.at, tz, "ru")}.`,
            },
          });
        }
      }
      for (const t of targets) {
        t.lastEmployeeToCustomerAt = m.sentAt;
        if (deliversResult(t.kind, m.text, m.sentAt, tz) && !claimsNoInfo(m.text)) {
          advance(t, "delivered", m, {
            en: `Result sent to the customer: “${quote(m.text)}”`,
            ru: `Результат отправлен клиенту: «${quote(m.text)}»`,
          });
          continue;
        }
        const deadline = parseDeadline(m.text, m.sentAt, tz);
        if (deadline) {
          advance(
            t,
            "deadline_set",
            m,
            {
              en: `Promised by ${clock(deadline, tz)}: “${quote(m.text)}”`,
              ru: `Обещано к ${clock(deadline, tz, "ru")}: «${quote(m.text)}»`,
            },
            deadline,
          );
          continue;
        }
        advance(t, "acknowledged", m, {
          en: `Team replied to the customer: “${quote(m.text)}”`,
          ru: `Команда ответила клиенту: «${quote(m.text)}»`,
        });
      }
      continue;
    }

    if (staff && !facing) {
      const targets = tasksFor(m, {
        allowKindFallback: !ch.shared,
        preferFrom: isTruckOffer(m.text),
      });
      for (const t of targets) {
        if (!m.userName) t.fleetContact = firstName(m.senderName);
        if (t.kind === "eta_update" && isEtaInfo(m.text, m.sentAt, tz)) {
          const at = extractTimes(m.text, m.sentAt, tz).at(-1)!.at;
          t.eta = {
            msgId: m.id,
            at,
            sentAt: m.sentAt,
            truck: extractTrucks(m.text)[0] ?? null,
            onSchedule: onSchedule(m.text),
            by: firstName(m.senderName),
          };
        }
        if ((t.kind === "quote" || t.kind === "truck_availability") && isTruckOffer(m.text)) {
          t.trucks = [...new Set([...t.trucks, ...extractTrucks(m.text)])];
          t.truckMsgId = m.id;
        }
        if (t.kind === "pod_bol" && /\b(pod|bol)\b/i.test(m.text) && !m.userName)
          t.podNote = { msgId: m.id, by: firstName(m.senderName) };
        if (isInternalWork(m.text) || isTruckOffer(m.text) || isEtaInfo(m.text, m.sentAt, tz)) {
          t.internalWorkAt = m.sentAt;
          if (t.status === "acknowledged") {
            advance(t, "in_progress", m, {
              en: `Team is working on it in “${m.channelTitle}”: “${quote(m.text)}”`,
              ru: `Команда работает над задачей в «${m.channelTitle}»: «${quote(m.text)}»`,
            });
          }
        }
      }
    }
  }

  // ETA known internally but never passed to the customer.
  for (const t of tasks) {
    if (t.kind !== "eta_update" || !open(t) || !t.eta) continue;
    const forwarded =
      t.lastEmployeeToCustomerAt &&
      t.lastEmployeeToCustomerAt > t.eta.sentAt &&
      t.status === "delivered";
    if (forwarded) continue;
    const waitingHours = (now.getTime() - t.eta.sentAt.getTime()) / 3_600_000;
    flags.push({
      kind: "eta_not_forwarded",
      message_id: t.eta.msgId,
      task_ref: t.id,
      severity: lastComplaint || waitingHours > 2 ? 4 : 3,
      reason: {
        en: `Fleet gave the ETA for ${t.ref ?? "the load"} at ${clock(t.eta.sentAt, tz)} (${clock(t.eta.at, tz)}${t.eta.truck ? `, truck ${t.eta.truck}` : ""}). It never reached the customer.`,
        ru: `Флот сообщил ETA по ${t.ref ?? "грузу"} в ${clock(t.eta.sentAt, tz, "ru")} (${clock(t.eta.at, tz, "ru")}${t.eta.truck ? `, трак ${t.eta.truck}` : ""}). Клиенту это не передали.`,
      },
    });
  }

  const suggestions = buildSuggestions(input, tasks, lastComplaint);
  return {
    task_updates: updates,
    quality_flags: flags,
    suggestions,
    brief_update: buildBrief(input, tasks, flags),
    day_summary: buildDaySummary(input, tasks, flags),
  };
}

// ── suggestions ────────────────────────────────────────────────────────────

type Need = { priority: number; at: number; s: Suggestion };

function buildSuggestions(
  input: AnalysisInput,
  tasks: T[],
  lastComplaint: { msgId: string; at: Date; name: string } | null,
): Suggestion[] {
  const tz = input.company.timezone;
  const now = input.now;
  const open = tasks.filter((t) => t.status !== "delivered" && t.status !== "cancelled");
  const facingChannels = input.channels.filter((c) => !c.shared && CUSTOMER_FACING.has(c.chatType));
  const mainFacing = facingChannels.find((c) => c.chatType === "customer") ?? facingChannels[0];
  const internal = input.channels.find((c) => c.chatType === "internal" && !c.shared);
  const fleet = input.channels.find((c) => c.chatType === "fleet") ?? internal;
  const needs = new Map<string, Need>();
  const offer = (channelId: string | undefined, n: Need) => {
    if (!channelId) return;
    const cur = needs.get(channelId);
    if (!cur || n.priority > cur.priority || (n.priority === cur.priority && n.at > cur.at))
      needs.set(channelId, n);
  };
  const complaintOpen = (t: T) => Boolean(lastComplaint && lastComplaint.at >= t.requestAt);
  const late = (d: Date | null) => Boolean(d && d.getTime() < now.getTime());
  const roundUp = (d: Date) => new Date(Math.ceil(d.getTime() / 900_000) * 900_000);

  for (const t of open) {
    const chId = t.channelId ?? mainFacing?.id;
    const ch = input.channels.find((c) => c.id === chId);
    if (!ch) continue;
    const st = styleFor(input.rules, ch);
    const used = new Set<string>();
    const time = (d: Date) => {
      if (st.tz) used.add(st.ids.tz!);
      return `${clock(d, tz)}${st.tz ? ` ${st.tz}` : ""}`;
    };
    const hi = t.contact ? `Hi ${t.contact}, ` : "Hi, ";
    const sorry = (en: string) => (st.noApology ? "" : en);
    const finish = (text: string) => {
      let out = text
        .replace(/\s+/g, " ")
        .replace(/\s([,.])/g, "$1")
        .trim();
      if (st.short) {
        const first = out.split(/(?<=\.)\s/)[0]!;
        if (first !== out) used.add(st.ids.short!);
        out = first;
      }
      if (st.signature) {
        out += `\n— ${input.customer.assigneeName ?? "Dispatch"}, ${input.company.name}`;
        used.add(st.ids.signature!);
      }
      if (st.noApology) used.add(st.ids.noApology!);
      return out;
    };
    const msgIds = (...ids: (string | null | undefined)[]) => [
      ...new Set(ids.filter(Boolean) as string[]),
    ];
    const refTxt = t.ref ? `load ${t.ref}` : "the load";
    const lastAt = (t.lastCustomerAt ?? t.requestAt).getTime();

    // N1: ETA known internally, not forwarded.
    if (t.kind === "eta_update" && t.eta) {
      const truck = st.truck && t.eta.truck ? `, truck #${t.eta.truck}` : "";
      if (truck) used.add(st.ids.truck!);
      const dest = t.lane ? ` to ${t.lane.to.replace(/,? [A-Z]{2}$/, "")}` : "";
      const apologetic = complaintOpen(t) && !st.noApology;
      const text = finish(
        `${hi}${apologetic ? `apologies for the slow updates. ${refTxt[0]!.toUpperCase()}${refTxt.slice(1)}` : refTxt}${truck} is ${t.eta.onSchedule ? "on schedule" : "moving"} — ETA${dest} ${st.tz ? "" : "around "}${time(t.eta.at)}. I'll keep you posted if anything changes.`,
      );
      offer(chId, {
        priority: 100,
        at: lastAt,
        s: {
          channel_id: chId!,
          task_ref: t.id,
          intent: apologetic ? "apologize_and_fix" : "reply_customer",
          text,
          rationale: {
            en: `${t.eta.by} gave the ETA in the Fleet chat at ${clock(t.eta.sentAt, tz)} (${clock(t.eta.at, tz)}${t.eta.truck ? `, truck ${t.eta.truck}` : ""}). ${t.contact ?? "The customer"} asked at ${clock(t.requestAt, tz)}${lastComplaint ? " and complained" : ""} — nobody passed it on.`,
            ru: `${t.eta.by} сообщил ETA в чате флота в ${clock(t.eta.sentAt, tz, "ru")} (${clock(t.eta.at, tz, "ru")}${t.eta.truck ? `, трак ${t.eta.truck}` : ""}). ${t.contact ?? "Клиент"} спрашивал в ${clock(t.requestAt, tz, "ru")}${lastComplaint ? " и пожаловался" : ""} — никто не передал.`,
          },
          used_message_ids: msgIds(t.eta.msgId, t.createdFromId, lastComplaint?.msgId),
          used_rule_ids: [...used],
        },
      });
      continue;
    }

    // Truck offered by fleet for an unconfirmed load → confirm to the customer.
    if (
      (t.kind === "quote" || t.kind === "truck_availability") &&
      t.trucks.length &&
      !late(t.puAt)
    ) {
      const pu = t.puAt ? `, PU ${relDay(t.puAt, now, tz, "en")} ${time(t.puAt)}` : "";
      const text = finish(
        `${hi}we can cover ${t.ref ? t.ref : t.lane ? laneText(t.lane) : "this load"}: truck #${t.trucks.at(-1)}${pu}${t.lane ? ` in ${t.lane.from.replace(/,? [A-Z]{2}$/, "")}` : ""}${t.price ? `, ${t.price}` : ""}. Please send the rate con.`,
      );
      if (st.truck) used.add(st.ids.truck!);
      offer(chId, {
        priority: 95,
        at: lastAt,
        s: {
          channel_id: chId!,
          task_ref: t.id,
          intent: "confirm_task",
          text,
          rationale: {
            en: `Fleet offered truck ${t.trucks.at(-1)} for this load; the customer is still waiting for confirmation.`,
            ru: `Флот предложил трак ${t.trucks.at(-1)} под этот груз; клиент ещё ждёт подтверждения.`,
          },
          used_message_ids: msgIds(t.truckMsgId, t.createdFromId),
          used_rule_ids: [...used],
        },
      });
    }

    // N2: request not acknowledged yet.
    if (t.status === "received") {
      const text = (() => {
        if (t.kind === "quote" || t.kind === "truck_availability") {
          const pu =
            t.puAt && !late(t.puAt) ? `, PU ${relDay(t.puAt, now, tz, "en")} ${time(t.puAt)}` : "";
          return `${hi}got it — checking ${t.equipment ?? "truck"} availability for ${t.lane ? laneText(t.lane) : refTxt}${pu}. Will confirm truck and rate within 30 min.`;
        }
        if (t.kind === "eta_update")
          return `${hi}checking with the driver on ${refTxt} — will send you the ETA within 30 min.`;
        if (t.kind === "pod_bol")
          return `${hi}on it — getting the POD for ${refTxt} from the driver, will send it within the hour.`;
        if (t.kind === "invoice")
          return `${hi}thanks for flagging this. Checking invoice ${t.ref ?? ""} against the rate con now — we'll send a corrected invoice today.`;
        if (t.kind === "detention")
          return `${hi}got it — preparing the detention request with in/out times for ${refTxt}.`;
        if (t.kind === "reschedule") {
          const times = extractTimes(
            input.messages.find((m) => m.id === t.createdFromId)?.text ?? "",
            t.requestAt,
            tz,
          );
          const target = times.at(-1);
          return `${hi}checking with the driver whether we can move the ${t.ref ?? ""} pickup${target ? ` to ${time(target.at)}` : ""} — will confirm within 30 min.`;
        }
        return `${hi}got it, working on it — will update you within 30 min.`;
      })();
      offer(chId, {
        priority: 90,
        at: lastAt,
        s: {
          channel_id: chId!,
          task_ref: t.id,
          intent: "confirm_task",
          text: finish(text),
          rationale: {
            en: `${t.contact ?? "The customer"} asked at ${clock(t.requestAt, tz)} and nobody has replied yet (SLA ${input.company.sla.ackMinutes} min).`,
            ru: `${t.contact ?? "Клиент"} написал в ${clock(t.requestAt, tz, "ru")}, ответа ещё нет (SLA ${input.company.sla.ackMinutes} мин).`,
          },
          used_message_ids: msgIds(t.createdFromId),
          used_rule_ids: [...used],
        },
      });
      continue;
    }

    // N3: promised deadline passed.
    if (late(t.deadlineAt)) {
      const by = roundUp(new Date(now.getTime() + 60 * 60_000));
      const detail =
        t.kind === "pod_bol" && t.podNote
          ? "the driver still has it in the cab. We're getting a photo from him now"
          : "we're on it now";
      const text = finish(
        `${hi}${sorry(`apologies for the delay on the ${t.kind === "pod_bol" ? "POD" : "update"} for ${refTxt} — `)}${detail}; you'll have it by ${time(by)}.`,
      );
      offer(chId, {
        priority: 80,
        at: lastAt,
        s: {
          channel_id: chId!,
          task_ref: t.id,
          intent: "apologize_and_fix",
          text,
          rationale: {
            en: `Promised by ${clock(t.deadlineAt!, tz)} (${relDay(t.deadlineAt!, now, tz, "en")}), still not delivered.${t.podNote ? ` ${t.podNote.by} (fleet): the POD is still with the driver.` : ""}`,
            ru: `Обещали к ${clock(t.deadlineAt!, tz, "ru")} (${relDay(t.deadlineAt!, now, tz, "ru")}), результата нет.${t.podNote ? ` ${t.podNote.by} (флот): POD всё ещё у водителя.` : ""}`,
          },
          used_message_ids: msgIds(t.podNote?.msgId, t.createdFromId),
          used_rule_ids: [...used],
        },
      });
      continue;
    }

    // N4: customer followed up and is waiting.
    if (
      t.lastCustomerAt &&
      (!t.lastEmployeeToCustomerAt || t.lastCustomerAt > t.lastEmployeeToCustomerAt)
    ) {
      const pu =
        t.puAt && !late(t.puAt) ? ` for PU ${relDay(t.puAt, now, tz, "en")} ${time(t.puAt)}` : "";
      const text =
        t.puAt && late(t.puAt) && (t.kind === "quote" || t.kind === "truck_availability")
          ? `${hi}${sorry("apologies for leaving ")}${st.noApology ? "Following up on " : ""}${t.ref ?? "this load"} without an answer. Is it still open? If so, we can check a ${t.equipment ?? "truck"} right away.`
          : `${hi}${sorry(`sorry for the wait on ${t.ref ?? "this"}. `)}Checking ${t.equipment ?? "truck"} availability${t.lane ? ` for ${laneText(t.lane)}` : ""}${pu} now — will confirm within 30 min.`;
      offer(chId, {
        priority: 70,
        at: lastAt,
        s: {
          channel_id: chId!,
          task_ref: t.id,
          intent: "reply_customer",
          text: finish(text),
          rationale: {
            en: `${t.contact ?? "The customer"} followed up at ${clock(t.lastCustomerAt, tz)} and got no answer.`,
            ru: `${t.contact ?? "Клиент"} написал повторно в ${clock(t.lastCustomerAt, tz, "ru")} и не получил ответа.`,
          },
          used_message_ids: msgIds(t.lastCustomerMsgId, t.createdFromId),
          used_rule_ids: [...used],
        },
      });
    }
  }

  // Internal / fleet side.
  const fleetName = (t: T) => t.fleetContact ?? lastFleetName(input) ?? "";
  for (const t of open) {
    if (t.kind === "eta_update" && !t.eta && fleet) {
      const lang = fleet.lang;
      const name = fleetName(t);
      offer(fleet.id, {
        priority: 60,
        at: t.requestAt.getTime(),
        s: {
          channel_id: fleet.id,
          task_ref: t.id,
          intent: "ask_fleet_eta",
          text:
            lang === "ru"
              ? `${name ? `${name}, ` : ""}какой ETA по ${t.ref ?? "грузу"}${t.lane ? ` (${laneText(t.lane)})` : ""}? ${input.customer.name} ждёт check call.`
              : `${name ? `${name}, ` : ""}what's the ETA on ${t.ref ?? "the load"}${t.lane ? ` (${laneText(t.lane)})` : ""}? ${input.customer.name} is waiting for a check call.`,
          rationale: {
            en: `${t.contact ?? "The customer"} asked for an ETA at ${clock(t.requestAt, tz)}; fleet has not given one yet.`,
            ru: `${t.contact ?? "Клиент"} запросил ETA в ${clock(t.requestAt, tz, "ru")}; флот ещё не ответил.`,
          },
          used_message_ids: t.createdFromId ? [t.createdFromId] : [],
          used_rule_ids: [],
        },
      });
    }
    if (t.kind === "pod_bol" && late(t.deadlineAt) && fleet) {
      const name = fleetName(t);
      offer(fleet.id, {
        priority: 50,
        at: t.requestAt.getTime(),
        s: {
          channel_id: fleet.id,
          task_ref: t.id,
          intent: "remind_task",
          text:
            fleet.lang === "ru"
              ? `${name ? `${name}, ` : ""}по ${t.ref ?? "грузу"} брокер ждёт POD с ${clock(t.deadlineAt!, tz, "ru")} (${relDay(t.deadlineAt!, now, tz, "ru")}). Попроси водителя скинуть фото прямо сейчас.`
              : `${name ? `${name}, ` : ""}the broker has been waiting for the POD on ${t.ref ?? "the load"} since ${clock(t.deadlineAt!, tz)}. Please get a photo from the driver now.`,
          rationale: {
            en: `POD promised to the customer by ${clock(t.deadlineAt!, tz)}; still not received from the driver.`,
            ru: `POD обещали клиенту к ${clock(t.deadlineAt!, tz, "ru")}; от водителя его всё ещё нет.`,
          },
          used_message_ids: [t.podNote?.msgId, t.createdFromId].filter(Boolean) as string[],
          used_rule_ids: [],
        },
      });
    }
    if (
      (t.kind === "quote" || t.kind === "truck_availability") &&
      !t.trucks.length &&
      !t.internalWorkAt &&
      t.puAt &&
      !late(t.puAt) &&
      internal
    ) {
      const eqRu = t.equipment === "reefer" ? "реф" : (t.equipment ?? "трак");
      offer(internal.id, {
        priority: 40,
        at: t.requestAt.getTime(),
        s: {
          channel_id: internal.id,
          task_ref: t.id,
          intent: "remind_task",
          text:
            internal.lang === "ru"
              ? `Нужен ${eqRu} на ${input.customer.name} ${t.ref ?? ""}: ${t.lane ? laneText(t.lane) : ""}, PU ${relDay(t.puAt, now, tz, "ru")} ${clock(t.puAt, tz, "ru")}. Кто свободен?`.replace(
                  /\s+/g,
                  " ",
                )
              : `Need a ${t.equipment ?? "truck"} for ${input.customer.name} ${t.ref ?? ""}: ${t.lane ? laneText(t.lane) : ""}, PU ${relDay(t.puAt, now, tz, "en")} ${clock(t.puAt, tz)}. Who's free?`.replace(
                  /\s+/g,
                  " ",
                ),
          rationale: {
            en: `Nobody has looked for a truck for this load yet.`,
            ru: `Под этот груз ещё никто не искал трак.`,
          },
          used_message_ids: t.createdFromId ? [t.createdFromId] : [],
          used_rule_ids: [],
        },
      });
    }
  }
  return [...needs.values()].map((n) => n.s);
}

function lastFleetName(input: AnalysisInput): string | null {
  const m = [...input.messages]
    .reverse()
    .find((x) => x.chatType === "fleet" && !x.userName && x.side === "employee");
  return m ? firstName(m.senderName) : null;
}

// ── brief & summary ────────────────────────────────────────────────────────

const STATUS_EN: Record<string, string> = {
  received: "not acknowledged",
  acknowledged: "acknowledged",
  in_progress: "in progress",
  deadline_set: "deadline set",
  delivered: "delivered",
  cancelled: "cancelled",
};
const STATUS_RU: Record<string, string> = {
  received: "не подтверждена",
  acknowledged: "подтверждена",
  in_progress: "в работе",
  deadline_set: "срок назван",
  delivered: "выполнена",
  cancelled: "отменена",
};

function buildBrief(input: AnalysisInput, tasks: T[], flags: Flag[]): string {
  const contacts = [
    ...new Set(input.messages.filter((m) => m.side === "customer").map((m) => m.senderName)),
  ];
  const open = tasks.filter((t) => t.status !== "delivered" && t.status !== "cancelled");
  const parts = [
    `${input.customer.name} (${input.customer.kind}), dispatcher: ${input.customer.assigneeName ?? "unassigned"}.`,
    contacts.length ? `Contacts: ${contacts.slice(0, 4).join(", ")}.` : "",
    open.length
      ? `Open: ${open.map((t) => `${t.title.en} — ${STATUS_EN[t.status]}`).join("; ")}.`
      : "No open tasks.",
    flags.some((f) => f.kind === "complaint") ? "Recently complained about slow updates." : "",
    flags.some((f) => f.kind === "rude_tone") ? "A rude reply from our side was flagged." : "",
    input.rules.length ? `Preferences: ${input.rules.map((r) => r.text).join(" ")}` : "",
  ];
  return parts.filter(Boolean).join(" ").slice(0, 1200);
}

function buildDaySummary(input: AnalysisInput, tasks: T[], flags: Flag[]): L10n {
  const created = tasks.filter((t) => t.isNew).length;
  const delivered = tasks.filter((t) => t.status === "delivered").length;
  const open = tasks.filter((t) => t.status !== "delivered" && t.status !== "cancelled");
  const chats = new Set(input.messages.map((m) => m.channelId)).size;
  const issues = flags.map((f) => f.kind);
  const en = [
    `${input.messages.length} messages in ${chats} chats.`,
    created ? `${created} new request(s).` : "",
    delivered ? `${delivered} task(s) delivered.` : "",
    open.length
      ? `Open: ${open.map((t) => `${t.title.en} (${STATUS_EN[t.status]})`).join("; ")}.`
      : "Nothing open.",
    issues.length ? `Issues: ${[...new Set(issues)].join(", ").replace(/_/g, " ")}.` : "",
  ];
  const ru = [
    `${input.messages.length} сообщений в ${chats} чатах.`,
    created ? `Новых запросов: ${created}.` : "",
    delivered ? `Выполнено задач: ${delivered}.` : "",
    open.length
      ? `Открыто: ${open.map((t) => `${t.title.ru} (${STATUS_RU[t.status]})`).join("; ")}.`
      : "Открытых задач нет.",
    issues.length ? `Проблемы: ${[...new Set(issues)].join(", ").replace(/_/g, " ")}.` : "",
  ];
  return { en: en.filter(Boolean).join(" "), ru: ru.filter(Boolean).join(" ") };
}
