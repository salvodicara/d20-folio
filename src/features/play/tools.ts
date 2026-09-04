/**
 * The play screen's tools, and how they map onto the map's own (`MapCanvas`'s `MapTool`).
 *
 * The rail offers one more than the canvas does — "add", which opens the creature dock rather
 * than changing what a pointer does on the ground — so the two vocabularies are kept apart and
 * translated here, in one function, instead of being conflated in the screen's JSX.
 */
import type { MapTool } from "./map/MapCanvas";

export type PlayTool = "select" | "pan" | "ruler" | "add" | "fog-reveal" | "fog-hide";

/** What the canvas should do while this tool is active. "add" leaves the map on select, so a
 *  DM can still pick a token while the dock is open. */
export function mapToolFor(tool: PlayTool): MapTool {
  switch (tool) {
    case "pan":
      return "pan";
    case "ruler":
      return "ruler";
    case "fog-reveal":
      return "fog-reveal";
    case "fog-hide":
      return "fog-hide";
    default:
      return "select";
  }
}
