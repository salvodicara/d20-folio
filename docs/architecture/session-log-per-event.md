# The session log, one document per event (re-foundation phase 3b)

Today a play session is one growing document,
`campaigns/{campaignId}/sessionLogs/{sessionId}` = `{ schema: 1, log: LogItem[], lastAt }`,
appended with `arrayUnion`. It is capped at 2,000 items and by Firestore's 1 MiB document
limit. Phase 3b moves it to one document per item and keeps the old shape readable.

## Target shape

- **Head** (unchanged path): `sessionLogs/{sessionId}`. It keeps `lastAt`, so `latest()` and
  `recent()` still find sessions by one ordered query.
- **Items**: `sessionLogs/{sessionId}/items/{itemId}`. One document per `LogItem`, its id
  equal to the item's id, plus `serverAt` (the server's timestamp). Never updated: a correction
  or retraction is itself a new item, as today.

## Order

The fold (`foldSession`) is order-sensitive: a correction counts only after its target. Today
the order is the server's arrival order (`arrayUnion`). Items keep that meaning: they are read
by `serverAt`, then by id. A correction is written by a device that has already seen its target
from the server, so it always arrives later. Device clocks (`at`) are not trusted for order.

Readers combine the two shapes: the head's `log` array first, in its order, then the items by
`serverAt`. A session is written in one shape only (see the steps), so the two never interleave.

## Steps

1. **Readers first (this change).** Readers read both shapes and the rules accept the items
   subcollection: a member creates only an item stamped with their own uid, under its own id,
   with `serverAt == request.time`, and nothing else; no update; the DM or the admin deletes.
   No writer changes.
2. **The old-clients window.** An app that predates step 1 reads only the array, so it would
   see a per-event session as empty. Writers switch only once every client in use has
   updated (the PWA update reaches a device on its next start), and only for **new**
   sessions, which get a `schema: 2` head without `log`. The head rules for schema 2 ship
   with that writer.
3. **Writers** create items for new sessions; the old documents stay as they are, readable
   forever. Migrating them is optional and, if done, owner-gated (snapshot → dry-run →
   apply).
