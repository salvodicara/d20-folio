---
"d20-folio": patch
---

Kill the Add-monster modal's cold-open flash: the dialog now mounts ONCE. A single
eager `ModalShell` sits above the Suspense boundary and only the lazy body swaps in,
so the shell no longer tears down + remounts when the bestiary chunk resolves. The
Add-monster trigger preloads the chunk + monster catalogue on hover/focus/press, so
the Suspense fallback never paints on a warm open, and `FolioLoader` latches its die
once shown so no lazy surface can flash it in-then-out.
