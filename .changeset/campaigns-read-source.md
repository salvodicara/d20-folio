---
"d20-folio": patch
---

Campaign actions no longer act on a stale copy of the campaign. Right after a sheet opens, an action waits for the server's answer instead of trusting the device's cached copy, and when the campaign cannot be read at all, the action is not done and a notice offers Reload. A character in no campaign is never held up.
