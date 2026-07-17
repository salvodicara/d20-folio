/**
 * Portrait — the ONE avatar primitive (#92).
 *
 * Fills its caller-provided sized box (the `.seal` / `.ch-portrait` /
 * `.topbar-avatar` / admin-row tile owns the shape, border, and size). Renders:
 *   • a STORED character portrait via the crop-aware PortraitImg (with
 *     lazy/async/intrinsic hints so a roster of N portraits doesn't eager-download
 *     N full-res JPEGs into 56px tiles — the #92 "load takes ages"); or
 *   • a REMOTE user avatar (Google `photoURL`) as a plain lazy img with
 *     `no-referrer` (or it 403s); or
 *   • a deterministic, per-seed TINTED INITIAL fallback (no RNG — `avatarTint`
 *     over `idToHue`), so every character/user without a portrait reads as a
 *     distinct gilded gem instead of an identical gold "?".
 *
 * Before this, the portrait pipeline was wired only in the Bio tab; the cockpit
 * hero, roster card, admin rows, and topbar each re-rolled their own <img> /
 * monogram. Routing them all through Portrait makes the portrait appear
 * everywhere it belongs with one consistent fallback + load behaviour.
 */

import type { CSSProperties } from "react";
import type { PortraitCrop } from "@/types/character";
import { PortraitImg } from "@/components/shared/PortraitImg";
import { avatarTint, cn } from "@/lib/utils";

interface PortraitProps {
  /** Portrait URL (character `portraitUrl` or a user `photoURL`); null → fallback. */
  src?: string | null;
  /** Stored crop region for a character portrait (ignored for remote avatars). */
  crop?: PortraitCrop | null;
  /** Display name — the fallback monogram + the accessible alt. REQUIRED: every caller
   *  holds a real string. A CHARACTER name is a branded `NonEmptyString` (assignable to
   *  `string`), so it always yields a real monogram and never needs a `?? ""` patch. A
   *  NON-character avatar (a Google account that may have no display name) passes its
   *  own genuinely-optional value resolved to a string AT THE CALL SITE (e.g.
   *  `displayName ?? email ?? "?"`); a `""`/whitespace result degrades to a "?" monogram
   *  via `initialOf`, and `alt=""` is acceptable — it never crashes and never invents a
   *  word. The prop is non-nullable so an empty name is a deliberate caller choice, not
   *  an implicit default smuggled in here. */
  name: string;
  /** Stable seed for the deterministic fallback tint (character id / uid / name). */
  seed: string;
  /** Eager only for the above-the-fold hero; everything else lazy-loads. */
  loading?: "lazy" | "eager";
  /** Remote (googleusercontent) avatar — plain img + no-referrer, no crop math. */
  remote?: boolean;
  className?: string;
}

/** First character of the name, uppercased — the fallback monogram. An empty /
 *  whitespace-only name (the honest-blank case — a player account with no display
 *  name) degrades to "?" rather than rendering a blank monogram. */
function initialOf(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

export function Portrait({
  src,
  crop = null,
  name,
  seed,
  loading = "lazy",
  remote = false,
  className,
}: PortraitProps) {
  if (src) {
    if (remote) {
      return (
        <img
          src={src}
          alt={name}
          loading={loading}
          decoding="async"
          referrerPolicy="no-referrer"
          className={cn("av-img h-full w-full object-cover", className)}
        />
      );
    }
    return (
      <PortraitImg
        src={src}
        crop={crop}
        alt={name}
        loading={loading}
        className={className}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn("av-fallback", className)}
      style={avatarTint(seed) as CSSProperties}
    >
      {initialOf(name)}
    </span>
  );
}
