---
"d20-folio": minor
---

Shared links now unfurl as a proper preview card. Paste a shared character into WhatsApp, Discord,
Messages or Slack and it arrives as "Lyra Voss — Level 11 Bard / Fighter · d20 Folio" over a
designed d20 Folio card; a campaign invite arrives as "Join Starless Keep on d20 Folio". Every other
link gets the same branded card with the app's own title. A character that is not shared — or an id
that does not exist — is never described: it gets the generic card, exactly like an unknown link,
and campaigns expose their name and nothing else. Zero-budget: the preview is served by a small
Cloud Function that only runs on a crawl or a cold first hit, and its response is CDN-cached per
link, so ordinary pageviews never touch it.
