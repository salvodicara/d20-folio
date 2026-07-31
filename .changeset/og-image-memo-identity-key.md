---
"d20-folio": patch
---

fix(functions): key the ogImage render memo on the PARSED entity identity, not the raw request path — path spellings that parse to the same entity (empty segments filtered, e.g. `/og//character//u//c.png`) now collapse onto one cache entry instead of each forcing a fresh raster. Defense-in-depth against path fuzzing on the public endpoint (the `maxInstances: 3` cap still hard-bounds the work).
