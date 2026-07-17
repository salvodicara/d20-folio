/**
 * Character-sheet PDF renderer — a faithful, from-scratch recreation of the
 * official D&D 2024 character sheet LAYOUT, filled with the character's data.
 *
 * Parity is geometric: the renderer draws panels + places values at the measured
 * coordinates in `sheet-geometry.ts` (603×774, the official trim), so the result
 * is visually indistinguishable from the official form — but every pixel is drawn
 * by us. No WotC artwork, logo, ©-line, or font is reproduced: the decorative
 * skin is re-authored, and the text is set in an embedded open humanist face
 * (a Latin+IT subset of Alegreya Sans, SIL OFL) standing in for the sheet's
 * commercial Scala Sans / Acumin.
 *
 * The renderer is **i18n-free**: it draws ONLY strings the view-model
 * (`character-pdf-view.ts`) already resolved through i18n keys — it never holds a
 * language literal. `toUpperCase()`/`toLowerCase()` here are case TRANSFORMS of an
 * already-localized string (for the sheet's caps / small-caps caption styling),
 * and features route to panels by their stable `kind`, never a display string.
 * Every value is the same override-affected value the cockpit shows (one source).
 */
import {
  PDFDocument,
  rgb,
  type PDFPage,
  type PDFFont,
  type PDFImage,
  type RGB,
} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { CharacterPdfViewModel } from "./character-pdf-view";
import { SHEET_FONT_BYTES } from "./fonts";
import { winAnsi } from "./pdf-text";
import {
  PAGE,
  FRAME,
  FRAME_OUTER,
  P1,
  P2,
  type RRect,
  type Anchor,
} from "./sheet-geometry";

// ── palette: black ink + neutral grays only — print-first, B&W (no color) ──
const INK = rgb(0, 0, 0); // values, titles, primary text
const MUTED = rgb(0.42, 0.42, 0.42); // small-caps field captions / labels
const FAINT = rgb(0.62, 0.62, 0.62); // footer / faint helper text
const BORDER = rgb(0.3, 0.3, 0.3); // panel + box borders (crisp)
const HAIR = rgb(0.72, 0.72, 0.72); // inner dividers / bubble outlines
const PANEL = rgb(1, 1, 1); // panel fill (white)
const BAND = rgb(0.9, 0.9, 0.9); // section header-band fill
const TITLE = rgb(0, 0, 0); // titles (black, set on the band)
const PIP = rgb(0.12, 0.12, 0.12); // proficiency pips

interface Fonts {
  sans: PDFFont;
  sansBold: PDFFont;
  sc: PDFFont;
  scBold: PDFFont;
}

// ───────────────────────────── text helpers ─────────────────────────────
// Presentation-boundary guard: any field may be an empty display string; the
// renderer draws blank rather than crash (text() also skips falsy). This is a
// draw-boundary normalization, not a domain default.
const sane = (s: string): string => winAnsi(s || "");

function width(font: PDFFont, s: string, size: number): number {
  return font.widthOfTextAtSize(sane(s), size);
}

function text(
  page: PDFPage,
  s: string,
  x: number,
  y: number,
  font: PDFFont,
  size: number,
  color: RGB = INK
): void {
  if (!s) return;
  page.drawText(sane(s), { x, y, size, font, color });
}

function textCenter(
  page: PDFPage,
  s: string,
  cx: number,
  y: number,
  font: PDFFont,
  size: number,
  color: RGB = INK
): void {
  text(page, s, cx - width(font, s, size) / 2, y, font, size, color);
}

function textRight(
  page: PDFPage,
  s: string,
  rx: number,
  y: number,
  font: PDFFont,
  size: number,
  color: RGB = INK
): void {
  text(page, s, rx - width(font, s, size), y, font, size, color);
}

/** Truncate with an ellipsis to fit `maxW`. */
function clip(font: PDFFont, s: string, size: number, maxW: number): string {
  const clean = sane(s);
  if (font.widthOfTextAtSize(clean, size) <= maxW) return clean;
  let lo = 0;
  let hi = clean.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (font.widthOfTextAtSize(`${clean.slice(0, mid)}…`, size) <= maxW) lo = mid;
    else hi = mid - 1;
  }
  return `${clean.slice(0, lo)}…`;
}

/** Word-wrap to `maxW`, returning the lines. */
function wrapText(font: PDFFont, s: string, size: number, maxW: number): string[] {
  const out: string[] = [];
  for (const raw of sane(s).split("\n")) {
    const words = raw.split(/\s+/).filter(Boolean);
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > maxW && line) {
        out.push(line);
        line = word;
      } else line = next;
    }
    if (line) out.push(line);
  }
  return out;
}

// ───────────────────────────── shape helpers ─────────────────────────────

/** A rounded rectangle drawn via an SVG path (pdf-lib has no rounded-rect prim). */
function roundRect(
  page: PDFPage,
  b: RRect,
  opts: { fill?: RGB; border?: RGB; borderWidth?: number }
): void {
  const r = Math.min(b.r, b.w / 2, b.h / 2);
  const { w, h } = b;
  // SVG path in a local top-left frame (y DOWN); placed so local (0,0) -> (x, y+h).
  const path =
    `M ${r} 0 H ${w - r} A ${r} ${r} 0 0 1 ${w} ${r} V ${h - r} ` +
    `A ${r} ${r} 0 0 1 ${w - r} ${h} H ${r} A ${r} ${r} 0 0 1 0 ${h - r} ` +
    `V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`;
  page.drawSvgPath(path, {
    x: b.x,
    y: b.y + b.h,
    borderColor: opts.border,
    borderWidth: opts.borderWidth ?? 0.8,
    color: opts.fill,
  });
}

/** A filled band across the TOP of a box, with the box's top corners rounded and
 *  a flat bottom — the section-header strip that makes each panel read as designed. */
function topBand(page: PDFPage, box: RRect, h: number, fill: RGB): void {
  const r = Math.min(box.r, box.w / 2, h);
  const { x, w } = box;
  const topY = box.y + box.h;
  const path =
    `M ${r} 0 H ${w - r} A ${r} ${r} 0 0 1 ${w} ${r} V ${h} H 0 V ${r} ` +
    `A ${r} ${r} 0 0 1 ${r} 0 Z`;
  page.drawSvgPath(path, { x, y: topY, color: fill });
}

/** A small struck box (score / value chip) — hairline border, no fill. */
function chip(page: PDFPage, b: RRect): void {
  roundRect(page, b, { border: HAIR, borderWidth: 0.7 });
}

/** A thin inner divider rule. */
function hairline(page: PDFPage, x1: number, x2: number, y: number): void {
  page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 0.5, color: HAIR });
}

/** A small decorative fleuron — a four-point lozenge with a pin-dot centre, the
 *  ornament that flanks section titles (original, evokes an illuminated folio). */
function fleuron(
  page: PDFPage,
  cx: number,
  cy: number,
  s: number,
  color: RGB = BORDER
): void {
  page.drawSvgPath(`M 0 ${-s} L ${s * 0.62} 0 L 0 ${s} L ${-s * 0.62} 0 Z`, {
    x: cx,
    y: cy,
    color,
  });
}

/** A shield outline (AC) — a generic heraldic shape drawn from scratch. Drawn in a
 *  local top-left frame (y DOWN), placed so the shield's top edge sits at `topY`. */
function shield(page: PDFPage, cx: number, topY: number, w: number, h: number): void {
  const path =
    `M 0 0 H ${w} V ${h * 0.52} Q ${w} ${h * 0.86} ${w / 2} ${h} ` +
    `Q 0 ${h * 0.86} 0 ${h * 0.52} Z`;
  page.drawSvgPath(path, {
    x: cx - w / 2,
    y: topY,
    borderColor: BORDER,
    borderWidth: 1,
  });
}

type PipState = "none" | "half" | "proficient" | "expertise";

/** A proficiency pip — hollow / half / filled / filled+ring. */
function pip(page: PDFPage, cx: number, cy: number, state: PipState): void {
  const r = 2.4;
  if (state === "expertise") {
    page.drawCircle({ x: cx, y: cy, size: r + 1.4, borderColor: PIP, borderWidth: 0.7 });
  }
  page.drawCircle({
    x: cx,
    y: cy,
    size: r,
    borderColor: PIP,
    borderWidth: 0.7,
    color: state === "proficient" || state === "expertise" ? PIP : undefined,
  });
  if (state === "half") page.drawCircle({ x: cx, y: cy, size: 1, color: PIP });
}

/** A small fillable bubble (death saves). */
function bubble(page: PDFPage, cx: number, cy: number, filled: boolean): void {
  page.drawCircle({
    x: cx,
    y: cy,
    size: 2.6,
    borderColor: FAINT,
    borderWidth: 0.7,
    color: filled ? PIP : undefined,
  });
}

// ───────────────────────────── caption helpers ─────────────────────────────

/** Small-caps muted field caption (lowercased → all-small-caps via the SC font). */
function caption(
  page: PDFPage,
  fonts: Fonts,
  s: string,
  x: number,
  y: number,
  size = 7
): void {
  text(page, s.toLowerCase(), x, y, fonts.sc, size, MUTED);
}
function captionCenter(
  page: PDFPage,
  fonts: Fonts,
  s: string,
  cx: number,
  y: number,
  size = 7
): void {
  textCenter(page, s.toLowerCase(), cx, y, fonts.sc, size, MUTED);
}

/** Bold all-caps centered title (used for the spell-table heading). */
function titleCenter(
  page: PDFPage,
  fonts: Fonts,
  s: string,
  cx: number,
  y: number,
  size = 8,
  color: RGB = TITLE
): void {
  textCenter(page, s.toUpperCase(), cx, y, fonts.sansBold, size, color);
}

/** A panel's header: a light band across the box top, a small-caps title centered
 *  on it, and a hairline rule under it. The structural device that makes every
 *  panel read as designed (and fills the "empty" feel) without color or art. */
function panelHeader(
  page: PDFPage,
  fonts: Fonts,
  box: RRect,
  s: string,
  size = 8.5
): void {
  const bandH = 15;
  const top = box.y + box.h;
  topBand(page, box, bandH, BAND);
  page.drawLine({
    start: { x: box.x, y: top - bandH },
    end: { x: box.x + box.w, y: top - bandH },
    thickness: 0.6,
    color: BORDER,
  });
  const cx = box.x + box.w / 2;
  const titleStr = clip(fonts.scBold, s.toLowerCase(), size, box.w - 10);
  textCenter(page, titleStr, cx, top - bandH + 4.6, fonts.scBold, size, TITLE);
  // engraved flanking rules — short hairlines either side of the title, drawn only
  // where there's genuine room (wide content panels), so compact stat boxes stay
  // clean. A subtle, original ornament that lifts the section headers.
  const half = width(fonts.scBold, titleStr, size) / 2;
  const ruleEnd = cx - half - 8;
  if (ruleEnd - (box.x + 16) > 16) {
    const ry = top - bandH / 2 - 0.5;
    const lOut = box.x + 16;
    const rOut = box.x + box.w - 16;
    hairline(page, lOut + 2, ruleEnd, ry);
    hairline(page, cx + half + 8, rOut - 2, ry);
    // fleurons hugging the title, terminal beads at the band edges
    fleuron(page, ruleEnd, ry, 2.3);
    fleuron(page, cx + half + 8, ry, 2.3);
    page.drawCircle({ x: lOut, y: ry, size: 1, color: HAIR });
    page.drawCircle({ x: rOut, y: ry, size: 1, color: HAIR });
  }
}

// ═══════════════════════════════ entry point ═══════════════════════════════

export async function renderCharacterPdf(
  vm: CharacterPdfViewModel,
  portrait?: { bytes: Uint8Array; mime: string } | null
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`${vm.name} — d20 Folio`);
  doc.setCreator("d20 Folio");
  doc.setProducer("d20 Folio");

  const fonts: Fonts = {
    sans: await doc.embedFont(SHEET_FONT_BYTES.sansRegular, { subset: true }),
    sansBold: await doc.embedFont(SHEET_FONT_BYTES.sansBold, { subset: true }),
    sc: await doc.embedFont(SHEET_FONT_BYTES.scRegular, { subset: true }),
    scBold: await doc.embedFont(SHEET_FONT_BYTES.scBold, { subset: true }),
  };

  let portraitImg: PDFImage | null = null;
  if (portrait) {
    try {
      portraitImg = portrait.mime.includes("png")
        ? await doc.embedPng(portrait.bytes)
        : await doc.embedJpg(portrait.bytes);
    } catch {
      portraitImg = null;
    }
  }

  const page1 = doc.addPage([PAGE.w, PAGE.h]);
  drawFrame(page1);
  drawHeader(page1, fonts, vm);
  drawStatBar(page1, fonts, vm);
  drawAbilities(page1, fonts, vm);
  drawHeroicInspiration(page1, fonts, vm);
  drawWeapons(page1, fonts, vm);
  drawClassFeatures(page1, fonts, vm);
  drawSpeciesTraits(page1, fonts, vm);
  drawFeats(page1, fonts, vm);
  drawEquipmentTraining(page1, fonts, vm);

  const page2 = doc.addPage([PAGE.w, PAGE.h]);
  drawFrame(page2);
  drawSpellcasting(page2, fonts, vm);
  drawSpellSlots(page2, fonts, vm);
  drawSpellTable(page2, fonts, vm);
  drawAppearance(page2, fonts, vm, portraitImg);
  drawBackstory(page2, fonts, vm);
  drawLanguages(page2, fonts, vm);
  drawEquipmentPanel(page2, fonts, vm);
  drawCoins(page2, fonts, vm);

  drawFooter(page1, fonts, vm, 1, 2);
  drawFooter(page2, fonts, vm, 2, 2);

  return doc.save();
}

// ═══════════════════════════════ page 1 ═══════════════════════════════

function drawFrame(page: PDFPage): void {
  roundRect(page, FRAME_OUTER, { border: BORDER, borderWidth: 0.7 });
  roundRect(page, FRAME, { border: HAIR, borderWidth: 0.7 });
}

function fieldValue(
  page: PDFPage,
  fonts: Fonts,
  value: string,
  capt: string,
  cap: Anchor,
  maxW: number,
  valSize = 9
): void {
  caption(page, fonts, capt, cap.x, cap.y);
  text(
    page,
    clip(fonts.sans, value, valSize, maxW),
    cap.x,
    cap.y + 9,
    fonts.sans,
    valSize,
    INK
  );
}

function drawHeader(page: PDFPage, fonts: Fonts, vm: CharacterPdfViewModel): void {
  const f = P1.identityFields;
  roundRect(page, P1.identity, { fill: PANEL, border: BORDER, borderWidth: 0.9 });
  text(
    page,
    clip(fonts.sansBold, vm.name, 15, 224),
    f.name.x,
    f.name.y + 10,
    fonts.sansBold,
    15
  );
  caption(page, fonts, vm.labels.characterName, f.name.x, f.name.y);
  fieldValue(page, fonts, vm.header.background, vm.labels.background, f.background, 112);
  fieldValue(page, fonts, vm.header.classes, vm.labels.className, f.class, 100);
  fieldValue(page, fonts, vm.header.species, vm.labels.species, f.species, 112);
  fieldValue(page, fonts, vm.header.subclass, vm.labels.subclass, f.subclass, 100);

  roundRect(page, P1.levelXp, { fill: PANEL, border: BORDER, borderWidth: 0.9 });
  {
    const lvx = P1.levelXp.x + P1.levelXp.w / 2;
    // LEVEL field (upper) — value over caption
    textCenter(page, String(vm.totalLevel), lvx, 738, fonts.sansBold, 18);
    captionCenter(page, fonts, vm.labels.level, lvx, 728, 6.5);
    hairline(page, P1.levelXp.x + 7, P1.levelXp.x + P1.levelXp.w - 7, 721);
    // XP field (lower) — blank for the player to fill, caption anchored at the base
    captionCenter(page, fonts, vm.labels.xp, lvx, 698, 6.5);
  }

  roundRect(page, P1.ac, { fill: PANEL, border: BORDER, borderWidth: 0.9 });
  {
    const acx = P1.ac.x + P1.ac.w / 2;
    const acTop = P1.ac.y + P1.ac.h;
    textCenter(
      page,
      clip(fonts.scBold, vm.labels.armorClass.toLowerCase(), 6.5, P1.ac.w - 6),
      acx,
      acTop - 11,
      fonts.scBold,
      6.5,
      TITLE
    );
    shield(page, acx, acTop - 19, 36, 42);
    textCenter(page, vm.combat.ac, acx, acTop - 45, fonts.sansBold, 18);
  }

  drawCombatBox(page, fonts, vm);
}

/**
 * Hit points · hit dice · death saves — one box split into three sub-sections by
 * vertical dividers (the official's structure), each with its own caption rule and
 * a clear field grid so nothing floats. Death-save bubbles sit BELOW their caption
 * so a longer localized label (IT) can never collide with them.
 */
function drawCombatBox(page: PDFPage, fonts: Fonts, vm: CharacterPdfViewModel): void {
  const cb = P1.combat;
  roundRect(page, cb, { fill: PANEL, border: BORDER, borderWidth: 0.9 });
  const cTop = cb.y + cb.h;
  const sepX1 = cb.x + 112; // hit points | hit dice
  const sepX2 = sepX1 + 47; // hit dice | death saves (widest gets the rest)
  for (const sx of [sepX1, sepX2])
    page.drawLine({
      start: { x: sx, y: cb.y + 8 },
      end: { x: sx, y: cTop - 8 },
      thickness: 0.5,
      color: HAIR,
    });
  // sub-title wraps to ≤2 lines (a long localized label — IT death saves — never
  // overflows its column); the divider follows the title height. Returns where
  // the column's content may start.
  const subTitle = (s: string, x0: number, x1: number, size = 6.5) => {
    const cx = (x0 + x1) / 2;
    const lines = wrapText(fonts.sc, s.toLowerCase(), size, x1 - x0 - 6).slice(0, 2);
    lines.forEach((ln, i) =>
      textCenter(page, ln, cx, cTop - 11 - i * 7.5, fonts.sc, size, MUTED)
    );
    const divY = cTop - 11 - (lines.length - 1) * 7.5 - 6;
    hairline(page, x0 + 6, x1 - 6, divY);
    return { cx, divY };
  };

  // HIT POINTS — big current over a max | temp row (bottom-anchored)
  {
    const { cx } = subTitle(vm.labels.hitPoints, cb.x, sepX1, 7);
    textCenter(page, String(vm.combat.hpCurrent), cx, cb.y + 33, fonts.sansBold, 20);
    captionCenter(page, fonts, vm.labels.current, cx, cb.y + 25, 6);
    const lcx = cb.x + (sepX1 - cb.x) * 0.31;
    const rcx = cb.x + (sepX1 - cb.x) * 0.69;
    textCenter(page, String(vm.combat.hpMax), lcx, cb.y + 13, fonts.sansBold, 11);
    captionCenter(page, fonts, vm.labels.max, lcx, cb.y + 5, 5.5);
    textCenter(
      page,
      vm.tempHp > 0 ? String(vm.tempHp) : "—",
      rcx,
      cb.y + 13,
      fonts.sansBold,
      11
    );
    captionCenter(page, fonts, vm.labels.temp, rcx, cb.y + 5, 5.5);
  }
  // HIT DICE — max over spent (bottom-anchored, aligned with HP fields)
  {
    const { cx } = subTitle(vm.labels.hitDice, sepX1, sepX2, 7);
    textCenter(page, vm.combat.hitDice, cx, cb.y + 33, fonts.sansBold, 13);
    captionCenter(page, fonts, vm.labels.max, cx, cb.y + 25, 5.5);
    textCenter(page, String(vm.hitDiceUsed), cx, cb.y + 13, fonts.sansBold, 11);
    captionCenter(page, fonts, vm.labels.spent, cx, cb.y + 5, 5.5);
  }
  // DEATH SAVES — successes then failures, bubbles below each caption (from divider)
  {
    const { cx, divY } = subTitle(vm.labels.deathSaves, sepX2, cb.x + cb.w);
    captionCenter(page, fonts, vm.labels.successes, cx, divY - 9, 5.5);
    for (let i = 0; i < 3; i++) bubble(page, cx - 9 + i * 9, divY - 19, i < vm.deathSucc);
    captionCenter(page, fonts, vm.labels.failures, cx, divY - 31, 5.5);
    for (let i = 0; i < 3; i++) bubble(page, cx - 9 + i * 9, divY - 41, i < vm.deathFail);
  }
}

function statCell(
  page: PDFPage,
  fonts: Fonts,
  cell: { box: RRect },
  label: string,
  value: string,
  valueSize = 14
): void {
  roundRect(page, cell.box, { fill: PANEL, border: BORDER, borderWidth: 0.9 });
  panelHeader(page, fonts, cell.box, label, 7);
  const cx = cell.box.x + cell.box.w / 2;
  // value centered in the area BELOW the band, sized to the box so a tall cell
  // (proficiency bonus) is confidently filled rather than reading as empty
  const midY = cell.box.y + (cell.box.h - 15) / 2 - valueSize * 0.34;
  textCenter(page, value, cx, midY, fonts.sansBold, valueSize);
}

function drawStatBar(page: PDFPage, fonts: Fonts, vm: CharacterPdfViewModel): void {
  const s = P1.statBar;
  // proficiency bonus sits in a tall box — fill it with a large, confident value
  statCell(page, fonts, s.profBonus, vm.labels.proficiencyBonus, vm.combat.pb, 26);
  statCell(page, fonts, s.initiative, vm.labels.initiative, vm.combat.initiative);
  statCell(page, fonts, s.speed, vm.labels.speed, vm.combat.speed);
  statCell(page, fonts, s.size, vm.labels.size, vm.size);
  statCell(
    page,
    fonts,
    s.passivePerception,
    vm.labels.passivePerception,
    String(vm.passives[0]?.value ?? "")
  );
}

const PIP_BY_STATE: Record<string, PipState> = {
  expertise: "expertise",
  proficient: "proficient",
  half: "half",
  none: "none",
};

function drawAbilities(page: PDFPage, fonts: Fonts, vm: CharacterPdfViewModel): void {
  for (const code of P1.abilities.order) {
    const ab = vm.abilities.find((a) => a.code === code);
    if (!ab) continue;
    drawAbilityBox(
      page,
      fonts,
      vm,
      P1.abilities.boxes[code],
      ab,
      vm.skills.filter((sk) => sk.ability === code)
    );
  }
}

/**
 * One ability = a fixed box (the official's measured size) filled top-to-bottom:
 * a header band with the ability name, the modifier struck in a medallion beside
 * the score chip, the saving throw under a divider, then the ability's skills
 * distributed to fill the remaining height. Sizing is fixed (never floating), so
 * the two columns read as a tidy designed stack with no dead space.
 */
function drawAbilityBox(
  page: PDFPage,
  fonts: Fonts,
  vm: CharacterPdfViewModel,
  box: RRect,
  ab: CharacterPdfViewModel["abilities"][number],
  skills: CharacterPdfViewModel["skills"]
): void {
  roundRect(page, box, { fill: PANEL, border: BORDER, borderWidth: 1 });
  panelHeader(page, fonts, box, ab.fullName, 8);
  const bandBottom = box.y + box.h - 15;
  const innerL = box.x + 6;
  const innerR = box.x + box.w - 6;

  // modifier medallion (left) + score chip (right), each captioned beneath
  const modCx = box.x + 31;
  const scoreCx = box.x + 65;
  const statCy = bandBottom - 17;
  // a struck "coin" — outer ring, fine inner ring, and four cardinal beads
  page.drawCircle({
    x: modCx,
    y: statCy,
    size: 13,
    borderColor: BORDER,
    borderWidth: 0.9,
  });
  page.drawCircle({
    x: modCx,
    y: statCy,
    size: 10.6,
    borderColor: HAIR,
    borderWidth: 0.5,
  });
  for (const [dx, dy] of [
    [0, 13],
    [0, -13],
    [13, 0],
    [-13, 0],
  ] as const)
    page.drawCircle({ x: modCx + dx, y: statCy + dy, size: 0.9, color: BORDER });
  textCenter(page, ab.modifier, modCx, statCy - 5, fonts.sansBold, 15);
  captionCenter(page, fonts, vm.labels.modifier, modCx, bandBottom - 36, 5.5);
  chip(page, { x: scoreCx - 13, y: statCy - 10, w: 26, h: 20, r: 3 });
  textCenter(page, String(ab.score), scoreCx, statCy - 5, fonts.sansBold, 12);
  captionCenter(page, fonts, vm.labels.score, scoreCx, bandBottom - 36, 5.5);

  // saving-throw row, under a divider
  const saveY = bandBottom - 50;
  hairline(page, innerL, innerR, saveY + 11);
  pip(page, innerL + 4, saveY + 2.5, ab.saveProficient ? "proficient" : "none");
  caption(page, fonts, vm.labels.savingThrow, innerL + 11, saveY, 6);
  textRight(page, ab.save, innerR, saveY, fonts.sansBold, 8);

  // the ability's skills, distributed to FILL the rest of the box
  if (!skills.length) return;
  const skillsTop = saveY - 7;
  hairline(page, innerL, innerR, skillsTop);
  const floor = box.y + 7;
  const step = Math.max(12.5, Math.min(15.5, (skillsTop - floor) / skills.length));
  let sy = skillsTop - step + 3;
  for (const sk of skills) {
    pip(page, innerL + 4, sy + 2.5, PIP_BY_STATE[sk.state] ?? "none");
    const bonusW = width(fonts.sansBold, sk.bonus, 7);
    text(
      page,
      clip(fonts.sans, sk.name, 7, innerR - bonusW - 4 - (innerL + 11)),
      innerL + 11,
      sy,
      fonts.sans,
      7,
      INK
    );
    textRight(page, sk.bonus, innerR, sy, fonts.sansBold, 7);
    sy -= step;
  }
}

function drawHeroicInspiration(
  page: PDFPage,
  fonts: Fonts,
  vm: CharacterPdfViewModel
): void {
  const h = P1.heroicInspiration;
  roundRect(page, h.box, { fill: PANEL, border: BORDER, borderWidth: 1 });
  panelHeader(page, fonts, h.box, vm.labels.heroicInspiration, 7);
  // a four-point sparkle inside a ring — filled when the character holds Heroic
  // Inspiration (a spark of fortune; our own emblem)
  const cx = h.box.x + h.box.w / 2;
  const cy = h.box.y + (h.box.h - 15) / 2;
  page.drawCircle({ x: cx, y: cy, size: 9, borderColor: HAIR, borderWidth: 0.7 });
  const ro = 6.2;
  const ri = 2.2;
  page.drawSvgPath(
    `M 0 ${-ro} L ${ri} ${-ri} L ${ro} 0 L ${ri} ${ri} L 0 ${ro} ` +
      `L ${-ri} ${ri} L ${-ro} 0 L ${-ri} ${-ri} Z`,
    {
      x: cx,
      y: cy,
      color: vm.inspiration ? PIP : undefined,
      borderColor: BORDER,
      borderWidth: 0.9,
    }
  );
}

function drawWeapons(page: PDFPage, fonts: Fonts, vm: CharacterPdfViewModel): void {
  const w = P1.weapons;
  roundRect(page, { ...w.box, r: 9 }, { fill: PANEL, border: BORDER, borderWidth: 0.9 });
  panelHeader(page, fonts, { ...w.box, r: 9 }, vm.labels.weaponsTitle);
  caption(page, fonts, vm.labels.colName, w.cols.name.x, w.cols.name.y, 6);
  caption(page, fonts, vm.labels.colAtk, w.cols.atk.x, w.cols.atk.y, 6);
  caption(page, fonts, vm.labels.colDamage, 386, w.cols.atk.y, 6);
  caption(page, fonts, vm.labels.colNotes, w.cols.notes.x, w.cols.notes.y, 6);
  let y = w.firstRowY;
  for (const wp of vm.weapons.slice(0, w.rows)) {
    text(
      page,
      clip(fonts.sansBold, wp.name, 8, 100),
      w.cols.name.x,
      y,
      fonts.sansBold,
      8
    );
    text(page, wp.attack, w.cols.atk.x, y, fonts.sans, 7.5);
    text(page, clip(fonts.sans, wp.damage, 7.5, 70), 386, y, fonts.sans, 7.5);
    if (wp.notes)
      text(
        page,
        clip(fonts.sans, wp.notes, 6.5, 124),
        w.cols.notes.x,
        y,
        fonts.sans,
        6.5,
        MUTED
      );
    y -= w.rowStep;
  }
}

/**
 * A bordered content panel with a header band and a NAMES-ONLY list (descriptions
 * live in the app / are penciled in — the official boxes are fixed-size, so we
 * never wrap prose). Each name gets a bullet; rows distribute to FILL the box so a
 * short list never clusters at the top, and a trailing "…" marks genuine overflow
 * rather than silently dropping items.
 */
function listPanel(
  page: PDFPage,
  fonts: Fonts,
  box: RRect,
  titleText: string,
  region: { bodyTop: number; bodyLeft: number; bodyRight: number },
  items: Array<{ name: string }>
): void {
  roundRect(
    page,
    { ...box, r: box.r || 9 },
    { fill: PANEL, border: BORDER, borderWidth: 0.9 }
  );
  panelHeader(page, fonts, { ...box, r: box.r || 9 }, titleText);
  const bulletX = region.bodyLeft + 1.5;
  const nameX = region.bodyLeft + 8;
  const maxW = region.bodyRight - nameX;
  const floor = box.y + 9;
  const n = items.length;
  if (n === 0) return;
  const step = Math.max(12, Math.min(20, (region.bodyTop - floor) / n));
  let y = region.bodyTop;
  for (const it of items) {
    if (y < floor) {
      text(page, "…", nameX, y + step - 4, fonts.sans, 7.5, MUTED);
      break;
    }
    page.drawCircle({ x: bulletX, y: y + 2.6, size: 1.15, color: PIP });
    text(page, clip(fonts.sansBold, it.name, 8.2, maxW), nameX, y, fonts.sansBold, 8.2);
    y -= step;
  }
}

function drawClassFeatures(page: PDFPage, fonts: Fonts, vm: CharacterPdfViewModel): void {
  const cf = P1.classFeatures;
  const items = vm.features
    .filter((f) => f.kind === "class")
    .map((f) => ({ name: f.name }));
  listPanel(page, fonts, cf.box, vm.labels.classFeatures, cf, items);
}

function drawSpeciesTraits(page: PDFPage, fonts: Fonts, vm: CharacterPdfViewModel): void {
  const st = P1.speciesTraits;
  const items = vm.features
    .filter((f) => f.kind === "race")
    .map((f) => ({ name: f.name }));
  listPanel(page, fonts, st.box, vm.labels.speciesTraits, st, items);
}

function drawFeats(page: PDFPage, fonts: Fonts, vm: CharacterPdfViewModel): void {
  const ft = P1.feats;
  const items = vm.features
    .filter((f) => f.kind === "feat")
    .map((f) => ({ name: f.name }));
  listPanel(page, fonts, ft.box, vm.labels.feats, ft, items);
}

function drawEquipmentTraining(
  page: PDFPage,
  fonts: Fonts,
  vm: CharacterPdfViewModel
): void {
  const box = P1.equipmentTraining.box;
  roundRect(page, box, { fill: PANEL, border: BORDER, borderWidth: 0.9 });
  panelHeader(page, fonts, box, vm.labels.equipmentTraining);
  const innerL = box.x + 10;
  const innerR = box.x + box.w - 10;
  const top = box.y + box.h;
  const span = innerR - innerL;

  // ARMOR TRAINING — sub-label + four labeled toggles
  caption(page, fonts, vm.labels.armorTraining, innerL, top - 30, 7);
  const toggles: Array<[string, boolean]> = [
    [vm.labels.armorLight, vm.armorTraining.light],
    [vm.labels.armorMedium, vm.armorTraining.medium],
    [vm.labels.armorHeavy, vm.armorTraining.heavy],
    [vm.labels.armorShields, vm.armorTraining.shields],
  ];
  toggles.forEach(([lbl, on], i) => {
    const cx = innerL + (span * (i + 0.5)) / 4;
    captionCenter(page, fonts, lbl, cx, top - 45, 6.3);
    pip(page, cx, top - 55, on ? "proficient" : "none");
  });
  hairline(page, innerL, innerR, top - 65);

  // WEAPONS — sub-label + localized categories (skip if none, never an empty row)
  let y = top - 80;
  if (vm.weaponsTraining.trim()) {
    caption(page, fonts, vm.labels.weapons, innerL, y, 7);
    const lw = width(fonts.sc, vm.labels.weapons.toLowerCase(), 7) + 8;
    text(
      page,
      clip(fonts.sans, vm.weaponsTraining, 7.5, innerR - innerL - lw),
      innerL + lw,
      y,
      fonts.sans,
      7.5,
      INK
    );
    y -= 11;
    hairline(page, innerL, innerR, y + 3);
    y -= 11;
  }

  // TOOLS — sub-label + wrapped value
  if (vm.tools.trim()) {
    caption(page, fonts, vm.labels.tools, innerL, y, 7);
    y -= 11;
    for (const ln of wrapText(fonts.sans, vm.tools, 7.5, span)) {
      if (y < box.y + 8) break;
      text(page, ln, innerL, y, fonts.sans, 7.5, INK);
      y -= 9.5;
    }
  }
}

// ═══════════════════════════════ page 2 ═══════════════════════════════
// (Page-2 panel TITLES reuse existing keys via vm.headings; the few captions
//  still missing a key render as honest blanks until the key lands — never a
//  hardcoded literal.)

function drawSpellcasting(page: PDFPage, fonts: Fonts, vm: CharacterPdfViewModel): void {
  const sc = P2.spellcasting;
  roundRect(page, sc.box, { fill: PANEL, border: BORDER, borderWidth: 0.9 });
  // spellcasting ability — caption + value chip at the top of the panel
  caption(page, fonts, vm.labels.spellcastingAbility, sc.ability.x, sc.ability.y, 6.5);
  chip(page, sc.abilityBox);
  textCenter(
    page,
    vm.spellcasting?.ability ?? "",
    sc.abilityBox.x + sc.abilityBox.w / 2,
    sc.abilityBox.y + 5.5,
    fonts.sansBold,
    10
  );
  hairline(page, sc.box.x + 7, sc.box.x + sc.box.w - 7, sc.abilityDivY);
  const rows: Array<[{ x: number; y: number }, RRect, string, string]> = [
    [
      sc.modifier.label,
      sc.modifier.box,
      vm.labels.spellcastingModifier,
      vm.spellcasting?.modifier ?? "",
    ],
    [
      sc.saveDc.label,
      sc.saveDc.box,
      vm.labels.spellSaveDcFull,
      vm.spellcasting?.saveDC ?? "",
    ],
    [
      sc.attackBonus.label,
      sc.attackBonus.box,
      vm.labels.spellAttackBonus,
      vm.spellcasting?.attackBonus ?? "",
    ],
  ];
  for (const [lab, box, labText, value] of rows) {
    // light value chip + a single-line small-caps label (was heavy 2-line bold
    // caps — the panel's clutter); both vertically centred on the chip
    const cy = box.y + box.h / 2;
    chip(page, box);
    textCenter(page, value, box.x + box.w / 2, cy - 3.5, fonts.sansBold, 11);
    text(
      page,
      clip(fonts.sc, labText.toLowerCase(), 7.5, sc.box.x + sc.box.w - 7 - lab.x),
      lab.x,
      cy - 3,
      fonts.sc,
      7.5,
      MUTED
    );
  }
}

function drawSpellSlots(page: PDFPage, fonts: Fonts, vm: CharacterPdfViewModel): void {
  const s = P2.spellSlots;
  if (!vm.spellcasting) return;
  roundRect(page, { ...s.box, r: 9 }, { fill: PANEL, border: BORDER, borderWidth: 0.9 });
  panelHeader(page, fonts, { ...s.box, r: 9 }, vm.labels.spellSlots);
  for (let h = 0; h < 3; h++) {
    text(
      page,
      vm.labels.total,
      (s.totalX[h] ?? 0) - 6,
      s.colHeaderY,
      fonts.sans,
      6,
      MUTED
    );
    text(
      page,
      vm.labels.expended,
      (s.expendedX[h] ?? 0) - 6,
      s.colHeaderY,
      fonts.sans,
      6,
      MUTED
    );
  }
  for (let col = 0; col < 3; col++) {
    for (let row = 0; row < 3; row++) {
      const level = col * 3 + row + 1;
      const ly = s.rowY[row] ?? 0;
      text(
        page,
        clip(fonts.sc, `${vm.labels.level} ${level}`, 6.5, 24),
        s.levelLabelX[col] ?? 0,
        ly,
        fonts.sc,
        6.5,
        MUTED
      );
      roundRect(
        page,
        { x: (s.totalX[col] ?? 0) - 6, y: ly - 4, w: 14, h: 13, r: 2 },
        { border: BORDER, borderWidth: 0.6 }
      );
      roundRect(
        page,
        { x: (s.expendedX[col] ?? 0) - 6, y: ly - 4, w: 14, h: 13, r: 2 },
        { border: BORDER, borderWidth: 0.6 }
      );
    }
  }
}

function drawSpellTable(page: PDFPage, fonts: Fonts, vm: CharacterPdfViewModel): void {
  const sp = P2.spells;
  roundRect(page, { ...sp.box, r: 9 }, { fill: PANEL, border: BORDER, borderWidth: 0.9 });
  // the official LEFT-biases this title (over the level/name/time columns), not
  // panel-centered — match its measured center (196) rather than the box center.
  titleCenter(page, fonts, vm.labels.spellTable, 196, sp.title.y, 8);
  // column-header row (Level · Name · Casting Time · Range · C·R·M · Notes)
  const hy = sp.cols.name.y;
  caption(page, fonts, vm.labels.level, sp.cols.level.x, hy, 6);
  caption(page, fonts, vm.labels.colName, sp.cols.name.x, hy, 6);
  caption(page, fonts, vm.labels.castingTime, sp.cols.time.x, hy, 5.5);
  caption(page, fonts, vm.labels.rangeLabel, sp.cols.range.x, hy, 5.5);
  textCenter(page, vm.labels.crmC, sp.crmCols.c, hy, fonts.sansBold, 6, MUTED);
  textCenter(page, vm.labels.crmR, sp.crmCols.r, hy, fonts.sansBold, 6, MUTED);
  textCenter(page, vm.labels.crmM, sp.crmCols.m, hy, fonts.sansBold, 6, MUTED);
  caption(page, fonts, vm.labels.colNotes, sp.cols.notes.x, hy, 6);
  if (!vm.spellcasting) return;
  const nameMaxW = sp.cols.time.x - sp.cols.name.x - 4;
  let y = sp.firstRowY;
  for (const group of vm.spellcasting.levels) {
    for (const spell of group.spells) {
      if (y < sp.box.y + 12) return;
      // level · name (bold when prepared) · range · concentration/ritual/material flags
      textCenter(page, String(group.level), sp.cols.level.x + 3, y, fonts.sans, 7, MUTED);
      text(
        page,
        clip(spell.prepared ? fonts.sansBold : fonts.sans, spell.name, 7.5, nameMaxW),
        sp.cols.name.x,
        y,
        spell.prepared ? fonts.sansBold : fonts.sans,
        7.5,
        spell.prepared ? INK : MUTED
      );
      if (spell.castingTime)
        text(
          page,
          clip(fonts.sans, spell.castingTime, 5.5, sp.cols.range.x - sp.cols.time.x - 3),
          sp.cols.time.x,
          y,
          fonts.sans,
          5.5,
          MUTED
        );
      if (spell.range)
        text(
          page,
          clip(fonts.sans, spell.range, 6.5, 56),
          sp.cols.range.x,
          y,
          fonts.sans,
          6.5,
          MUTED
        );
      if (spell.concentration)
        textCenter(page, vm.labels.crmC, sp.crmCols.c, y, fonts.sans, 7, PIP);
      if (spell.ritual)
        textCenter(page, vm.labels.crmR, sp.crmCols.r, y, fonts.sans, 7, PIP);
      if (spell.material)
        textCenter(page, vm.labels.crmM, sp.crmCols.m, y, fonts.sans, 7, PIP);
      y -= sp.rowStep;
    }
  }
}

function drawAppearance(
  page: PDFPage,
  fonts: Fonts,
  vm: CharacterPdfViewModel,
  portrait: PDFImage | null
): void {
  const ap = P2.appearance;
  roundRect(page, ap.box, { fill: PANEL, border: BORDER, borderWidth: 0.9 });
  panelHeader(page, fonts, ap.box, vm.labels.appearance);
  // With a portrait, embed it (fit to the box); without one, leave the box blank
  // so the player can describe or sketch their character there.
  if (!portrait) return;
  const areaBottom = ap.box.y + 6;
  const maxW = ap.box.w - 16;
  const maxH = ap.box.y + ap.box.h - 19 - areaBottom;
  const scale = Math.min(maxW / portrait.width, maxH / portrait.height);
  const w = portrait.width * scale;
  const h = portrait.height * scale;
  page.drawImage(portrait, {
    x: ap.box.x + (ap.box.w - w) / 2,
    y: areaBottom + (maxH - h) / 2,
    width: w,
    height: h,
  });
}

function drawBackstory(page: PDFPage, fonts: Fonts, vm: CharacterPdfViewModel): void {
  const bs = P2.backstory;
  roundRect(page, { ...bs.box, r: 9 }, { fill: PANEL, border: BORDER, borderWidth: 0.9 });
  panelHeader(page, fonts, { ...bs.box, r: 9 }, vm.labels.backstory);
  let y = bs.body.top;
  for (const ln of wrapText(fonts.sans, vm.backstory, 7.5, bs.body.right - bs.body.x)) {
    if (y < bs.alignment.label.y + 14) break;
    text(page, ln, bs.body.x, y, fonts.sans, 7.5, INK);
    y -= 9.2;
  }
  caption(
    page,
    fonts,
    vm.labels.alignment,
    bs.alignment.label.x,
    bs.alignment.label.y,
    6.5
  );
  if (vm.alignment)
    text(
      page,
      vm.alignment,
      bs.alignment.value.x,
      bs.alignment.label.y,
      fonts.sans,
      8,
      INK
    );
}

function drawLanguages(page: PDFPage, fonts: Fonts, vm: CharacterPdfViewModel): void {
  const lg = P2.languages;
  roundRect(page, { ...lg.box, r: 9 }, { fill: PANEL, border: BORDER, borderWidth: 0.9 });
  panelHeader(page, fonts, { ...lg.box, r: 9 }, vm.labels.languages);
  let y = lg.body.top;
  for (const ln of wrapText(fonts.sans, vm.languages, 7.5, lg.body.right - lg.body.x)) {
    if (y < lg.box.y + 6) break;
    text(page, ln, lg.body.x, y, fonts.sans, 7.5, INK);
    y -= 9.2;
  }
}

function drawEquipmentPanel(
  page: PDFPage,
  fonts: Fonts,
  vm: CharacterPdfViewModel
): void {
  const eq = P2.equipment;
  roundRect(page, { ...eq.box, r: 9 }, { fill: PANEL, border: BORDER, borderWidth: 0.9 });
  panelHeader(page, fonts, { ...eq.box, r: 9 }, vm.labels.equipment);
  let y = eq.body.top;
  for (const it of vm.equipment) {
    if (y < eq.attunement.label.y + 14) break;
    text(page, clip(fonts.sans, it.name, 7.5, 120), eq.body.x, y, fonts.sans, 7.5, INK);
    textRight(
      page,
      clip(fonts.sans, it.detail, 6.5, 56),
      eq.box.x + eq.box.w - 6,
      y,
      fonts.sans,
      6.5,
      MUTED
    );
    y -= 9.6;
  }
  // Magic Item Attunement sub-section (the official's mid-panel divider).
  page.drawLine({
    start: { x: eq.box.x + 6, y: eq.attunement.label.y + 11 },
    end: { x: eq.box.x + eq.box.w - 6, y: eq.attunement.label.y + 11 },
    thickness: 0.5,
    color: BORDER,
  });
  text(
    page,
    vm.labels.attunement,
    eq.attunement.label.x,
    eq.attunement.label.y,
    fonts.sansBold,
    7,
    TITLE
  );
  let ay = eq.attunement.top - 6;
  for (const name of vm.attunement) {
    if (ay < eq.box.y + 6) break;
    pip(page, eq.body.x + 2, ay + 2, "proficient");
    text(
      page,
      clip(fonts.sans, name, 7.5, eq.box.w - 26),
      eq.body.x + 10,
      ay,
      fonts.sans,
      7.5,
      INK
    );
    ay -= 9.6;
  }
}

function drawCoins(page: PDFPage, fonts: Fonts, vm: CharacterPdfViewModel): void {
  const c = P2.coins;
  roundRect(page, c.box, { fill: PANEL, border: BORDER, borderWidth: 0.9 });
  panelHeader(page, fonts, c.box, vm.labels.coins);
  const cells: Array<
    [{ x: number; y: number; w: number; h: number; labelX: number }, number, string]
  > = [
    [c.cols.cp, vm.currency.cp, vm.labels.cp],
    [c.cols.sp, vm.currency.sp, vm.labels.sp],
    [c.cols.ep, vm.currency.ep, vm.labels.ep],
    [c.cols.gp, vm.currency.gp, vm.labels.gp],
    [c.cols.pp, vm.currency.pp, vm.labels.pp],
  ];
  for (const [cell, amount, code] of cells) {
    roundRect(
      page,
      { x: cell.x, y: cell.y, w: cell.w, h: cell.h, r: 4 },
      { border: BORDER, borderWidth: 0.8 }
    );
    textCenter(page, String(amount), cell.x + cell.w / 2, c.valueY, fonts.sans, 8);
    text(page, code.toUpperCase(), cell.labelX, c.labelY, fonts.sansBold, 6, MUTED);
  }
}

function drawFooter(
  page: PDFPage,
  fonts: Fonts,
  vm: CharacterPdfViewModel,
  n: number,
  total: number
): void {
  textCenter(
    page,
    `${vm.footer}  ·  ${n} / ${total}`,
    PAGE.w / 2,
    3.5,
    fonts.sans,
    6,
    FAINT
  );
}
