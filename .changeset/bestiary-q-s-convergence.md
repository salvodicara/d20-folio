---
"d20-folio": patch
---

fix(bestiary): q-s convergence — pack-side collision sanction + the swarm speed note. The
"Spettro" Specter/Phantom distinct-entity IT-name collision was sanctioned in the PUBLIC helper's
`ALLOWED_COLLISIONS`, but its `subclasses:phantom` member is a pack-only entity — the pack
allowlist must live pack-side (licensing partition). The sanction moves to a new
`ALLOWED_COLLISIONS_PACK` in the composed guard, merged in for the composed lane; the public
SRD-only lane carries just the Specter and needs no exemption.

Also fixes the Swarm of Insects Speed line: the SRD prints an irregular
`Speed 20 ft., Climb or Fly 20 ft. (GM's choice)` — one 20 ft. mode the GM picks as Climb OR Fly,
which a flat `speeds` record can't express (it dropped the second segment and left the conditional
Spider Climb trait dangling). Modeled as a closed-token `speedNote` affix (§A.4, D-10), rendered
appended to the Speed line.
