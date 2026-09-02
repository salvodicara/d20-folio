# Architecture Decision Records

Lightweight ADRs (Nygard format). One decision per file; superseded decisions link their replacement.

| ADR                                               | Title                                                                                 | Status   | Date       |
| ------------------------------------------------- | ------------------------------------------------------------------------------------- | -------- | ---------- |
| [0001](0001-one-entity-generic-reducer.md)        | One entity-generic combat reducer over an Encounter aggregate                         | proposed | 2026-09-02 |
| [0002](0002-append-only-action-log.md)            | The append-only action log is the only persisted mutation                             | proposed | 2026-09-02 |
| [0003](0003-mechanics-kernel-not-adopted.md)      | The `mechanics-*` kernel is salvaged, not adopted                                     | proposed | 2026-09-02 |
| [0004](0004-k1-and-wayfinder-disposition.md)      | K1 and the Wayfinder S1 are retired; A1 topology direction kept                       | proposed | 2026-09-02 |
| [0005](0005-rules-enforce-access-not-gameplay.md) | Firestore rules enforce identity, membership, ownership and shape; trust at the table | proposed | 2026-09-02 |
| [0006](0006-one-mechanics-authoring-format.md)    | One versioned mechanics authoring format for SRD, pack and homebrew                   | proposed | 2026-09-02 |
| [0007](0007-test-portfolio-reset.md)              | Test portfolio: golden replays, properties, exhaustiveness, few rules and e2e         | proposed | 2026-09-02 |
| [0008](0008-diagnostics-zero-cost.md)             | Diagnostics: domain log plus in-house error reports, no third-party sink              | proposed | 2026-09-02 |
| [0009](0009-migrate-before-deploy.md)             | Every persisted-shape change migrates live data before the deploy that needs it       | proposed | 2026-09-02 |
