---
"d20-folio": patch
---

Add the one-off public-snapshot builder (`scripts/build-public-snapshot.sh`): from a clean checkout it copies every tracked file minus the private exclusions (content-pack/, data-scrape/, previews/, the three ingestion scripts, and itself — mirroring PROGRESS.md's enumeration) into a fresh-history git repo with a single "feat: initial public release" commit under the maintainer's noreply address, verifies the exclusions are absent, and runs the partition guard plus the full SRD-only gate (typecheck + unit tests + build) inside the target from its own fresh install. To be deleted once the public repo is live.
