---
---

Guard the diagnostics installer's lazy IndexedDB chain against unhandled rejections (a failed breadcrumb read/write could otherwise re-report itself as a runtime error), and cover the private-mode boot-safety fallback and the changed-ring persistence gating with tests.
