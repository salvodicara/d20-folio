# P06 — Monster and campaign-rule authoring

## Binding scope

New V2 application; Astra approved full-lab 0.9.3 plus shell/Account r2 is the binding
experience. Transfer all relevant BG3 behavior, organization and feedback, useful Beyond/Roll20
capabilities, with D&D 2024 governing rules. The mock is not a ceiling on functional depth.
Existing engines, managers and navigation impose no compatibility requirement. No legacy combat
bridge, second runtime, prose interpreter, P07, P13/P16 expansion or P14 execution. Production
remains separate. No deployment, real-data writes, costs, main push or implicit V2 integration.
The owner has delegated technical design/implementation; no repeated product micro-approval.
Actual curated P06 runtime images and explicit block integration remain owner gates.

PRODUCT owns “Homebrew automation and editable combat”. Custom data must feed the SAME engine
as official content: actions, targets, costs, resources, effects, reactions, consequences and
receipts. The finite vocabulary is extensible, never a permanent product ceiling. Modeled
mechanics require deterministic automation; a manual alternative does not excuse missing support.
During combat relevant values, resources, conditions, active effects and results remain editable
on authoritative facts with coherent consequences, provenance and causal correction/undo. DM
permissions remain. Editing an in-use copy/effect differs from editing a library template/version;
no silent propagation to other copies. Genuine unsupported input is retained and diagnosed;
manual resolution applies explicit costs/consequences to the same facts and receipts. P06 proves
authoring/conformance and reuse only. Future engine/play acceptance MUST run actual custom combat
with automated costs/effects, edits during use and causal undo, ordinary/boundary/composition.

## Architecture and owners

LibraryDefinition/LibraryVersion remain the only definition/version authority. Preserve P03
loaded bases, session epoch, operation controller, stable envelope, CAS and immutable receipts.
No parallel queue, automatic reconnect replay, replacement of loaded edits or local ACL consent.
Bestiary is a filtered view of owned stable monster LibraryVersions, never another template store.
Authoring extends src/lib/homebrew/model.ts and conformance.ts through a dedicated advanced
vocabulary module; keep P05 character-instance family restrictions unchanged. The shared reader
serves editor, offers, actual copies and print. Unknown keys/options/versions survive untouched;
exact imported originals retain P05 append-only recovery before replacement.

Two new authoritative campaign resources are separate from the strict P02 campaign parent:

- folioCampaigns/{campaignId}/preparations/{preparationId}/monsters/{instanceId}: a prepared
  monster copy with full immutable LibraryVersion and separate state. The preparation identifier
  labels an encounter preparation; no turn log, roll, combat lease or gameplay starts here.
- folioCampaigns/{campaignId}/rules/{ruleInstanceId}: pinned campaign-rule version and enabled
  state. Selecting a rule does not activate it; explicit DM/admin action does. Members read rules,
  DM/admin read preparation; mutation requires current DM/admin and nonarchived campaign.

src/lib/homebrew/preparation.ts owns codecs/paths/operations; preparation-repository.ts owns IO;
docs/homebrew-preparation.md owns schema/transitions. firestore.rules validates exact target,
kind, source, campaign revision/base and receipt atomically. Source must be actor-owned stable
version; accepting another creator's offer first is mandatory, including for admin. Existing
P02 admin inspection does not fabricate another account's consent. Receipt reads recheck current
campaign access so an old DM receipt cannot leak revoked preparation. New IO uses P03 Envelope,
receiptPath/equal/OperationController/SessionController. No broad wildcard authorization.

Intent captures original whole base, campaign revision, exact destination and scope. Transaction
reads receipt first for idempotency, then current user/campaign/base/source; compares before writes.
State change preserves snapshot; explicit chosen version update preserves state exactly, even
when it exceeds a new capacity (report mismatch, no clamp/refill). New clones are separate IDs;
retries reuse the same opId/target. A→B→A invalidates through session epoch; preparation selection
also fences local callbacks and mount lifetime. Scope/authority is not a future Encounter lease.

## Authoring vocabulary

Version 1 and edition 2024, source/sourceVersion/mechanicId on each family. Description/table
notes explain only. Same finite formula bounds as P05, no RNG/eval. Collections have finite
bounds (32 programs, 32 resources, 32 effects/program, 16 ordered multiattack steps). Stable IDs
identify resources/programs/dependencies, never translated labels or array position.

Monster: size/type/alignment, AC, maximum HP and HP formula, CR including fractions, initiative,
six ability scores and saving-throw bonuses, movement modes in meters, senses/passive perception,
languages, defenses and skill bonuses. Typed actions/traits/bonus/reaction/legendary/lair programs
carry ID/name/source, activation/trigger, attack or save parameters, normal/long/reach/area,
resource cost/frequency and ordered P05 effect primitives. Multiattack is an ordered list of
program references/counts with no cycles/nested multiattack. Resources declare ID/name/capacity,
recovery boundary/kind/formula or d6 recharge threshold; no remaining count in templates.
Legendary costs reference declared resources; reaction trigger is a finite event token plus
optional explanation. Unknown event/step kinds remain unsupported at their exact paths.

Campaign rule: domain scope (combat/exploration/rest/character), application (typed/narrative),
replaced mechanic ID, agreement declaration and priority. Typed policy declarations identify a
fact (AC/speed/attack/save/DC/resource capacity), operation (add/set), bounded amount, target
selector and optional resource ID; programs use the same action/resource/effect declarations.
Dependencies reference source mechanic IDs with required/conflicting relation. Active campaign
view computes and explains missing dependencies, incompatible enabled declarations and equal
priority replacement conflicts; it never claims to execute or resolve them. Priority is data,
not an ACL override. Narrative-only is an explicit authored choice, not fallback for modeled
unsupported kinds. Disabled copies retain their snapshot/state; reactivation is explicit.

Common validation: required identities, duplicate IDs, dangling references, cost exceeding
capacity, invalid recovery/recharge, invalid ranges, gate/resolution/area mismatch, negative
formula minima, cycle/nested multiattack, typed rule lacking declarations, unknown preservation.
Invalid stays draft, cannot record/reuse; unsupported stays visible and preserved, never advertised
as executable. State includes label/current HP/temp HP/conditions/resource remaining for prepared
copies and enabled for rules. State editing here prepares an instance, not a combat command.

## Named E families and acceptance before code

| Families                    | Owner files                     | Ordinary                              | Boundary                                             | Composition and limits                                                         |
| --------------------------- | ------------------------------- | ------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------ |
| E01/E03/E10/E11             | advanced vocabulary/conformance | attack with reach and ordered damage  | invalid range, missing attack ref                    | multiattack referencing two attacks, rider gate; no execution                  |
| E05/E16/E18                 | same                            | finite resource and recharge 5–6      | threshold outside d6, oversized cost, duplicate ID   | legendary/reaction costs plus reset declaration; no recovery draw              |
| E06/E08/E12/E13/E14/E17     | same                            | save/area/condition duration          | missing save ability/area, negative formula          | save-gated damage plus condition/concentration declaration; no P14 claim       |
| E19/E21                     | same and preparation repository | typed campaign modifier with priority | dangling dependency/unknown kind/unauthorized enable | two enabled rules with explicit dependency/conflict report; no silent override |
| E02/E04/E07/E09/E15/E20/E22 | unknown declarations            | preserved unsupported original        | nested unknown version/key exact recovery            | honest path diagnostics; future vocabulary/engine blocks own execution         |

## Experience

Preserve Astra fonts, palette, assets, shell icon placement and r2 controls. Monster/rule forms
follow specific state-editor-monster.png/state-editor-campaign-rule.png: narrow creation shelf,
spacious grouped fields, two columns desktop, one phone, short labels with explanations outside
buttons. Progressive action/resource/dependency sections retain depth without dumping JSON as
primary editor. All strings EN/IT. Accessible labels, focus/dialog cleanup, system motion guards.
No product animation/shortcut off switches. Account stays stable; dice preference remains personal.

Create/edit/autosave/reload, explicit immutable version and comparison, duplicate, portable import/
export and all-page print inspection. Reuse dialog chooses authorized campaign/preparation and
shows version/conformance before writing. Campaign surface shows real rules with enable/disable,
provenance/dependencies; DM preparation displays actual persisted creatures and edits/version
comparison. Library bestiary consumes stable versions. Local draft/pending/unknown/conflict,
comparison, recovery and scope invalidation are real states. Duplication creates a new own draft;
removing an in-use copy is explicit and receipt-backed, without deleting source versions or grants.
No silent destruction of original incompatible data.

## Proof and delivery

P06 needs new real optimized-build journeys using actual Google login and Auth Emulator provider,
independent authenticated synthetic sender/recipient/DM clients, explicit demo-d20folio, actual
SDK/rules and final data/receipt audits. Wait provider document readiness, verify sign-in; do not
change app for harness assumptions. Both families: create/edit/save/reload/version/reuse/update,
offer→accept→one recipient materialization, revoke before blocks/after retains, retry/duplicate,
concurrent base, offline/reconnect no replay, dropped real ack/unknown reload/reconcile, ABA.
Import/export preserves typed/unknown fields and exact original incompatible bytes. Generate PDFs
and inspect EVERY actual page, including long content. Correct/replay affected failures, retain
failed/green logs, commands, synthetic fixtures, source/build/image hashes and independent reviews.

EN/IT dark actual screenshots 1440×900,1280×800,390×844 compared with specific mocks; curated chat
images before owner verdict. just ci, full demo rules, six private fixture copies/exact recovery;
ci-srd-only for catalog/adapters seam. No weakened tests/skips/--no-verify. Emulator evidence is not
production index/transaction-limit/provider/AppCheck/IAM/HTTPS/installed-PWA/device acceptance;
record concrete gaps for separately authorized staging/release. PROGRAM_STATUS alone owns frontier,
lease/owner/gate/integration SHA; external HANDOFF retains evidence/service and authorization receipts.
Owner-only Conventional commits with changeset/fact-owner reconciliation. Only explicit P06 approval
permits fresh fetch/rebase/gates/hooked HEAD:v2, remote verification and clean owned-worktree removal.
No PR/main/deploy. Session finishes only after required exits; then one COMPLETE recursive successor
prompt carrying this rule, sources, ownership, gates, BG3/Astra/new-app/depth/custom-combat contracts.
Do not send it during interim approval and do not start the next block.

## Reference evidence

Specific Astra mock images and shell r2 were visually inspected, source library-tools.js and
full-lab program/coverage/review read independently. Rules reference (read 7 September 2026):
https://www.dndbeyond.com/sources/dnd/br-2024/how-to-use-a-monster . Creation-to-encounter pattern:
https://www.dndbeyond.com/posts/1140-tutorial-how-to-homebrew-monsters-on-d-d-beyond .
These inform structure, not copied non-SRD monster text. Public fixtures are synthetic.
