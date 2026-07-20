---
"d20-folio": patch
---

The portrait lightbox now uses the SAME Radix `Dialog` primitive as every other
overlay, so it shares the one ref-counted body scroll-lock (react-remove-scroll),
focus trap, ESC dismissal, and body portal. It previously hand-rolled its own
`document.body.style.overflow` lock, which was not ref-counted and fought the shared
one (a one-source-of-truth violation) — opening/closing the lightbox while a dialog
was also open could strand the body scroll state and freeze the page. The lightbox no
longer writes `document.body.style.overflow` directly. Behaviour and appearance are
unchanged (backdrop/image/caption/close, the modal z-layer); it additionally gains the
accessible focus trap the shared primitive provides.
