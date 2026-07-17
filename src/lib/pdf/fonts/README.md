# Sheet PDF fonts

The character-sheet PDF (`../character-pdf.ts`) embeds a humanist sans to evoke the
look of the official 2024 sheet **without** redistributing any licensed/commercial
typeface. The official sheet sets _Scala Sans_ + _Acumin_ (both commercial); we
substitute the open **Alegreya Sans** family (a warm literary humanist sans — the
closest open match).

## What ships here

Only the **runtime assets** live in this folder:

| File                          | What                                                         |
| ----------------------------- | ------------------------------------------------------------ |
| `alegreya-sans-regular.ts`    | base64 of a Latin+IT **subset** of Alegreya Sans Regular     |
| `alegreya-sans-bold.ts`       | …Bold                                                        |
| `alegreya-sans-sc-regular.ts` | …small-caps (box/section labels)                             |
| `alegreya-sans-sc-bold.ts`    | …small-caps Bold                                             |
| `index.ts`                    | decodes the four into `SHEET_FONT_BYTES` (Uint8Array)        |
| `OFL.txt`                     | the SIL Open Font License 1.1 (required to ship with a font) |

The fonts are **subset** (ASCII + Latin-1 + Latin-Extended-A + the punctuation the
renderer draws) so each face is ~30–35 KiB instead of ~260 KiB, then **base64-inlined**
into TS so they embed identically in the browser and in Node (vitest) — no `fetch`,
no service-worker precache concern, fully offline. They are decoded once on import
and `pdf-lib`/`@pdf-lib/fontkit` embeds them with `subset: true` per export.

## License

SIL Open Font License 1.1 (see `OFL.txt`). Copyright 2013 The Alegreya Sans Project
Authors (github.com/huertatipografica/Alegreya-Sans). **No Reserved Font Name** is
declared, so the subset needs no rename; we ship `OFL.txt` as the license requires.

## Regenerating

The full upstream TTFs are **not** vendored (clean repo — only runtime assets stay).
To regenerate the subsets after a font update:

1. Download the upstream faces from `ofl/alegreyasans` + `ofl/alegreyasanssc` in
   `github.com/google/fonts`.
2. Subset + base64-inline with `fontTools`:
   `python3 -m fontTools.subset <face>.ttf --unicodes=U+0020-007E,U+00A0-00FF,U+0100-017F,U+2010-2027,U+20AC --layout-features=kern,liga,calt,ccmp,locl --no-hinting --desubroutinize --output-file=<out>.ttf`
   then base64-encode each into its `*.ts` module (see git history for the exact shape).
