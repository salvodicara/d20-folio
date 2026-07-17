---
"d20-folio": patch
---

Set the public repo metadata in `package.json` (`repository`/`homepage`/`bugs`/`license` pointing at github.com/salvodicara/d20-folio and d20-folio.web.app) and annotate the `.gitignore` rules for maintainer-only paths (`content-pack/`, `data-scrape/`, `previews/`) so they don't confuse a public contributor whose tree doesn't contain them.
