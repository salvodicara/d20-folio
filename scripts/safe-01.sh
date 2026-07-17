#!/usr/bin/env bash
#
# safe-01.sh — the SAFE-01 billing kill-switch lifecycle, one script, three verbs.
#
#   arm      one-shot idempotent setup: APIs · topic · £1 budget wired to the
#            topic · the detach IAM grant · deploy onBudgetAlert. Re-running is
#            always a no-op on anything already in place.
#   status   read-only: prints ARMED / NOT ARMED / FIRED and the state of each piece.
#   restore  post-fire recovery in the SAFE order: DEFUSE (drop the detach grant so
#            re-attach can't instantly re-fire) → re-link billing → re-enable APIs →
#            re-arm (gated). Safe to run when nothing fired.
#
# The owner runs these (they touch billing + IAM). Everything is check-then-act, so
# a re-run never errors or duplicates. Preview without touching anything:
#   SAFE01_DRY_RUN=1 scripts/safe-01.sh arm     (or: just safe-arm-dry)
# In dry-run every MUTATING command is printed instead of run; read-only lookups
# return placeholders so the preview needs no gcloud at all.
#
# The DETACH capability is the project-scoped role roles/billing.projectManager on
# the function's runtime service account: it lets the function DETACH billing but NOT
# re-link it (re-linking needs a billing-account-side grant the SA never holds) — the
# least privilege for a kill-switch. Full rationale: docs/BUG_REPORTING.md § SAFE-01.
set -euo pipefail

# ── Constants (match the deployed function + the project) ─────────────────────
PROJECT_ID="d20-folio"
REGION="europe-west1"
TOPIC="budget-kill"                          # hard-coded in onBudgetAlert — keep exact
FUNCTION="onBudgetAlert"
BUDGET_NAME="d20-folio £1 cap"
BUDGET_AMOUNT="1"                            # £1 — inherits the billing account currency (this account is GBP)
DETACH_ROLE="roles/billing.projectManager"  # project-scoped: DETACH-only, can never re-link

DRY="${SAFE01_DRY_RUN:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BILLING_CACHE="$REPO_ROOT/.safe-01-billing-account"  # untracked; written at arm, read at restore

# ── Output helpers ────────────────────────────────────────────────────────────
step() { printf '\n→ %s\n' "$*"; }
ok()   { printf '  ✓ %s\n' "$*"; }
act()  { printf '  → %s\n' "$*"; }
warn() { printf '  ⚠ %s\n' "$*"; }
die()  { printf '✗ %s\n' "$*" >&2; exit 1; }

# Run a state-changing command — or just print it, in dry-run.
mutate() {
  if [[ -n "$DRY" ]]; then
    printf '  DRY  %s\n' "$*"
    return 0
  fi
  "$@"
}

# Run a read-only lookup and echo its value. In dry-run, print the query and echo a
# placeholder (so a preview needs no gcloud). $1 = dry-run placeholder; rest = command.
query() {
  local placeholder="$1"; shift
  if [[ -n "$DRY" ]]; then
    printf '  DRY? %s\n' "$*" >&2
    printf '%s' "$placeholder"
    return 0
  fi
  "$@" 2>/dev/null || true
}

# ── Preflight — CLIs present + authed ─────────────────────────────────────────
preflight() {
  step "checking CLIs + auth…"
  local missing=0
  if command -v gcloud >/dev/null 2>&1; then ok "gcloud present"; else
    warn "gcloud NOT found — install: https://cloud.google.com/sdk/docs/install  then: gcloud auth login"
    missing=1
  fi
  if command -v firebase >/dev/null 2>&1; then ok "firebase present"; else
    warn "firebase NOT found — install: npm i -g firebase-tools  then: firebase login"
    missing=1
  fi
  if [[ "$missing" == 1 ]]; then
    if [[ -n "$DRY" ]]; then warn "dry-run: continuing without CLIs (command preview only)"; return 0; fi
    die "install the missing CLI(s) above, then re-run."
  fi
  if [[ -n "$DRY" ]]; then return 0; fi
  local acct; acct="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null || true)"
  [[ -n "$acct" ]] || die "gcloud not authed. Run: gcloud auth login && gcloud config set project $PROJECT_ID"
  ok "gcloud authed as $acct"
  firebase login:list 2>/dev/null | grep -q '@' || die "firebase not authed. Run: firebase login"
  ok "firebase authed"
}

# ── Resolvers ─────────────────────────────────────────────────────────────────
resolve_project_number() {
  query "000000000000" gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)'
}
resolve_billing_id() {  # bare XXXXXX-XXXXXX-XXXXXX, or empty when detached
  local name; name="$(query "billingAccounts/0X0X0X-0X0X0X-0X0X0X" \
    gcloud billing projects describe "$PROJECT_ID" --format='value(billingAccountName)')"
  printf '%s' "${name#billingAccounts/}"
}
billing_enabled() {  # "true" / "false" — gcloud prints "True"/"False"; normalize so every == "true" site works
  query "true" gcloud billing projects describe "$PROJECT_ID" --format='value(billingEnabled)' | tr '[:upper:]' '[:lower:]'
}
sa_email() { printf '%s-compute@developer.gserviceaccount.com' "$1"; }

iam_bound() {  # 0 if $sa holds $DETACH_ROLE on the project
  local sa="$1"
  [[ -n "$DRY" ]] && return 1
  gcloud projects get-iam-policy "$PROJECT_ID" --flatten='bindings[].members' \
    --filter="bindings.role=$DETACH_ROLE AND bindings.members=serviceAccount:$sa" \
    --format='value(bindings.role)' 2>/dev/null | grep -q .
}

# ── arm ───────────────────────────────────────────────────────────────────────
cmd_arm() {
  step "SAFE-01 ARM — the £1 billing kill-switch (idempotent)"
  preflight

  step "resolving project + billing account…"
  local pnum bid sa
  pnum="$(resolve_project_number)"
  bid="$(resolve_billing_id)"
  if [[ -z "$bid" ]]; then
    [[ -n "$DRY" ]] && bid="0X0X0X-0X0X0X-0X0X0X" \
      || die "no billing account attached to $PROJECT_ID. Attach one (Console → Billing), or run 'just safe-restore' if the switch FIRED."
  fi
  sa="$(sa_email "$pnum")"
  ok "project number     $pnum"
  ok "billing account    $bid"
  ok "runtime service acct $sa"
  if [[ -z "$DRY" ]]; then printf '%s\n' "$bid" > "$BILLING_CACHE"; ok "cached billing id → $BILLING_CACHE"; fi

  step "enabling required APIs (idempotent)…"
  local api
  for api in cloudbilling.googleapis.com billingbudgets.googleapis.com pubsub.googleapis.com; do
    mutate gcloud services enable "$api" --project="$PROJECT_ID"
    ok "$api"
  done

  step "Pub/Sub topic '$TOPIC'…"
  if [[ -z "$DRY" ]] && gcloud pubsub topics describe "$TOPIC" --project="$PROJECT_ID" >/dev/null 2>&1; then
    ok "topic already exists"
  else
    mutate gcloud pubsub topics create "$TOPIC" --project="$PROJECT_ID"
    ok "topic ready"
  fi

  step "£1 budget wired to '$TOPIC'…"
  local topic_path="projects/$PROJECT_ID/topics/$TOPIC" existing
  existing="$(query "" gcloud billing budgets list --billing-account="$bid" \
    --filter="displayName='$BUDGET_NAME'" --format='value(name)')"
  if [[ -n "$existing" ]]; then
    ok "budget exists ($existing)"
    act "ensuring amount=£$BUDGET_AMOUNT + Pub/Sub notification wired…"
    mutate gcloud billing budgets update "$existing" --billing-account="$bid" \
      --budget-amount="$BUDGET_AMOUNT" \
      --notifications-rule-pubsub-topic="$topic_path"
    ok "budget verified + notification wired"
  else
    act "creating £$BUDGET_AMOUNT budget scoped to ${PROJECT_ID}…"
    mutate gcloud billing budgets create --billing-account="$bid" \
      --display-name="$BUDGET_NAME" \
      --budget-amount="$BUDGET_AMOUNT" \
      --filter-projects="projects/$pnum" \
      --notifications-rule-pubsub-topic="$topic_path"
    ok "budget created + notification wired"
  fi

  step "IAM — grant $DETACH_ROLE to the runtime SA (detach-only; cannot re-link)…"
  if iam_bound "$sa"; then
    ok "binding already present"
  else
    mutate gcloud projects add-iam-policy-binding "$PROJECT_ID" \
      --member="serviceAccount:$sa" --role="$DETACH_ROLE" --condition=None
    ok "binding granted"
  fi

  step "deploying $FUNCTION (firebase runs the npm predeploy inside functions/)…"
  ( cd "$REPO_ROOT" && mutate firebase deploy --only "functions:$FUNCTION" --project "$PROJECT_ID" )
  ok "function deployed"

  printf '\n'
  step "ARMED — the £1 kill-switch is live."
  printf '    billing account : %s (cached)\n' "$bid"
  printf '    topic           : %s\n' "$topic_path"
  printf '    budget          : £%s → publishes to the topic\n' "$BUDGET_AMOUNT"
  printf '    function        : %s (%s)\n' "$FUNCTION" "$REGION"
  printf '    detach grant    : %s on %s\n' "$DETACH_ROLE" "$sa"
  printf '    verify anytime  : just safe-status\n'
}

# ── status ────────────────────────────────────────────────────────────────────
cmd_status() {
  step "SAFE-01 STATUS"
  preflight

  local pnum bid enabled sa
  pnum="$(resolve_project_number)"
  bid="$(resolve_billing_id)"
  enabled="$(billing_enabled)"
  sa="$(sa_email "$pnum")"
  [[ -z "$bid" && -f "$BILLING_CACHE" ]] && bid="$(tr -d '[:space:]' < "$BILLING_CACHE")"

  step "state…"
  local billing_ok=0 topic_ok=0 budget_ok=0 iam_ok=0 fn_ok=0
  if [[ "$enabled" == "true" ]]; then billing_ok=1; ok "billing ATTACHED ($bid)"; else warn "billing DETACHED — the switch FIRED (or was never attached)"; fi

  if [[ -z "$DRY" ]] && gcloud pubsub topics describe "$TOPIC" --project="$PROJECT_ID" >/dev/null 2>&1; then
    topic_ok=1; ok "topic '$TOPIC' exists"
  else warn "topic '$TOPIC' missing"; fi

  if [[ -n "$bid" ]]; then
    local bname
    bname="$(query "" gcloud billing budgets list --billing-account="$bid" \
      --filter="displayName='$BUDGET_NAME'" --format='value(name)')"
    if [[ -n "$bname" ]]; then
      budget_ok=1
      local amt; amt="$(query "$BUDGET_AMOUNT" gcloud billing budgets describe "$bname" \
        --billing-account="$bid" --format='value(amount.specifiedAmount.units)')"
      ok "budget '$BUDGET_NAME' present (≈£${amt:-?})"
    else warn "budget '$BUDGET_NAME' not found"; fi
  else warn "no billing account id — cannot read the budget"; fi

  if iam_bound "$sa"; then iam_ok=1; ok "detach grant present ($DETACH_ROLE on $sa)"; else warn "detach grant MISSING on $sa"; fi

  local fn_state
  fn_state="$(query "ACTIVE" gcloud functions describe "$FUNCTION" --region="$REGION" --gen2 \
    --project="$PROJECT_ID" --format='value(state)')"
  if [[ -n "$fn_state" ]]; then fn_ok=1; ok "function $FUNCTION: $fn_state"; else warn "function $FUNCTION not deployed"; fi

  local lastfire
  lastfire="$(query "" gcloud logging read \
    "resource.labels.function_name=$FUNCTION AND textPayload:DETACHING" \
    --project="$PROJECT_ID" --limit=1 --format='value(timestamp)')"
  [[ -n "$lastfire" ]] && warn "a DETACH was logged at $lastfire" || ok "no detach event in recent logs"

  step "verdict:"
  if [[ "$billing_ok" == 0 ]]; then
    printf '  ✗ FIRED — billing is detached. Recover with: just safe-restore\n'
  elif [[ "$topic_ok" == 1 && "$budget_ok" == 1 && "$iam_ok" == 1 && "$fn_ok" == 1 ]]; then
    printf '  ✓ ARMED — every piece is in place.\n'
  else
    printf '  ⚠ NOT ARMED — a piece above is missing. Arm with: just safe-arm\n'
  fi
}

# ── restore ───────────────────────────────────────────────────────────────────
cmd_restore() {
  step "SAFE-01 RESTORE — post-fire recovery"
  preflight

  local pnum sa enabled
  pnum="$(resolve_project_number)"
  sa="$(sa_email "$pnum")"
  enabled="$(billing_enabled)"

  if [[ "$enabled" == "true" && -z "$DRY" ]]; then
    ok "billing is ATTACHED — nothing fired, nothing to restore."
    printf '    (check the whole switch with: just safe-status)\n'
    return 0
  fi
  warn "billing is DETACHED — the kill-switch FIRED. Running the SAFE restore."
  warn "FIRST ban the abusive UID in /admin (or set status:\"blocked\" on their /users doc) before re-arming."

  # 1. DEFUSE — drop the detach grant so a still-over-budget month can't instantly re-fire.
  step "DEFUSE — removing $DETACH_ROLE from $sa (neutralises the detach; topic/budget/function untouched)…"
  mutate gcloud projects remove-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$sa" --role="$DETACH_ROLE" --condition=None || true
  ok "detach capability removed — the function can no longer stop billing"

  # 2. Resolve the billing account id (cache first, then prompt).
  local bid=""
  [[ -f "$BILLING_CACHE" ]] && bid="$(tr -d '[:space:]' < "$BILLING_CACHE")"
  if [[ -z "$bid" ]]; then
    if [[ -n "$DRY" ]]; then bid="0X0X0X-0X0X0X-0X0X0X"; else
      read -r -p "  billing account id (XXXXXX-XXXXXX-XXXXXX — 'gcloud billing accounts list'): " bid
    fi
  fi
  [[ -n "$bid" ]] || die "no billing account id. Find it: gcloud billing accounts list"
  ok "billing account $bid"

  # 3. RE-LINK billing.
  step "re-linking billing to bring the project back…"
  mutate gcloud billing projects link "$PROJECT_ID" --billing-account="$bid"
  ok "billing re-linked"

  # 4. Re-enable APIs a detach can disable, then verify.
  step "re-enabling core APIs (a detach can disable them)…"
  mutate gcloud services enable \
    cloudfunctions.googleapis.com run.googleapis.com \
    firestore.googleapis.com firebasestorage.googleapis.com \
    cloudbilling.googleapis.com billingbudgets.googleapis.com pubsub.googleapis.com \
    --project="$PROJECT_ID"
  ok "APIs re-enabled"
  local nowon; nowon="$(billing_enabled)"
  [[ "$nowon" == "true" || -n "$DRY" ]] && ok "billing verified ENABLED" || warn "billing still shows disabled — check the Console"

  # 5. RE-ARM the defused piece — gated: re-arming while cost is still over budget re-detaches.
  printf '\n'
  warn "Re-arming re-grants the detach role. If month-to-date cost is STILL over £$BUDGET_AMOUNT the budget re-fires and re-detaches within minutes."
  warn "Only re-arm once the abuse is fixed AND cost is under budget (or the month rolled over)."
  local ans="n"
  if [[ -n "$DRY" ]]; then
    act "DRY: would prompt to re-arm; skipping (re-arm later with 'just safe-arm')."
  else
    read -r -p "  Re-arm the kill-switch now? (y/N): " ans
  fi
  if [[ "$ans" == "y" || "$ans" == "Y" ]]; then
    mutate gcloud projects add-iam-policy-binding "$PROJECT_ID" \
      --member="serviceAccount:$sa" --role="$DETACH_ROLE" --condition=None
    ok "RE-ARMED — detach capability restored."
  else
    warn "Left DEFUSED — billing is up, detach disabled. Re-arm later with: just safe-arm"
  fi

  printf '\n'
  step "RESTORE COMPLETE — verify https://d20-folio.web.app, then: just safe-status"
}

# ── Dispatch ──────────────────────────────────────────────────────────────────
usage() {
  cat <<EOF
SAFE-01 billing kill-switch — arm · status · restore

  scripts/safe-01.sh arm       one-shot idempotent setup (APIs · topic · budget · IAM · deploy)
  scripts/safe-01.sh status    read-only — prints ARMED / NOT ARMED / FIRED
  scripts/safe-01.sh restore   post-fire recovery (defuse → re-link → re-enable → re-arm)

Preview any verb without touching the project:
  SAFE01_DRY_RUN=1 scripts/safe-01.sh arm
Runbook: docs/BUG_REPORTING.md § SAFE-01
EOF
}

main() {
  case "${1:-}" in
    arm)               cmd_arm ;;
    status)            cmd_status ;;
    restore)           cmd_restore ;;
    -h|--help|help|"") usage ;;
    *) die "unknown subcommand '${1}' (use: arm | status | restore)" ;;
  esac
}
main "$@"
