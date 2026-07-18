---
"d20-folio": patch
---

Fix the mobile palette tap that "did nothing": tapping a search result in Ask the Folio now always opens the target (compendium entry, character, campaign, section). The palette's Back-sentinel retirement (`history.back()`) is an async traversal, and the old two-animation-frame deferral pushed the navigation while it was still in flight — the landing traversal then rewound the fresh route, silently undoing the navigation (mobile frame timing lost that race most of the time; desktop usually won it). The shared overlay-history seam now exposes `retireTopOverlayThen`, which runs the navigation on the traversal's popstate — its one deterministic completion signal — and the campaign create/join modals adopt the same hand-off, clearing their dead same-key Back entry too.
