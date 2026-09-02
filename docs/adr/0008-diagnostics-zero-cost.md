# ADR-0008: Diagnostics — the domain log plus in-house error reports; no third-party sink

**Date**: 2026-09-02
**Status**: proposed
**Deciders**: owner ("debug without user reports, professional"), architecture round

## Context

Incidents are reconstructed from memory ("I think Flurry of Blows"). There is a bug reporter with screenshots but no
telemetry; the owner runs at ~£1/month and friends' data must not leak to third parties.

## Decision

Two layers: the encounter action log (replayable, attributed) is the forensic record of play; a structured client
logger with correlation ids and an IndexedDB breadcrumb ring buffer writes automatic reports on error-level events
(fold rejection, quarantine, denied write, unhandled rejection) to `users/{uid}/diagnostics/{id}` (bounded, create-only),
read from the existing admin inbox.

## Alternatives Considered

### Alternative 1: Sentry (free tier)

- **Pros**: industry standard, source maps, releases.
- **Cons**: third party receives friends' data; bundle weight; quota.
- **Why not**: privacy and cost posture; remains a sink swap if ever wanted.

### Alternative 2: Cloud Logging via Functions

- **Why not**: cost and a server component for gameplay diagnostics.

## Consequences

### Positive

- Every rejected fold and quarantine is visible to the admin without a report.

### Negative

- Retention is client-capped (last 50 per user); no alerting beyond the inbox.
