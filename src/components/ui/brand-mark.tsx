/**
 * BrandMark — the canonical "d20 Folio" logo lockup (Illuminated Folio).
 *
 * One component owns every appearance of the brand so the topbar, nav-rail
 * brand slot, the welcome/login surface, and any future placement stay in
 * lock-step. It composes two parts:
 *
 *   • <D20Mark>   — the faceted d20 hero glyph. Two fidelities:
 *       - "line"   : a single-stroke `currentColor` die (crisp at 18–30 px in
 *                    the topbar/rail — strokes never muddy at small sizes).
 *       - "gilt"   : a gold-leaf gradient-faceted die with a struck "20" face,
 *                    for the welcome hero and large lockups.
 *   • the wordmark — Cinzel ceremonial "d20 Folio": gold-leaf gradient "d20"
 *     (weight 800) + cream "Folio" (700). Never italicised — Cinzel ships no
 *     italic face, and a synthetic oblique shears ink outside the
 *     background-clip:text paint box (DESIGN.md §3).
 *
 * Tokens (gold-leaf-*, --font-title, --accent-text) are theme-aware via
 * folio.css, so the lockup is AA in both dark and light without per-call
 * colour overrides. The decorative gilt facets carry no semantic colour — the
 * accessible name comes from the wordmark text (or `label` on the bare mark).
 *
 * SVG geometry is the DERIVED face-on icosahedron projection (looking straight
 * down a face axis): a pointy-top hexagon silhouette whose front hemisphere is the
 * 10 true triangular facets — central "20" face, a two-triangle roof, an inverted
 * bottom face, and the side flanks. Both fidelities share these exact vertices, so
 * the die reads as a real d20 in section (not the old faked pentagon / 6-spoke
 * ring). Purely presentational + reduced-motion safe (no animation here; the
 * welcome surface adds its own breathing halo gated behind `[data-motion]`).
 */

import { useId } from "react";
import type { SVGProps } from "react";
import { cn } from "@/lib/utils";

export type BrandMarkVariant = "line" | "gilt";
export type BrandMarkSize = "sm" | "md" | "lg" | "xl";

/** px size of the die glyph per scale step (the wordmark scales in CSS). */
const MARK_PX: Record<BrandMarkSize, number> = {
  sm: 24,
  md: 30,
  lg: 44,
  xl: 88,
};

export interface D20MarkProps extends Omit<SVGProps<SVGSVGElement>, "ref"> {
  /** "line" = compact currentColor die; "gilt" = gold-leaf faceted die. */
  variant?: BrandMarkVariant;
  size?: BrandMarkSize;
  /** Accessible label; omit when the mark sits beside the wordmark text. */
  label?: string;
}

/**
 * The d20 die glyph on its own. Use inside <BrandMark>, or standalone where a
 * bare mark is wanted (favicon-like contexts, dense chrome).
 */
export function D20Mark({
  variant = "line",
  size = "md",
  label,
  className,
  ...props
}: D20MarkProps) {
  const px = MARK_PX[size];
  const a11y = label
    ? { role: "img" as const, "aria-label": label }
    : { "aria-hidden": true as const };

  if (variant === "line") {
    // The TRUE icosahedron (d20) face-on projection — derived from the geometry,
    // not faked. Looking straight down a face axis, the silhouette is a pointy-top
    // hexagon and the FRONT HEMISPHERE shows exactly 10 triangular faces: a central
    // upward "20" face, a two-triangle "roof" meeting at the top vertex, an inverted
    // triangle dropping to the bottom vertex, and the flanking side facets. This is
    // the canonical D&D-die read (matches a real d20 in section), unlike the old
    // pentagon/6-spoke fake.
    //
    // Projected vertices (circumradius ~43, centre 50,50; computed in /tmp/d20.py):
    //   Hexagon  T(50,7) UR(87,28.5) LR(87,71.5) Bot(50,93) LL(13,71.5) UL(13,28.5)
    //   Inner △  A(50,23.4) B(73,63.3) C(27,63.3)   ← the front "20" face
    return (
      <svg
        viewBox="0 0 100 100"
        width={px}
        height={px}
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeLinecap="round"
        className={cn("brand-d20", className)}
        {...a11y}
        {...props}
      >
        {/* hexagon silhouette */}
        <polygon points="50,7 87,28.5 87,71.5 50,93 13,71.5 13,28.5" strokeWidth={5} />
        {/* the 12 internal seams of the true 10-face projection (A·B·C spokes to the
            hexagon corners + the central-triangle edges) */}
        <path
          d="M50,23.4 50,7 M50,23.4 13,28.5 M50,23.4 87,28.5 M50,23.4 73,63.3 M50,23.4 27,63.3 M73,63.3 27,63.3 M73,63.3 87,28.5 M73,63.3 87,71.5 M73,63.3 50,93 M27,63.3 13,28.5 M27,63.3 13,71.5 M27,63.3 50,93"
          strokeWidth={2.4}
          opacity="0.6"
        />
        {/* "20" numeral in the central face — the critical die-recognition cue */}
        <text
          x="50"
          y="53.5"
          textAnchor="middle"
          dominantBaseline="middle"
          style={{ fontFamily: "var(--font-title)" }}
          fontWeight="900"
          fontSize="18"
          fill="currentColor"
          stroke="none"
        >
          20
        </text>
      </svg>
    );
  }

  // Gilt faceted die — gold-leaf gradients with a struck "20" face. The
  // gradient ids are namespaced per-instance (useId) so multiple gilt marks on
  // one page never collide in the SVG <defs> registry.
  return <GiltD20 px={px} a11y={a11y} className={className} {...props} />;
}

interface GiltD20Props extends Omit<SVGProps<SVGSVGElement>, "ref"> {
  px: number;
  a11y: { role: "img"; "aria-label": string } | { "aria-hidden": true };
}

function GiltD20({ px, a11y, className, ...props }: GiltD20Props) {
  const uid = useId().replace(/:/g, "");
  const face = `bm-face-${uid}`;
  const mid = `bm-mid-${uid}`;
  const dim = `bm-dim-${uid}`;
  const gem = `bm-gem-${uid}`;
  return (
    <svg
      viewBox="0 0 100 100"
      width={px}
      height={px}
      className={cn("brand-d20 brand-d20-gilt", className)}
      {...a11y}
      {...props}
    >
      {/* Facet stops reference semantic gilt vars (defaulted to the bright
          gold-leaf ramp; folio.css shifts them toward the DEEP ramp under
          [data-theme="light"] so the carved 3D read survives on vellum — the
          bright stops washed out gold-on-gold, the same failure the wordmark
          already fixed). */}
      <defs>
        <linearGradient id={face} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="var(--gilt-hi, var(--gold-leaf-50))" />
          <stop offset="0.5" stopColor="var(--gilt-mid, var(--gold-leaf-300))" />
          <stop offset="1" stopColor="var(--gilt-lo, var(--gold-leaf-700))" />
        </linearGradient>
        <linearGradient id={mid} x1="0.2" y1="0" x2="0.7" y2="1">
          <stop offset="0" stopColor="var(--gilt-mid, var(--gold-leaf-300))" />
          <stop offset="1" stopColor="var(--gilt-lo, var(--gold-leaf-500))" />
        </linearGradient>
        <linearGradient id={dim} x1="0" y1="0" x2="0.5" y2="1">
          <stop offset="0" stopColor="var(--gilt-lo, var(--gold-leaf-500))" />
          <stop offset="1" stopColor="var(--gilt-deep, var(--gold-leaf-900))" />
        </linearGradient>
        <radialGradient id={gem} cx="0.4" cy="0.35" r="0.8">
          <stop offset="0" stopColor="var(--gilt-hi, var(--gold-leaf-50))" />
          <stop offset="0.55" stopColor="var(--gilt-mid, var(--gold-leaf-300))" />
          <stop offset="1" stopColor="var(--gilt-lo, var(--gold-leaf-700))" />
        </radialGradient>
        {/* Subtle drop shadow for the "20" numeral — one filter, no dup text. */}
        <filter id={`${uid}-shadow`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow
            dx="0.5"
            dy="0.5"
            stdDeviation="0.6"
            floodColor="var(--gold-leaf-950, var(--gold-leaf-900))"
            floodOpacity="0.5"
          />
        </filter>
      </defs>

      {/* The TRUE icosahedron (d20) face-on projection — the geometry of a real die
          in section, not a faked ring. The front hemisphere is exactly 10 triangular
          facets tiling the pointy-top hexagon: a central upward "20" face, a
          two-triangle ROOF meeting at the top vertex, an inverted triangle dropping
          to the bottom vertex, and the flanking sides. Facet VALUE follows a top
          light (roof brightest → bottom darkest) for the cut-gem read.
          Vertices (computed): hex T(50,7) UR(87,28.5) LR(87,71.5) Bot(50,93)
          LL(13,71.5) UL(13,28.5); inner △ A(50,23.4) B(73,63.3) C(27,63.3). */}
      {/* gradient-filled body for a clean polyhedral silhouette under the facets */}
      <polygon
        points="50,7 87,28.5 87,71.5 50,93 13,71.5 13,28.5"
        fill={`url(#${dim})`}
        stroke="var(--gold-leaf-900)"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />

      {/* roof — the two top faces (brightest, top-lit) */}
      <polygon
        points="50,23.4 50,7 13,28.5"
        fill={`url(#${face})`}
        stroke="var(--gold-leaf-900)"
        strokeWidth="0.9"
        strokeLinejoin="round"
      />
      <polygon
        points="50,23.4 50,7 87,28.5"
        fill={`url(#${face})`}
        stroke="var(--gold-leaf-900)"
        strokeWidth="0.9"
        strokeLinejoin="round"
      />
      {/* upper flanks of the central face */}
      <polygon
        points="50,23.4 27,63.3 13,28.5"
        fill={`url(#${mid})`}
        stroke="var(--gold-leaf-900)"
        strokeWidth="0.9"
        strokeLinejoin="round"
      />
      <polygon
        points="50,23.4 73,63.3 87,28.5"
        fill={`url(#${mid})`}
        stroke="var(--gold-leaf-900)"
        strokeWidth="0.9"
        strokeLinejoin="round"
      />
      {/* left + right side facets */}
      <polygon
        points="27,63.3 13,28.5 13,71.5"
        fill={`url(#${mid})`}
        stroke="var(--gold-leaf-900)"
        strokeWidth="0.9"
        strokeLinejoin="round"
      />
      <polygon
        points="73,63.3 87,28.5 87,71.5"
        fill={`url(#${dim})`}
        stroke="var(--gold-leaf-900)"
        strokeWidth="0.9"
        strokeLinejoin="round"
      />
      {/* lower flanks + the inverted bottom face (darkest, in shadow) */}
      <polygon
        points="27,63.3 13,71.5 50,93"
        fill={`url(#${dim})`}
        stroke="var(--gold-leaf-900)"
        strokeWidth="0.9"
        strokeLinejoin="round"
      />
      <polygon
        points="73,63.3 87,71.5 50,93"
        fill={`url(#${dim})`}
        stroke="var(--gold-leaf-900)"
        strokeWidth="0.9"
        strokeLinejoin="round"
      />
      <polygon
        points="73,63.3 27,63.3 50,93"
        fill={`url(#${dim})`}
        stroke="var(--gold-leaf-900)"
        strokeWidth="0.9"
        strokeLinejoin="round"
      />

      {/* central "20" face — the bright FOCAL facet (it must out-shine the ring so
          the eye lands on the numeral). A gem radial + a top-lit overlay. */}
      <polygon
        points="50,23.4 73,63.3 27,63.3"
        fill={`url(#${gem})`}
        stroke="var(--gold-leaf-50)"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <polygon
        points="50,23.4 73,63.3 27,63.3"
        fill="var(--gold-leaf-50)"
        opacity="0.26"
      />

      {/* "20" numeral — the dominant recognition element at every size. Carved (dark
          fill, a hairline gold-50 highlight stroke above the drop shadow) so it stays
          crisp and struck-into-the-metal at 24–30 px. */}
      <text
        x="50"
        y="54"
        textAnchor="middle"
        dominantBaseline="middle"
        style={{ fontFamily: "var(--font-title)" }}
        fontWeight="900"
        fontSize="21"
        fill="var(--gold-leaf-900)"
        stroke="var(--gold-leaf-50)"
        strokeWidth="0.3"
        paintOrder="stroke"
        letterSpacing="0.5"
        filter={`url(#${uid}-shadow)`}
      >
        20
      </text>

      {/* Struck-metal rim light: a bright glint along the two roof ridges (the top
          edges catching a light from above) — the biggest "premium, not flat" cue. */}
      <path
        d="M50,7 13,28.5 M50,7 87,28.5"
        fill="none"
        stroke="var(--gold-leaf-50)"
        strokeWidth="0.9"
        opacity="0.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export interface BrandMarkProps {
  /** Fidelity of the die glyph (default "line" for chrome contexts). */
  variant?: BrandMarkVariant;
  size?: BrandMarkSize;
  /** Render the "d20 Folio" wordmark beside the mark (default true). */
  showWordmark?: boolean;
  /**
   * Wordmark tone:
   *  - "hero"   : the two-tone lockup (gold-leaf gradient "d20" + cream "Folio")
   *               for the welcome / login surface.
   *  - "chrome" : a UNIFIED all-gold wordmark matching the home appbar /
   *               nav-rail lockup — the cream "Folio" read lower-contrast /
   *               less-branded in the topbar.
   * Defaults to "hero" for the gilt variant, "chrome" for the line variant.
   */
  tone?: "hero" | "chrome";
  /**
   * Accessible name for the whole lockup. With the wordmark shown the visible
   * text already names it, so this is only needed for the mark-only form.
   * Defaults to "d20 Folio".
   */
  label?: string;
  className?: string;
}

/**
 * The full "d20 Folio" brand lockup — faceted die + gold-leaf wordmark.
 * Stays a plain inline group; wrap it in a link at the call-site when the brand
 * should navigate (topbar / nav-rail home link).
 */
export function BrandMark({
  variant = "line",
  size = "md",
  showWordmark = true,
  tone,
  label = "d20 Folio",
  className,
}: BrandMarkProps) {
  // Default the tone from the variant: the line mark is chrome (topbar/rail),
  // the gilt mark is the hero lockup.
  const resolvedTone = tone ?? (variant === "gilt" ? "hero" : "chrome");
  return (
    <span
      className={cn(
        "brand-lockup",
        `brand-${size}`,
        `brand-tone-${resolvedTone}`,
        className
      )}
    >
      <D20Mark variant={variant} size={size} label={showWordmark ? undefined : label} />
      {showWordmark && (
        <span className="brand-word" aria-hidden={false}>
          <span className="brand-word-d20">d20</span>{" "}
          <span className="brand-word-folio">Folio</span>
        </span>
      )}
    </span>
  );
}
