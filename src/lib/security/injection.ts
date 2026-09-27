// Adapted from iva-agent (MIT), see THIRD_PARTY_NOTICES.md
// Source: agent/lib/security-gate.ts (sanitizeInbound, "web" surface rules).
//
// Deterministic prompt-injection screen for inbound chat text. For Victor AI every chat
// message is DATA, never an instruction, so the policy is Iva's warn-and-pass "web"
// surface: the text always reaches the model, but a flagged message is marked
// `untrusted_flag` and wrapped in <untrusted> tags inside every prompt.

const INVISIBLE_RE = /[\p{Cf}\p{Cc}͏]/gu;
const KEEP_CONTROL = new Set(["\n", "\r", "\t"]);
// Scripts that tokenize at 3-10 tokens per glyph (Tibetan, Yi, Braille, math alphanumerics).
const WALLET_DRAIN_RE = /[ༀ-࿿ꀀ-꓏⠀-⣿]|[\u{1D400}-\u{1D7FF}\u{10000}-\u{1034F}]/gu;
export const MAX_INBOUND_CHARS = 50_000;

const LOOKALIKES: Record<string, string> = {
  А: "A",
  В: "B",
  С: "C",
  Е: "E",
  Н: "H",
  К: "K",
  М: "M",
  О: "O",
  Р: "P",
  Т: "T",
  Х: "X",
  а: "a",
  с: "c",
  е: "e",
  о: "o",
  р: "p",
  х: "x",
  у: "y",
  Α: "A",
  Β: "B",
  Ε: "E",
  Ζ: "Z",
  Η: "H",
  Ι: "I",
  Κ: "K",
  Μ: "M",
  Ν: "N",
  Ο: "O",
  Ρ: "P",
  Τ: "T",
  Υ: "Y",
  Χ: "X",
  ο: "o",
  ν: "v",
};

const UZ_APOSTROPHE = "['‘’ʻʼ`]?";

const ROLE_MARKER_RE = new RegExp(
  String.raw`(?:^|\n)\s*(?:system|assistant|user|human|AI|claude|instruction|admin|root` +
    String.raw`|система|систем|ассистент|пользователь|человек|админ|инструкция` +
    String.raw`|tizim|yordamchi|foydalanuvchi|inson|ko${UZ_APOSTROPHE}rsatma)\s*[:-]\s`,
  "gimu",
);

const EN_OVERRIDES = [
  /ignore\s+(?:all\s+)?previous\s+instructions?/i,
  /forget\s+(?:all\s+)?(?:your\s+)?(?:previous\s+)?instructions?/i,
  /you\s+are\s+now\s+(?:in\s+)?(?:\w+\s+)?mode/i,
  /new\s+(?:system\s+)?instructions?\s*:/i,
  /override\s+(?:all\s+)?(?:safety|security|rules|guidelines)/i,
  /act\s+as\s+(?:if\s+)?(?:you\s+are\s+)?(?:a\s+)?(?:different|new|unrestricted)/i,
  /(?:DAN|STAN|DUDE|KEVIN)\s+mode/i,
  /jailbreak|do\s+anything\s+now/i,
  /pretend\s+(?:you\s+)?(?:are|have)\s+no\s+(?:rules|restrictions|limits)/i,
  /(?:reveal|show|display|print|output)\s+(?:your\s+)?(?:system\s+)?(?:prompt|instructions)/i,
  /(?:send|forward|email|post)\s+(?:all\s+)?(?:data|files|secrets|keys|tokens)/i,
];

const RU_UZ_OVERRIDES = [
  /(?:про)?игнорир\p{L}*\s+(?:\p{L}+\s+){0,3}?(?:инструкц|указан|правил|предписан|команд)\p{L}*/iu,
  /забуд\p{L}*\s+(?:\p{L}+\s+){0,3}?(?:инструкц|указан|правил|предписан|роль)\p{L}*/iu,
  /(?:нов|друг)\p{L}+\s+(?:инструкц|указан|предписан)\p{L}*\s*:/iu,
  /(?:систем\p{L}+\s+(?:промпт|подсказк)\p{L}*|промпт\p{L}*\s+систем\p{L}+)/iu,
  /режим\p{L}*\s+(?:разработчик|бога|dev)\p{L}*/iu,
  /(?:покажи|выведи|раскрой|напечатай)\p{L}*\s+(?:\p{L}+\s+){0,3}?(?:промпт|инструкц|систем)\p{L}*/iu,
  /(?:отмени|обойди|сними|отключи)(?:те)?(?!\p{L})\s+(?:\p{L}+\s+){0,3}?(?:ограничен|запрет|защит|цензур|фильтр)\p{L}*/iu,
  new RegExp(
    String.raw`(?:oldingi|avvalgi|barcha)\s+(?:\p{L}+\s+){0,2}?ko${UZ_APOSTROPHE}rsatma\p{L}*`,
    "iu",
  ),
  new RegExp(
    String.raw`(?:tizim|dasturchi)\s*\p{L}*\s+(?:prompt|ko${UZ_APOSTROPHE}rsatma|rejim)\p{L}*`,
    "iu",
  ),
];

// Intent families from Iva's web surface. The "your new task" family is left out on
// purpose: in dispatch chats «ваша задача» is ordinary business language.
const INTENT_PATTERNS = [
  /(?<!\p{L})ты\s+(?:больше|уже)\s+не\s+(?:\p{L}+\s+){0,2}?(?:ассистент|помощник|бот|модель|ии(?!\p{L})|claude|gpt|обязан|должен|огранич)/iu,
  /\byou\s+are\s+no\s+longer\s+(?:\w+\s+){0,2}?(?:an?\s+(?:assistant|ai|model|bot)|bound|restricted|limited|subject\s+to)/i,
  /\bfrom\s+now\s+on,?\s+you\s+(?:are|will|must|act)\b/i,
  /(?:send|post|upload|exfiltrate|dump|leak)\s+(?:\S+\s+){0,4}?(?:\.env\b|id_rsa|\/\.ssh|environment\s+variables|credentials)/i,
  /(?:отправ|перешл|пришл|выгруз|слей|скинь)\p{L}*\s+(?:[^\s.]+\s+){0,4}?(?:\.env\b|id_rsa|\.ssh|переменн\p{L}*\s+окружен\p{L}*)/iu,
  /\bfollow\s+the\s+(?:instructions?|steps?)\s+(?:on|at|from|in)\s+(?:this\s+|the\s+)?(?:https?:|link|url|page(?!\s+\d))/i,
  /\b(?:do\s*n[o']?t|never)\s+(?:\w+\s+){0,3}?(?:tell|show|mention|reveal|inform)\s+(?:this\s+)?(?:to\s+)?the\s+(?:user|owner|human)/i,
  /не\s+(?:\p{L}+\s+){0,2}?(?:показыв|сообщ|говор|раскрыв|упомин)\p{L}*\s+(?:\p{L}+\s+){0,3}?(?:пользовател|владельц|хозя)\p{L}*/iu,
];

const OVERRIDES = [...EN_OVERRIDES, ...RU_UZ_OVERRIDES, ...INTENT_PATTERNS];

export type ScreenResult = {
  /** Text with invisible characters removed and capped; this is what gets stored. */
  text: string;
  /** Attack signal present → store with untrusted_flag and wrap in prompts. */
  flagged: boolean;
  /** Iva's block threshold reached (still passed on as data, never obeyed). */
  blocked: boolean;
  reason: string;
  flags: string[];
};

function normalizeLookalikes(text: string): { text: string; normalized: number } {
  let normalized = 0;
  const probe = Array.from(text)
    .map((c) => {
      const mapped = LOOKALIKES[c];
      if (mapped) normalized++;
      return mapped ?? c;
    })
    .join("");
  return { text: probe, normalized };
}

export function screenInbound(input: string, maxChars = MAX_INBOUND_CHARS): ScreenResult {
  const originalLen = input.length;
  const flags: string[] = [];
  let invisibleRemoved = 0;
  let text = input.replace(INVISIBLE_RE, (c) => {
    if (KEEP_CONTROL.has(c)) return c;
    invisibleRemoved++;
    return "";
  });
  let expensive = 0;
  text = text.replace(WALLET_DRAIN_RE, () => {
    expensive++;
    return "";
  });
  const capped = Array.from(text).slice(0, maxChars).join("");
  if (capped.length < text.length) flags.push(`truncated=${text.length - capped.length}`);
  text = capped;

  if (originalLen > 100 && invisibleRemoved > originalLen * 0.05) {
    return {
      text,
      flagged: true,
      blocked: true,
      reason: "invisible-flood",
      flags: ["invisible-flood"],
    };
  }
  if (invisibleRemoved) flags.push(`invisible=${invisibleRemoved}`);
  if (expensive > 50) {
    return { text, flagged: true, blocked: true, reason: "wallet-drain", flags: ["wallet-drain"] };
  }

  const { text: probe, normalized } = normalizeLookalikes(text);
  if (normalized) flags.push(`lookalikes=${normalized}`);
  const folded = text.normalize("NFKC");
  const views = [...new Set([text, probe, folded, normalizeLookalikes(folded).text])];
  const roleMarkers = Math.max(...views.map((v) => (v.match(ROLE_MARKER_RE) ?? []).length));
  const overrides = OVERRIDES.filter((re) => views.some((v) => re.test(v))).length;
  if (roleMarkers) flags.push(`role-markers=${roleMarkers}`);
  if (overrides) flags.push(`overrides=${overrides}`);

  const blocked = (roleMarkers >= 2 && overrides >= 1) || overrides >= 3;
  const flagged = blocked || overrides > 0 || roleMarkers > 0;
  return {
    text,
    flagged,
    blocked,
    reason: blocked
      ? `prompt injection: ${roleMarkers} role markers, ${overrides} override patterns`
      : flagged
        ? "suspicious phrasing"
        : "clean",
    flags,
  };
}

/** Wraps chat text for a prompt. Flagged text is marked so the model treats it as data only. */
export function wrapUntrusted(text: string, flagged: boolean): string {
  const safe = text.replace(/<\/?untrusted>/gi, "");
  return flagged ? `<untrusted>${safe}</untrusted>` : safe;
}
