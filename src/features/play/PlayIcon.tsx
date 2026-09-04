/**
 * The play surface's glyphs: one licensed sprite, referenced by id.
 *
 * Glyphs are never hand-drawn (UI spec §3b). `src/assets/icons/play-sprite.svg` holds exactly
 * the symbols this screen renders, normalised into one 24px viewBox from two licensed sets —
 * game-icons.net (CC BY 3.0; lorc, delapouite, skoll, sbed, carl-olsen, willdabeast) as filled
 * `currentColor` shapes, and Lucide (ISC) as 1.75px strokes — plus the five action-economy
 * marks, which are the app's OWN information code (§4) and therefore drawn in house. The
 * attribution ships in the app's credits (`legal.licenses.iconsDesc` / `iconsLucide`).
 *
 * The sheet is INLINED rather than referenced as `<use href="/sprite.svg#id">`: a cross-document
 * `<use>` does not inherit `currentColor` in every engine, and the whole point of the sprite is
 * that one glyph takes the tone of whatever it sits on (an economy colour, the DM's magenta, a
 * disabled 40%). It rides the lazy play chunk, so nothing here weighs on the app's eager bundle.
 *
 * `tests/unit/play-sprite.guard.test.ts` pins the set both ways: every id this feature renders
 * exists in the sheet, and the sheet carries no symbol the feature never renders.
 */
import spriteMarkup from "@/assets/icons/play-sprite.svg?raw";
import { cn } from "@/lib/utils";

/** Mount ONCE per play screen, above everything that references a glyph. */
export function PlaySprite() {
  return (
    <div
      className="pl-sprite"
      hidden
      aria-hidden="true"
      // Static build-time asset from this repository, not user content.
      dangerouslySetInnerHTML={{ __html: spriteMarkup }}
    />
  );
}

export interface PlayIconProps {
  /** A symbol id in the sheet, without the `#` (e.g. `i-broadsword`, `e-action`). */
  readonly id: string;
  readonly className?: string;
  /** Give a decorative glyph a name only when nothing beside it already says what it is. */
  readonly label?: string;
}

export function PlayIcon({ id, className, label }: PlayIconProps) {
  return (
    <svg
      className={cn("pl-icon", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <use href={`#${id}`} />
    </svg>
  );
}
