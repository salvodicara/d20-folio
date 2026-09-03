# Owlbear Rodeo 2 as the map layer for d20 Folio — research memo

Date: 2026-09-03. Question: can a free, offline-first, dice-less D&D 2024 companion PWA (React 19 +
Firebase, append-only Encounter log with declared relations engaged / adjacent / range band / cover /
visible) use Owlbear Rodeo 2 as its map layer instead of building a VTT?

Evidence sources are primary where possible: the SDK package itself (`@owlbear-rodeo/sdk` 3.1.0
tarball, `lib/**/*.d.ts`), docs.owlbear.rodeo (fetched 2026-09-03; the site blocks non-browser
clients, so it was read through a reader proxy), the `owlbear-rodeo/*` GitHub org, the extension
store data files (`owlbear-rodeo/extensions`), extension source repos, the pricing page, the ToS, and
the official blog. Where a claim is inferred rather than documented it is marked **(inferred)**.

---

## 1. Owlbear Rodeo 2 extension model

### Build / host / install

- An extension is a static web site plus a `manifest.json`. Owlbear loads every extension surface as
  an **iframe** pointing at the developer's URL; there is no bundle upload, no server-side code, no
  store-hosted code. "In the Owlbear framework everything is an iframe. The action menus, iframe.
  Modals, load a URL in an iframe." — blog, _Building an extension for Owlbear Rodeo 2.0_,
  2023-03-01, https://blog.owlbear.rodeo/building-an-extension-for-owlbear-rodeo-2-0/
- Manifest fields (docs, https://docs.owlbear.rodeo/extensions/reference/manifest/): `name` (≤45
  chars), `version`, `manifest_version` (1), `description` (≤128 chars), `icon`, `author`,
  `homepage_url`, `action` `{title, icon, popover: url, width?, height?}`, `background_url` (a
  hidden iframe that runs while the room is open — this is where context menus, tools and
  scene listeners are registered), `permissions[]` (iframe `allow` features only:
  clipboard-write/read, autoplay, bluetooth, camera, microphone, usb, display-capture, hid).
- Install flow: user copies the manifest URL, opens Profile → Add Extension, pastes it, then enables
  the extension per room (https://extensions.owlbear.rodeo/guide). The GM enables an extension for a
  room; every player in that room then loads the same iframes.
- Hosting: any static HTTPS host. The official tutorial deploys to Render's free static tier and
  lists alternatives; Firebase Hosting works identically. CORS is noted as _optional_: "Owlbear Rodeo
  makes 'safe' requests which mean that CORS should not be necessary" — add
  `Access-Control-Allow-Origin` only if manifest fetch fails
  (https://docs.owlbear.rodeo/extensions/tutorial-sharing-your-extension/hosting-your-extension/).
- SDK: `@owlbear-rodeo/sdk` **3.1.0**, MIT, published 2024-12-03 (npm registry `time` field);
  repo https://github.com/owlbear-rodeo/sdk last push 2024-12-03; tags v2.2.0 (2024-02-01), v2.3.0
  (2024-02-21), v2.4.0 (2024-04-18), v3.0.0 (2024-10-09, with the 2.3 "Warp Core" release), v3.1.0.
  Runtime deps: `events`, `immer`, `js-base64`, `uuid`. The SDK is a postMessage bridge
  (`MessageBus`) between the iframe and the host; `OBR.isAvailable` tells you whether you are
  embedded. Nine months without a release: stable, slow-moving, and host-side changes (2.4,
  May 2026) shipped without an SDK bump.

### What the SDK exposes (from `lib/index.d.ts` and per-API `.d.ts`, v3.1.0)

| Namespace         | Exposed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OBR.scene.items` | `getItems(filter)`, `updateItems(filterOrItems, immerDraftFn)`, `addItems`, `deleteItems`, `getItemAttachments`, `getItemBounds`, `onChange(items[])`. Item shape: `id, type, name, visible, locked, createdUserId, zIndex, lastModified (ISO), lastModifiedUserId, position: {x,y} (scene px), rotation, scale: {x,y}, metadata: Record<string,unknown>, layer, attachedTo?, disableHit?, disableAutoZIndex?, disableAttachmentBehavior?, description?`. Item types: IMAGE (with `image`, `grid: {offset, dpi}`, `text`), SHAPE, LINE, CURVE, PATH, LABEL, TEXT, RULER, POINTER, BILLBOARD, EFFECT (shaders), **WALL** (`points[], doubleSided, blocking`), **LIGHT** (`attenuationRadius, sourceRadius, falloff, innerAngle, outerAngle, lightType PRIMARY/SECONDARY/AUXILIARY`). Layers: MAP, GRID, DRAWING, PROP, MOUNT, CHARACTER, ATTACHMENT, NOTE, TEXT, RULER, FOG, POINTER, POST_PROCESS, CONTROL, POPOVER. |
| `OBR.scene.local` | Same API for **local-only** items (visible to the current user only; `fastUpdate` path). Used for overlays/labels.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `OBR.scene.grid`  | `getDpi()` (px per cell), `getScale()` → `{raw: "5ft", parsed: {multiplier: 5, unit: "ft", digits}}`, `getType()` SQUARE / HEX_VERTICAL / HEX_HORIZONTAL / DIMETRIC / ISOMETRIC, `getMeasurement()` **CHEBYSHEV / ALTERNATING / EUCLIDEAN / MANHATTAN**, `getDistance(from, to)`, `snapPosition(pos, sensitivity?, useCorners?, useCenter?)`, `onChange(grid)`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `OBR.scene.fog`   | Only `getFilled/setFilled`, `getColor`, `getStrokeWidth`, `onChange`. Static fog shapes are FOG-layer items. Dynamic fog is driven by WALL/LIGHT items and is "processed on the GPU … then composited"; there is **no line-of-sight / visibility query** (https://docs.owlbear.rodeo/extensions/reference/dynamic-fog/).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `OBR.scene`       | `isReady`, `onReadyChange`, scene `getMetadata/setMetadata/onMetadataChange`; `history.undo/redo`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `OBR.player`      | `id` (sync), `getId()` — the **user id**, "shared if the same player joins a room multiple times"; `getConnectionId()` (unique per tab/session); `getRole()` `"GM" \| "PLAYER"`; `getName/setName`, `getColor`, `getSelection/select/deselect`, `getMetadata/setMetadata`, `hasPermission(p)`, `onChange`. No email, no account handle, no avatar.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `OBR.party`       | `getPlayers()` → `Player[] {id, connectionId, role, selection?, name, color, syncView, metadata}`, `onChange`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `OBR.room`        | `id`, `getPermissions()`/`onPermissionsChange`, `getMetadata/setMetadata/onMetadataChange` — "In total the room metadata must be under **16kB**."                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `OBR.broadcast`   | `sendMessage(channel, data, {destination: REMOTE\|LOCAL\|ALL})` — "Any value that can be JSON serialized. Limited to **16KB** in size"; `onMessage(channel, cb({data, connectionId}))`. Ephemeral, not persisted.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Surfaces          | `OBR.action` (the top-left action button + its popover: width/height/badge/icon/title/open/close), `OBR.popover.open({id, url, width, height, anchorPosition/anchorElementId, …})`, `OBR.modal.open({id, url, …})`, `OBR.contextMenu.create({id, icons[{icon,label,filter}], onClick(context.items), embed?})`, `OBR.tool.create` + `createMode` (receives click/drag/key events on the canvas) + `createAction`, `OBR.notification.show`, `OBR.viewport` (pan/zoom/transform), `OBR.theme`, `OBR.interaction.startItemInteraction(items)` (low-latency local drag/preview path).                                                                                                                                                                                                                                                                                                                                    |
| `OBR.assets`      | Upload images/scenes into the user's storage and open the asset picker.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

Permissions (`types/Permission.d.ts`): per-layer `*_CREATE/_UPDATE/_DELETE` for FOG, MAP, PROP,
MOUNT, CHARACTER, ATTACHMENT, NOTE, DRAWING, RULER, POINTER, TEXT, plus `CHARACTER_OWNER_ONLY`.
The GM sets these room-wide; an extension running as a PLAYER is bound by them when calling
`updateItems` (a player extension cannot edit a token the room forbids it to edit). GM iframes can
do anything the GM can.

### What it does NOT expose

- No account identity (email, handle), no cross-room roster, no "campaign" object — only room id +
  player id + role.
- No LOS/visibility/"can player X see item Y" query; no fog-revealed-area query; no cover.
- No server-side hooks, no webhooks, no REST API, no background job when the room is closed — an
  extension exists only while a browser has the room open.
- No persistent store beyond metadata (room ≤16 kB; item/scene/player metadata with no documented
  cap — **(inferred)** treat items as small, since every item is synced to every client).
- No per-item metadata size limit is documented; no rate limits are documented. Practical limit is
  the realtime sync fan-out: every `updateItems` is broadcast to every connected client.
- No offline mode (see §5).

### Store listing / review

- Store data lives in https://github.com/owlbear-rodeo/extensions (`extensions.json` name → URL of a
  `store.md` with YAML front matter: title, description, author, image, icon, tags, manifest,
  learn-more). Listing = fork + PR; "The Extension Store will show your extension once your pull
  request is accepted and merged." Tags allowed: built-by-owlbear, dice, fog, tool, content-pack,
  drawing, audio, combat, automation, other
  (https://docs.owlbear.rodeo/extensions/tutorial-sharing-your-extension/showcase-your-extension/).
- As of the repo's last push (2026-08-26) `extensions.json` has **102** extensions;
  `verified.json` lists **3** (initiative-tracker, dice, colored-rings). Verification is requested by
  commenting `/verify <key>` on the PR; a Discord thread tracks the checklist: accessible colors and
  font sizes, light+dark themes, fully functional on iPhone/Android/iPad and Chrome/Firefox/Safari,
  no dependency on other extensions, **works in a private window / with cookies disabled**, proper API
  use ("Scene API is only used to store data that shares the Scene lifecycle"), works with and
  without a scene open, user support, no known bugs, **manifest hosted on a custom domain the
  developer controls** (https://extensions.owlbear.rodeo/verified).
- No policy text found against paid/commercial or externally-backed extensions. Evidence that they
  are tolerated: Game Master's Grimoire gates features behind Patreon and depends on the author's
  own backend (tabletop-almanac.com) and is listed on the store.
- Owlbear's own extensions are GPL-3 "provided as an example of how to use the SDK"; the SDK is MIT
  (https://github.com/owlbear-rodeo/sdk/blob/main/LICENSE). Using the MIT SDK imposes nothing on our
  code.

---

## 2. Talking to an external backend (our Firebase) from inside Owlbear

- **Network:** the iframe is our origin, so the host page's CSP does not constrain our fetches. The
  only CSP that matters is ours. Firestore (WebChannel/long-poll or gRPC-web), Firebase Auth, and
  Hosting all work from any origin we control. Owl20 and GMG already do cross-origin traffic from
  inside Owlbear iframes (Owl20 receives `window.postMessage` from a browser extension and re-emits via
  `OBR.broadcast`; GMG calls tabletop-almanac.com, dddice, and Discord webhooks —
  https://github.com/mvoncken/owl20-owlbear, https://github.com/kamejosh/owlbear-hp-tracker CHANGELOG).
- **Auth:** the extension cannot learn who the Owlbear user _is_. It gets `OBR.player.id` (stable
  per Owlbear account across re-joins), `connectionId`, `role`, display name/colour, and
  `OBR.room.id`. Identity therefore must be established on our side:
  1. The user is already signed in to d20 Folio (PWA). The PWA mints a short-lived **pairing code**
     or link (Cloud Function → Firebase custom token, or a Firestore doc keyed by code).
  2. Inside Owlbear the extension asks for the code once, exchanges it for `signInWithCustomToken`,
     and stores the mapping `{obrRoomId, obrPlayerId} → {folioUid, campaignId}` in Firestore
     (**not** in Owlbear metadata: that is shared with every extension and every room member).
  3. Third-party-context caveats: Safari and Chrome partition cookies/storage for cross-site iframes,
     so Firebase Auth persistence inside the iframe is partitioned per top-level site (owlbear.app)
     and may be wiped in private mode. The verification checklist explicitly requires the extension to
     function "in a private browsing window or with cookies disabled", so the design must degrade to
     an unauthenticated **broadcast-only / read-only** mode when auth cannot persist. Avoid
     `signInWithRedirect` (breaks inside iframes); prefer custom-token exchange; treat `signInWithPopup`
     as unreliable inside an iframe **(inferred from platform behaviour, not Owlbear docs)**.
- **Offline behaviour:** none. The iframe only exists while the Owlbear tab is open and connected;
  see §5.

---

## 3. What can be derived automatically from Owlbear scene state

Owlbear coordinates are scene pixels; one grid cell = `grid.dpi` px; the ruler unit is
`grid.scale.parsed` (e.g. multiplier 5, unit "ft"). Token footprint = image cell size
(`image.width / image.grid.dpi`) × `item.scale`, snapped to the grid (Owlbear snaps tokens to
cells by default).

| Fact                                          | Derivable?                        | How / caveat                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Distance between tokens                       | **Yes**                           | `OBR.scene.grid.getDistance(a, b)` (inputs in scene pixels; docs: "For all other measurement types this will be an integer of how many grid cells were traversed", exact distance only under EUCLIDEAN), or compute Chebyshev/alternating distance in cells from positions ourselves and multiply by `scale.parsed.multiplier`. D&D 2024's default diagonal rule (every square 5 ft) is Owlbear's `CHEBYSHEV`; the optional 5-10-5 rule is `ALTERNATING`. Compute edge-to-edge for Large+ tokens using the footprint, not centre-to-centre. Hex/iso grids need their own branch. |
| Adjacency / reach (5 ft, 10 ft)               | **Yes**                           | edge distance ≤ 1 cell → adjacent/engaged candidate; ≤ 2 cells → in 10 ft reach. Elevation is _not_ in the item model (Battle Board stores its own elevation in item metadata), so vertical reach stays declared unless we adopt a metadata convention.                                                                                                                                                                                                                                                                                                                          |
| Range bands (normal/long, "short/long" bands) | **Yes**                           | band = f(cell distance × multiplier, weapon/spell range from the Folio character). Pure function over Owlbear distance + our data.                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Movement events                               | **Yes, with debouncing**          | `OBR.scene.items.onChange` fires with the full item list on every synced change; diff `position`/`lastModified`/`lastModifiedUserId` per tracked id. Remote drags arrive as a burst of interim positions **(inferred from the interaction/fast-update design)**; commit a "moved" event only after positions settle (e.g. 300–500 ms quiet) and attribute it to `lastModifiedUserId`. Distance moved this turn = accumulate path segments in cells (approximation: Owlbear does not expose the drag path, only snapshots).                                                       |
| Area templates (cone/sphere/line)             | **Partly**                        | We can _draw_ templates as SHAPE/CURVE items (or local items) sized in cells, and test which token footprints intersect them — pure geometry we own. Owlbear's own ruler/`RULER` items and the official Ranges extension are UI, not events we can consume.                                                                                                                                                                                                                                                                                                                      |
| Line of sight / visible                       | **Partly, only with Dynamic Fog** | If the scene uses Owlbear's Dynamic Fog, WALL items (`points[]`, `blocking`, `doubleSided`, `zIndex` elevation) are readable, so a ray-cast from attacker to target corners against blocking walls is computable client-side. Owlbear itself never exposes the GPU-computed visibility. Smoke & Spectre (closed-source, battle-system.com) stores its own obstruction lines in its own scene metadata format and does not expose per-player visibility. Static hand-drawn fog gives no usable geometry.                                                                          |
| Cover (half / three-quarters)                 | **No**                            | Needs the corner-to-corner rule and object semantics (what blocks, what is a creature); not in the model. Stays declared (or "suggested" from wall ray-casts, GM confirms).                                                                                                                                                                                                                                                                                                                                                                                                      |
| Conditions / markers                          | **Readable**                      | Bubbles stores `item.metadata["com.owlbear-rodeo-bubbles-extension/metadata"] = {health, "max health", "temporary health", "armor class", hide, group, index}` on IMAGE items in CHARACTER/MOUNT layers (source: `src/metadataHelpers/itemMetadataIds.ts`, GPL-3, last push 2026-07-28). Official Initiative Tracker uses `rodeo.owlbear.initiative-tracker/metadata = {initiative}`. Condition Markers (Apache-2.0, 2026-08-10) adds marker images as attachments. We can read those keys for interoperability and write our own namespace.                                     |
| Concealment/hidden tokens                     | Readable flag only                | `item.visible=false` = hidden from players; that is GM-fog, not the D&D Invisible condition.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

What remains **declared** in Folio (no scene evidence): cover, most visibility (no walls), flanking/
"engaged" as a _state_ (adjacency is only a candidate; being engaged is a rules decision), elevation
(unless we adopt a metadata key), difficult terrain, lighting/obscurement, and anything on hex/iso
maps that our geometry branch doesn't handle yet.

---

## 4. Existing bridges and the ecosystem

- **Beyond20** (https://beyond20.here-for-more.info/) supports Roll20, Foundry VTT, and Discord
  natively; Owlbear is not on its list. **Owl20** (browser extension https://github.com/uberdragon/owl20
  MIT + Owlbear extension https://github.com/mvoncken/owl20-owlbear LGPL-3, pushed 2026-05-09,
  listed at https://extensions.owlbear.rodeo/owl20) bridges Beyond20's DOM events → `window.postMessage`
  into the Owlbear iframes → `OBR.broadcast` to the room. It is roll-forwarding only; no state sync.
- **Stat Bubbles for D&D** (Seamus Finlayson, GPL-3, https://github.com/SeamusFinlayson/Bubbles-for-Owlbear-Rodeo):
  HP/max/temp/AC bubbles on tokens, per-token hide, inline math, AoE tools. Pure metadata, no external
  sync.
- **Initiative Tracker** (official, GPL-3, https://github.com/owlbear-rodeo/initiative-tracker,
  last push 2024-08-18): context menu writes an `initiative` number to item metadata; a 250×129 action
  popover lists them.
- **Pretty Sordid** (Seamus Finlayson, GPL-3, current repo `pretty-sordid-initiative`, 2026-08-06):
  initiative with token icons; GMG can drive it.
- **Game Master's Grimoire / HP Tracker** (Joshua Hercher, MIT, https://github.com/kamejosh/owlbear-hp-tracker,
  v3.7.3, last push 2026-09-02): HP/initiative/party/loot, 5e & PF2e statblocks served from the
  author's backend tabletop-almanac.com, dddice integration, Discord webhooks, D&D Beyond roll capture,
  Patreon-gated features. This is the closest existing analogue to "an external app with its own
  backend living inside Owlbear."
- **Battle Board** (Missing Link Dev, https://github.com/MissingLinkDev/battle-board, 2026-03-30):
  5e initiative + combat manager with "automatic range overlays", "real-time distance calculations
  between all tokens with elevation support", health tracking, GM/player views. Existence proof that
  §3's distance/range derivations are practical on the SDK.
- **Rumble!** (Battle-System): chat, DMs, safety cards, dice. **Smoke & Spectre!** (Battle-System):
  per-player dynamic fog, light sources, UVTT import, "Spectre" tokens visible only to chosen players;
  settings live in scene metadata; closed source.
- **Ranges** (official, GPL-3, 2025-08-29): circular range measure mode. **Bendy/Segmentable Ruler**:
  path measurement UI.
- **Sheet from Beyond** (URL-per-token popover) and **obr-external-links**: the only "external character
  sheet" pattern on the store is _open a URL in a popover_. No Demiplane, Shard, or D&D Beyond
  state-sync extension exists; nothing on the store syncs a sheet's state both ways.
- **Roadmap signals (blog):** 2.3 "Warp Core" GPU renderer + Dynamic Fog + GPU effects (2024-10-09);
  Map Alignment (2026-05-07); 2.4 "Forecast" automatic fog detection + Storage Saver (2026-05-23,
  Forecast beta Bestling-only at first; "a lot more planned for 2026 and beyond"); _On Plagiarism, AI
  and Centaurs_ (2026-08-24): team of three (Mitch, Nicola, Andrew), sustained by a paid tier with
  "no paywall-gated features", committed to keeping a robust free tier, no generative-AI features.
  No marketplace/paid-extension announcement found.

---

## 5. Costs and risks

- **Pricing** (https://www.owlbear.rodeo/pricing, read 2026-09-03): Nestling **free** — 200 MB, 2
  rooms, 25 MB / 67 MP images, 50 MB video; Fledgling **$3.99/mo** ($3.33 billed yearly) — 5 GB, 10
  rooms, personalised rooms; Bestling **$7.99/mo** ($6.66 yearly) — 10 GB, 25 rooms, 50 MB / 144 MP
  images, Forecast beta. Extensions, SDK access, all tools, ad-free and Dynamic Lighting are on every
  tier. Only the GM needs storage; players join free. Cost to d20 Folio: **zero** (we host a static
  site on Firebase Hosting).
- **Vendor dependence:** Mini Manta Studio Pty. Ltd. (Victoria, Australia), three people. ToS
  (https://www.owlbear.rodeo/terms): 18+ only; "AS IS"; accounts may be terminated "for any reason";
  liability capped at fees paid / USD 100. No clause on extensions, APIs, or commercial use either way.
  Nothing forbids a free extension that talks to our backend; nothing guarantees the SDK.
- **SDK stability:** manifest v1 unchanged since 2023; SDK 3.x since 2024-10 with no release since
  2024-12 while the host kept shipping. Low churn; the risk is silent host behaviour changes, not API
  breaks.
- **Data exposure:** item/scene/room/player metadata is readable by every extension in the room and
  every member. Never put Folio ids that grant access, tokens, or private character data into Owlbear
  metadata; put only opaque combatant ids and display values (HP shown, conditions shown).
- **Offline:** Owlbear 2 is account-based and server-synced. Its troubleshooting page documents
  "Reconnecting" (changes stored locally, sync on reconnect, refresh loses them) and "Disconnected"
  (no persistence, refresh required) — https://docs.owlbear.rodeo/docs/troubleshooting/. The
  IndexedDB/WebRTC/LAN model belongs to the _legacy_ 1.x edition
  (https://github.com/owlbear-rodeo/owlbear-rodeo-legacy, archived-style, last push 2023-12-05), not
  to 2.x. **At a table with no wifi, Owlbear is unavailable and the extension does not run.** Folio's
  PWA must keep working in mode A with the Encounter log as the sole source of truth; Owlbear can only
  ever be an optional projection.
- **Physical-table fit:** Owlbear is a screen-per-player VTT. For an in-person group it typically means
  a laptop/TV for the map plus phones for sheets — some groups already do this; many use a paper map
  and will never open Owlbear.
- **Age gate:** Owlbear's ToS requires users to be over 18; Folio has no such gate. An Owlbear bridge
  cannot be a required path for any Folio feature.

---

## 6. Comparison: building a light in-app map (grid + tokens + ruler, no fog)

Scope assumed: square grid, map image upload, token placement/drag with snapping, size classes,
ruler with Chebyshev/alternating diagonals, pan/zoom, touch, multi-user sync via Firestore, per-token
HP/condition overlays from the Encounter log, no fog/vision/walls.

| Area                                                                                           | Effort (senior React dev)                                                                    |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Canvas core: pan/zoom, grid, image layer, tokens, snapping, ruler, hit-testing                 | 2–3 wks                                                                                      |
| Touch/mobile (pinch, drag vs pan disambiguation, low-end phones, DPR)                          | 1–2 wks                                                                                      |
| Sync model: token positions as Encounter-log events, conflict rules, presence, cursor previews | 1–2 wks                                                                                      |
| Assets: map upload, resize/WebP, storage rules, quota UX, offline cache in the PWA             | 1–2 wks                                                                                      |
| Overlays from the log (HP, conditions, range bands, AoE templates), undo                       | 1–2 wks                                                                                      |
| Bilingual UI, a11y, screenshot gate, e2e, bundle budget work                                   | 1–2 wks                                                                                      |
| **Total**                                                                                      | **~7–13 weeks** to a shippable v1; fog/vision/walls would add 4–8 more and are out of scope. |

Libraries: **react-konva/Konva** (2D canvas scene graph with drag events, ~150 kB min; best
fit for a token map), **PixiJS 8** (WebGL, ~400 kB, overkill without fog/effects), or **plain SVG +
pointer events** (zero deps, fine up to ~100 tokens, easiest with React 19 and the bundle budget).
Recommendation if built: SVG first, Konva only if profiling demands it.

What it would automate vs Owlbear: exactly the same derivations as §3 (distance, adjacency, bands,
movement, templates) — since we own the geometry, results are identical; it would _not_ add LOS/cover
either, unless we also build walls. The difference is ownership: the in-app map runs offline, is
bilingual by construction, has no age gate, and feeds the log directly.

Hidden costs: (1) **Storage** — new Firebase Storage buckets require the Blaze plan
(`*.firebasestorage.app` is "not available on Spark"; legacy appspot buckets keep 5 GB / 1 GB-day
free) — https://firebase.google.com/pricing; map images are the first thing in Folio that is neither
tiny nor text, so quotas, per-campaign caps and the £1 kill-switch posture all get exercised. (2)
**Sync** — token drags are the highest-frequency writes the product would ever have; Firestore
write quotas (20 K/day Spark) and listener fan-out need throttled position events (commit on drop, not
per pixel). (3) **Mobile performance** — large map images on phones, memory, DPR. (4) **Permanent
surface** — a map is a product, with its own bug surface, screenshot matrix (theme × locale × viewport),
and expectation creep toward fog/vision/measurement parity.

---

## 7. Recommendation

**Choose B, staged behind A, never replacing A.** A (map-less declarations) is already the
architecture and is the only mode that satisfies offline-first, zero-cost, and the physical-table
premise. C (built-in VTT) spends 2–3 months and a permanent maintenance/storage surface to reach
what Battle Board already demonstrates on Owlbear, and it would still leave cover/visibility
declared. B costs a static site, reuses our engine, and adds value only for groups that already
use Owlbear — which is the population that wants token-derived relations at all.

Phased path:

0. **A stays canonical.** Relations are log events with a `source` field: `declared` (today) or
   `derived` (new; carries `provenance: {obrRoomId, obrSceneId, itemIds, distanceCells, rule}`).
   The reducer treats both identically; the UI shows derived ones as _suggested_ until accepted (GM
   or owning player), so a wrong token drag never silently changes rules outcomes.
1. **Read-only bridge (2–3 wks):** extension with `background_url` + action popover, hosted on
   Firebase Hosting under our custom domain (`/obr/manifest.json`). Pairing by code. It subscribes
   to `scene.items.onChange` + `scene.grid`, maps items to combatants, and emits _proposed_
   `adjacency`/`rangeBand`/`moved` events into the Encounter log. No writes to Owlbear.
2. **Projection to tokens (1–2 wks):** write `app.d20folio/combatant` metadata (opaque combatant id
   - HP/temp/AC/conditions as display values) and optionally mirror into Bubbles' keys for people
     who already use Bubbles; local-item overlays for the current band ring (GM and owner only).
3. **Store listing + verification (1 wk + Discord latency):** PR to `owlbear-rodeo/extensions`;
   meet the checklist (mobile, all browsers, private window → auth-less degraded mode, custom
   domain). Tag `combat`, `automation`.
4. Only if usage justifies: template drawing tool (`OBR.tool` mode) and wall ray-cast LOS
   _suggestions_. Never fog, never vision ownership.

### Architecture sketch for B

Surfaces

- `background_url` iframe: SDK bootstrap, pairing state, `onChange` subscriptions, Firestore client.
  Runs for everyone who has the extension enabled; does work only when paired.
- Action popover (~320×480): pairing, encounter picker, live "relations" list with accept/dismiss,
  status (connected / degraded / offline).
- Context menu on CHARACTER/MOUNT images: "Link to Folio combatant…", "Unlink", "Show band ring".
- Optional `OBR.tool` mode later for templates.

Data flow

- Owlbear → Folio: `items.onChange` → filter IMAGE on CHARACTER/MOUNT with
  `metadata["app.d20folio/combatant"]` (or a link table in Firestore for unlinked tokens) →
  diff positions vs last snapshot → debounce → geometry (footprint, cell distance under the scene's
  measurement, bands from Folio weapon/spell ranges) → `proposeRelation`/`proposeMove` events
  appended to the Encounter log (Firestore) with provenance. Only the paired GM client appends, to
  avoid N players proposing the same event; players' iframes stay read-only. If the GM is not on
  Owlbear, the first paired player with a `PLAYER` role is elected by lowest connectionId
  **(inferred design choice)**.
- Folio → Owlbear: Firestore listener on the encounter's derived HP/conditions → `updateItems` on
  linked tokens, writing our namespace (and Bubbles keys if the user opts in); `OBR.notification`
  for turn changes. Writes are idempotent and skip when values are unchanged to avoid sync storms.
- Broadcast channel `app.d20folio/turn` for ephemeral "your turn" pings (≤16 KB).

Identity mapping

- `obrRoomId + obrPlayerId → folioUid + campaignId` stored in Firestore under the user's own
  document after pairing; never in Owlbear metadata.
- `itemId → combatantId` stored in item metadata as an opaque id (and mirrored in Firestore so it
  survives scene copies where ids change **(inferred)**).
- Role: Owlbear `GM` ⇒ may accept proposals for any combatant; `PLAYER` ⇒ only for combatants they
  own in Folio (Folio's ownership is authoritative, not Owlbear's).

Failure modes and handling

- Auth cannot persist (private window / partitioned storage): degrade to read-only display of what
  the room broadcasts; never block Owlbear use. Required for verification anyway.
- Scene not ready / no scene: idle; the verification checklist requires both configurations to work.
- Wrong grid scale (map at 10 ft cells or no scale): show the parsed unit; if unit ≠ ft or
  multiplier ≠ 5, propose nothing and tell the GM why.
- Hex/iso scenes: distance still comes from `getDistance`; adjacency uses ≤1 cell; templates disabled.
- Two extensions writing the same metadata (Bubbles vs ours): our namespace is the source; mirroring
  into Bubbles keys is opt-in and one-way.
- Token deleted/copied/scene switched: unlink events; combatant persists in Folio.
- Owlbear outage or wifi loss at the table: Folio continues in A; on reconnect the extension re-reads
  the scene and reconciles positions (no replay of stale proposals older than the current round).
- SDK/host change: pin `@owlbear-rodeo/sdk`, run a smoke e2e against a real room monthly, and keep
  the extension a separate bundle so a breakage cannot take the PWA down.

---

## Source list

- SDK package: https://www.npmjs.com/package/@owlbear-rodeo/sdk (3.1.0, 2024-12-03, MIT); repo https://github.com/owlbear-rodeo/sdk
- Docs: https://docs.owlbear.rodeo/extensions/getting-started/ · /extensions/reference/manifest/ · /extensions/reference/metadata/ · /extensions/apis/room/ · /extensions/apis/player/ · /extensions/apis/broadcast/ · /extensions/apis/scene/items/ · /extensions/apis/scene/grid/ · /extensions/apis/scene/local/ · /extensions/apis/scene/fog/ · /extensions/reference/dynamic-fog/ · /extensions/tutorial-sharing-your-extension/hosting-your-extension/ · /extensions/tutorial-sharing-your-extension/showcase-your-extension/ · /extensions/tutorial-sharing-your-extension/extension-verification/ · /docs/troubleshooting/ · /docs/managing-your-subscription/
- Store: https://extensions.owlbear.rodeo/ · /guide · /verified · https://github.com/owlbear-rodeo/extensions (extensions.json, verified.json, tags.json)
- Pricing/ToS: https://www.owlbear.rodeo/pricing · https://www.owlbear.rodeo/terms
- Blog: https://blog.owlbear.rodeo/building-an-extension-for-owlbear-rodeo-2-0/ (2023-03-01) · /owlbear-rodeo-2-3-release-notes/ (2024-10-09) · /owlbear-rodeo-2-4-release-notes/ (2026-05-23) · /on-plagiarism-ai-and-centaurs/ (2026-08-24)
- Extensions: Bubbles https://github.com/SeamusFinlayson/Bubbles-for-Owlbear-Rodeo · Initiative Tracker https://github.com/owlbear-rodeo/initiative-tracker · Pretty Sordid https://github.com/SeamusFinlayson/pretty-sordid-initiative · Condition Markers https://github.com/SeamusFinlayson/conditionmarkers · GMG https://github.com/kamejosh/owlbear-hp-tracker · Battle Board https://github.com/MissingLinkDev/battle-board · Owl20 https://github.com/uberdragon/owl20 + https://github.com/mvoncken/owl20-owlbear · Smoke & Spectre https://extensions.owlbear.rodeo/smoke · Ranges https://github.com/owlbear-rodeo/ranges · Dynamic Fog https://github.com/owlbear-rodeo/dynamic-fog · Sheet from Beyond https://github.com/alvarocavalcanti/sheet-from-beyond
- Beyond20: https://beyond20.here-for-more.info/
- Firebase pricing: https://firebase.google.com/pricing
