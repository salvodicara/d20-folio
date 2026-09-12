# GPT-6 Astra (Codex) vs Claude Fable 5.1 (Claude Code) — benchmark evidence and routing

Research date: 2026-09-12. Purpose: an evidence-based "which agent does what" table for d20 Folio v2
plus a protocol to re-run it when a model ships. Every score carries its publication date, URL and a
flag: **V** = vendor-reported (launch table / system card), **I** = independent run, **A** =
aggregator quoting a vendor number. Nothing here is authority — it is evidence for an owner decision
in `docs/program/DECISIONS.md`.

## 0. The two agents as they exist today

| | Codex (OpenAI) | Claude Code (Anthropic) |
|---|---|---|
| Frontier model | **GPT-6 Astra** — `gpt-6-astra`, launched 2026-09-03; 1,050,000-token context (922K max input), 128K output; $10 / $50 per M tokens, cached input $1/M; prompts above 272K input tokens cost 2x input and 1.5x output; knowledge cutoff 2026-04-30. Reasoning effort: **low, medium, high, xhigh, max** (no "ultra" — that was a Sol-only mode). Tools: web search, image generation, hosted shell, apply-patch, computer use, MCP, skills. | **Claude Fable 5.1** — `claude-fable-5-1`, launched 2026-09-01; 1M context, no long-context surcharge, 128K output; $10 / $50 per M, cache reads $0.25/M (75% cut); cutoff June 2026; adaptive thinking with effort levels up to max. |
| Secondary models | GPT-5.6 Sol (default in Codex, $4/$20), Terra, Luna (2026-07-09) | Claude Opus 5 (2026-07-24; default on Claude Max), Sonnet 5 (2026-06-30) |
| In the agent today | Astra is *selectable* in Codex (CLI ≥ 0.153, `model = "gpt-6-astra"` or `codex -m gpt-6-astra --reasoning-effort xhigh`); Sol stays the default. | `/model fable` resolves to Fable 5.1 in Claude Code ≥ 2.1.255; Opus 5 is the plan default. Anthropic's guidance: start with Opus 5, use Fable 5.1 for demanding reasoning and long-horizon work. |
| Plan availability | There is no "ChatGPT Max" plan. Astra in Codex: **Plus** (limited: 5–45 local msgs / 5 h), **Pro $100** (25–225 / 5 h, full allowance), **Pro $200** (100–900 / 5 h), Business/Enterprise; a second 7-day window also applies; extra usage via credits. In *Chat* Astra is "GPT-6 Pro", Pro/Business/Enterprise only. Image generation turns burn allowance 3–5x faster than text. | Claude Max (5x / 20x): Opus 5 default, Fable 5.1 available; Fable 5.1 uses 25–50% more tokens than Fable 5 on the same jobs (practitioner report), so Max budgets matter. |
| Sources | [OpenAI model page](https://developers.openai.com/api/docs/models/gpt-6-astra) · [OpenAI announcement](https://openai.com/index/gpt-6-astra/) (403 to fetch; numbers via officechai / Vellum / MindStudio) · [9to5mac](https://9to5mac.com/2026/09/04/openai-releasing-major-upgrade-to-chatgpt-and-codex-with-gpt-6-astra-details-here/) · [OpenAI Help: usage with Astra in Work and Codex](https://help.openai.com/en/articles/20001516-managing-usage-with-gpt-6-astra-in-work-and-codex) (403; limits via [codexusage.dev](https://www.codexusage.dev/limits/astra) 2026-09-11 and [Notebookcheck](https://www.notebookcheck.net/GPT-6-Astra-is-on-ChatGPT-Plus-but-only-in-Work-and-Codex.1391574.0.html)) · [Codex KB Astra config](https://codex.danielvaughan.com/2026/09/03/gpt-6-astra-codex-cli-configuration-context-notes-safety/) | [Anthropic system card](https://www-cdn.anthropic.com/0339e6a7c5c7b87f5c07798616dc32c215d14235/Claude%20Fable%205.1%20&%20Claude%20Mythos%205.1%20System%20Card.pdf) · [What's new in Fable 5.1](https://platform.claude.com/docs/en/models/fable-5-1/whats-new-fable-5-1) · [Claude Code model config](https://code.claude.com/docs/en/model-config) · [claudefa.st](https://claudefa.st/blog/models/model-selection) |

Two caveats before the numbers. **Neither vendor published a matched suite against the other's
newest model** (OpenAI compares Astra with Sol and, on some rows, Fable 5.1 or Opus 5; Anthropic
compares Fable 5.1 with Sol, not Astra). And **Artificial Analysis re-versioned its indices on
2026-09-09 (v4.3)**, so the widely quoted "Astra 67 vs Fable 5.1 70" (Coding Agent Index, 3–4 Sep)
and "61 vs 66" (Intelligence Index) are the *old scale*; on v4.3 both flagships are 53 = 53 and
62 = 62. Both scales are reported below with dates.

## 1. Score table (primary pair: GPT-6 Astra vs Claude Fable 5.1)

### 1.1 Composite indices (independent)

| Index | GPT-6 Astra | Claude Fable 5.1 | GPT-5.6 Sol | Opus 5 | Flag | Date / source |
|---|---|---|---|---|---|---|
| AA Intelligence Index v4.3 | **53** | **53** | 47 | 51 | I | 2026-09-09 · [AA: Benchmarking GPT-6 Astra](https://artificialanalysis.ai/articles/benchmarking-gpt-6-astra) · [index page](https://artificialanalysis.ai/evaluations/artificial-analysis-intelligence-index) |
| AA Intelligence Index (pre-v4.3 scale) | 61 (61.2 on v4.1.1) | 66 (65.7) | 61 (60.9) | 63 | I | 2026-09-03/04 · [MindStudio](https://www.mindstudio.ai/blog/gpt-6-astra-benchmarks-analysis), [officechai](https://officechai.com/ai/gpt-6-astra-benchmarks/), [AA Fable 5.1](https://artificialanalysis.ai/articles/claude-fable-5-1) |
| AA Coding Agent Index v4.3 (Astra in Codex, Fable in Claude Code) | **62** | **62** | 55 | 60 | I | 2026-09-09 · AA. Note: "part of that gap belongs to the scaffolding rather than the model" ([DataCamp](https://www.datacamp.com/blog/gpt-6-astra-vs-claude-fable-5-1)) |
| AA Coding Agent Index (pre-v4.3) | 67 | 70 | — | ~67 | I | 2026-09-03/04 · [AI Weekly](https://aiweekly.co/alerts/gpt-6-astra-lands-at-67-on-coding-index-behind-fable-51s-70), MindStudio, [AA on X](https://x.com/ArtificialAnlys/status/2095595489031000350): Astra "equal to Fable 5 at lower cost", one-third the tokens of Sol (max), one-fifth of Opus 5 (xhigh) |
| AA cost per Intelligence-Index task (max) | **$3.26** | $7.63 | $1.99 | — | I | 2026-09-09 · AA. Output tokens/task: Astra 27k vs Fable 5.1 78k. Astra ≈ 75% dearer than Sol per task, ≈ 2.3x cheaper than Fable 5.1 |
| Vals Index | #3 / 56 | **68.83 (#1 / 56)** | #2 (July) | — | I | 2026-09-01/10 · [Vals Fable 5.1](https://www.vals.ai/models/anthropic_claude-fable-5-1), [Vals Astra](https://www.vals.ai/models/openai_gpt-6-astra) |
| Arena Agent leaderboard (net improvement) | 12.39% (#2) | **13.85% (#1)** | — | — | I (crowd) | 2026-09-09 · [arena.ai agent](https://arena.ai/leaderboard/agent?rankBy=labs) |
| llm-stats composite | **59.90** | 55.90 | 55.00 | — | A | Sep 2026 · [llm-stats](https://llm-stats.com/benchmarks) |

### 1.2 Software engineering

| Benchmark | GPT-6 Astra | Claude Fable 5.1 | GPT-5.6 Sol | Opus 5 | Flag | Date / source |
|---|---|---|---|---|---|---|
| SWE-bench Pro | **not published** (OpenAI reported DeepSWE instead) | **81.2** (vendor scaffold) | 64.6 (Terra 63.4, Luna 62.7) | 79.2 | V | 2026-09-01 (Anthropic system card), 2026-07-09 (OpenAI) · [BenchLM](https://benchlm.ai/benchmarks/swe-bench-pro), [alphacorp](https://alphacorp.ai/blog/gpt-6-astra-vs-claude-fable-5-1-benchmarks-pricing-and-which-is-better). Caveats: Scale's standardized SEAL scaffold runs 15–30 pts below vendor scaffolds ([Scale Labs](https://labs.scale.com/leaderboard)); OpenAI's July 2026 audit found ~30% of public tasks broken |
| DeepSWE v1.1 | **74.1** | 67.4 | 72.7 | 73.7 | V (OpenAI) | 2026-09-03 · [officechai](https://officechai.com/ai/gpt-6-astra-benchmarks/), [BenchLM compare](https://benchlm.ai/compare/claude-fable-5-1-vs-gpt-6-astra) |
| SWE-bench Verified | not published | not published (Fable 5: 95.0 V) | 96.2 (A) | 96.0 V / 97.0 Vals | V/I | Jun–Aug 2026 · [morphllm](https://www.morphllm.com/best-ai-model-for-coding). **Saturated; no longer discriminates** |
| Terminal-Bench 4.0 | **57.7 (V) / 57.9 (I, AA)** | 55.8 (V) | 37.3 | 52.3 | V + I | 2026-09-03 (OpenAI), 2026-09-09 (AA), 2026-09-01 (Anthropic) · [Vellum Astra](https://www.vellum.ai/blog/gpt-6-astra-benchmarks-explained), [Vellum Fable 5.1](https://www.vellum.ai/blog/claude-fable-5-1-mythos-5-1-benchmarks-explained), BenchLM (57.90) |
| Terminal-Bench 2.1 (Vals, same harness for all) | **87.27 (#1 / 64)** | 85.02 (#3) | 85.77 (#2) | 84.64 | I | 2026-09-10 · [BenchLM Vals TB 2.1](https://benchlm.ai/benchmarks/valsterminalbench21) |
| Terminal-Bench 2.1 (AA run) | — | **91.4** | 88.8 (V; ultra 91.9) | 89.1 (V) | I / V | 2026-09-01 · AA Fable 5.1; 2026-07-14 · [LayerLens](https://layerlens.ai/blog/gpt-5-6-benchmark-review-sol-terra-luna) |
| Terminal-Bench-Science 0.1 | **64.6** | 52.6 | 22.4 | 29.0–30.0 | V (both vendors) | 2026-09-01/03 · Vellum ×2 |
| CursorBench 3.2.0 | not published | **73.4** | 67.2 | 70.0 | V (Anthropic) | 2026-09-01 · Vellum, [DataCamp](https://www.datacamp.com/blog/claude-fable-5-1) |
| FrontierCode 1.1 | 64.5 | regression at high effort (see §3) ; Fable 5: 64.9 | — | — | V | 2026-09-03 · Vellum Astra, Zvi |
| LiveCodeBench (Vals) | not listed | **90.52 (#1 / 143)** | — | — | I | 2026-09-01 · Vals |
| Code Migration (Vals) | **#1 / 58** | — | — | — | I | 2026-09-10 · Vals |
| Vibe Code Bench v1.1 (Vals) | #3 / 94 | — | — | — | I | 2026-09-10 · Vals |
| Aider Polyglot | — | — | — | — | I (frozen) | Leaderboard stopped at GPT-5 88.0 (2025); none of the 2026 models submitted · [llm-stats](https://llm-stats.com/benchmarks/aider-polyglot) 2026-09-12. **Retired as a signal** |
| HumanEval-style | — | — | — | — | — | Saturated since 2025; nobody reports it. Dropped |
| Code review — CodeRabbit (105 known issues; recall / precision / comments) | "relative advantage grows to **20% over Sol and 33% over Opus 5**" on cross-file bugs | 61.0 / 37.3 / 166 | 69.7 / 31.6 / 231 | 55.2 / 39.3 / 166 | I | 2026-09-04 · [CodeRabbit Astra](https://www.coderabbit.ai/blog/gpt-6-astra-code-review-evaluation); 2026-09-01 · [CodeRabbit Fable 5.1](https://www.coderabbit.ai/blog/fable-5-1-model-review) |
| SRE-Bench (single attempt) | **88.0** | 12.5 (Vellum) — officechai lists 12.5 under Opus 5 | 55.9 | 12.5 | V (OpenAI) | 2026-09-03 · Vellum, officechai — attribution of the 12.5 differs between aggregators |
| Snorkel AI 27 shared coding tasks | — | both solved 18; Fable alone 2 | — | Opus alone 5 | I (n=27) | 2026-09-06 · [Pochang Lab](https://pochanglab.com/en/blog/gpt-6-astra-codex-review) (Fable 5 vs Opus 5) |

### 1.3 Agentic, computer use, tool use, autonomy

| Benchmark | GPT-6 Astra | Claude Fable 5.1 | GPT-5.6 Sol | Opus 5 | Flag | Date / source |
|---|---|---|---|---|---|---|
| OSWorld 2.0 | **72.6** (offline set) | 77.9 partial / 41.7 strict | 65.7 | 70.2 (OpenAI table) / 75.4 / 39.6 (Anthropic table) | V — *settings differ; not comparable across vendors* | 2026-09-01/03 · Vellum ×2, [MiraFlow](https://miraflow.ai/blog/osworld-2-explained-computer-use-agent-benchmark-2026) |
| OSWorld-Verified (public board) | not listed | not listed (Fable 5: 85.0 #2) | not listed | — | I | 2026-09-10 · [BenchLM](https://benchlm.ai/benchmarks/osworld-verified) |
| ScreenSpot-Pro (GUI grounding) | **92.7** | 87.3 | 76.9 | — | V (OpenAI) | 2026-09-03 · officechai |
| Agents' Last Exam | **59.3** | 48.7 | 53.6 | 55.5 | V (OpenAI) | 2026-09-03 · officechai |
| AutomationBench | **41.4** (AA-run variant: 69) | 31.4 | 18.1–19.6 | 26.9 | V + I | Vellum, AA |
| BrowseComp | **91.5** | — | 90.4 | — | V | officechai |
| BenchCAD (vision → CAD) | **95.9** | 84.3 | 83.3 | — | V | Vellum Astra |
| GDPval-AA v2 (Elo, agentic knowledge work) | ~45 Elo below Sol | **1853** | 1711 | 1824 | I (AA) | 2026-09-01/09 · AA |
| τ²-bench | — | — (Fable 5: 81.5 Airline #1) | — | — | I | 2026-09-11 · [OpenRouter τ²-Airline](https://openrouter.ai/benchmarks/tau2-bench-airline). **No Astra / Fable 5.1 runs found — thin** |
| METR 50% time horizon | not evaluated | not evaluated | ~11.3 h (95% CI 5–40 h) with cheating scored as failure; "detected cheating rate higher than any public model" on METR's harness; not "a robust measurement" | not evaluated | I | 2026-06-26 · [METR](https://metr.org/blog/2026-06-26-gpt-5-6-sol/); [horizons page](https://metr.org/time-horizons/) last update 2026-05-08, ">16 h unreliable" |
| OpenAI alignment rows (lower is better) | computer-use safety 2.4%, honeypot cheating 0.0%, hallucination 4.2% | — | 22.0% / 48.2% / 12.2% | — | V (OpenAI) | officechai. AA independent: Astra Omniscience hallucination 51% (down from 92%) — a very different framing |
| Chain-of-thought monitorability | "substantial decrease" vs Sol (system card) | — | — | — | V | Codex KB, Józefiak — relevant to reviewing Astra's work rather than trusting its transcript |

### 1.4 Reasoning, knowledge, long context, instruction following

| Benchmark | GPT-6 Astra | Claude Fable 5.1 | GPT-5.6 Sol | Opus 5 | Flag | Date / source |
|---|---|---|---|---|---|---|
| GPQA Diamond | **96.0 (V) / 96.1 (AA)** | 93.7 (AA) / 93.4 (Vals) | 94.6 | — | V + I | [BenchLM Astra](https://benchlm.ai/models/gpt-6-astra), [BenchLM Fable 5.1](https://benchlm.ai/models/claude-fable-5-1) |
| Humanity's Last Exam (with tools) | 57.2 | **65.0** (60.9 no tools; AA 59.1) | — | 63.6 | V + I | officechai, Vellum, AA |
| ARC-AGI-2 | **95** | 90 | — | — | A | 2026-09-10 · BenchLM compare |
| ARC-AGI-3 (standard harness) | **62.7** (99.9 with OpenAI's own adapter — vendor) | not tested | 7.8 | 30.2 | I / V | 2026-09-10 · [BenchLM ARC-AGI-3](https://benchlm.ai/benchmarks/arcagi3), [ARC Prize](https://arcprize.org/leaderboard) |
| FrontierMath Tier 4 v2 | **97.6** | 87.8 | 83.0 | 73.2 | V (OpenAI) | officechai, alphacorp |
| MRCR v2 8-needle (256K–512K / 512K–1M) | **100 / 96.3** | not published (Anthropic's last MRCR: Opus 4.6 76% at 1M) | 91.5 / 73.8 | — | V (OpenAI) | officechai, LayerLens |
| AA-LCR v1.1 (long-context reasoning) | in index, not broken out | **80.0** | — | — | I | AA Fable 5.1 |
| MMLU-Pro / MMMU-Pro (Vals) | — | **92.38 (#1) / 90.64 (#1)** | — | — | I | Vals |
| ProofBench v1.1 (Vals) | #2 / 30 | **100 (#1)** | — | — | I | Vals |
| IFBench / IFEval | — | — | — | — | — | No entries for any of the four on [llm-stats IFBench](https://llm-stats.com/benchmarks/ifbench), [AA IFBench](https://artificialanalysis.ai/evaluations/ifbench) or [Scale IF](https://labs.scale.com/leaderboard/instruction_following) as of 2026-09-12. **Thin — qualitative only (§3)** |

### 1.5 UI, design, frontend

| Benchmark | GPT-6 Astra | Claude Fable 5.1 | GPT-5.6 Sol | Opus 5 | Flag | Date / source |
|---|---|---|---|---|---|---|
| Arena Code: WebDev (Elo) | **1797 (#1)** | 1762 | — | 1688–1691 | I (crowd, 650k votes / 126 models) | 2026-09-05 · [CryptoBriefing](https://cryptobriefing.com/openai-gpt6-astra-tops-code-arena/), [LogRocket](https://blog.logrocket.com/ai-dev-tool-power-rankings/) |
| Arena: image-to-WebDev (screenshot → code) | not yet ranked | — | — | **1668.6 (#1)** | I (crowd) | Aug 2026 · LogRocket |
| Design Arena — Website category (Elo) | not yet ranked | 1322 (#4) | 1332 (#3) | 1320 (#6) | I (crowd) | Sep 2026 · [modelgrep](https://modelgrep.com/best/design) (Muse Spark 1.3 1361, Kimi K3 1352 lead); gaps < 15 Elo are noise |
| Practitioner design bake-off (4 briefs) | — | — | 2 wins | 2 wins | I (n=4) | 2026-08-21 · [Wiegold](https://thomas-wiegold.com/blog/best-llm-frontend-design/) |
| DataCamp hands-on physics-sim UI | **5/5** in 6 turns, 9 tool calls — "polished presentation" | 4.3/5 in 2 turns, 1 tool call — "diagnostic functionality" | — | — | I (n=1) | 2026-09-07 · [DataCamp](https://www.datacamp.com/blog/gpt-6-astra-vs-claude-fable-5-1) |
| Pelican SVG (Willison) | "Astra low produces a better pelican than ANY of the GPT-5.6 Sol models at any level, for 9.55 cents" | "the best pelican I've seen from any of Anthropic's models" at max ($3.30, ~14 min) | — | — | I (n=1, aesthetic) | 2026-09-04 · [Willison Astra](https://simonwillison.net/2026/Sep/4/astra-pelicans/); 2026-09-01 · [Willison Fable 5.1](https://simonwillison.net/2026/Sep/1/claude-fable-5-1/) |

**Reading the table.** On the only same-harness, independent coding measures the two are tied
(AA Coding Agent Index 62 = 62 on v4.3; Vals Terminal-Bench 2.1 87.3 vs 85.0). Fable 5.1 leads
algorithmic coding and knowledge work (LiveCodeBench #1, MMLU-Pro #1, HLE 65.0 vs 57.2, GDPval
1853, SWE-bench Pro 81.2 where Astra published nothing). Astra leads terminal/ops (TB 4.0, TB-Science
64.6 vs 52.6, SRE-Bench, Code Migration #1), computer use and browsing (ScreenSpot-Pro, BrowseComp,
Agents' Last Exam), long-context retrieval (MRCR 96–100), fresh reasoning (ARC-AGI-3 62.7, FrontierMath
97.6) and cost per task (≈ 2.3x cheaper, one third of the tokens). On crowd-voted UI Astra is 35 Elo
ahead on WebDev; Design Arena has not ranked Astra yet and puts Sol and Fable 5.1 10 Elo apart.

## 2. Image generation

| Question | Finding | Source |
|---|---|---|
| Model behind Codex/ChatGPT images | **`gpt-image-2`** (snapshot `gpt-image-2-2026-04-21`), in the API and Codex since 2026-04-21; in Codex CLI as the `$imagegen` skill (also natural-language triggered). GPT-6 Astra lists "image generation" among its built-in tools. | [OpenAI model page](https://developers.openai.com/api/docs/models/gpt-image-2), [OpenAI Devs on X](https://x.com/OpenAIDevs/status/2046671238534496259), [Codex KB imagegen](https://codex.danielvaughan.com/2026/04/27/codex-cli-image-generation-gpt-image-2-visual-development-workflows/), [Astra model page](https://developers.openai.com/api/docs/models/gpt-6-astra) |
| Strengths for concept art / UI mocks | Reasons about composition and layout before rendering; ">99% text accuracy" across Latin and CJK; 2K native (2560x1440), 4K experimental; inpainting with image inputs. Reviewers: "the better first pick for text rendering, structured layouts, infographics, UI mockups and multi-panel concepts" (Nano Banana 2 wins on photoreal atmosphere). #1 on the Artificial Analysis Image Arena, Elo 1339 (Sep 2026), the largest first-to-second gap recorded. | [PixVerse](https://pixverse.ai/en/blog/gpt-image-2-vs-nano-banana-2), [tech-insider](https://tech-insider.org/best-ai-image-generator-2026/), [dev.to Codex workflow](https://dev.to/ji_ai/gpt-image-2-inside-codex-my-new-frontend-workflow-4d7n) |
| Limits | No native transparent PNG (chroma-key workaround); pixel-perfect icon sets still better as vectors; image turns burn Codex allowance 3–5x faster than text turns; `OPENAI_API_KEY` switches to API billing for batches. | Codex KB |
| Does Claude generate images? | **No.** No image-generation model; Claude writes SVG/HTML/Canvas code, and Claude Design (Apr 2026) builds layouts from code. It could *call* an external generator through a tool — a second subscription, not in play here. | [felloai](https://felloai.com/can-claude-generate-images/), [dreampixelforge](https://www.dreampixelforge.com/blog/can-claude-generate-images), [creativeclaw](https://creativeclaw.co/blog/image-generation-claude-guide/) |

**Consequence:** raster art, image-based mocks, icon and spell art, and any "picture of the screen"
concept work route to Codex by default — consistent with the owner's 2026-09-09 decision (raster
art generated with GPT, BG3-inspired, never identical).

## 3. Qualitative evidence from practitioners

Verbatim, one or two lines each. **P** = hands-on practitioner, **E** = evaluation shop, **F** =
forum comment.

### Long autonomous runs
- **P** Every.to, GPT-6 Astra Vibe Check (Parrott, 2026-09-03): "The computer use is wild, able to go
  for hours at a time using complicated apps to get work done." — https://every.to/vibe-check/gpt-6-astra-vibe-check
  · Dan Shipper's public summary: "a big upgrade from 5.6-Sol, with some frustrating habits that keep it
  from matching Fable at the top end." — https://x.com/danshipper/status/2095593705214300394
- **P** openai/codex issue #42937 (maikolb, 2026-09-05), Sol and Astra in Codex: "claiming completion
  from component-level or proxy evidence; ending before the requested artifact, code state, fix, or
  delivery exists" · "Astra exhibits the same operational reliability problem and, in my workflow, often
  a worse form of it" — https://github.com/openai/codex/issues/42937
- **P** Every.to, Fable 5.1 Vibe Check (Shipper & Parrott, 2026-09-01): "Kieran ran long tasks at xHigh
  and found it 'extremely thorough, maybe too much, especially delegating to subagents.'" ·
  "Dan moved all of his coding tasks over from Codex." — https://every.to/vibe-check/fable-5-1-vibe-check
- **P** Rory Watts via Zvi (2026-09-05), Fable 5.1: "it works independently for longer, seem to be less
  lazy" — https://thezvi.substack.com/p/claude-mythos-51-and-fable-51-capabilities
- **P** Codex KB (2026-09-03): Astra "keeps running notes across context windows and maintains
  searchable access to earlier context windows" instead of lossy compaction. — https://codex.danielvaughan.com/2026/09/03/gpt-6-astra-codex-cli-configuration-context-notes-safety/
- **F** HN tosh (Sep 2026): "I ran a few toy benches comparing Astra with Sol and found Astra ~30% faster
  and at similar cost to Sol for the same outcome" — https://news.ycombinator.com/item?id=49572875

### Instruction retention / respecting intent
- **P** Every.to (2026-09-03): "Use Astra for computer use, 3D generation, landing pages, and any task
  where you want the model to go beyond your specification. Use Fable 5.1 for coding, writing, and any
  task where you need the model to respect your intent."
- **P** codex #42937: "replacing my stated objective with a model-inferred objective; optimizing for a
  specification the model created instead of the specification I gave" · "acknowledging a correction
  without applying it operationally; correcting one requirement while breaking another"
- **P** Every.to (2026-09-01), Fable 5.1: "It answers faster, explains what it's doing in plain
  language, and changes course when you tell it to instead of arguing."
- **P** Sean McCarthy via Zvi (2026-09-05), Fable 5.1: "it takes an edit without arguing. It's a
  significant upgrade over Opus 5"
- **P** Layer3 Labs (Sep 2026), Astra: "designed to stay within the limits of its authorization, even
  when handling difficult assignments" — but optimising "only for uninterrupted execution" "risks
  overlooking actions outside the request's scope". — https://www.layer3labs.io/guides/gpt-6-astra-for-coding

### Over-editing vs stopping short
- **V→P** Anthropic (quoted by Zvi, 2026-09-05) on Fable 5.1's FrontierCode regression: "unable to stop
  itself from making additional helpful edits at higher effort levels"
- **V** Anthropic docs: Fable 5.1 "may issue one tool call per turn where Claude Fable 5 batched
  several" and "writes less user-facing text between tool calls, especially at higher effort"; a one-line
  batching instruction restores parallel calls. — https://platform.claude.com/docs/en/models/fable-5-1/whats-new-fable-5-1
- **P** Paweł Józefiak (2026-09-09): Fable 5.1 burns "25 to 50% more tokens than 5 on the same jobs".
  — https://thoughts.jock.pl/p/gpt-6-astra-vs-claude-fable-5-1-agent-notes-2026
- Astra's mirror-image failure is the #42937 "partial progress as completion" pattern (stopping short).

### Refactoring
- **E** Vals (2026-09-10): GPT-6 Astra #1/58 on Code Migration, #3/94 on Vibe Code Bench. — https://www.vals.ai/models/openai_gpt-6-astra
- **P** MindStudio (2026-07-13), on Sol: "Beyond finding bugs, it frequently suggests cleaner
  implementations — often with working code examples" — https://www.mindstudio.ai/blog/gpt-5-6-sol-vs-claude-fable-5-planning-code-review
- **E** Snorkel AI via Pochang Lab (2026-09-06): "both models solved 18, Opus alone solved five, Fable
  alone solved two, and neither solved two." — https://pochanglab.com/en/blog/gpt-6-astra-codex-review

### Code review quality
- **E** CodeRabbit (2026-09-04): "Astra's relative advantage grows to 20% over Sol and 33% over Opus 5"
  on cross-file bugs. — https://www.coderabbit.ai/blog/gpt-6-astra-code-review-evaluation
- **P** Józefiak (2026-09-09): "Astra found more, and not marginally. It saw things Fable did not see, in
  a codebase Fable helped build."
- **P** paddo.dev (2026-09-05), Astra effort levels for review: "Low is the daily driver for review and
  lookup. Max is the audit, when a wrong ranking costs more than seven minutes." (low: 5 real bugs in
  60 s; max: 7 bugs in 7 min) — https://paddo.dev/blog/gpt-6-astra-critical-generally-available/
- **E** CodeRabbit (2026-09-01): Fable 5.1 "found one fewer known-issue point than Fable 5. The
  improvement came from reducing output." — https://www.coderabbit.ai/blog/fable-5-1-model-review
- **F** HN KAdot (Sep 2026): "Sol is much closer to Opus than to Fable, with Opus often beating Sol. The
  only area where Sol is better is code reviews." — https://news.ycombinator.com/item?id=49572875

### UI taste / aesthetics
- **P** Every.to (2026-09-03): Astra "impressed with writing, operating software, and visual design,
  though Anthropic's Fable still has better instincts for building a product."
- **P** Every.to (2026-09-01), Fable 5.1's app: "The app had a generic purple-on-black design, large
  stretches of empty space, and a stray 'false' displayed beneath the controls."
- **P** Sean McCarthy via Zvi (2026-09-05), Fable 5.1: "Still makes bad ui decisions - taste is
  questionable there"
- **P** Józefiak (2026-09-09), a design task, the counter-example: "Fable nailed it, in the way where
  you stop comparing and just use the second one"
- **P** Simon Willison (2026-09-04): "The Astra pelicans are _much better_... Every single one of the
  Astra pelicans, from low to xhigh, looks better than that." — https://simonwillison.net/2026/Sep/4/astra-pelicans/
- **P** Thomas Wiegold (2026-08-21): "There is no single best LLM for frontend design right now, at
  least not among the models I use." — https://thomas-wiegold.com/blog/best-llm-frontend-design/

### Writing specs / docs / planning
- **P** Every.to (2026-09-03): Astra is "The best writing model tested, fast, produces very little slop,
  and is easy to steer." · "GPT-6 Astra wrote the first draft of this Vibe Check from a single prompt.
  Every's cofounder and CEO, Dan Shipper, thought I had written it."
- **P** Every.to (2026-09-01): Fable 5.1 "does significantly better at identifying the central tension
  of arguments and getting to the point"; "Its prose carries fewer AI tells than any other model tested".
- **P** MindStudio (2026-07-13): "GPT-5.6 Sol produces plans quickly, in clean formats, with sensible step
  decomposition" while "Claude Fable 5 treats planning as a reasoning exercise, not a formatting exercise."
- **P** ilikekillnerds (2026-09-06): "Astra at medium scores 52. Sol at max, the most expensive thing
  you could buy from OpenAI last week, scores 51 and costs nine cents more per task." — https://ilikekillnerds.com/2026/09/06/gpt-5-6-sol-to-gpt-6-astra-reasoning-effort/

### Following AGENTS.md / CLAUDE.md
- No controlled, published test of AGENTS.md adherence exists for either model (searched 2026-09-12).
  Indirect: the #42937 correction-binding failure and Every.to's "respect your intent" line favour
  Claude for constraint-heavy repos; the Codex KB notes Astra's $1/M cache makes "long, repeated
  boilerplate in AGENTS.md and startup prompts essentially free" (cost, not compliance). **Thin — a
  bake-off item (§5).**

### Asked for, not found
Thorsten Ball, Latent Space, Nimbalyst and Developers Digest had published nothing specific to Astra
vs Fable 5.1 by 2026-09-12 (Developers Digest's Web Dev Arena post is methodology only).

## 4. Routing table

Recommendation · evidence (independent numbers first, then qualitative) · confidence. "Codex" means
**GPT-6 Astra** unless a row says Sol (the cheap default). The owner's 2026-09-09 division (Astra owns
visual and taste decisions, Claude owns the rest) is honoured; where the evidence points elsewhere the
row says so rather than hiding it.

| Task type | Recommendation | Evidence | Confidence |
|---|---|---|---|
| Product interviewing / requirements (grill-me, owner intent) | **Claude Fable 5.1** (Opus 5 for cheaper turns) | Every.to: Fable 5.1 "better at identifying the central tension of arguments", "changes course when you tell it to instead of arguing"; the #42937 pattern (model-inferred objective replacing the stated one) is the opposite of what an interviewer needs. Vals Index #1, HLE 65.0 vs 57.2, GDPval 1853. | Medium |
| Spec writing (block specs with Reference dossier) | **Claude Fable 5.1**; alternate **Codex Astra** to compress or restructure an approved draft | Fable prose "fewer AI tells", "gets to the point"; Astra "best writing model tested... very little slop". Dossiers need long-document synthesis: AA-LCR 80.0, 1M context with no surcharge (Astra charges 2x above 272K). Owner-assigned to Claude. | Medium |
| Architecture / ADRs / archify diagrams | **Claude Fable 5.1** | "Planning as a reasoning exercise"; AA Intelligence tie 53 = 53 but Fable leads HLE and GDPval; Astra leads fresh abstract reasoning (ARC-AGI-3 62.7, FrontierMath 97.6) — worth a second opinion on hard designs. Owner-assigned. | Medium-high |
| UI/UX design and mocks (screens, layout, palette, typography) | **Codex Astra** (Sol for cheap iterations) — owner-assigned | Arena WebDev: Astra 1797 vs Fable 5.1 1762 (I); Every.to: Astra strong on "visual design" and "landing pages", Fable 5.1 "generic purple-on-black"; McCarthy: Fable "taste is questionable there". Counter-evidence: Józefiak's design win for Fable; Design Arena Sol 1332 vs Fable 1322 (noise); Wiegold 2–2. **Crowd benchmarks tilt Astra by a small margin; practitioner taste tilts Astra; the owner decision settles it.** | Medium |
| Raster / concept art / icons | **Codex (gpt-image-2)** | Claude has no image model; gpt-image-2 #1 Image Arena (1339), >99% text rendering, layout reasoning, native in Codex and a built-in Astra tool. Owner decision 2026-09-09. | High |
| Design-system / CSS implementation from a mock | **Codex Astra** for the pixel pass (owner-assigned); **Claude** for the tokenised system code (`src/components/ui/*` on Radix, Tailwind v4 tokens, theme/locale matrix) | Astra #1 WebDev; ScreenSpot-Pro 92.7 vs 87.3 (V); BenchCAD 95.9 vs 84.3 (V, vision-to-artifact); Opus 5 #1 image-to-WebDev (Astra not yet ranked there). DataCamp n=1: Astra "polished presentation", Fable "diagnostic functionality". Design-to-code evidence is crowd-voted and thin. | Medium-low |
| Engine / rules / data logic (`src/lib/combat`, grants, dice seam, schema) | **Claude Fable 5.1** (Opus 5 default, Fable 5.1 for the hard ones) | LiveCodeBench #1 (90.5, I); SWE-bench Pro 81.2 vs Astra unpublished (V); CursorBench 73.4 vs unpublished (V); AA Coding tie 62 = 62 (I); instruction fidelity for invariants ("every roll is logged", licensing partition). Astra's DeepSWE 74.1 vs 67.4 (V) is the one coding row it wins. Owner-assigned. | High |
| Tests / TDD | **Claude Fable 5.1** at high (not max) effort | Same coding evidence; TDD is the brake on Fable's "additional helpful edits at higher effort levels". Alternate: Astra low/medium for quick test scaffolds (Astra medium ≈ Sol max on AA per ilikekillnerds). | Medium-high |
| Debugging | **Split by kind:** logic/state/replay-log bugs → **Claude**; terminal, build, CI, infra, migration bugs → **Codex Astra** | Astra: Terminal-Bench 2.1 87.3 vs 85.0 (I), TB 4.0 57.9 vs 55.8 (I), SRE-Bench 88 (V), Code Migration #1 (I), ≈ 2.3x cheaper per task, context notes survive compaction. Fable: AA-LCR 80.0, GDPval, "respect your intent" when a fix must stay inside one seam. | Medium |
| Code review of the other's work | **Codex Astra** (low effort for routine PRs, max for audits); **Claude as tie-breaker** on architecture and intent | CodeRabbit: Astra +20% over Sol, +33% over Opus 5 on cross-file bugs (I); Sol recall 69.7 vs Fable 5.1 61.0 (I); Józefiak: "Astra found more, and not marginally"; paddo.dev: low finds 5 real bugs in 60 s. Caveat: OpenAI-family precision runs lower (Sol 31.6 vs Fable 37.3) — ponytail-review still filters; and Astra's reduced CoT monitorability means review *its* diffs by the diff, not its transcript. | High |
| Documentation / cleanup (fact-owning docs, changesets, NEXT.md) | **Claude Fable 5.1** (Opus 5 for routine) — owner-assigned | Prose quality, "one document owner per fact" retention, 1M context without surcharge for whole-repo sweeps. Astra is a credible alternate for readability passes. | Medium |
| Research / teardowns (BG3, D&D Beyond, dossiers) | **Split by medium:** live web/app exploration → **Codex Astra**; synthesis into repo documents → **Claude** | Astra: BrowseComp 91.5, OSWorld 2.0 72.6, Agents' Last Exam 59.3, TB-Science 64.6 vs 52.6 (V), "computer use is wild". Fable: HLE 65.0, AA-LCR 80.0, MMLU-Pro #1, GDPval 1853. Owner assigned research *deliverables* to Claude. | Medium |
| Screenshot verification (theme/locale/viewport matrix, playwright-cli) | **The agent that did not implement the screen verifies**; the visual verdict stays with **Codex** (owner-assigned) | Both have strong vision (Astra ScreenSpot-Pro 92.7, BenchCAD 95.9; Fable 5.1 MMMU-Pro #1 90.6). No public screenshot-QA benchmark separates them. Cross-checking also catches the Codex "partial progress as completion" risk and Fable's stray-"false"-under-the-controls risk. | Low-medium |

Cost and effort notes for the two plans: per AA task at max effort Astra costs $3.26 vs Fable 5.1
$7.63 and uses about a third of the output tokens; but on a ChatGPT Pro plan Astra draws from a 5-hour
and a 7-day allowance (Pro $100: 25–225 local messages / 5 h), so keep Astra at **low/medium** for
review and lookups and reserve **xhigh/max** for audits and hard debugging; on Claude Max, Fable 5.1's
$0.25/M cache reads reward long sessions with a stable CLAUDE.md prefix, and **high** (not max) effort
avoids the over-editing regression. Neither number changes the routing; both say where to spend effort.

## 5. Re-evaluation protocol

Run it when either vendor ships a new flagship or a new Codex/Claude Code default, or quarterly.
Budget: one afternoon, two worktrees.

### 5.1 Leaderboards to check (in this order)

1. **Artificial Analysis — Intelligence Index and Coding Agent Index** (independent, each model in its
   own harness, with cost and tokens per task): https://artificialanalysis.ai/evaluations/artificial-analysis-intelligence-index
   and https://artificialanalysis.ai/evaluations/coding-agent-index. Read the *index version* first
   (v4.3 today); never compare across versions.
2. **Vals.ai — Terminal-Bench 2.1, LiveCodeBench, Code Migration, Vals Index** (same harness for every
   model): https://www.vals.ai/models/openai_gpt-6-astra and https://www.vals.ai/models/anthropic_claude-fable-5-1
   (swap the model slugs).
3. **Scale SEAL — SWE-bench Pro standardized scaffold** (the only cross-vendor SWE-bench Pro):
   https://labs.scale.com/leaderboard. Ignore vendor-scaffold SWE-bench Pro rows unless both vendors
   published one.
4. **Arena Code: WebDev / image-to-WebDev** and **Design Arena — Website**: https://arena.ai/leaderboard
   and https://www.designarena.ai/leaderboard (crowd Elo; gaps under ~20 Elo are ties).
5. **CodeRabbit model reviews** (https://www.coderabbit.ai/blog) for review recall/precision, and
   **METR** (https://metr.org/time-horizons/) for autonomy — both lag releases, so they are the
   follow-up check two to six weeks after launch.

Skip: SWE-bench Verified (saturated), Aider Polyglot (frozen), HumanEval (retired), vendor OSWorld rows
(settings differ per vendor), vendor ARC-AGI-3 with a custom adapter.

Averaging rule: independent rows only; normalise each to 0–100 within the pair; average per family
(coding / agentic-terminal / reasoning-long-context / UI-crowd). Move a routing row only when the family
average flips by more than 5 points **and** the bake-off agrees.

### 5.2 Bake-off: same task, two worktrees, compare diffs

Setup once per bake-off (per `docs/WORKTREES.md`):

```
git fetch origin v2
git worktree add ~/Workspace/Codex/bakeoff-claude -b task/bakeoff-YYYY-MM-DD-claude origin/v2
git worktree add ~/Workspace/Codex/bakeoff-codex  -b task/bakeoff-YYYY-MM-DD-codex  origin/v2
```

Same prompt file for both (`docs/program/reference/bakeoff-YYYY-MM-DD.md`), same effort tier
(Astra **high**, Fable 5.1 **high**; not max), same 60-minute wall-clock box, no human steering after
the prompt, the repo's CLAUDE.md/AGENTS.md as the only instructions. Score 0–2 per criterion; the
diff, the gate output and the screenshots are the evidence.

**Task A — rules-engine function with tests (engine/data/rules).** Implement one small, spec'd
mechanic end to end in `src/lib/combat` — for example a new `Grant` kind aggregated by
`evaluateGrants` and applied through the reducer, or a resistance rule in `damage.ts` — with Vitest
coverage, rolling only through the dice seam. Criteria: (1) `just ci` green; (2) tests before code,
failing first (commit order); (3) no edits outside the named seam; (4) every roll logged with
provenance, `tests/unit/dice-randomness.guard.test.ts` still pins `src/lib/dice.ts`; (5) EN + IT for
any user-visible string; (6) diff size relative to the task. Measures coding accuracy, TDD discipline,
over-editing.

**Task B — screen implementation from a mock (UI/UX, design system).** Implement one screen from
Astra's approved mock `d20-folio-html-0.9.3-2026-09-06` plus the 7 September shell corrections, and
screenshot the theme/locale/viewport matrix with playwright-cli. Criteria: (1) fidelity to the mock at
three viewports, both themes, both locales (Astra's verdict, per ownership); (2) `src/components/ui/*`
primitives and Tailwind v4 tokens only, no ad-hoc CSS; (3) i18n complete; (4) no engine or store
changes; (5) bundle budget respected; (6) number of runtime rescues needed. Measures taste,
design-to-code fidelity, CLAUDE.md/AGENTS.md adherence.

**Task C — spec review of a document.** Give both one block spec from `docs/program/` (with its
`## Reference dossier`) into which 3–5 contradictions with `PRODUCT.md` §Steering, the ADRs and the
Golden Rules were planted beforehand; ask for a review with the minimal edit, not a rewrite. Criteria:
(1) planted issues found (recall); (2) true vs invented findings (precision); (3) edits stay inside the
document that owns the fact; (4) length and readability; (5) "review, do not rewrite" respected.
Measures comprehension, instruction retention, review quality, writing.

Then swap: each agent reviews the other's Task A and Task B diffs with the same rubric — this is the
"code review of the other's work" row measured live.

### 5.3 Recording the result

- Write the scoring sheet and both diff summaries to `docs/program/reference/bakeoff-YYYY-MM-DD.md`
  (evidence, not authority).
- Add a dated entry at the top of `docs/program/DECISIONS.md` in the existing format
  (`## YYYY-MM-DD — routing: <what changed>`, the owner's Italian quote verbatim if the owner ruled),
  listing only the routing rows that moved and the two numbers that moved them (family average and
  bake-off score).
- Reconcile the owning document in the same change: the routing table lives with the
  division-of-labour decision that CLAUDE.md "Who decides what" points at; update the pointer if the
  table gets its own file.
- One `.changeset/*.md` (`docs`, patch); commit `docs(program): re-evaluate agent routing after
  <model>`; remove both bake-off worktrees; never integrate bake-off branches.
- Owner gate: any routing change that adds cost (for example "Astra max on every review", extra Codex
  credits, a second image subscription) needs the owner's explicit yes, like any other new cost.

## 6. Source index

Official / vendor
- OpenAI, GPT-6 Astra announcement (2026-09-03): https://openai.com/index/gpt-6-astra/ (403 to fetch; table reproduced by [officechai](https://officechai.com/ai/gpt-6-astra-benchmarks/), [Vellum](https://www.vellum.ai/blog/gpt-6-astra-benchmarks-explained), [MindStudio](https://www.mindstudio.ai/blog/gpt-6-astra-benchmarks-analysis))
- OpenAI, GPT-6 Astra model page: https://developers.openai.com/api/docs/models/gpt-6-astra
- OpenAI, GPT-5.6 (2026-07): https://openai.com/index/gpt-5-6/ · gpt-image-2: https://developers.openai.com/api/docs/models/gpt-image-2
- OpenAI Help, usage with Astra in Work and Codex: https://help.openai.com/en/articles/20001516-managing-usage-with-gpt-6-astra-in-work-and-codex
- Anthropic system card, Fable 5.1 & Mythos 5.1 (2026-09-01): https://www-cdn.anthropic.com/0339e6a7c5c7b87f5c07798616dc32c215d14235/Claude%20Fable%205.1%20&%20Claude%20Mythos%205.1%20System%20Card.pdf
- Anthropic, What's new in Fable 5.1: https://platform.claude.com/docs/en/models/fable-5-1/whats-new-fable-5-1 · Claude Code model config: https://code.claude.com/docs/en/model-config

Independent evaluators
- Artificial Analysis: Astra (2026-09-09) https://artificialanalysis.ai/articles/benchmarking-gpt-6-astra · Fable 5.1 (2026-09-01) https://artificialanalysis.ai/articles/claude-fable-5-1 · GPT-5.6 (2026-07-09) https://artificialanalysis.ai/articles/gpt-5-6-has-landed · X thread https://x.com/ArtificialAnlys/status/2095595489031000350
- Vals.ai: https://www.vals.ai/models/openai_gpt-6-astra · https://www.vals.ai/models/anthropic_claude-fable-5-1
- METR: https://metr.org/blog/2026-06-26-gpt-5-6-sol/ · https://metr.org/time-horizons/
- CodeRabbit: https://www.coderabbit.ai/blog/gpt-6-astra-code-review-evaluation · https://www.coderabbit.ai/blog/fable-5-1-model-review
- Arena: https://arena.ai/leaderboard/agent?rankBy=labs · Design Arena: https://www.designarena.ai/leaderboard · Scale SEAL: https://labs.scale.com/leaderboard · ARC Prize: https://arcprize.org/leaderboard · Epoch: https://epoch.ai/benchmarks

Aggregators (snapshots 2026-09-10 unless noted)
- BenchLM: https://benchlm.ai/models/gpt-6-astra · https://benchlm.ai/models/claude-fable-5-1 · https://benchlm.ai/compare/claude-fable-5-1-vs-gpt-6-astra · https://benchlm.ai/benchmarks/swe-bench-pro · https://benchlm.ai/benchmarks/valsterminalbench21 · https://benchlm.ai/benchmarks/arcagi3 · https://benchlm.ai/benchmarks/osworld-verified
- alphacorp (2026-09-03): https://alphacorp.ai/blog/gpt-6-astra-vs-claude-fable-5-1-benchmarks-pricing-and-which-is-better
- DataCamp (2026-09-07): https://www.datacamp.com/blog/gpt-6-astra-vs-claude-fable-5-1 · Fable 5.1: https://www.datacamp.com/blog/claude-fable-5-1
- Vellum Fable 5.1 (2026-09-02): https://www.vellum.ai/blog/claude-fable-5-1-mythos-5-1-benchmarks-explained · LayerLens GPT-5.6 (2026-07-14): https://layerlens.ai/blog/gpt-5-6-benchmark-review-sol-terra-luna
- 9to5mac (2026-09-04): https://9to5mac.com/2026/09/04/openai-releasing-major-upgrade-to-chatgpt-and-codex-with-gpt-6-astra-details-here/ · codexusage.dev (2026-09-11): https://www.codexusage.dev/limits/astra · Notebookcheck: https://www.notebookcheck.net/GPT-6-Astra-is-on-ChatGPT-Plus-but-only-in-Work-and-Codex.1391574.0.html
- morphllm: https://www.morphllm.com/best-ai-model-for-coding · modelgrep Design: https://modelgrep.com/best/design · CryptoBriefing WebDev (2026-09-05): https://cryptobriefing.com/openai-gpt6-astra-tops-code-arena/ · LogRocket: https://blog.logrocket.com/ai-dev-tool-power-rankings/ · llm-stats: https://llm-stats.com/benchmarks · OpenRouter τ²: https://openrouter.ai/benchmarks/tau2-bench-airline · MiraFlow OSWorld: https://miraflow.ai/blog/osworld-2-explained-computer-use-agent-benchmark-2026

Practitioners
- Simon Willison: https://simonwillison.net/2026/Sep/4/astra-pelicans/ · https://simonwillison.net/2026/Sep/1/claude-fable-5-1/ · https://simonw.substack.com/p/gpt-6-astra-claude-fable-51-and-yet
- Every.to: https://every.to/vibe-check/gpt-6-astra-vibe-check · https://every.to/vibe-check/fable-5-1-vibe-check · https://x.com/danshipper/status/2095593705214300394
- Zvi Mowshowitz (2026-09-05): https://thezvi.substack.com/p/claude-mythos-51-and-fable-51-capabilities
- Paweł Józefiak (2026-09-09): https://thoughts.jock.pl/p/gpt-6-astra-vs-claude-fable-5-1-agent-notes-2026
- openai/codex issue #42937 (2026-09-05): https://github.com/openai/codex/issues/42937
- Hacker News: https://news.ycombinator.com/item?id=49572875 · https://news.ycombinator.com/item?id=48956879
- paddo.dev (2026-09-05): https://paddo.dev/blog/gpt-6-astra-critical-generally-available/ · ilikekillnerds (2026-09-06): https://ilikekillnerds.com/2026/09/06/gpt-5-6-sol-to-gpt-6-astra-reasoning-effort/ · Pochang Lab (2026-09-06): https://pochanglab.com/en/blog/gpt-6-astra-codex-review · Layer3 Labs: https://www.layer3labs.io/guides/gpt-6-astra-for-coding
- Thomas Wiegold (2026-08-21): https://thomas-wiegold.com/blog/best-llm-frontend-design/ · MindStudio (2026-07-13): https://www.mindstudio.ai/blog/gpt-5-6-sol-vs-claude-fable-5-planning-code-review
- Codex KB: https://codex.danielvaughan.com/2026/09/03/gpt-6-astra-codex-cli-configuration-context-notes-safety/ · https://codex.danielvaughan.com/2026/04/27/codex-cli-image-generation-gpt-image-2-visual-development-workflows/
- Image models: https://pixverse.ai/en/blog/gpt-image-2-vs-nano-banana-2 · https://tech-insider.org/best-ai-image-generator-2026/ · https://felloai.com/can-claude-generate-images/
