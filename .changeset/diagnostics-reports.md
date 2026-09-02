---
---

Automatic diagnostics reports: error-level events (quarantine, rejected save, invalid combat state, runtime errors) are written create-only to `diagnostics/{id}` with breadcrumbs and correlation ids, bounded per session and per user, and read from a new admin inbox section (ADR-0008, amended to a top-level collection).
