# Room backgrounds — provenance and rights (generated 2026-10-28, approved 2026-11-02)

**Tool and cost.**
- Generated with the built-in `image_gen` tool of the owner's Codex app (`codex-cli 0.164.0-alpha.11.1`, bundled in ChatGPT.app), driven non-interactively with `codex exec`.
- Codex is signed in with the owner's ChatGPT account (`codex login status` → "Logged in using ChatGPT"). There is no OpenAI API key in `~/.codex/auth.json` (`OPENAI_API_KEY` is empty), so nothing can be billed per call. Each image uses the ChatGPT plan's included usage. The CLI fallback (`scripts/image_gen.py`, which bills the API) was not used.

**Rights.**
- Under OpenAI's terms of use, the user owns the output generated with their account.
- The prompts describe original scenes. They name no artist, studio or franchise style beyond "painterly fantasy concept art in the spirit of the BG3 main-menu backdrops" (a description of a genre, not a copy of an asset).
- The only image given to the generator is the owner's own earlier art: `img/hero/sanctum-hero.webp`, owner-generated, see DESIGN.md §13 Asset Contract. After that, each new image used `sanctum-v2.png`, generated here, as its style reference.
- The BG3, Steam, D&D Beyond and Diablo IV captures in `bg/ref/` are design references for people only. They were never given to the generator and are never shipped.

**Shared style block** (`bg/gen/style.txt`, identical in every prompt):
- painterly BG3-like brushwork;
- night interior of the same mountain castle;
- warm candle and hearth light, plus one lapis moonlight accent;
- low value key, muted saturation, soft edges;
- the subject in the centre 35–65% × 30–65%, so the wide and phone crops both keep it;
- top 12% and bottom 18% calm and dark, but painted, never flat black;
- no people, faces, text, logos or UI.

| File | Room / used on | Prompt file | Reference given | Output (1536×1024 PNG) |
|---|---|---|---|---|
| `sanctum-v1.png` | Sanctum, first try (rejected: too busy and saturated) | `prompt-sanctum.txt` | `ref-sanctum.png` (owner art) | `~/.codex/generated_images/01a1811b-…/exec-b2bb91ef-….png` |
| `sanctum-v2.png` | Sanctum · sign-in | `prompt-sanctum2.txt` | `sanctum-v1.png` | see `gen-sanctum2.log` |
| `study-v1.png` | Study · characters, settings, errors | `prompt-study.txt` | `sanctum-v2.png` | see `gen-study.log` |
| `war-room-v1.png` | War room · campaigns | `prompt-war-room.txt` | `sanctum-v2.png` | see `gen-war-room.log` |
| `library-v1.png` | Library, first try (rejected: same open book as the sanctum) | `prompt-library.txt` | `sanctum-v2.png` | see `gen-library.log` |
| `library-v2.png` | Library · compendium, 404 | `prompt-library2.txt` | `sanctum-v2.png` | see `gen-library2.log` |
| `armoury-v1.png` | Armoury · character creation | `prompt-armoury.txt` | `sanctum-v2.png` | see `gen-armoury.log` |

**Shipped form** (this folder): `sanctum.webp`, `study.webp`, `war-room.webp`, `library.webp`, `armoury.webp` are the five approved images (sanctum-v2, study-v1, war-room-v1, library-v2, armoury-v1). The prompts and the 1536×1024 PNG masters stay in the owner's archive (`~/Workspace/Codex/folio-sfondi-2026-10-28/`), not in the repo.

**Original notes.**
- `img/rooms/<room>.webp`: WebP q80, 1536×1024, about 170 KB each.
- One file serves desktop, tablet and phone. The crop is set in CSS per breakpoint, and the subject stays inside the centre of every crop.
- If adopted for the app, they replace the 10 current hero files (5 wide plus 5 phone).
