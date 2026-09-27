// Lists the models each configured OpenAI-compatible provider exposes (GET /models).
// Prints ids only — never keys. Usage: pnpm llm:models
import { realProviders } from "@/lib/llm/providers";

async function main() {
  for (const p of realProviders()) {
    try {
      const res = await fetch(`${p.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${p.apiKey}` },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        console.log(`${p.id}: HTTP ${res.status}`);
        continue;
      }
      const body = (await res.json()) as { data?: { id: string; owned_by?: string }[] };
      const ids = (body.data ?? []).map((m) => m.id.replace(/^models\//, "")).sort();
      console.log(`${p.id} (${ids.length} models):`);
      for (const id of ids) console.log(`  ${id}`);
    } catch (err) {
      console.log(`${p.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

void main();
