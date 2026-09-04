---
---

Type the new stage-3 tests against the strict build: the parametrized area cases declare
`aim: Position | null` so the optional answer stays an `Answers`, and the log-only attack helper
returns the intent member of `Action` so spreading it with fresh answers narrows correctly.
