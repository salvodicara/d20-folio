# DM-only item state and the creature roster (2026-11-04)

Edge-case families M20 (cursed, sentient, evolving items, artifacts) and M19 (creatures outside the
tracker, planes) from the [edge cases](2026-11-edge-cases.md). Design only. Implementation follows the
engine's B families, and any new collection or rules change ships in a release deploy the owner
approves. ADR-0005 still holds: rules enforce who reads and writes what, never game legality.

## 1. Security model first

**The threat.** A player learns something the DM hides: that a sword is cursed, what a sentient item
wants, which artifact property is still unrolled. Every player can read their own character document
and, through the campaign attachment, their party's. Firestore rules are not filters: a rule like
`resource.data.hidden != true` still lets an unscoped list return the hidden documents. So **hidden
state never sits in any document a player can read**, not even as a flag.

**Where it lives.** Two campaign subcollections, keyed by the item's `instanceId` (every physical copy
already has one, and it travels with the item when it changes hands):

| Collection                               | Read      | Write     | Holds                                                                                                                                          |
| ---------------------------------------- | --------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `campaigns/{c}/dmItems/{instanceId}`     | DM, admin | DM, admin | what only the DM knows: curse present and not yet revealed, a sentient item's hidden aims, rolled-but-unrevealed artifact properties, DM notes |
| `campaigns/{c}/itemReveals/{instanceId}` | members   | DM, admin | what the DM has revealed: `curse: true`, revealed sentient traits, revealed artifact properties                                                |

Both copy the proven `dmNotes` gate (`firestore.rules`, the `dmNotes` match): a DM-only `match`, and
**both names added to the member wildcard's exclusion list**. Without that, Firestore OR-combines the
broad member grant and a player reads `dmItems` through it. That exclusion is the line most likely to be
missed, so it gets its own rules test.

Revealing moves knowledge from `dmItems` to `itemReveals`. The DM never writes the player's character
document (nobody writes another user's subtree; ADR-0005).

**Other leak paths.** These are checked in review and covered by a test each:

- **The session log and the chronicle are member-readable.** A hidden curse writes no line there.
  The DM's own view gets the lines, and they enter the log only at the reveal.
- **The public sheet projection** (`public/sheet`) is built from the character only. Hidden state
  never reaches it.
- **Hidden mechanics are not applied to the player's sheet.** A sheet that silently gained
  Vulnerability would reveal the curse. Until the reveal, the DM's view shows what the curse does,
  and the DM rules on it at the table. After the reveal, the overlay applies on the sheet like any
  grant.
- **Solo play has no DM.** A character outside a campaign sees the catalogue's curse text as written,
  which is today's behaviour. The catalogue is public SRD/pack text anyway; what is hidden is only
  _whether this copy_ is cursed.

**Rules tests** (emulator, `tests/rules`), before any client code:

- A member can neither get nor list `dmItems`, directly or through the wildcard.
- A member can read `itemReveals` but cannot write it.
- The DM can do both.
- A removed member loses read access.
- Document size and key shape are bounded, as on `dmNotes`.

## 2. M20: items with a DM side

- **Curses.** The catalogue says what a curse does: `curse: { grants, blocksUnattune: true }` on the
  magic item, which is public text. The instance state is the DM's: `dmItems[id].cursed`, and later
  `itemReveals[id].curse`. Once revealed, `unattuneItem` refuses ("Cursed attunement"), and the
  curse's grants apply. Before the reveal, an unattune goes through on the sheet and the DM's view
  flags it, because blocking it would itself reveal the curse.
- **Identify** shows properties, attunement and charges (catalogue plus the item's resources) and
  never reads `dmItems`.
- **Sentient items.** The catalogue gives the stat block and the conflict rule (a Charisma save,
  then the item takes control). The item's aims and its current demand are DM state, revealed trait
  by trait.
- **Artifacts.** The catalogue lists the property tables. The rolled properties for this copy are DM
  state, revealed one at a time.
- **Magic items resist damage.** Plain catalogue data (AC and HP by size, resistance to all damage).
  Nothing is hidden, so it needs no collection.
- **Evolving items** (optional, `TableRules.evolvingItems`). Nothing is hidden: the owner sees which
  properties are unlocked, so it is per-item state on the character (`unlockedProperties(item, owner)`
  in `@/lib/item-overlays`). The DM unlocks a stage through the same reveal path when the table rules
  say the DM decides.

## 3. M19: creatures and where things are

- **Owned companions stay on their owner's sheet** (`summons`, `companionHp`; the
  [summons design](2026-11-summons.md)). The missing piece is initiative.
  `companionInitiative(source)` gives a familiar its own entry (rolled once, stored beside its HP) and
  gives a summon the caster's turn, as the spell says. No new collection.
- **Creatures the DM keeps between fights** (a hireling, a recurring villain, a rescued prisoner) go in
  a campaign roster with the same two-level split: `roster` (members read, DM writes) and `dmRoster`
  (DM only) for what the party doesn't know. An encounter takes roster entries by id. It never copies
  them, so damage taken in a fight persists after it.
- **Planes as a location tag**, never a map: an optional `location: { plane?: string; inside?:
instanceId }` on a character session, a roster entry and a summon. `inside` names the container (a
  Bag of Holding, a Rope Trick, Magnificent Mansion), which is off every plane.
  `sharesPlane(a, b)` answers the familiar link and the planar checks. When neither side is tagged, the
  answer is "yes", which keeps today's behaviour.

## 4. UX before building

The DM-side screens are mocked and approved before any code: the item's DM panel (curse, aims, rolled
properties, «Rivela»), the player's view before and after a reveal, and the roster. Every string ships in
English and Italian.

## Order

1. Rules and their emulator tests (`dmItems`, `itemReveals`, wildcard exclusion), deployed in an
   owner-approved release.
2. The catalogue `curse` and `sentient` data and `blocksUnattune`, with no hidden state yet (works solo).
3. The DM panel and the reveal path, after the mock is approved.
4. `companionInitiative`, then `location` and `sharesPlane`, then the roster.
