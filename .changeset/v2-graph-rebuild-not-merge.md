---
"d20-folio": patch
---

Rebuild the committed graphify graph instead of merging into it: `.githooks/pre-commit` now removes `graphify-out/graph.json` and the label cache before `graphify update`, because `graphify update` merges its extraction into whatever graph it finds and four in-place refreshes had grown `graph.json` from 23.9 MB to 77.5 MB (219,548 links, only 52,364 distinct). The graph is rebuilt clean at 23.6 MB / 52,135 links (51,592 distinct source-target-relation triples; the remainder are real multi-edges at different source locations), and the refresh step is now guarded so a failing or missing `graphify` restores the previous graph and never aborts a commit.
