/**
 * The phone's slim Hit Points strip (D&D Beyond's phone header strip): when it shows,
 * and how the Hit Points read. Pure, so the band and the strip agree.
 */

/** What the band's IntersectionObserver entry says, reduced to what decides. */
export interface BandEdge {
  isIntersecting: boolean;
  /** The band's bottom edge, relative to the top of the observed viewport. */
  bottom: number;
}

/** The strip shows once the whole band has scrolled up out of view, never before. */
export function stripShown(band: BandEdge): boolean {
  return !band.isIntersecting && band.bottom <= 0;
}

/** Green above half, amber above a quarter, red at a quarter or less. */
export function hpTone(current: number, max: number): "ok" | "low" | "bad" {
  const share = max > 0 ? current / max : 0;
  return share > 0.5 ? "ok" : share > 0.25 ? "low" : "bad";
}
