// Embedded sheet fonts (Alegreya Sans, OFL) — decoded once on import.
// The renderer registers @pdf-lib/fontkit and embeds these with subset:true.

import { ALEGREYA_SANS_REGULAR } from "./alegreya-sans-regular";
import { ALEGREYA_SANS_BOLD } from "./alegreya-sans-bold";
import { ALEGREYA_SANS_SC_REGULAR } from "./alegreya-sans-sc-regular";
import { ALEGREYA_SANS_SC_BOLD } from "./alegreya-sans-sc-bold";

/** base64 -> bytes; `atob` is global in browsers and in Node (vitest) alike. */
function decode(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** The four embedded faces, as raw TrueType bytes ready for `embedFont`. */
export const SHEET_FONT_BYTES = {
  sansRegular: decode(ALEGREYA_SANS_REGULAR),
  sansBold: decode(ALEGREYA_SANS_BOLD),
  scRegular: decode(ALEGREYA_SANS_SC_REGULAR),
  scBold: decode(ALEGREYA_SANS_SC_BOLD),
} as const;
