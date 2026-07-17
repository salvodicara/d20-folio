# Cloud Functions runbook — reporting · signup email · billing kill-switch

The Cloud Functions (`functions/`, 2nd-gen, `europe-west1`) wire the app to the
maintainer and hard-guarantee the zero-budget promise:

- **OWN-37** — an in-app **bug / feature reporter** turns a player's report into a
  GitHub issue on the configured tracker (the `GITHUB_REPO` secret, default
  `salvodicara/d20-folio`). The tracker is PUBLIC, so the issue body is
  **privacy-stripped** (see [What reaches the public issue](#what-reaches-the-public-issue)).
- **OWN-38** — every **new user registration** emails the owner so abuse can be
  blocked fast from `/admin`.
- **SAFE-01** — the **billing kill-switch**: a Pub/Sub trigger the £1 Cloud Billing
  budget publishes to; on actual cost overrun it DETACHES billing from the project so
  spend can never run past ~£1. Runbook in [its own section](#safe-01--billing-kill-switch-the-zero-budget-hard-guarantee).

A client PWA can't safely hold a GitHub token or SMTP credentials, so the client
only writes to Firestore; the privileged work happens in Cloud Functions (Admin
SDK + secrets in Secret Manager).

> **Closing the loop — the fix commit auto-closes the issue** (owner, 2026-06-12 —
> golden rule 17, docs/GOLDEN_RULES.md). A report opens GitHub issue **#N**; the commit that
> FIXES it must use a closing **keyword** — `Fixes #N` / `Closes #N` / `Resolves #N`,
> NOT a bare `(issue #N)` — so the merge to `main` closes the issue and links the
> commit automatically. (Issue #24 needed a manual close because its commit only said
> "(issue #24)"; never again.)

---

## Entry points (client)

One dialog (`src/features/report/ReportDialog.tsx`, mounted ONCE at the app root in
`App.tsx` — outside the error nets and the router, so it survives crashes), three
quiet ways in. Every entry calls the same `openReport(prefill?)` seam
(`src/features/report/open-report.ts`):

1. **Command palette** — ⌘K → "Report a bug or idea" (searchable EN + IT:
   bug/report/segnala/…; one of the curated quick actions on an empty palette).
2. **Account menu** — the avatar menu on every page carries "Report a bug" /
   "Segnala un problema" (the conventional, discoverable-when-needed home).
3. **Crash screens** — both error fallbacks (the in-shell route `errorElement` and
   the fullscreen app-root boundary) offer "Report this problem" / "Segnala il
   problema", which opens the reporter **pre-filled** (`crash-report.ts`: type bug,
   severity high, the error headline as title, route + stack head as description)
   so a crash report is one tap with zero typing.

Deliberately **no** entry in the play cockpit or the site footer — reporting is
discoverable when sought, never chrome during play.

---

## Architecture

```
┌──────────────┐   1. write /bug_reports/{id}        ┌─────────────────────────┐
│  Client PWA  │ ─────────────────────────────────▶ │  Firestore              │
│  ReportDialog│   2. upload screenshot to Storage   │  /bug_reports/{id}      │
│  (Ask the    │ ─────────────────────────────────▶ │  + Storage              │
│   Folio →    │      bug-reports/{uid}/{id}.png     │  bug-reports/{uid}/…    │
│   "bug")     │                                     └───────────┬─────────────┘
└──────────────┘                                                 │ onCreate
                                                                 ▼
                                              ┌──────────────────────────────────┐
                                              │ onBugReportCreated (Functions v2) │
                                              │  • privacy-strip the report       │
                                              │  • Octokit issues.create()        │
                                              │  • write issueNumber/url + status │
                                              └──────────────┬────────────────────┘
                                                             │  creates
                                                             ▼
                                              ┌──────────────────────────────────┐
                                              │  GitHub issue (GITHUB_REPO —      │
                                              │  PUBLIC tracker, stripped body)   │
                                              │  [TYPE] title · labels · debug    │
                                              └──────────────────────────────────┘
   client subscribes to the doc ──▶ "opened as #NN" once the function writes back.


┌──────────────┐   first sign-in creates /users/{uid}   ┌─────────────────────────┐
│  Client PWA  │ ─────────────────────────────────────▶ │  Firestore /users/{uid} │
└──────────────┘                                         └───────────┬─────────────┘
                                                                     │ onCreate
                                                                     ▼
                                              ┌──────────────────────────────────┐
                                              │ onUserCreated (Functions v2)      │
                                              │  • nodemailer → owner email       │
                                              │  • uid/email/name + /admin link   │
                                              └──────────────────────────────────┘
```

Both functions run **2nd-gen, region `europe-west1`** (matches the project),
256 MiB / 60 s. All credentials use `defineSecret` (Secret Manager).

---

## Data model

### Firestore `/bug_reports/{id}`

| Field            | Type                                             | Written by | Notes                                             |
| ---------------- | ------------------------------------------------ | ---------- | ------------------------------------------------- |
| `type`           | `bug\|feature\|visual\|data\|performance\|other` | client     | drives the issue-title tag + `type:` label        |
| `screen`         | string (a screen id)                             | client     | auto-detected from the route, user-overridable    |
| `severity`       | `low\|medium\|high`                              | client     | `severity:` label                                 |
| `title`          | string (required)                                | client     | the issue summary                                 |
| `description`    | string                                           | client     | the issue body                                    |
| `status`         | `new\|opened\|error`                             | client→fn  | client writes `new`; function flips to `opened`   |
| `reporterUid`    | string                                           | client     | rules require `== auth.uid`                       |
| `locale`         | `en\|it`                                         | client     | so the maintainer reads it in the player's tongue |
| `debugContext`   | object (see below)                               | client     | sanitized, undefined-stripped snapshot            |
| `screenshotPath` | string (optional)                                | client     | `bug-reports/{uid}/{id}.png`                      |
| `screenshotUrl`  | string (optional)                                | client     | Firebase download URL — admin inbox ONLY          |
| `createdAt`      | server timestamp                                 | client     | —                                                 |
| `issueNumber`    | number (optional)                                | function   | write-back                                        |
| `issueUrl`       | string (optional)                                | function   | write-back                                        |

**`debugContext`** (from `src/features/report/collect-debug-context.ts`): `url`,
`pathname`, `characterId?`, `campaignId?`, `appVersion`, `gitSha`, `mode`,
`userAgent`, `viewport`, `dpr`, `theme`, `locale`, `online`, `serviceWorker`,
`recentErrors[]` (a PII-light ring of the last ~15 console/window errors),
`capturedAt`.

### What reaches the public issue

The issue lands on a **PUBLIC** tracker, so `formatIssueBody`
(`functions/src/issue-format.ts`) enforces a privacy contract, pinned by
`issue-format.test.ts`:

- **Public** — the user-written title + description, `type` / `severity` /
  `screen` (body lines + labels), `locale` (body line only), the Firestore doc
  id as a non-identifying `Report ref`, and an **allowlisted** debug slice: `appVersion`,
  `gitSha`, `mode`, `userAgent`, `viewport`, `dpr`, `theme`, `locale`, `online`,
  `serviceWorker`, `capturedAt`. Any future debug field defaults to PRIVATE until
  deliberately allowlisted.
- **Private (Firestore doc only — the `/admin` inbox reads it)** — `reporterUid`,
  `characterId` / `campaignId`, `url` / `pathname` (routes carry those ids),
  `recentErrors[]` (messages can quote Firestore paths and user data), and the
  screenshot (`screenshotUrl` embeds the uid in its Storage path and its pixels
  can show a character sheet). The body notes
  "_Reporter details are retained privately._"; the `Report ref` is how an admin
  maps an issue back to its Firestore doc.

### Storage `bug-reports/{uid}/{id}.png`

A downscaled (≤1200px) PNG screenshot captured with `html2canvas`. Owner-write,
admin-read. The **client** writes the Firebase download URL onto the report at upload
time (no `signBlob` / IAM signing on the runtime service account); it stays in the
Firestore doc for the admin inbox and is **never embedded in the public issue**.

### Security rules

- **Firestore** (`firestore.rules`): `/bug_reports/{id}` — `create` requires a
  signed-in, non-blocked user whose `reporterUid == auth.uid`, `status == "new"`,
  and the required string fields present; `read` + `update`/`delete` are
  **admin-only** (the function uses the Admin SDK and bypasses rules).
- **Storage** (`storage.rules`): `bug-reports/{uid}/{file}` — owner write
  (size + image-type validated), admin read/delete. Admin is the SAME
  data-driven `/users/{uid}.role == "admin"` check `firestore.rules` uses,
  resolved via the cross-service `firestore.get()` (no hardcoded uid); pinned
  by `tests/rules/storage-rules.test.ts`.

### Admin inbox — closed issues drop out

The report doc records the GitHub `issueNumber` when the function opens the issue, but
nothing mirrors a later **closure** back into Firestore. So `/admin`'s bug inbox asks
GitHub which issues are closed and **hides those reports** (owner ruling: a closed
report doesn't render at all). It's an admin-only surface, so it uses an
**unauthenticated** read of the public issues API (`src/lib/github-issue-state.ts` —
`GET /repos/{GITHUB_REPO}/issues?state=closed` against the shared client repo
constant, overridable via `VITE_GITHUB_REPO`, cached in-memory for the session); no
GitHub token ever ships in the client bundle. It
**degrades gracefully**: any failure (offline, rate-limit) resolves to "unknown" and
the inbox shows every report behind a quiet note rather than hiding what it can't
verify. Stranded `error` reports (no issue number) always show.

> ⚠️ The anonymous read only succeeds while the repo is **PUBLIC**. `salvodicara/d20-folio`
> is currently **private**, so the lookup returns 404 → "unknown" → the inbox shows all
> reports (including closed) behind the note. The filter activates automatically the
> moment the repo is public; the only token-free alternative is a webhook Cloud Function
> mirroring issue state into Firestore (heavier, not built).

---

## Owner setup runbook

> One-time. You need `firebase-tools` (already installed for deploys). A Java
> runtime — only needed to run the emulator/rules tests locally — is auto-managed
> via asdf (see `.tool-versions` at the repo root); no manual install needed.

### 1. Create a fine-grained GitHub PAT

GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained
tokens → Generate new token**:

- **Resource owner:** `salvodicara`
- **Repository access:** _Only select repositories_ → **`salvodicara/d20-folio`**
- **Permissions → Repository permissions → Issues:** **Read and write**
  (everything else: _No access_)
- **Expiration:** your call (set a calendar reminder to rotate).

Copy the token (`github_pat_…`). It is scoped to issues on the one repo — the
least privilege the function needs.

### 2. Set the Function secrets

From the repo root (these prompt for the value and store it in Secret Manager):

```bash
# OWN-37 — GitHub
firebase functions:secrets:set GITHUB_TOKEN     # paste the PAT
firebase functions:secrets:set GITHUB_REPO      # "owner/repo" issue target, e.g. salvodicara/d20-folio
                                                # (or leave unset → DEFAULT_REPO in functions/src/issue-format.ts)

# OWN-38 — mail (Gmail SMTP by default)
firebase functions:secrets:set MAIL_HOST        # smtp.gmail.com   (default if unset)
firebase functions:secrets:set MAIL_USER        # the owner's Gmail address
firebase functions:secrets:set MAIL_PASS        # the App Password from step 3 (NOT your login password)
firebase functions:secrets:set MAIL_FROM        # the sending address (or "d20 Folio <…>")
firebase functions:secrets:set OWNER_EMAIL      # where new-signup notifications go
```

`GITHUB_REPO` defaults to `salvodicara/d20-folio` and `MAIL_HOST` to
`smtp.gmail.com` if you skip them; `OWNER_EMAIL` has NO default — the signup
email is skipped (with a loud error log) until the secret is set.

> **Retargeting the issue tracker** touches TWO configs that must agree: the
> function's `GITHUB_REPO` secret (where issues are FILED — no redeploy needed,
> new value picked up on the next function instance) and the client's
> `VITE_GITHUB_REPO` build var (where the admin inbox READS closed-issue state —
> `src/lib/github-issue-state.ts`, same `"owner/repo"` format, same default).
> Leave both unset for the production tracker.

### 3. Create a Gmail App Password (for SMTP)

Gmail SMTP rejects your normal password. With 2-Step Verification ON, go to
**Google Account → Security → 2-Step Verification → App passwords**, create one
named "d20 Folio", and use the 16-character value as `MAIL_PASS`.

(Prefer a transactional provider? Set `MAIL_HOST`/`MAIL_USER`/`MAIL_PASS` to that
provider's SMTP instead — the transport is provider-agnostic.)

### 4. Deploy

```bash
# The functions package uses npm (standalone — NOT part of the pnpm workspace).
# Its install + lint + build run automatically via the firebase.json predeploy
# hook (`npm --prefix functions ci/run lint/run build`), so just deploy:
firebase deploy --only functions,firestore:rules,storage
```

The `functions` predeploy in `firebase.json` already runs `npm ci` + lint + build,
so a plain `firebase deploy --only functions` works once `functions/package-lock.json`
is committed.

### 5. Test via the emulator

```bash
# Build + start the functions emulator (and Firestore/Storage):
npm --prefix functions run build
firebase emulators:start --only functions,firestore,storage,auth
```

- Trigger **OWN-37**: write a doc to `bug_reports/{id}` in the Emulator UI
  (http://localhost:4000) with `status:"new"`, a `title`, `type`, `screen`,
  `severity`, `reporterUid`. With real secrets piped in (`firebase emulators:exec`
  - `--import`/env), the function opens a real issue; without them it logs an
    error and sets `status:"error"` (safe).
- Trigger **OWN-38**: create a `users/{uid}` doc — the function attempts the
  email and logs the result.

> Secrets are **not** available in the emulator by default. To exercise the live
> paths locally, export them as env vars for the emulator process, e.g.
> `GITHUB_TOKEN=… firebase emulators:exec --only functions "<your test>"`. The
> pure formatters (`issue-format.ts`, `signup-email.ts`) are unit-tested without
> any secret: `npm --prefix functions test`.

---

## SAFE-01 — billing kill-switch (the zero-budget hard guarantee)

> **Ops card — the whole lifecycle, day to day.**
>
> - **Setup (once):** `just safe-arm`. You're protected from then on — nothing else to
>   do or remember. Re-running is always safe.
> - **No disarm needed** — it sits inert until actual spend crosses the £1 budget.
> - **Check anytime:** `just safe-status` → `ARMED` / `NOT ARMED` / `FIRED`.
> - **If it fires** (budget alert email / paid features freeze): run `just safe-restore`
>   — it defuses first, re-attaches billing, and prints the next step. Re-arm with
>   `just safe-arm`, preferably once the new billing month starts.
> - **Preview only:** `just safe-arm-dry` — shows every command, touches nothing.

The £1 Cloud Billing budget is an ALERT by default — it emails, it never stops spend.
SAFE-01 turns it into a hard cap using Google's documented ["disable Cloud Billing to
stop usage"](https://docs.cloud.google.com/billing/docs/how-to/disable-billing-with-notifications)
pattern: the budget publishes a JSON notification to a Pub/Sub topic; a Cloud Function
reads it and, when ACTUAL cost exceeds the budget, **detaches the billing account from
the project** via the Cloud Billing API (`updateProjectBillingInfo` with an empty
`billingAccountName`). With no billing account, all billable usage stops — spend
cannot run past the cap.

> ⚠️ **This is a blunt instrument.** Detaching billing does NOT throttle — it SHUTS THE
> PROJECT DOWN (see [What breaks](#what-breaks-while-billing-is-detached)). It is the
> deliberate zero-budget guarantee: the app going dark is strictly preferable to an
> unbounded bill. Restoring service is a manual owner action
> ([After an emergency](#after-an-emergency--one-command)).

### How it works

```
┌────────────────────┐  cost crosses a threshold   ┌──────────────────────────┐
│ Cloud Billing      │ ──────────────────────────▶ │ Pub/Sub topic            │
│ £1 budget (alert)  │   JSON: costAmount,          │ budget-kill              │
│  + Pub/Sub linked  │        budgetAmount, …       └───────────┬──────────────┘
└────────────────────┘                                          │ onMessagePublished
                                                                ▼
                                     ┌───────────────────────────────────────────┐
                                     │ onBudgetAlert (Functions v2, SAFE-01)      │
                                     │  • decideBudgetKill: costAmount>budgetAmount?│
                                     │  • idempotent: already detached ⇒ no-op     │
                                     │  • detach: updateProjectBillingInfo("")     │
                                     └───────────────────────────────────────────┘
                                                                │ billingAccountName:""
                                                                ▼
                                        Billing account DETACHED → all usage stops
```

The DECISION is a pure, unit-tested function (`functions/src/budget-kill.ts` —
`parseBudgetNotification` + `decideBudgetKill`); the trigger (`onBudgetAlert` in
`functions/src/index.ts`) does only the IO. Guard rails:

- **Actual overrun only.** Fires on `costAmount > budgetAmount`. A FORECAST alert still
  carries the real `costAmount`, so a forecast trip (cost still under budget) is a
  no-op — the switch never trips on a prediction, only on money actually spent.
- **Idempotent.** Reads the project's current billing state first; if billing is
  already detached it logs and returns — a re-published alert can't error-loop.
- **Loud.** Logs at ERROR around the detach so it's unmissable in Cloud Logging.

### Owner setup — one command

The whole one-time setup is wrapped in **`just safe-arm`** (backed by
`scripts/safe-01.sh` — the justfile recipes are thin wrappers). It is **idempotent**:
every step is check-then-act, so re-running is always a no-op on anything already in
place. Run it once from the repo root:

```bash
just safe-arm
```

It resolves the project's billing account and runtime service account, then, in order:

1. **Enables the required APIs** — `cloudbilling`, `billingbudgets`, `pubsub`.
2. **Creates the `budget-kill` Pub/Sub topic** if absent (the name is hard-coded in
   `onBudgetAlert`; the script keeps it exact).
3. **Creates (or verifies) the £1 budget wired to the topic** — `gcloud billing budgets
create/update` with `--notifications-rule-pubsub-topic`, scoped to the project, in the
   billing account's currency (GBP for this account). The old manual "Console → Manage
   notifications" step is gone: the CLI wires the Pub/Sub notification directly.
4. **Grants the detach role to the runtime SA** — see
   [IAM](#iam--the-least-privilege-detach-grant) below.
5. **Deploys `onBudgetAlert`** — `firebase deploy --only functions:onBudgetAlert`; the
   `firebase.json` predeploy runs `npm ci` + lint + build inside `functions/`.

It caches the billing-account id to an untracked `.safe-01-billing-account` file so
`just safe-restore` can re-link without asking, and prints a final **ARMED** summary.
To preview every command without touching the project (no gcloud needed):

```bash
just safe-arm-dry            # SAFE01_DRY_RUN=1 — prints each command instead of running it
```

Check the whole switch at any time (read-only):

```bash
just safe-status             # → ARMED / NOT ARMED / FIRED, piece by piece
```

> These recipes touch billing + IAM, so the **owner** runs them (same discipline as
> admin-role granting, `CLAUDE.md`) — never a deploy pipeline, never an agent. The
> script only automates the exact commands the owner would otherwise type by hand; the
> manual console equivalents are kept in the [appendix](#appendix--the-manual-console-equivalents)
> for when the CLI is unavailable.

### IAM — the least-privilege detach grant

The detach call is `updateProjectBillingInfo(name=projects/d20-folio,
billingAccountName="")` — a **project-side** operation. It needs
`resourcemanager.projects.deleteBillingAssignment` on the **project**, which the
**Project Billing Manager** role (`roles/billing.projectManager`) grants. `safe-arm`
grants exactly that, on the **project**:

```bash
gcloud projects add-iam-policy-binding d20-folio \
  --member="serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/billing.projectManager" --condition=None
```

This is deliberately **narrower** than the older "Billing Account Administrator on the
billing account" advice. Project Billing Manager on the project lets the SA **detach**
billing but **not re-link** it — re-linking additionally needs
`billing.resourceAssociations.create` on the **billing account**, which this grant does
NOT include. So the kill-switch can shut spend off but can never turn it back on; only
the owner (via `just safe-restore`) can re-attach. Least privilege for a kill-switch.

The runtime SA is the 2nd-gen default Compute Engine SA,
`PROJECT_NUMBER-compute@developer.gserviceaccount.com` (the project number is what
`safe-arm` resolves). Note the default Compute SA holds Editor, which does **not** carry
billing-assignment permissions — the explicit grant above is what makes the detach
possible, and removing it is exactly how `safe-restore` defuses the switch.

### What breaks while billing is detached

Per current Google docs, detaching billing **terminates all billable services in the
project — including Free Tier usage**. Concretely for d20 Folio:

- **Cloud Functions** stop — including `onBudgetAlert` itself (so it cannot re-detach;
  it doesn't need to), the bug-report and signup-email triggers, and `deleteUser`.
- **Firebase Hosting** — a custom domain / paid-tier serving stops; a Spark-style
  static serve may linger briefly, but treat the app as **down**.
- **Cloud Firestore / Storage** reads and writes fail — the live app can't sync.
- **Artifact Registry, Secret Manager, Pub/Sub** — all suspended.

In short: the deployed app goes **dark**. That is the intended trade — a dark app beats
an unbounded bill. Recovery is manual and immediate once you re-attach billing.

### After an emergency — one command

The switch fired and billing is detached (`just safe-status` prints **FIRED**).
Recovery is **`just safe-restore`**. Do ONE thing by hand first, then run it:

- **Ban the abusive users FIRST.** d20 Folio has a blocked-users mechanism: a user doc
  with `status: "blocked"` is denied by `firestore.rules` / `storage.rules` (the
  `isNotBlocked()` check — see `firestore.rules`), and the owner blocks accounts from
  **`/admin`** (the signup email deep-links there). Block the offending UID(s) so they're
  already denied the moment billing returns. If `/admin` is unreachable (functions down),
  set `status: "blocked"` on the `/users/{uid}` doc directly in the Firestore console.
  Find WHO via **Billing → Reports** (by service) + **Cloud Logging** once you're back in.

Then:

```bash
just safe-restore
```

It runs the recovery in the **SAFE order** — defuse before re-attach — because
month-to-date cost stays above £1 for the rest of the calendar month, so a naive
re-attach would let the budget re-fire and re-detach within minutes:

1. **DEFUSE FIRST.** Removes the `roles/billing.projectManager` grant from the runtime
   SA. This neutralises the **only** dangerous action — the detach — while leaving the
   topic, budget, function, and subscription fully intact. It's a single idempotent IAM
   call with no fragile resource-name discovery, and because v2 event functions don't
   retry by default, a post-reattach budget alert now produces exactly one harmless
   `PERMISSION_DENIED` log instead of a re-detach. (Reversible: re-arming re-grants it.)
2. **Re-links billing** — `gcloud billing projects link` with the id cached by `safe-arm`
   (or prompts for it; `gcloud billing accounts list` shows it).
3. **Re-enables the core APIs** a detach can disable (functions, run, firestore, storage,
   billing, budgets, pubsub) and verifies billing shows enabled.
4. **RE-ARM, gated.** It **warns** that re-granting the detach role while cost is still
   over £1 will re-fire, then asks. Answer **no** to leave the switch DEFUSED (billing
   up, detach disabled) and re-arm later with `just safe-arm` once cost is under budget or
   the month rolled over; answer **yes** only when the abuse is fixed and cost is back
   under budget.

`safe-restore` is **safe to run when nothing fired** — it detects attached billing,
says so, and exits without changing anything. Preview it with
`SAFE01_DRY_RUN=1 scripts/safe-01.sh restore`. After recovery, `firebase deploy --only
functions` if any function is missing, then `just safe-status` to confirm the cap stands.

### Testing the kill-switch

The decision logic is unit-tested with zero cloud calls
(`functions/src/budget-kill.test.ts`): `npm --prefix functions test`. To exercise the
wired trigger without spending real money, publish a synthetic over-budget message to
the topic (this WILL detach billing if the SA has the role — do it knowingly, then
re-attach per the restore path):

```bash
gcloud pubsub topics publish budget-kill --project=d20-folio \
  --message='{"budgetDisplayName":"d20-folio £1 cap","costAmount":9.99,"budgetAmount":1,"currencyCode":"GBP"}'
```

A safer dry run: temporarily comment the `updateProjectBillingInfo` call (or check
Cloud Logging shows the `DETACHING billing` ERROR line) to confirm the decision path
fires, without actually detaching. An under-budget message
(`"costAmount":0.5,"budgetAmount":1`) must log "no action".

For the plumbing (topic · budget · IAM · function) rather than the decision, run
`just safe-status` — it prints ARMED / NOT ARMED / FIRED and the state of each piece
without changing anything. The script's own dry-run command plan is smoke-tested in
`tests/unit/safe-01-script.test.ts` (no gcloud required).

### Appendix — the manual console equivalents

`just safe-arm` / `safe-status` / `safe-restore` just automate the commands below; run
these by hand only if the CLI is unavailable. Substitute `BILLING_ACCOUNT_ID`
(`XXXXXX-XXXXXX-XXXXXX`, from **Billing → Account management**) and `PROJECT_NUMBER`
(`gcloud projects describe d20-folio --format='value(projectNumber)'`).

```bash
# 1. APIs
gcloud services enable cloudbilling.googleapis.com billingbudgets.googleapis.com \
  pubsub.googleapis.com --project=d20-folio
# 2. Topic (name is hard-coded in onBudgetAlert — keep it exact)
gcloud pubsub topics create budget-kill --project=d20-folio
# 3. £1 budget, scoped to the project, wired to the topic
gcloud billing budgets create --billing-account=BILLING_ACCOUNT_ID \
  --display-name="d20-folio £1 cap" --budget-amount=1 \
  --filter-projects="projects/PROJECT_NUMBER" \
  --notifications-rule-pubsub-topic="projects/d20-folio/topics/budget-kill"
# 4. Detach grant (project-scoped Project Billing Manager — detach-only, cannot re-link)
gcloud projects add-iam-policy-binding d20-folio \
  --member="serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/billing.projectManager" --condition=None
# 5. Deploy
firebase deploy --only functions:onBudgetAlert --project d20-folio
```

Restore, by hand, in the SAFE order (defuse → re-link → re-enable → re-arm):

```bash
# DEFUSE first — drop the detach grant so re-attach can't instantly re-fire
gcloud projects remove-iam-policy-binding d20-folio \
  --member="serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/billing.projectManager" --condition=None
# Re-link billing
gcloud billing projects link d20-folio --billing-account=BILLING_ACCOUNT_ID
# Re-enable APIs a detach can disable
gcloud services enable cloudfunctions.googleapis.com run.googleapis.com \
  firestore.googleapis.com firebasestorage.googleapis.com \
  cloudbilling.googleapis.com billingbudgets.googleapis.com pubsub.googleapis.com \
  --project=d20-folio
# RE-ARM only once cost is back under budget (re-run step 4 above)
```

Console equivalents: the budget's Pub/Sub notification lives under **Billing → Budgets &
alerts → (budget) → Edit → Manage notifications**; re-linking billing is **Billing → My
projects → d20-folio → Actions (⋮) → Change billing**.

---

## Cost (free-tier envelope)

- **Invocations:** the reporter / signup triggers fire only on a new report / new user,
  and the kill-switch only on a budget threshold crossing — a handful per day at most.
  The Functions free tier (2M invocations/mo, 400K GB-s) is not remotely approached.
- **Artifact Registry:** 2nd-gen functions store a build image (~a few pennies/mo
  of storage — the only non-zero line). Pruning old images keeps it negligible.
- **Storage:** screenshots are downscaled PNGs (tens of KB); the 5 GB free tier
  holds tens of thousands.
- **Secret Manager:** the handful of secrets sit well within the free tier.

Net: effectively free at this volume, with the only measurable cost being a few
pennies/month of Artifact Registry image storage — well within the £1 budget, which
SAFE-01 now enforces as a hard cap (not just an alert).
