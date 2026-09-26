// Adapted from iva-agent (MIT), see THIRD_PARTY_NOTICES.md
// Source: agent/lib/security-gate.ts (scanOutbound) + packages/secret-redaction.
//
// Outbound secret redaction. Runs on every suggestion stored or shown, every digest
// item and every Telegram send. Matches become [REDACTED]; the text still goes out
// and the finding is returned so callers can log it (without the secret itself).

type Pattern = readonly [name: string, expression: RegExp];

// Env names whose values are secrets in this project.
const SECRET_KEY_NAMES = [
  "ANTHROPIC_API_KEY",
  "DATABASE_URL",
  "IMAP_PASSWORD",
  "LLM_API_KEY",
  "SESSION_SECRET",
  "TELEGRAM_BOT_TOKEN",
  "POSTGRES_PASSWORD",
  "access_token",
  "client_secret",
  "refresh_token",
];

const NAMED_SECRET = new RegExp(
  String.raw`(?<![A-Za-z0-9_])["']?(?:${SECRET_KEY_NAMES.join("|")})["']?\s*[=:]\s*["']?[^\s"'},]+`,
  "gu",
);

const API_KEY_PATTERNS: readonly Pattern[] = [
  ["named_secret", NAMED_SECRET],
  ["openai", /(?<![A-Za-z0-9])sk-(?!ant-|or-)[A-Za-z0-9_-]{20,}/g],
  ["openrouter", /(?<![A-Za-z0-9])sk-or-(?:v\d+-)?[A-Za-z0-9_-]{20,}/g],
  ["anthropic", /(?<![A-Za-z0-9])sk-ant-[A-Za-z0-9_-]{20,}/g],
  ["groq", /(?<![A-Za-z0-9])gsk_[A-Za-z0-9]{20,}/g],
  ["jwt", /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g],
  ["google_api", /AIza[A-Za-z0-9\-_]{35}/g],
  ["github_pat", /ghp_[A-Za-z0-9]{36}/g],
  ["github_fine", /github_pat_[A-Za-z0-9_]{82}/g],
  ["slack", /xox[bp]-[0-9]{10,}-[A-Za-z0-9-]+/g],
  ["telegram_bot", /\d{8,10}:[A-Za-z0-9_-]{35}/g],
  ["aws_access", /AKIA[A-Z0-9]{16}/g],
  ["stripe", /sk_(?:live|test)_[A-Za-z0-9]{20,}/g],
  ["bearer_token", /Bearer\s+[A-Za-z0-9\-._~+/]{16,}=*/gi],
  [
    "generic_key",
    /(?:api[\s_-]?key|apikey|api[\s_-]?token)["']?\s*[=:]\s*["']?[A-Za-z0-9\-._]{20,}/gi,
  ],
  ["generic_secret", /(?:secret|password|passwd|pwd)\s*[=:]\s*["']?[^\s"']{8,}/gi],
  ["url_userinfo", /(?<=:\/\/)[^\s/?#@:]*:[^\s/?#@]+(?=@[^\s/?#]+)/g],
];

const INTERNAL_PATH_PATTERNS: readonly Pattern[] = [
  ["home_dotfiles", /(?:\/home\/\w+|~)\/\.(?:ssh|config|env|gnupg|aws|docker|kube)/g],
  ["etc_sensitive", /\/etc\/(?:shadow|passwd|sudoers|ssh)/g],
  ["proc_environ", /\/proc\/\w+\/environ/g],
  ["dot_env_content", /^\w+_(?:KEY|TOKEN|SECRET|PASSWORD)\s*=\s*.+$/gm],
];

const EXFIL_PATTERNS: readonly Pattern[] = [
  [
    "markdown_image_exfil",
    /!\[.*?\]\(https?:\/\/[^)]*(?:token|key|secret|api|auth|password|env|data=)[^)]*\)/gi,
  ],
  [
    "url_with_secret_param",
    /https?:\/\/[^\s]*[?&](?:token|key|secret|api_key|password|auth)=[^\s&]{8,}/gi,
  ],
];

export const REDACTED = "[REDACTED]";

export type RedactionFinding = { type: string; name: string };
export type RedactionResult = { text: string; clean: boolean; findings: RedactionFinding[] };

export function redactOutbound(input: string): RedactionResult {
  let text = input;
  const findings: RedactionFinding[] = [];
  const groups: ReadonlyArray<readonly [string, readonly Pattern[]]> = [
    ["api_key", API_KEY_PATTERNS],
    ["internal_path", INTERNAL_PATH_PATTERNS],
    ["data_exfil", EXFIL_PATTERNS],
  ];
  for (const [type, patterns] of groups) {
    for (const [name, re] of patterns) {
      const matches = input.match(re);
      if (!matches) continue;
      for (const match of matches) {
        findings.push({ type, name });
        text = text.split(match).join(REDACTED);
      }
    }
  }
  return { text, clean: findings.length === 0, findings };
}
