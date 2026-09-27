# LLM evaluation (`pnpm eval`)

`pnpm eval` seeds the demo company into its own database (`victor_eval`), runs the Apex
"yesterday" scenario through one model at a time (no response cache, no fallback), and checks what
the demo depends on. Nothing in the test changes between rounds — only prompts, schemas and the
deterministic apply layer do.

| Check | Expected outcome (BUILD_PROMPT §8 + golden path) |
| --- | --- |
| 1 | Reefer **48230** stuck at `acknowledged` ("ok") with an open `missing_deadline` signal |
| 2 | ETA for **48207** exists only in the Russian Fleet chat → `eta_not_forwarded` on that task, evidence = the Fleet message (16:30) |
| 3 | POD for **48190** promised "by 3pm" → `deadline_set` at 2026-09-25 15:00 CDT and `overdue` |
| 4 | Broker complaint ("third time we are chasing you") flagged, routed to the owner |
| 5 | Rude reply ("Stop spamming the chat") flagged and attributed to Timur |
| 6 | Load **48221** handled cleanly → `delivered`, no open signals (6b: clean customer Great Lakes has no signals) |
| 7 | The suggested reply to the broker carries the ETA and lists the Fleet message as context |
| 8a | Edit "around 4:30 PM → 4:30 PM CST, truck #214" with a reason → a learned CST rule |
| 8b | The next suggestion in the Apex chat uses CST and lists the rule as applied |
| 9 | Owner digest has 1–5 items, worded in EN and RU |

Run: `pnpm eval` (shortlist of every configured provider + mock baseline) or
`pnpm eval -- --models gemini:gemini-3.7-flash,mock --out docs/EVAL.md --round 3`.

## Providers and keys in this environment (2026-09-27)

| Provider | Status |
| --- | --- |
| Cerebras (primary, `LLM_BASE_URL=https://api.cerebras.ai/v1`) | ⚠️ `LLM_API_KEY` in `.env` is a 13-character placeholder with Cyrillic letters, not a key (HTTP headers cannot even carry it). The app detects this, disables the provider and says so in Settings / `pnpm demo:check`. `GET /models` could not be called, so Cerebras models are **not evaluated**; code defaults are Cerebras' documented ids `gpt-oss-120b` (main) / `llama3.1-8b` (fast) — re-run `pnpm eval` after adding a real key. |
| Google Gemini (fallback, OpenAI-compatible endpoint) | ✅ key works. |
| Anthropic | No key — provider stays in code, joins the chain only when `ANTHROPIC_API_KEY` is set. |

### `GET /models` — Gemini (61 ids)

`antigravity-preview-05-2026`, `antigravity-preview-09-2026`, `antigravity-preview-latest`, `aqa`,
`deep-research-max-preview-04-2026`, `deep-research-preview-04-2026`, `deep-research-pro-preview-12-2025`,
`gemini-2.5-computer-use-preview-10-2025`, `gemini-2.5-flash`, `gemini-2.5-flash-image`, `gemini-2.5-flash-lite`,
`gemini-2.5-flash-native-audio-latest`, `gemini-2.5-flash-native-audio-preview-09-2025`,
`gemini-2.5-flash-native-audio-preview-12-2025`, `gemini-2.5-flash-preview-tts`, `gemini-2.5-pro`,
`gemini-2.5-pro-preview-tts`, `gemini-3-flash-preview`, `gemini-3-pro-image`, `gemini-3-pro-image-preview`,
`gemini-3.1-flash-image`, `gemini-3.1-flash-image-preview`, `gemini-3.1-flash-lite`, `gemini-3.1-flash-lite-image`,
`gemini-3.1-flash-lite-preview`, `gemini-3.1-flash-live-preview`, `gemini-3.1-flash-tts-preview`,
`gemini-3.1-pro-preview`, `gemini-3.1-pro-preview-customtools`, `gemini-3.5-flash`, `gemini-3.5-flash-lite`,
`gemini-3.5-live-translate-preview`, `gemini-3.5-transcribe`, `gemini-3.5-transcribe-live`, `gemini-3.6-flash`,
`gemini-3.7-flash`, `gemini-3.8-flash`, `gemini-3.8-flash-lite-tts`, `gemini-3.8-flash-tts`, `gemini-3.8-live`,
`gemini-3.8-live-extended-thinking`, `gemini-embedding-001`, `gemini-embedding-2`, `gemini-embedding-2-preview`,
`gemini-flash-latest`, `gemini-flash-lite-latest`, `gemini-omni-1.1-flash`, `gemini-omni-flash-preview`,
`gemini-pro-latest`, `gemini-robotics-er-2-preview`, `gemini-robotics-er-2-streaming-preview`, `gemma-4-26b-a4b-it`,
`gemma-4-31b-it`, `lyria-3-clip-preview`, `lyria-3-pro-preview`, `lyria-3.5`, `lyria-realtime-exp`,
`nano-banana-pro-preview`, `veo-3.1-fast-generate-preview`, `veo-3.1-generate-preview`, `veo-3.1-lite-generate-preview`.

### Probing the free tier (one tiny strict-JSON-Schema request each)

| Model | Result |
| --- | --- |
| `gemini-3.8-flash` | ✅ 2.8 s, strict JSON Schema honoured (later: frequent 503 "high demand") |
| `gemini-3.7-flash` | ✅ 2.9 s |
| `gemini-3.6-flash` | ✅ 1.4 s |
| `gemini-3.5-flash` | ⚠️ 21 s, first answer ignored the schema |
| `gemini-3.5-flash-lite` | ✅ 0.9 s |
| `gemini-3.1-flash-lite` | ✅ 1.2 s |
| `gemma-4-26b-a4b-it` | ✅ 1.2 s (rejects `reasoning_effort`) |
| `gemma-4-31b-it` | ❌ 500 internal error |
| `gemini-3.1-pro-preview`, `gemini-pro-latest` | ❌ 429 — free-tier quota for pro models is 0 |
| `gemini-2.5-pro`, `gemini-2.5-flash` | ❌ 404 — "no longer available to new users" |
| `gemini-3-flash-preview`, `gemini-flash-latest` | ❌ 503 high demand |

No Gemini response carries `x-ratelimit-*` headers; 429 bodies carry `retryDelay`, which the
limiter honours. Cerebras sends `x-ratelimit-*` headers on every response; the limiter reads them.

**Shortlist** (strongest general models the free tier actually serves): `gemini-3.8-flash`,
`gemini-3.7-flash`, `gemini-3.6-flash`; fast candidates `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`.

## Rounds

### Round 1 — 2026-09-27, prompts from the first build

| Model | 1 | 2 | 3 | 4 | 5 | 6 | 6b | 7 | 8a | 8b | 9 | Passed | Avg analysis latency |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| mock (baseline) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 11/11 | 0.0 s |
| gemini-3.7-flash | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | 10/11 | 6.9 s |
| gemini-3.8-flash | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | 2/11 | — (503 high demand on every analysis call) |
| gemini-3.6-flash | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | 8/11 | 17.5 s |
| gemini-3.5-flash-lite | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | 9/11 | 3.5 s |
| gemini-3.1-flash-lite | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ | 9/11 | 7.5 s |

Failures and what changed for round 2 (prompts / apply layer, never the test):

- 3.7-flash 8b: the re-analysis after the edit hit 503 three times → added bounded retries for
  5xx/timeouts and **model failover inside a provider** (`GEMINI_MODEL` accepts a list).
- 3.5-flash-lite 3: POD deadline written as **2025**-09-25 (timeline stamps have no year) → NOW now
  states the full date, year and UTC offset; the apply layer repairs a deadline that is a year off
  its evidence message (`repairDeadlineYear`, unit-tested).
- 3.6-flash 7: its one suggestion for the Apex chat was about another item → prompt sets the
  priority inside a chat (complaint / unanswered ETA first).
- 3.1-flash-lite 6: no task for 48221 (already completed) → prompt: completed requests are tasks too.
- 8b everywhere: after the ETA was sent the models proposed nothing or a message without a time →
  prompt: open items keep needing messages; promises carry a concrete time; time-format rules
  apply to every time written for that customer.

### Round 2 — 2026-09-27 06:51 UTC — priority, completed tasks, year+offset, retries

| Model | 1 | 2 | 3 | 4 | 5 | 6 | 6b | 7 | 8a | 8b | 9 | Passed | Avg analysis latency | Calls (failed) | Tokens in/out |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| gemini:gemini-3.7-flash | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | 2/11 | 12.1 s | 4 (2) | 3140/2457 |
| gemini:gemini-3.5-flash-lite | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | 10/11 | 5.8 s | 6 (0) | 12950/7594 |
| gemini:gemini-3.1-flash-lite | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | 10/11 | 11.4 s | 6 (0) | 13325/7321 |
| gemini:gemini-3.6-flash | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | 10/11 | 13.7 s | 6 (1) | 9296/5918 |
| gemini:gemini-3.8-flash | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | 9/11 | 14.1 s | 6 (3) | 7843/6005 |

Checks: 1 = 48230 stuck at acknowledged; 2 = eta_not_forwarded (48207); 3 = 48190 POD overdue; 4 = complaint flagged; 5 = rude tone flagged (Timur); 6 = 48221 delivered cleanly; 6b = clean customer has no signals; 7 = ETA suggestion uses the Fleet message; 8a = edit distilled into a CST rule; 8b = next suggestion follows the learned rule; 9 = owner digest ≤5 worded items

- **gemini:gemini-3.7-flash** failed: 1 (status=no task, missing_deadline=0); 2 (task=none, signals=0); 3 (status=none, deadline=-, overdue=0); 4 (signals=0); 5 (signals=0); 6 (path=none); 7 (no ETA suggestion (0 pending)); 8a (no ETA suggestion to edit); 8b (no ETA suggestion to edit)
- **gemini:gemini-3.5-flash-lite** failed: 8b ("Hi Mike, apologies for the delay on load 48230. We are finalizing the truck assignment and" rules=0)
- **gemini:gemini-3.1-flash-lite** failed: 6b (open=2)
- **gemini:gemini-3.6-flash** failed: 8b (no next suggestion)
- **gemini:gemini-3.8-flash** failed: 8a (no rule); 8b (no next suggestion)

Round 2 notes: quality is now 10/11 for three models; the remaining failures are mostly the free
tier itself — 503 "high demand" (3.7-flash on the first analysis, 3.6-flash on the re-analysis) and a
429 quota on 3.8-flash (its free daily quota is small). 8b for 3.5-flash-lite: the follow-up
promised "finalizing the truck assignment" without a clock time, so no CST → round 3 asks for clock
times in promises and makes applying every fitting rule explicit. 6b for 3.1-flash-lite: two
signals on the clean customer (model-specific; not seen with other models).

### Round 3 — 2026-09-27 06:55 UTC — clock times in promises, apply every fitting rule

| Model | 1 | 2 | 3 | 4 | 5 | 6 | 6b | 7 | 8a | 8b | 9 | Passed | Avg analysis latency | Calls (failed) | Tokens in/out |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| gemini:gemini-3.5-flash-lite | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | 10/11 | 7.6 s | 6 (0) | 13496/7683 |
| gemini:gemini-3.1-flash-lite | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 11/11 | 11.7 s | 6 (0) | 13534/6528 |
| gemini:gemini-3.6-flash | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | 9/11 | 22.9 s | 6 (3) | 7993/5229 |
| gemini:gemini-3.7-flash | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | 2/11 | 0.0 s | 4 (4) | 0/0 |

Checks: 1 = 48230 stuck at acknowledged; 2 = eta_not_forwarded (48207); 3 = 48190 POD overdue; 4 = complaint flagged; 5 = rude tone flagged (Timur); 6 = 48221 delivered cleanly; 6b = clean customer has no signals; 7 = ETA suggestion uses the Fleet message; 8a = edit distilled into a CST rule; 8b = next suggestion follows the learned rule; 9 = owner digest ≤5 worded items

- **gemini:gemini-3.5-flash-lite** failed: 8b ("Hi Mike, regarding load 48230, we are finalizing the unit assignment and will confirm the " rules=1)
- **gemini:gemini-3.6-flash** failed: 8a (no rule); 8b (no next suggestion)
- **gemini:gemini-3.7-flash** failed: 1 (status=no task, missing_deadline=0); 2 (task=none, signals=0); 3 (status=none, deadline=-, overdue=0); 4 (signals=0); 5 (signals=0); 6 (path=none); 7 (no ETA suggestion (0 pending)); 8a (no ETA suggestion to edit); 8b (no ETA suggestion to edit)

Round 3 notes: **gemini-3.1-flash-lite passes 11/11**; 3.5-flash-lite 10/11 (its follow-up said
"will confirm shortly" — no clock time, so no CST). 3.6/3.7-flash failed on HTTP 429: the 429 body
says `GenerateRequestsPerDayPerProjectPerModel-FreeTier, quotaValue 20` — **every Gemini model is
capped at 20 requests per day on the free tier**, while its `retryDelay` says "5s". The limiter now
reads that quota id and pauses the model until the quota day rolls over (midnight Pacific) instead
of retrying in 5 s, and `rpd` for Gemini models is 20.

### Round 3b — high-quota open model

| Model | Result |
| --- | --- |
| `gemma-4-26b-a4b-it` | ❌ the Apex analysis timed out 3× at 90 s (≈280 s). Too slow for a live demo; not used. |
| `gemma-4-31b-it` | not run (500 in the probe, same family) |

## Choice

| Role | Env var | Chain (tried in order) | Why |
| --- | --- | --- | --- |
| Main (analysis, handoff) | `GEMINI_MODEL` | `gemini-3.1-flash-lite, gemini-3.5-flash-lite, gemini-3.7-flash, gemini-3.6-flash, gemini-3.8-flash` | 11/11 first; each model has its own 20/day quota and its own load, so five models give ~100 analyses/day and survive 503 spikes |
| Fast (digest wording, rule distillation, mapping) | `GEMINI_FAST_MODEL` | `gemini-3.5-flash-lite, gemini-3.1-flash-lite, gemini-3.7-flash` | fastest model that passed 8a/9 in every round (0.9–5 s) |
| Primary provider | `LLM_MODEL` / `LLM_FAST_MODEL` (Cerebras) | `gpt-oss-120b` / `llama3.1-8b` | ⚠️ not evaluated — no Cerebras key here; Cerebras' documented flagship and small models. Run `pnpm eval` once a key is in `.env`. |
| Last resort | — | mock heuristics | offline, deterministic, 11/11 |

Demo budget: "Load yesterday" = 3 analyses + 1 digest; the edit = 1 distill + 1 re-analysis; each
live Telegram message ≈ 1 analysis. A full run ≈ 8–12 requests; repeated rehearsals of the same
scenario are served from the demo response cache (0 requests).

## Requests used in this session

| Provider | Requests | Notes |
| --- | --- | --- |
| Google Gemini | ≈ 115 (98 through the limiter + 17 probes + 2 `/models`) | free tier; 3.6/3.7/3.8-flash hit their 20/day cap during round 3 |
| Cerebras | 0 | placeholder key |
| Anthropic | 0 | no key |
