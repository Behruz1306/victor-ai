// Adapted from iva-agent (MIT), see THIRD_PARTY_NOTICES.md
// Source: agent/lib/telegram-format.ts (escaping + length-safe chunking).
// Pulse sends plain text, so only the escaping and chunking parts are kept.

export const TELEGRAM_TEXT_LIMIT = 4096;

const HTML_ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };

export function escHtml(s: unknown): string {
  return String(s).replace(/[&<>]/g, (c) => HTML_ESC[c] ?? c);
}

/** Splits text into ≤limit chunks, preferring paragraph, then line, then word boundaries. */
export function chunkText(text: string, limit = TELEGRAM_TEXT_LIMIT): string[] {
  const chunks: string[] = [];
  let rest = text.trim();
  while (rest.length > limit) {
    const window = rest.slice(0, limit);
    let cut = window.lastIndexOf("\n\n");
    if (cut < limit * 0.5) cut = window.lastIndexOf("\n");
    if (cut < limit * 0.5) cut = window.lastIndexOf(" ");
    if (cut <= 0) cut = limit;
    chunks.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest) chunks.push(rest);
  return chunks;
}
