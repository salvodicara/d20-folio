# Tooling audit — from-scratch premium UI/UX redesign of d20 Folio

Date: 2026-09-02. Method: `~/.agents/skills/find-skills/SKILL.md` (leaderboard → `npx skills find` →
verify installs / source / stars / license / freshness / security / overlap). Nothing was installed.
Evidence was resolved per artifact with `npm view`, `gh api repos/<owner>/<repo>`, vendor docs and
web search; metrics are per-artifact, never transferred from a sibling or alias.

Repo facts that shape the verdicts (checked in the worktree):

- Playwright 1.60 with projects `chromium` (Desktop Chrome), `mobile` (Pixel 7), plus service-worker
  twins; `tests/e2e/visual-full.spec.ts` already asserts EVERY surface × {dark,light} × {desktop,mobile}
  × {en,it} via `toHaveScreenshot`, gated by `VISUAL=1` / `--update-snapshots` (the old `tests/e2e/visual-gate.ts`, deleted on `v2` 2026-09-03).
  Baselines are platform-specific and NOT committed — that is the one real gap in (e).
- `@axe-core/playwright` 4.11 (a11y sweep `tests/e2e/a11y.spec.ts`), `lucide-react` 1.16 (ISC),
  `@fontsource-variable/{alegreya,cinzel}` + `@fontsource/source-serif-4` (self-hosted, offline-safe).
- `DESIGN.md` line 2966: `/legal` already credits every game-icons.net glyph under CC BY 3.0.
- No Storybook. No MCP servers configured (`~/.claude.json` mcpServers = none).
- Golden rule 25: owner approves visuals from pushed screenshots (chat images on a phone).

## 1. Summary recommendation (max 6 additions → only 2 real additions + 1 update + 1 enable)

| #   | Verdict                                  | Artifact                                                                                                                                                                                                                                                              | Use it for                                                                                                                                                                                        | Cost / secrets / privacy the owner must approve                                                                                                                                                                                                                         |
| --- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **ADD (owner-gated: paid)**              | Mobbin MCP — remote HTTP `https://api.mobbin.com/mcp`                                                                                                                                                                                                                 | (b) pull real shipped screens (621k) by pattern — "character sheet", "stat block", "inventory", "dark fantasy app" — as reference images while probing taste                                      | Pro plan ≈ $40/seat/mo (annual $480); MCP "unlimited during beta, may need AI credits later". OAuth via browser; Mobbin sees the search prompts. No secret stored in repo.                                                                                              |
| 2   | **ADD (owner-gated: cloud + CI secret)** | `@argos-ci/playwright` 7.4.7 (MIT) + Argos cloud (argos-ci/argos, MIT, 619★, pushed 2026-09-02)                                                                                                                                                                       | (e) turn the existing `visual-full` matrix into a hosted diff review the owner can open on a phone; baselines come from git history, so the "platform-specific, uncommitted baselines" gap closes | Free tier 5,000 screenshots/mo (the 8-cell matrix × ~N surfaces must fit; count before enabling). Needs `ARGOS_TOKEN` as a CI secret and uploads app screenshots (fixture data only) to Argos' cloud. Zero-cost posture holds only if the monthly count stays under 5k. |
| 3   | **UPDATE (no owner gate)**               | `@playwright/cli` 0.1.18 → 0.1.19 (Apache-2.0, microsoft/playwright-cli 13k★, published 2026-09-01)                                                                                                                                                                   | (d) headless screenshot sweeps with `--device`, session persistence; already the installed `playwright-cli` skill                                                                                 | none                                                                                                                                                                                                                                                                    |
| 4   | **ENABLE selectively (already on disk)** | ECC `design-system` skill (`~/.claude/plugins/cache/ecc/ecc/2.2.0/skills/design-system/SKILL.md`; 7.9K installs on skills.sh as `affaan-m/ecc@design-system`)                                                                                                         | (c) generate/audit the token system and check visual consistency of styling PRs                                                                                                                   | none; copy just that skill dir into `~/.agents/skills/` per the CLAUDE.md "ECC selective" rule — do not enable the plugin                                                                                                                                               |
| 5   | **NO ADDITION NEEDED**                   | (a) probes/mockups: built-in `/design` artboards (Claude Design, research preview since 2026-08-17, Pro/Max), `Artifact` tool, `mcp__visualize` `show_widget`, installed `prototype` skill (UI.md = several variants on one route with a switcher), `impeccable live` | fast side-by-side variants viewable on a phone — the exact failure mode of the rejected Figma/OpenPencil atlases is avoided by never building an atlas                                            | none                                                                                                                                                                                                                                                                    |
| 6   | **NO ADDITION NEEDED**                   | (f) icons/fonts: installed `better-icons` (Iconify → `lucide:`, `game-icons:` prefixes), `lucide-react` (ISC), `@fontsource` self-hosting, impeccable `typeset`                                                                                                       | clean-license glyphs and fonts; CC BY 3.0 game-icons attribution is already wired at `/legal`                                                                                                     | none                                                                                                                                                                                                                                                                    |

Everything else surveyed: **do not install** (section 4).

## 2. Per-candidate evidence

### Figma

| Candidate                                              | Exact artifact                                                                                         | Metrics                                                                                                                                               | License / security / cost                                                                                                                                                              | Verdict                                                                                                                           |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Figma official remote MCP                              | `https://mcp.figma.com/mcp` (`claude mcp add --transport http figma https://mcp.figma.com/mcp`, OAuth) | Companion skills `figma/mcp-server-guide` (1,950★, pushed 2026-09-01): `figma-use` 6.8K installs, `implement-design` 6K, `figma-generate-design` 4.7K | Free during beta, "will become usage-based paid". Starter plan / View / Collab seats: **6 tool calls per month**; Dev/Full paid seat needed for canvas writing. Figma Developer Terms. | Skip. Owner rejected the Figma atlas; 6 calls/mo on a free seat is useless; OpenPencil already reads the .fig locally at no cost. |
| GLips/Figma-Context-MCP (`figma-developer-mcp` 0.13.2) | npm 0.13.2 (MIT, published 2026-06-18); repo 15,761★, pushed 2026-08-07                                | Needs a Figma personal access token in env; read-only layout JSON                                                                                     | Skip — same reason, plus a PAT to manage.                                                                                                                                              |
| edenspiekermann/Skills `audit-design-system`           | skills.sh 170 installs; repo 64★, pushed 2026-03-24, **no license**                                    | Requires Figma MCP read tools (`get_design_context`, `get_screenshot`, …); cannot audit code                                                          | Skip.                                                                                                                                                                                  |

### Pencil / OpenPencil (installed)

| OpenPencil MCP | `@open-pencil/mcp` 0.14.0 (MIT, published 2026-08-11); repo 8,126★, pushed 2026-09-02; `claude mcp add --scope user open-pencil -- openpencil-mcp` (stdio) or Streamable HTTP `http://127.0.0.1:7600/mcp` when the app is open | 91–106 local tools incl. PNG/JPG/WEBP export (base64) | Already installed as the `open-pencil` skill + app. Use ONLY to read/export existing `.fig` frames as reference images or to export a single approved probe; never to author another atlas. Registering the MCP is optional (CLI covers export). |

### Google Stitch

| Official endpoint | `https://stitch.googleapis.com/mcp` with `X-Goog-Api-Key` header (key from Stitch settings), or gcloud OAuth + `gcloud beta services mcp enable stitch.googleapis.com` | 350 free generations/month per Google account; Gemini 3 Flash/Pro | Google Labs experimental terms; prompts and generated UI live in Google's project. | Skip. Output is generic Material-flavoured; it competes with `/design` artboards and `prototype`, adds a Google credential, and the owner judges taste, not volume. |
| Community wrapper | `@_davideast/stitch-mcp` 0.9.0 (Apache-2.0, published 2026-05-28); repo 959★, pushed 2026-05-28, explicitly "NOT affiliated with Google" | Tools `get_screen_image`, `get_screen_code`, `build_site` | Skip (stale 3 months; official endpoint exists). |

### v0 / Lovable-style generators

Both generate into their own hosted Next.js/Supabase stacks, own the code first, and require accounts; none fits a code-owned React 19 + Vite + Tailwind v4 + Radix PWA with an AGPL licence and SRD partition. Skip.

### Pattern libraries (real screenshots)

| Mobbin MCP | `claude mcp add mobbin --scope user --transport http https://api.mobbin.com/mcp`; OAuth in browser; published 2026-08-31 (mobbin.com/mcp) | 621,500 screens; returns images + annotations + app context | "Available on Pro & Team plans"; Pro list ≈ $40/seat/mo billed annually; usage "unlimited during beta, may require AI credits". | **Recommend, owner-gated.** Only pattern library with a first-party MCP. |
| Page Flows (Screenlane redirected here July 2024) | no API / MCP / export; $39/quarter or $99/yr | — | Skip. |
| Free browse-only libraries: Refero, Collect UI, UX Archive, Banani | no API; screenshot via the in-app Browser pane / Claude-in-Chrome | — | Free fallback for (b) if Mobbin is declined; note ToS on scraping — take a handful of reference screenshots manually, never bulk. |

### Browser drivers

| `@playwright/cli` | 0.1.19 (Apache-2.0, published 2026-09-01); repo 13,035★ | `open --device="iPhone 15"`, `screenshot`, `--persistent` | Installed (0.1.18) as the `playwright-cli` skill. Update. |
| `@playwright/mcp` | 0.0.80 (Apache-2.0, published 2026-09-01); repo 36,739★ | Same engine, MCP transport; Playwright team says "coding agent → use CLI" | Skip: duplicate of playwright-cli + in-app Browser pane. |
| `chrome-devtools-mcp` | 1.8.0 (Apache-2.0, published 2026-08-25); repo 50,588★, pushed 2026-09-02 | screenshot, emulate, resize, perf traces | **Telemetry ON by default** (`--no-usage-statistics` to disable; CrUX lookups `--no-performance-crux`). Skip: the in-app Browser pane + Claude-in-Chrome already give `resize_window` with `colorScheme`, console and network reads, without Google telemetry. Only worth it for perf traces, which the redesign does not need. |

### Visual regression

| Argos | `@argos-ci/playwright` 7.4.7 (MIT, 2026-08-26); argos-ci/argos MIT 619★ pushed 2026-09-02 | Reporter `createArgosReporterOptions({ uploadToArgos: !!process.env.CI })`; needs `ARGOS_TOKEN`; free 5,000 screenshots/mo, Pro $100/mo | **Recommend, owner-gated** (cloud upload + secret). |
| Lost Pixel | npm 3.22.0 last published 2024-11-14; repo **archived 2026-04-22** ("joining Figma, sunsetting") | — | Do not install. |
| Chromatic | needs Storybook (repo has none); from $179/mo | — | Skip. |
| Percy | from $599/mo | — | Skip. |
| Playwright `toHaveScreenshot` (in repo) | already covers the full 8-cell matrix; baselines platform-specific and uncommitted | — | Keep as the local lane; Argos is the hosted review on top of it. |

### Icons

| `better-icons` (installed) | npm 1.0.4 (MIT, 2026-01-22); Iconify search + SVG fetch + optional MCP (`better-icons setup -a claude-code`) | Iconify hosts `lucide` (ISC), `ph` Phosphor (MIT), `game-icons` (CC BY 3.0), `mdi`, `tabler` | Covers (f). Network call to api.iconify.design per search only. |
| `iconify-mcp-server` (imjac0b) | 1.0.4, **GPL-3.0**, 15★, last push 2025-11-22 | same Iconify API | Skip: stale, tiny, duplicate. |
| game-icons.net | CC BY 3.0 (FAQ: "CC-BY, some public domain"; credit the authors on a credit page) | already credited at `/legal` (DESIGN.md:2966) | Compatible with AGPL-3.0 as attribution-only data (not ShareAlike). Keep. |

### Fonts

| `sliday/google-fonts-skill` / `google-fonts-mcp` (PyPI 1.3.0) | MIT, 12★, pushed 2026-08-31; `claude mcp add google-fonts -- uvx google-fonts-mcp`; Python + network | 1,923 fonts, 73 pairings | Skip: under the 100-star/1K-install bar; impeccable `typeset` already reasons about pairings and the app self-hosts via `@fontsource` (offline PWA requirement). |

### Accessibility

| Deque axe MCP Server | docs.deque.com devtools-server 4.0.0; API key `AXE_API_KEY` or OAuth via `@deque/axe-auth`; **requires an axe DevTools for Web subscription via sales** | — | Skip: paid enterprise; `@axe-core/playwright` 4.11 (MPL-2.0; latest 4.13.0) is already in devDeps and the a11y e2e sweep drives the same surface manifest. |
| skills.sh a11y skills (`mastepanoski/claude-skills@wcag-accessibility-audit` 1.3K, `alirezarezvani/claude-skills@a11y-audit` 887) | prose checklists | — | Skip: impeccable `audit`/`harden` + `web-design-guidelines` + axe already cover it. |

### UX-review / design skills

| `nextlevelbuilder/ui-ux-pro-max-skill` | skills.sh 341K installs (core skill; 677K across the 19-skill bundle); repo 124,276★, MIT, pushed 2026-09-02; CLI `ui-ux-pro-max-cli` 2.15.0 (2026-08-13); Python 3 stdlib BM25 search over CSVs (styles, 192 palettes, 74 font pairings, 22 stack guidelines); offline, no telemetry | 100–200 KB on disk, loaded progressively | Skip for now: heavy overlap with impeccable (typeset/colorize/audit), design-taste-frontend (87 KB), high-end-visual-design and the 67-aesthetic registry. Its palette/pairing lookup is the only non-overlapping piece; revisit only if impeccable's picks feel generic. |
| `borghei/Claude-Skills` `design-auditor` | 684★, pushed 2026-08-12, **MIT + Commons Clause** (non-standard); Python scripts; 12 categories, three A–F grades (Design, AI-slop, WCAG) | code-only, no Figma | Skip: impeccable `critique`/`audit`/`doctor` + web-design-guidelines cover the same rules; Commons Clause is an avoidable licence oddity. |
| `murphytrueman/design-system-ops` | 174★, MIT, pushed 2026-08-22; ~45 skills (token-audit, drift-detection, theme-audit, design-to-code-check …); code-only works; `git clone … ~/.claude/skills/design-system-ops` | — | Defer: below the 1K-install bar and bulky; ECC `design-system` (already on disk) fills the "audit tokens/consistency" slot. Reconsider `token-audit` + `drift-detection` only if ECC proves thin. |
| `Eskapeum/design-audit` | 1★, single commit 2026-04-03, MIT | — | Skip. |
| skills.sh "ui ux design review" results (`rknall/claude-skills@uiux-design-review` 466, `plugin87/…@design-review` 251, …) | all < 500 installs | — | Skip. |
| `vercel-labs/agent-skills@web-design-guidelines` | installed already | — | Keep as the compliance checklist. |
| Anthropic `frontend-design` plugin (installed, 8 KB) vs `impeccable` 4.1.1 (installed, 65k★, Apache-2.0) | impeccable is the renamed, expanded successor (18+ commands, brand/product modes, live mode) | — | Use impeccable as the primary; keep frontend-design only as the one-page aesthetic preamble; do not load both in one turn. |

### Design tokens

| Style Dictionary | 5.5.2 (Apache-2.0, 2026-08-19); DTCG 2025.10 | build pipeline JSON → CSS | Skip: the design system lives as Tailwind v4 CSS tokens in-repo (DESIGN.md); no Figma round-trip is wanted after the atlas rejection. |
| Tokens Studio / `ilikescience/design-tokens-skill` (15★, MIT) / `julianoczkowski/designer-skills@design-tokens` (5K installs) | DTCG guidance | — | Skip for the same reason; ECC `design-system` suffices. |

## 3. Overlap map against installed tools

| Need                                    | Installed tool(s) that already cover it                                                                                                                                                                                                                                                                                         | Gap                                                                | Addition                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------- |
| (a) fast side-by-side probes on a phone | `/design` artboards (Artifacts, PNG export), `Artifact`, `mcp__visualize show_widget`, `prototype` (UI variant switcher on a real route), `impeccable live`, `canvas-design`/`theme-factory` (static art only), `image-to-code` (generate reference image → code)                                                               | none                                                               | —                          |
| (b) real reference screenshots          | Browser pane / Claude-in-Chrome screenshots of free galleries (manual, few)                                                                                                                                                                                                                                                     | no searchable corpus                                               | Mobbin MCP (paid)          |
| (c) critique / audit                    | impeccable (`critique`, `audit`, `doctor`, `polish`), `web-design-guidelines`, `claude-mem:design-is` (Rams), `design-taste-frontend` (landing pages only — not product UI), `high-end-visual-design` (agency polish rules), `awesome-design-skills` (aesthetic vocab), `browser-qa` (ECC prose), ECC `design-system` (on disk) | token/consistency audit not yet enabled                            | enable ECC `design-system` |
| (d) render + screenshot matrix          | `playwright-cli` skill + repo Playwright projects (`chromium`, `mobile`) + `surfaces.ts` seeding theme/locale; Browser pane `resize_window colorScheme`; Claude-in-Chrome                                                                                                                                                       | none                                                               | update CLI                 |
| (e) visual regression                   | `visual-full.spec.ts` (VISUAL=1 lane)                                                                                                                                                                                                                                                                                           | uncommitted platform-specific baselines; no phone-viewable diff UI | Argos (free tier)          |
| (f) icons / fonts                       | `better-icons`, `lucide-react`, `@fontsource`, `/legal` CC BY credits                                                                                                                                                                                                                                                           | none                                                               | —                          |

Overlaps to prune in practice (context budget, not uninstalls): `design-taste-frontend` (87 KB, landing-page-scoped) and `high-end-visual-design` (agency-website persona) should not auto-load for product UI work; `browser-qa` (ECC prose) is redundant with `playwright-cli`; `image-to-code` only when a generated reference image is the intended input.

## 4. What NOT to install and why

- **Figma official / GLips / edenspiekermann skills** — atlas workflow already rejected; 6 calls/mo on a free seat; PAT handling; OpenPencil reads the .fig locally.
- **Google Stitch (official or `@_davideast/stitch-mcp`)** — generic output, Google credential + experimental terms, duplicates `/design` + `prototype`.
- **v0 / Lovable** — not code-owned; foreign stacks; licence/SRD partition risk.
- **`chrome-devtools-mcp`** — usage telemetry on by default; duplicates the Browser pane/Claude-in-Chrome; perf traces unnecessary here.
- **`@playwright/mcp`** — duplicates the installed playwright-cli; MCP schema cost in context.
- **Lost Pixel** — archived 2026-04-22. **Chromatic** — needs Storybook (absent) and $179/mo. **Percy** — $599/mo.
- **Storybook** — a second rendering surface would drift from the real PWA shell; the surface manifest already renders every real route.
- **Deque axe MCP** — enterprise subscription; axe-core is already in the e2e suite.
- **`iconify-mcp-server`** (GPL-3.0, 15★, stale) and **`google-fonts-skill`** (12★) — below the quality bar and duplicated.
- **`ui-ux-pro-max`**, **`design-auditor`**, **`design-system-ops`**, **skills.sh review skills < 1K installs** — overlap with impeccable + ECC; one of them (design-auditor) carries a Commons Clause.
- **Style Dictionary / Tokens Studio / token skills** — no Figma round-trip wanted; tokens live in Tailwind v4 CSS.
- **Page Flows** — no API.

## 5. Install commands (run only after owner approval where marked)

```bash
# 1. Mobbin MCP — OWNER GATE: Pro plan (~$40/seat/mo annual); OAuth in browser
claude mcp add mobbin --scope user --transport http https://api.mobbin.com/mcp

# 2. Argos — OWNER GATE: cloud upload of screenshots + ARGOS_TOKEN CI secret (free ≤ 5,000 shots/mo)
pnpm add -D @argos-ci/playwright@7.4.7
#   then in playwright.config.ts: reporter: [["list"], ["@argos-ci/playwright/reporter", { uploadToArgos: !!process.env.CI }]]
#   and set ARGOS_TOKEN in GitHub Actions secrets (never in .env committed files)

# 3. playwright-cli update — no gate
npm install -g @playwright/cli@0.1.19

# 4. ECC design-system skill, selective enable — no gate (plugin stays disabled)
cp -R ~/.claude/plugins/cache/ecc/ecc/2.2.0/skills/design-system ~/.agents/skills/design-system

# Optional, only if the owner declines Mobbin: no install; use Claude-in-Chrome to screenshot
# a handful of reference screens from refero.design / collectui.com / uxarchive.com manually.
```

## 6. Suggested workflow mapping (no new tools)

1. Probe: `prototype` (UI.md) on ONE real route with 3–4 variants → `playwright-cli screenshot --device` for
   dark/light × en/it → paste as chat images. Or `/design` for non-code artboards when the question is
   pure taste. Mobbin images sit next to the probe as "what the best apps do".
2. Decide: owner picks from chat images (rule 25). No atlases; one surface at a time.
3. Build: impeccable (product mode) + frontend-design preamble; `better-icons` for glyphs; ECC
   `design-system` to keep tokens coherent.
4. Verify: repo a11y sweep (axe) + `VISUAL=1` lane locally; Argos build page on the phone for the
   before/after diff of the whole matrix.

## 7. Sources (accessed 2026-09-02)

- find-skills method: `~/.agents/skills/find-skills/SKILL.md`; skills.sh CLI (`npx skills find …`) results captured above.
- Figma: https://help.figma.com/hc/en-us/articles/32132100833559-Guide-to-the-Figma-MCP-server ; https://developers.figma.com/docs/figma-mcp-server/ ; https://github.com/figma/mcp-server-guide ; https://toolradar.com/tools/figma-mcp/pricing
- GLips: https://github.com/GLips/Figma-Context-MCP ; npm `figma-developer-mcp`
- OpenPencil: https://openpencil.dev/programmable/mcp-server ; https://github.com/open-pencil/open-pencil ; npm `@open-pencil/mcp`
- Stitch: https://stitch.withgoogle.com/docs/mcp/setup ; https://github.com/davideast/stitch-mcp ; https://www.sotaaz.com/post/stitch-mcp-guide-en ; https://justinmckelvey.com/blog/google-stitch-mcp
- Mobbin: https://mobbin.com/mcp ; https://www.vendr.com/marketplace/mobbin ; https://delv.tools/blog/mobbin-mcp-first-look-design-reference-claude
- Page Flows / Screenlane: https://www.lazyweb.com/compare/lazyweb-vs-pageflows-vs-screenlane ; https://toolradar.com/tools/screenlane
- Playwright: https://github.com/microsoft/playwright-cli ; https://github.com/microsoft/playwright-mcp ; https://bug0.com/blog/playwright-cli-vs-playwright-mcp-ai-browser-testing-2026 ; https://playwright.dev/docs/getting-started-mcp
- Chrome DevTools MCP: https://github.com/ChromeDevTools/chrome-devtools-mcp (telemetry flags) ; npm `chrome-devtools-mcp`
- Argos: https://argos-ci.com/docs/quickstart/playwright-quickstart.md ; https://argos-ci.com/pricing ; https://argos-ci.com/blog/lost-pixel-alternatives
- Lost Pixel: https://www.lost-pixel.com/ (joining Figma, sunsetting) ; gh api repos/lost-pixel/lost-pixel (archived)
- Chromatic / Percy pricing: https://argos-ci.com/blog/best-visual-regression-testing-tools ; https://www.chromatic.com/compare/lost-pixel
- Icons: https://github.com/imjac0b/iconify-mcp-server ; https://game-icons.net/faq.html ; npm `better-icons`, `lucide-react`, `@phosphor-icons/react`
- Fonts: https://github.com/sliday/google-fonts-skill ; https://pypi.org/project/google-fonts-mcp/
- axe: https://docs.deque.com/devtools-server/4.0.0/en/axe-mcp-server/ ; https://www.deque.com/axe/mcp-server/ ; npm `@axe-core/playwright`
- UX skills: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill ; https://www.skills.sh/nextlevelbuilder/ui-ux-pro-max-skill ; https://github.com/borghei/Claude-Skills/blob/main/engineering/design-auditor/SKILL.md ; https://github.com/murphytrueman/design-system-ops ; https://github.com/edenspiekermann/Skills ; https://github.com/Eskapeum/design-audit ; https://github.com/pbakaus/impeccable
- Tokens: https://github.com/style-dictionary/style-dictionary ; https://github.com/ilikescience/design-tokens-skill
- Claude Design `/design`: https://code.claude.com/docs/en/whats-new/2026-w34
- Licence compatibility: https://fossa.com/resources/devops-tools/license-compatibility-checker/mit-vs-agpl-3-0/ ; https://wiki.creativecommons.org/wiki/GPL_compatibility_use_cases
