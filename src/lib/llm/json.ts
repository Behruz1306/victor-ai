// Structured output helpers shared by every OpenAI-compatible provider: JSON Schema for the
// request, lenient parsing of what comes back, and the wording for JSON mode / repair.
import { z } from "zod";

/** JSON Schema for `response_format` (strict json_schema mode) and for JSON-mode prompts. */
export function jsonSchemaFor(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _drop, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  return rest;
}

/**
 * Parses model text into a value. Tolerates what models add around JSON in JSON mode:
 * code fences, a sentence before the object, trailing prose.
 */
export function parseJsonLenient(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through
  }
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      // fall through
    }
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
  throw new SyntaxError("no JSON object in the model output");
}

export type ParseOutcome<T> = { ok: true; value: T } | { ok: false; error: string };

/** Lenient parse + zod validation. The error text is short enough to feed back for repair. */
export function parseStructured<T>(text: string, schema: z.ZodType<T>): ParseOutcome<T> {
  let raw: unknown;
  try {
    raw = parseJsonLenient(text);
  } catch (err) {
    return {
      ok: false,
      error: `invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { ok: true, value: parsed.data };
  const issues = parsed.error.issues
    .slice(0, 8)
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
  return { ok: false, error: `schema mismatch: ${issues}` };
}

export function jsonModeInstructions(jsonSchema: Record<string, unknown>): string {
  return `OUTPUT FORMAT
Return ONLY one JSON object — no prose, no markdown, no code fences — that validates against this JSON Schema (every property is required; use null where the schema allows it):
${JSON.stringify(jsonSchema)}`;
}

export function repairPrompt(original: string, previous: string, error: string): string {
  return `${original}

YOUR PREVIOUS ANSWER WAS REJECTED (${error.slice(0, 400)}).
Previous answer (first 1500 characters): ${previous.slice(0, 1500)}
Answer again with one valid JSON object that matches the schema exactly.`;
}
