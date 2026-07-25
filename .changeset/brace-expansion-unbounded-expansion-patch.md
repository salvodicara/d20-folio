---
"d20-folio": patch
---

fix(deps): close the brace-expansion unbounded-expansion DoS advisory (GHSA-mh99-v99m-4gvg, high) in both trees — the dev-tooling copy moves to 5.0.8 by version override, and the copies stuck on 2.1.2 (no patched release their consumers can take) are cleared by scoped parent overrides, `jake>filelist` 2.0.2 at root and `rimraf>glob` 11.1.0 in both, the latter also patching the copy that shipped inside the deployed Cloud Function.
