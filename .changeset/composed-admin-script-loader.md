---
---

Admin scripts run against the composed content pack again: the module loader expands Vite's `import.meta.glob` at load time and settles the pack/SRD import cycle, so a one-off migration resolves the same ids and catalogues the app does instead of falling back to an SRD-only composition. The `combat/state` decoder moves to a pure `src/lib/combat-state-codec.ts` (re-exported unchanged from `combat-state-io.ts`) so migrations parse a stored subdoc with the exact rules the app reads it by.
