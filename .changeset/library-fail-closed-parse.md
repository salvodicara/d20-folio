---
---

The homebrew-library read is fail-closed: a malformed document quarantines whole with a typed CodecFailure and a diagnostics report instead of silently dropping the offending entry, which a full-doc overwrite would otherwise bake in permanently.
