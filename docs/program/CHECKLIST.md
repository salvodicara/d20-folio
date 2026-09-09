# Delivery checklist

<!-- source: full-lab/docs/DELIVERY-CHECKLIST.md -->

This is the closing control of a block, not a second execution state: state lives in
[`docs/PROGRAM_STATUS.md`](../PROGRAM_STATUS.md) and [`NEXT.md`](NEXT.md). A block is closed only
when A, B, C and its own row of D are satisfied. Record for every line `proven / gap / not
verified`, the gesture, the expected and observed result, the test or report, the command and date,
and the screenshot of the current revision. A route or a count of controls is never a proof.

## A — Behaviour of the delivered surfaces

| Area                           | Closing proof                                                                                                                                                                          |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reference dossier              | Every surface/mechanism of the block names the product that already does it, the evidence, what is copied and what is adapted (rule 30); no invented pattern where a proven one exists |
| Only what is needed, all of it | Main task, essential data, primary action, secondary detail; openings replayed with no external guide and canonical navigation                                                         |
| Orientation and continuity     | Four domains, search, detail → return with filters, scroll, selection and draft; context change and Back/Forward with no contamination                                                 |
| Account, campaigns, characters | Create, open, copy, archive, restore; several characters of one account in one campaign; independent selectors; invite, claim, leave                                                   |
| Builder and sheet              | Choices and cascades, 18 skills and saves, progression, resources, conditions and vital state, images and fallback, companions, import/export/print                                    |
| Spells and inventory           | Preparation, casting, costs, ritual, components and chosen level; coins, charges, equipment, containers and transfers; reading never consumes                                          |
| Eleven homebrew families       | Per family: create, edit, autosave, versions, reuse, import/export, print, sharing and revocation; the copy materialised in the right recipient                                        |
| Player table and freedom       | Composed action, targets, three automation levels, digital or physical dice, explicit costs, receipt and undo; every E family supported or honestly manual                             |
| The DM as a distinct user      | Preparation → activation and reinforcements; overview → complete authorised sheet A/B → return, with no change of active character or balance                                          |
| Map and DM session             | Assets, scene, grid, tokens, camera, gestures and shortcuts, allowed and extra movement, areas, fog, reveal and player preview, and resume                                             |
| Campaign and world             | Chronicle, lore and notes with explicit public and private, treasure and rewards on the recipient, dates, travel, downtime and rests                                                   |
| Calendar                       | Availability, invitation and RSVP, proposal and confirmation, recurrences, occurrences and time zones, links and reminders with preview                                                |
| Account and secondary surfaces | Preferences, public exposure and revocation, recovery, session zero, support, legal, admin, PWA update defer and apply                                                                 |
| Devices and robustness         | IT and EN, dark only, desktop 1440×900 and 1280×800 and pertinent phone; long names, keyboard and focus, crop and fallback, error, cancel and reload                                   |

An unautomated primitive never blocks the intent of play: the contextual manual path counts. Never
promise the enumeration of every possible homebrew, and always separate a local result, a content
fixture and a simulation of concurrency or ACLs — the last is not real backend proof.

## B — Reference and the owner's visual gate

- [ ] The approved reference is identified now by tag, manifest and hash — never an old manifest
      applied to newer files. See [`reference/README.md`](reference/README.md).
- [ ] Every UI gap of section A is closed with current proofs; residual limits stay explicit.
- [ ] The pertinent suites are rerun on the final files, and curated screenshots of the flows and
      states are captured on top of page captures.
- [ ] Real screenshots are sent in chat, viewable on a phone, covering flows, navigation and the DM
      workspace, not only style.
- [ ] The owner's 8 September standing delegation applies: reviewed, gate-green work integrates into
      `v2` without a fresh per-block visual verdict. It keeps the screenshots mandatory and excludes
      a new material product decision, block PD's verdict, the P28–P30 owner visual review, and any
      separately gated production, deployment, real-data migration or cost decision.
- [ ] Files changed after an owner verdict carry evidence and a judgement on the delta; they never
      inherit the previous verdict automatically.

## C — Architecture, program and real review

- [ ] The block preserves one authoritative state, Encounter trust distinct from DM-only note ACLs,
      the offline and zero-cost posture, versioned copies and no peer writes.
- [ ] The ownership boundaries hold: P02 multi-character roster; P03 identity, version, lease and
      revocation; P11b the personal cutover before P30; P14a/b/c and the eight outcomes covering
      E01–E22; P05 staying editor and schema.
- [ ] DM overview and inspection stay separate from the acting character; the nine manual freedom
      scenarios and stateful return have a named owner and named future proofs.
- [ ] An independent reviewer actually reads the current revision of the changed contracts and
      code. Record file, version, findings, dispositions and any rereview required; closed
      historical findings never stand in for a review of new additions.
- [ ] [`NEXT.md`](NEXT.md) is rewritten for the successor and the same block or outcome is resumed
      whenever a gate is missing or failed.
- [ ] Before the closing commit, state the concrete A/B/C result and the residuals. This document
      executes nothing and authorises no commit, integration or deployment.

## D — Runtime proofs owed by each block

<!-- source: full-lab/docs/DELIVERY-CHECKLIST.md, section D -->

| Blocks  | Required runtime proof                                                                                                                                                                        |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P01     | Reconcile documents on a fresh v2 baseline, with no functional code; Counterspell and tempHP divergences reconciled in documented expectations                                                |
| P02–P04 | Emulator ACL get/list/write and attachments; roster and assignment; two clients and a stable `opId`; version and lease compared atomically or by explicit adapter; offer → materialisation    |
| P05–P13 | Eleven families and the SRD/pack partition, schema and derived values, six fixtures and snapshot → dry-run → idempotent apply → verify; P11b with zero dual write across join → play → rejoin |
| P14–P19 | P14a's first red/green regressions; the eight E outcomes with ordinary, boundary, composition and manual cases, one receipt and causal undo; VTT two clients before extending gestures        |
| P20–P27 | Real persistence and campaign, account and public permissions; transfers with no duplicates; calendar DST and recurrences; integrations only with consent and authorisation; recovery and PWA |
| P28–P30 | The CI, rules and licensing gates, six fixtures, runtime anti-drift, the owner's whole-app visual gate, a real DM/player session, and a recoverable cutover; deployment stays owner-triggered |

A block never declares D done for another block, and the mock never satisfies a runtime proof.
