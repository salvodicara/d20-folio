# G0 Automation Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a reproducible, reviewable G0 baseline that assigns every frozen causal-branch
path and every current product capability or manual input to an automation-first owner, retained
proof, deletion target, and Tactical Codex handoff without changing production behavior.

**Architecture:** G0 is a documentation-only freeze gate. It inventories evidence from clean
`origin/main` and the read-only causal worktree, records current authority and target disposition,
and proves G0 as one of the two Wave-0 inputs to K1 alongside peer T0; it introduces no runtime,
persistence, presenter, UI, or migration code.

**Tech Stack:** Markdown, Git plumbing, ripgrep, zsh, Prettier, Changesets.

**Spec:** the Program Controller amendment to
`docs/superpowers/plans/2026-08-25-automation-first-wayfinder.md`, based on parent commit
`7590b186f0878ea95c70bf58a5d246efd44366e4` and still arguing from
`docs/plans/2026-08-24-automation-first-product-reset.md` at that commit. The companion
`docs/superpowers/plans/2026-08-25-test-portfolio-reset.md` is amended in the same package only to
ratify O1's creation/advancement proof registry.

## Global Constraints

- Work from the isolated Codex worktree rooted at
  `/Users/salvatoredicara/.codex/worktrees/8b3c/d20-folio`, whose amendment parent is
  `7590b186f0878ea95c70bf58a5d246efd44366e4`; the recorded G0 evidence base remains
  `1ccb8af74b69e8af2f2b8568480ab1e3048c1eac`.
- Read the reset from sibling commit `7590b186f0878ea95c70bf58a5d246efd44366e4` and treat the
  two locally amended Automation/T0 Wayfinders as the Program Controller decision. Sibling
  working-tree dirt is not authority.
- Treat `/Users/salvatoredicara/Workspace/d20-folio-wayfinder-causal-protocol` as immutable evidence.
  Never merge, rebase, clean, reset, checkout, stage, commit, or cherry-pick it.
- Production code, tests, runtime configuration, UI, routes, i18n, Firestore Rules, Functions, and
  persistence are out of scope. No rendering, live call-site switch, migration apply, deploy,
  release, or publication is authorized.
- Repository-owned outputs are exactly this prerequisite child plan, the two named status ledgers,
  `.changeset/automation-g0-readiness.md`, the Automation Wayfinder amendment, and the T0 proof
  registry amendment. Baseline evidence is embedded in the capability ledger; no seventh
  repository artifact is created.
- External evidence lives only under
  `/Users/salvatoredicara/Workspace/Codex/d20-folio-g0-7590b18/`: `causal-disposition.md`,
  `personal-capabilities.md`, `campaign-capabilities.md`, `controller-baseline.md`,
  `causal-fingerprint.zsh`, `g0-plan-review.md`, `g0-plan-rereview.md`,
  `g0-architecture-review.md`, optional `g0-architecture-rereview.md`, `g0-quality-review.md`, and
  optional `g0-quality-rereview.md`. SDD briefs, task reports, ledgers, and review packages live only
  in this child plan's gitignored `.superpowers/sdd/` workspace. None is staged or treated as
  authority.
- Disposition values are exactly `extract`, `rewrite`, `reject`, or
  `superseded-by-current-main`. Every `extract` or `rewrite` row names a future owning slice and an
  exact differential/contract proof; an unowned row blocks K1.
- `ExternalAnswers` may contain only selected targets, table geometry, physical/hidden outcomes, or
  explicit rulings. Never classify knowable costs, legality, DCs, scaling, resources, durations,
  conditions, action economy, or deterministic consequences as external input.
- U1 and O1 remain headless DEV/TEST contracts. Architecture G0 owns no React/DOM rendering or live
  caller. Tactical Codex Tasks 4/7/10/13 create candidates; Task 15 alone owns live visual cutover.
- H1 typed/versioned Homebrew and A2 planner/chronicle/calendar records remain explicit DAG nodes.
- The absent private `content-pack/fixtures/team` payloads must be recorded as unavailable, never
  reconstructed or replaced with public stand-ins. Their six-fixture protocol remains a later
  migration gate.
- G0 and T0 are independent Wave-0 peers and may run in parallel; neither opens the other. This task
  stops after the reviewed G0 inventory and identifies unfinished T0 as the next independent node.
  The Program Controller amendment assigns `CRE-008` to the expanded O1 domain, so the inventory
  has zero unassigned capabilities; K1 still waits for reviewed G0 and approved T0.

---

### Task 1: Publish the G0 Baseline and Disposition Ledgers

**Files:**

- Create: `docs/superpowers/status/2026-08-25-causal-branch-disposition.md`
- Create: `docs/superpowers/status/2026-08-25-automation-capability-ledger.md`
- Create: `.changeset/automation-g0-readiness.md`
- Include in commit: `docs/superpowers/plans/2026-08-25-g0-automation-readiness.md`
- Modify: `docs/superpowers/plans/2026-08-25-automation-first-wayfinder.md`
- Modify: `docs/superpowers/plans/2026-08-25-test-portfolio-reset.md`

**Interfaces:**

- Consumes: the Program Controller amendment on parent `7590b18`, the reset at that commit, the
  current public evidence base, the frozen causal branch/worktree, and the amended T0 proof
  registry in `docs/superpowers/plans/2026-08-25-test-portfolio-reset.md`.
- Produces: one causal disposition row per unique changed path; one capability row per distinct
  current action/manual-input contract; reproducible schema/fixture/test/deployed-evidence baseline;
  explicit G0/T0/K1 dependency status; and owner-reviewed extraction gates.
- Does not produce: a public runtime contract, `resolveCommand`, a test taxonomy, a migration,
  persistence schema, UI presenter, renderer, live caller, or deploy artifact.

- [ ] **Step 1: Reconfirm the isolated clean base and stable authority**

Run:

```bash
git status --short --branch
git rev-parse HEAD
git -C /Users/salvatoredicara/Workspace/d20-folio-automation-first-reset \
  show --no-patch --format='%H %s' 7590b18
shasum -a 256 \
  docs/superpowers/plans/2026-08-25-automation-first-wayfinder.md
git -C /Users/salvatoredicara/Workspace/d20-folio-automation-first-reset \
  show 7590b18:docs/plans/2026-08-24-automation-first-product-reset.md \
  | shasum -a 256
shasum -a 256 \
  docs/superpowers/plans/2026-08-25-test-portfolio-reset.md
```

Expected: `HEAD` is the authority parent
`7590b186f0878ea95c70bf58a5d246efd44366e4`; only the exact six-file amendment allowlist is touched.
Record the parent commit and amended Wayfinder/T0 plus unchanged reset content hashes in both
ledgers and the ignored task report.

- [ ] **Step 2: Fingerprint the frozen causal evidence before inventory**

Inspect the external fingerprint script and confirm that it contains `set -euo pipefail`, uses
`rel_file` rather than zsh's special `path` parameter, records the untracked-file count, and hashes
sorted base64-path/content-digest records. Run exactly:

```bash
zsh /Users/salvatoredicara/Workspace/Codex/d20-folio-g0-7590b18/causal-fingerprint.zsh
```

Expected: causal `HEAD` is
`09f3f69d1550820e1bfbf161e946c787d704b9a9`, `UNTRACKED_COUNT` is `2`, and the status, diff, and
untracked-manifest values are 64-character SHA-256 values. Copy the complete five-line output into
the task report and both ledgers. Step 10 invokes the same script, not a retyped pipeline.

- [ ] **Step 3: Build the exhaustive causal path set**

Run:

```bash
CAUSAL_WT=/Users/salvatoredicara/Workspace/d20-folio-wayfinder-causal-protocol
git -C "$CAUSAL_WT" diff --name-status --find-renames \
  1ccb8af74b69e8af2f2b8568480ab1e3048c1eac \
  09f3f69d1550820e1bfbf161e946c787d704b9a9
git -C "$CAUSAL_WT" diff --name-status --find-renames HEAD
git -C "$CAUSAL_WT" ls-files --others --exclude-standard
```

Normalize every unique affected path from the committed, tracked-dirty, deleted, renamed, and
untracked sets. For an existing file record its commit blob ID and, when dirty, current SHA-256. For
a deleted path record the last available base/branch blob ID and the deletion state. Pin every
comparison to the recorded full SHA; do not use moving `origin/main` again. The direct tree-to-tree
comparison deliberately retains current-main-only paths so they can be classified
`superseded-by-current-main`; a three-dot branch-only comparison would hide them. Do not trust the
Wayfinder's historical path count over the fresh command output.

- [ ] **Step 4: Write the causal-branch disposition ledger**

Create `docs/superpowers/status/2026-08-25-causal-branch-disposition.md` with these sections:

1. purpose, authority commit/hash, clean-main SHA, causal HEAD, and immutable-worktree fingerprints;
2. exact reproduction commands and observed committed/dirty/untracked/unique totals;
3. salvage law: reproduce behavior from a clean base behind one kernel, never copy the dependency
   graph;
4. one Markdown row per unique path using exactly these columns:

```text
Path | Evidence state | Hash evidence | Disposition | Behavior owner | Retained proof | Deletion / non-adoption owner | Accepted behavior | Rejected dependency graph | Owner review | Required gate
```

Use only the four allowed disposition values. For `extract` and `rewrite`, `Behavior owner` is
exactly one of K1, P1, C1, U1, S1, H1, A2, or F1-F6; T0 may appear only in `Retained proof`, and X1
may appear only in `Deletion / non-adoption owner`. `extract` means re-author the smallest behavior
behind the target contract after a failing differential test; it never means copy or cherry-pick.
For `reject` and `superseded-by-current-main`, both `Behavior owner` and `Accepted behavior` are
`none`, while the deletion/non-adoption owner and retained proof remain explicit.

Before architecture review, set `Owner review` to `pending-AR1` for every `extract`/`rewrite` row.
After Step 12, the G0 implementer replaces it with `AR1-approved` or
`AR1-approved-with-condition:<condition-id>` using the row-by-row reviewer verdict. G0 cannot exit
with an unreviewed accepted row or an unresolved condition. End with disposition totals and an
owner-review register grouped by future behavior owner.

- [ ] **Step 5: Verify path coverage mechanically**

Build a fresh sorted source path list from Step 3 and extract the ledger's backticked first-column
paths into a second sorted list:

```bash
CAUSAL_WT=/Users/salvatoredicara/Workspace/d20-folio-wayfinder-causal-protocol
{
  git -C "$CAUSAL_WT" diff --name-only -z --no-renames \
    1ccb8af74b69e8af2f2b8568480ab1e3048c1eac \
    09f3f69d1550820e1bfbf161e946c787d704b9a9
  git -C "$CAUSAL_WT" diff --name-only -z --no-renames HEAD
  git -C "$CAUSAL_WT" ls-files --others --exclude-standard -z
} | tr '\0' '\n' | LC_ALL=C sort -u > /tmp/d20-g0-source-paths.txt
shasum -a 256 /tmp/d20-g0-source-paths.txt

sed -n '/^| `.*` |/s/^| `\([^`]*\)`.*/\1/p' \
  docs/superpowers/status/2026-08-25-causal-branch-disposition.md \
  | LC_ALL=C sort -u > /tmp/d20-g0-ledger-paths.txt
```

`--no-renames` deliberately expands both sides of a rename into the affected-path set. Run:

```bash
diff -u /tmp/d20-g0-source-paths.txt /tmp/d20-g0-ledger-paths.txt
shasum -a 256 /tmp/d20-g0-ledger-paths.txt
test "$(wc -l < /tmp/d20-g0-source-paths.txt | tr -d ' ')" = \
  "$(sed -n '/^| `.*` |/p' docs/superpowers/status/2026-08-25-causal-branch-disposition.md | wc -l | tr -d ' ')"
```

Expected: `diff` has no output and both list hashes are identical. Validate row width, controlled
dispositions, behavior-owner law, proof/deletion ownership, accepted-behavior presence, and hash
evidence:

```bash
awk -F '|' '
function trim(value) {
  gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
  return value
}
/^\| `.*` \|/ {
  rows++
  if (NF != 13) { print "bad field count:", $0; bad = 1; next }
  hash = trim($4)
  row_path = trim($2)
  disposition = trim($5)
  behavior_owner = trim($6)
  proof = trim($7)
  deletion_owner = trim($8)
  accepted = trim($9)
  owner_review = trim($11)
  if (seen_path[row_path]++) { print "duplicate path:", row_path; bad = 1 }
  if (hash == "" || proof == "" || deletion_owner == "" || owner_review == "") bad = 1
  if (disposition !~ /^(extract|rewrite|reject|superseded-by-current-main)$/) bad = 1
  if (disposition ~ /^(extract|rewrite)$/) {
    if (behavior_owner !~ /^(K1|P1|C1|U1|S1|H1|A2|F[1-6])$/) bad = 1
    if (accepted == "" || accepted == "none") bad = 1
  } else {
    if (behavior_owner != "none" || accepted != "none") bad = 1
  }
}
END { if (rows == 0 || bad) exit 1 }
' docs/superpowers/status/2026-08-25-causal-branch-disposition.md
```

Derive the mutually exclusive evidence-state partition from the pinned base, causal `HEAD`, and
frozen worktree; compare every ledger row and its state-specific hash-evidence form. Then prove the
gate rejects an `untracked` → `dirty` mutation for the intended diagnostic:

```bash
# Step 5 causal evidence-state validator and sensitivity probe
set -eu

CAUSAL_WT=/Users/salvatoredicara/Workspace/d20-folio-wayfinder-causal-protocol
causal_ledger=docs/superpowers/status/2026-08-25-causal-branch-disposition.md
state_dir=$(mktemp -d)

cleanup_state_dir() {
  if [ -n "${state_dir:-}" ] && [ -d "$state_dir" ]; then
    rm -rf -- "$state_dir"
  fi
}
trap cleanup_state_dir EXIT HUP INT TERM

derive_causal_evidence_states() {
  git -C "$CAUSAL_WT" diff --name-only --no-renames \
    1ccb8af74b69e8af2f2b8568480ab1e3048c1eac \
    09f3f69d1550820e1bfbf161e946c787d704b9a9 \
    | LC_ALL=C sort -u > "$state_dir/committed.txt"
  git -C "$CAUSAL_WT" diff --name-only --no-renames HEAD \
    | LC_ALL=C sort -u > "$state_dir/dirty.txt"
  git -C "$CAUSAL_WT" ls-files --others --exclude-standard \
    | LC_ALL=C sort -u > "$state_dir/untracked.txt"
  : > "$state_dir/untracked-digests.txt"
  while IFS= read -r untracked_path; do
    if [ ! -f "$CAUSAL_WT/$untracked_path" ]; then
      echo "missing frozen untracked path: $untracked_path"
      return 1
    fi
    untracked_digest=$(shasum -a 256 "$CAUSAL_WT/$untracked_path" | awk '{ print $1 }')
    printf '%s|%s\n' "$untracked_path" "$untracked_digest"
  done < "$state_dir/untracked.txt" > "$state_dir/untracked-digests.txt"
  git -C "$CAUSAL_WT" diff --name-only --no-renames --diff-filter=D \
    1ccb8af74b69e8af2f2b8568480ab1e3048c1eac \
    09f3f69d1550820e1bfbf161e946c787d704b9a9 \
    | LC_ALL=C sort -u > "$state_dir/deleted.txt"
  {
    sed -n 'p' "$state_dir/committed.txt"
    sed -n 'p' "$state_dir/dirty.txt"
    sed -n 'p' "$state_dir/untracked.txt"
  } | LC_ALL=C sort -u > "$state_dir/union.txt"

  while IFS= read -r entry_path; do
    if grep -Fqx "$entry_path" "$state_dir/untracked.txt"; then
      evidence_state=untracked
    elif grep -Fqx "$entry_path" "$state_dir/deleted.txt"; then
      evidence_state=deleted
    elif grep -Fqx "$entry_path" "$state_dir/committed.txt" &&
      grep -Fqx "$entry_path" "$state_dir/dirty.txt"; then
      evidence_state=both
    elif grep -Fqx "$entry_path" "$state_dir/committed.txt"; then
      evidence_state=committed
    elif grep -Fqx "$entry_path" "$state_dir/dirty.txt"; then
      evidence_state=dirty
    else
      echo "unable to derive evidence state: $entry_path"
      return 1
    fi
    printf '%s|%s\n' "$entry_path" "$evidence_state"
  done < "$state_dir/union.txt" > "$state_dir/expected-states.txt"
}

validate_causal_evidence_states() {
  input_ledger=$1
  expected_states=$2
  expected_untracked_digests=$3
  awk -F '|' -v expected_file="$expected_states" -v digest_file="$expected_untracked_digests" '
  function trim(value) {
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
    return value
  }
  function is_hex(value, expected_length) {
    return length(value) == expected_length && value !~ /[^0-9a-f]/
  }
  function labelled_hex(value, label, expected_length, raw) {
    if (substr(value, 1, length(label)) != label || substr(value, length(value), 1) != "`") return 0
    raw = substr(value, length(label) + 1, length(value) - length(label) - 1)
    return is_hex(raw, expected_length)
  }
  function backticked_hex(value, expected_length, raw) {
    if (substr(value, 1, 1) != "`" || substr(value, length(value), 1) != "`") return 0
    raw = substr(value, 2, length(value) - 2)
    return is_hex(raw, expected_length)
  }
  function valid_evidence(state, evidence, parts, count, deleted_prefix) {
    if (state == "committed") return labelled_hex(evidence, "B:`", 40)
    if (state == "untracked") return labelled_hex(evidence, "U:`", 64)
    if (state == "dirty") return labelled_hex(evidence, "no target delta; W:`", 64)
    if (state == "both") {
      count = split(evidence, parts, "; ")
      return count == 2 && labelled_hex(parts[1], "B:`", 40) && labelled_hex(parts[2], "W:`", 64)
    }
    if (state == "deleted") {
      deleted_prefix = "`TOMBSTONE`; base blob "
      if (substr(evidence, 1, length(deleted_prefix)) != deleted_prefix) return 0
      return backticked_hex(substr(evidence, length(deleted_prefix) + 1), 40)
    }
    return 0
  }
  BEGIN {
    while ((getline line < expected_file) > 0) {
      separator = index(line, "|")
      entry_path = substr(line, 1, separator - 1)
      state = substr(line, separator + 1)
      expected[entry_path] = state
      expected_count[state]++
      expected_rows++
    }
    close(expected_file)
    while ((getline digest_line < digest_file) > 0) {
      separator = index(digest_line, "|")
      entry_path = substr(digest_line, 1, separator - 1)
      digest = substr(digest_line, separator + 1)
      if (separator <= 1 || !is_hex(digest, 64)) {
        print "invalid untracked digest manifest row:", digest_line
        bad = 1
        continue
      }
      if (entry_path in expected_untracked_digest) {
        print "duplicate untracked digest manifest path:", entry_path
        bad = 1
        continue
      }
      expected_untracked_digest[entry_path] = digest
      expected_untracked_digest_rows++
    }
    close(digest_file)
  }
  /^\| `.*` \|/ {
    entry_path = trim($2)
    gsub(/^`|`$/, "", entry_path)
    state = trim($3)
    evidence = trim($4)
    rows++
    if (!(entry_path in expected)) {
      print "unexpected causal evidence path:", entry_path
      bad = 1
      next
    }
    if (seen[entry_path]++) { print "duplicate causal evidence path:", entry_path; bad = 1 }
    if (state != expected[entry_path]) {
      print "evidence state mismatch:", entry_path, "expected", expected[entry_path], "actual", state
      bad = 1
    }
    if (!valid_evidence(state, evidence)) {
      print "hash evidence form mismatch:", entry_path, state, evidence
      bad = 1
    }
    if (state == "untracked") {
      if (!(entry_path in expected_untracked_digest)) {
        print "missing untracked hash expectation:", entry_path
        bad = 1
      } else {
        actual_digest = substr(evidence, 4, 64)
        if (actual_digest != expected_untracked_digest[entry_path]) {
          print "untracked hash mismatch:", entry_path, "expected",
            expected_untracked_digest[entry_path], "actual", actual_digest
          bad = 1
        }
      }
    }
    actual_count[state]++
  }
  END {
    for (entry_path in expected) {
      if (!seen[entry_path]) { print "missing causal evidence path:", entry_path; bad = 1 }
    }
    states[1] = "committed"
    states[2] = "both"
    states[3] = "deleted"
    states[4] = "dirty"
    states[5] = "untracked"
    required["committed"] = 70
    required["both"] = 24
    required["deleted"] = 1
    required["dirty"] = 3
    required["untracked"] = 2
    for (idx = 1; idx <= 5; idx++) {
      state = states[idx]
      if (expected_count[state] != required[state]) {
        print "derived partition mismatch:", state, "expected", required[state], "actual", expected_count[state] + 0
        bad = 1
      }
      if (actual_count[state] != expected_count[state]) {
        print "ledger partition mismatch:", state, "expected", expected_count[state] + 0, "actual", actual_count[state] + 0
        bad = 1
      }
    }
    if (expected_rows != 100 || rows != expected_rows) {
      print "causal evidence row mismatch: expected", expected_rows + 0, "actual", rows + 0
      bad = 1
    }
    for (entry_path in expected_untracked_digest) {
      if (expected[entry_path] != "untracked") {
        print "digest manifest path is not derived untracked evidence:", entry_path
        bad = 1
      }
    }
    if (expected_untracked_digest_rows != expected_count["untracked"]) {
      print "untracked digest manifest row mismatch: expected",
        expected_count["untracked"] + 0, "actual",
        expected_untracked_digest_rows + 0
      bad = 1
    }
    exit bad ? 1 : 0
  }
  ' "$input_ledger"
}

derive_causal_evidence_states
validate_causal_evidence_states \
  "$causal_ledger" "$state_dir/expected-states.txt" "$state_dir/untracked-digests.txt"
printf 'Causal evidence partition passed: 70 committed, 24 both, 1 deleted, 3 dirty, 2 untracked.\n'

state_mutant=$state_dir/untracked-to-dirty-mutant.md
awk -F '|' -v OFS='|' '
/^\| `tests\/rules\/runtime-action-writer\.test\.ts` \|/ {
  if ($3 !~ /^[[:space:]]*untracked[[:space:]]*$/) {
    print "state mutant source is not untracked" > "/dev/stderr"
    exit 1
  }
  $3 = " dirty "
  mutations++
}
{ print }
END {
  if (mutations != 1) {
    print "state mutant expected one mutation, found", mutations + 0 > "/dev/stderr"
    exit 1
  }
}
' "$causal_ledger" > "$state_mutant"
if validate_causal_evidence_states \
  "$state_mutant" "$state_dir/expected-states.txt" "$state_dir/untracked-digests.txt" \
  > "$state_dir/state-mutant-diagnostic.txt" 2>&1; then
  echo "untracked-to-dirty probe unexpectedly passed"
  exit 1
fi
if ! grep -Fx \
  "evidence state mismatch: tests/rules/runtime-action-writer.test.ts expected untracked actual dirty" \
  "$state_dir/state-mutant-diagnostic.txt" >/dev/null; then
  cat "$state_dir/state-mutant-diagnostic.txt"
  echo "untracked-to-dirty probe failed without the intended diagnostic"
  exit 1
fi
echo "untracked-to-dirty probe: evidence-state validator rejected the mutant as intended"

wrong_digest_mutant=$state_dir/untracked-wrong-digest-mutant.md
awk -F '|' -v OFS='|' '
/^\| `tests\/rules\/runtime-action-writer\.test\.ts` \|/ {
  $4 = " U:`810086d439c53643553ef449bacb7fb2bebaf5dc36effa4f3394da5ac89facd2` "
  mutations++
}
{ print }
END {
  if (mutations != 1) {
    print "untracked wrong-digest mutant expected one mutation, found", mutations + 0 > "/dev/stderr"
    exit 1
  }
}
' "$causal_ledger" > "$wrong_digest_mutant"
if validate_causal_evidence_states \
  "$wrong_digest_mutant" "$state_dir/expected-states.txt" "$state_dir/untracked-digests.txt" \
  > "$state_dir/wrong-digest-diagnostic.txt" 2>&1; then
  echo "untracked wrong-digest probe unexpectedly passed"
  exit 1
fi
if ! grep -Fx \
  "untracked hash mismatch: tests/rules/runtime-action-writer.test.ts expected ea03848ece38459ddbf4cc1ab4fa5a8ad218af7bb58a95d0008fca70f4c85287 actual 810086d439c53643553ef449bacb7fb2bebaf5dc36effa4f3394da5ac89facd2" \
  "$state_dir/wrong-digest-diagnostic.txt" >/dev/null; then
  cat "$state_dir/wrong-digest-diagnostic.txt"
  echo "untracked wrong-digest probe failed without the intended path-bound diagnostic"
  exit 1
fi
echo "untracked wrong-digest probe: path-bound hash validator rejected the mutant as intended"
```

Expected: both validators and both sensitivity probes exit `0`; every `U:` digest is bound to the
actual frozen untracked path content, and the exclusive state partition is exactly 70 `committed`,
24 `both`, 1 `deleted`, 3 `dirty`, and 2 `untracked`. Repeat these validators after Step 12 and
additionally require zero
`pending-AR1` or unresolved `AR1-approved-with-condition` rows.

- [ ] **Step 6: Inventory all current capabilities and manual-input contracts**

Inspect current callers and authority seams across all of these categories; a category heading with
no row is a failed inventory:

```text
character creation/import/editing; spells/casting; attacks/saves/damage/healing;
features/reactions; items/equipment/charges/attunement; rests/action economy;
resources/conversions; conditions/effects/concentration/death/exhaustion;
solo turns/offline persistence/undo; character sharing/public projection;
campaign create/join/invite/membership/attachment/roles/treasury;
encounter lifecycle/initiative/turns/NPC and PC consequences;
notes/shared notes/chronicle; proposals/availability/RSVP/agenda/sessions/calendar export;
personal and campaign Homebrew definitions/versions/pins/sandbox;
manual overrides, entered physical outcomes, target selection, geometry, hidden outcomes,
explicit table rulings, and every current generic number/text prompt that can affect mechanics.
```

Use production callers, stores, codecs, Firestore clients/Rules, Functions exports, routes, and
retained tests as evidence. Group content records that share one action/input contract; do not hide
distinct authority, persistence, or external-answer behavior in a broad feature-family row.
Give every current override/ruling/external-input call site its own auditable row or an exact pointer
to the capability row that owns the same input contract; configuration choices belong in the command
or creation/record draft, not automatically in `ExternalAnswers`.

- [ ] **Step 7: Write the automation capability ledger**

Create `docs/superpowers/status/2026-08-25-automation-capability-ledger.md` with:

1. authority and scope;
2. a reproducible baseline containing base SHA, current schema/version markers and their owning
   paths, available fixture paths and SHA-256 hashes, explicit absence of the six private fixtures,
   focused pre-edit test commands/outcomes, and the exact locally available or unavailable deployed
   SHA evidence;
3. the verified program DAG, including G0/T0 → K1, headless U1/O1, H1/A2, F1-F6, X1, and Tactical
   Codex candidate/Task-15 handoffs;
4. capability rows with exactly these columns:

```text
ID | Capability / manual input | Current caller | Current authority | SemanticCommand or record command | Valid ExternalAnswers | Kernel handler | Solo | Shared | Offline | Persistence owner | Tactical Codex handoff | Retained proof | Legacy deletion target | Readiness / future owner
```

Every caller, authority, test, and deletion target names an exact path or explicit target-owned new
file from the T0 proof registry. IDs use the controlled category prefixes `CRE`, `SPL`, `ATK`, `FEA`,
`ITM`, `RST`, `RES`, `EFF`, `SOL`, `SHR`, `CAM`, `ENC`, `REC`, `HBR`, and `OVR`, followed by a
three-digit sequence. Use `none` when no `ExternalAnswers` are valid. `Readiness / future owner` is
exactly `<reuse|rewrite|delete-after-parity|gap>:<primary-owner>`, where the owner is K1, P1, C1,
U1, O1, S1, A1, A2, H1, F1-F6, or X1. The sole controlled exception is
There is no unassigned-owner exception after the Program Controller amendment. Every row must use
owned readiness; owned gaps require the exact ratified T0 proof and focused command. `CRE-008` is
`rewrite:O1` and records the locale-free advancement contract, sole physical hit-die observation,
P1 persistence boundary, Task 7/15 handoffs, target advancement proof, and current differential
proofs. Separate committed
`EffectInstance` activity from capability availability. Record planner/calendar commands as A2
record operations, not gameplay kernel commands; record Homebrew lifecycle/pinning as H1 authority
operations whose compiled definitions alone enter K1.

5. a readiness summary with `reuse`, `rewrite`, `delete-after-parity`, and `gap` totals;
6. explicit Wave-0 handoff. G0 and T0 are independent peers; record T0 as the next unfinished node
   for this orchestration, not as a node opened by G0. The owner-assignment blocker is cleared, but
   Both scoped G0 architecture/quality rereviews passed, completing the artifact review gate; Step
   14's post-rebase `just ci` passed on G0 commit `cda3270` against `origin/main` `250e5d5`, and K1 remains closed until G0 is integrated and T0 is approved.

- [ ] **Step 8: Reproduce baseline evidence and prove ledger structure**

Run every claimed baseline command in this G0 worktree and record UTC start/end time, exact `HEAD`,
exit code, and test/file counts in both the external SDD task report and the committed capability
ledger:

```bash
date -u '+%Y-%m-%dT%H:%M:%SZ'
git rev-parse HEAD
pnpm test --run tests/unit/campaign-io.test.ts tests/unit/encounter.test.ts tests/unit/campaign-sections.test.tsx
pnpm test --run tests/unit/sessions-section.test.tsx tests/unit/chronicle-section.test.tsx tests/unit/campaign-invite.test.tsx
pnpm test --run tests/unit/party-encounter.test.tsx tests/unit/encounter-custom-monsters.test.tsx tests/unit/homebrew-library-ui.test.tsx
pnpm exec playwright test tests/e2e/campaigns-flow.spec.ts tests/e2e/encounter-picker.spec.ts tests/e2e/session-edit-no-jump.spec.ts tests/e2e/chronicle-edit-no-jump.spec.ts
just ci
asdf exec npm --prefix functions test
asdf exec npm --prefix functions run lint
asdf exec npm --prefix functions run build
pnpm test:rules
date -u '+%Y-%m-%dT%H:%M:%SZ'
```

Observed on the unchanged evidence SHA: the three focused Vitest lanes pass with their own retained
file/test counts. The focused Playwright lane exits `1` with 13 downstream locator timeouts because
this worktree has no `.env.local`, all six `VITE_FIREBASE_*` variables are unset, Playwright injects
only the auth bypass, and eager Firebase/Auth initialization fails before bypass/routes. Classify
that outcome as a local E2E provisioning limitation, not product-regression evidence; the lane is
unproven and not green until correctly provisioned, but it does not invalidate G0 inventory
completeness. The retained broad/Functions/Rules baseline remains recorded with its exact historical
SHA and counts; this amendment does not rerun it or claim `just ci-srd-only`/six-fixture execution.

Run the complete lightweight validator as one shell block. It validates the unmodified ledger first,
then uses one cleaned scratch directory for exactly seven adversarial probes. The two path probes use
the same valid, row-scoped `SPL-002` source because the known-present token occurs in three cells of
the complete ledger; the derived source retains it once and substitutes another existing exact path
for the two repetitions before either adversarial mutation.

```bash
# Step 8 lightweight validators and adversarial probes
set -eu

ledger=docs/superpowers/status/2026-08-25-automation-capability-ledger.md
expected_header='| ID | Capability / manual input | Current caller | Current authority | SemanticCommand or record command | Valid ExternalAnswers | Kernel handler | Solo | Shared | Offline | Persistence owner | Tactical Codex handoff | Retained proof | Legacy deletion target | Readiness / future owner |'
scratch_dir=$(mktemp -d)

cleanup_step8_scratch() {
  if [ -n "${scratch_dir:-}" ] && [ -d "$scratch_dir" ]; then
    rm -rf -- "$scratch_dir"
  fi
}
trap cleanup_step8_scratch EXIT HUP INT TERM

count_literal() {
  awk -v needle="$2" '
  {
    remainder = $0
    while ((offset = index(remainder, needle)) != 0) {
      count++
      remainder = substr(remainder, offset + length(needle))
    }
  }
  END { print count + 0 }
  ' "$1"
}

require_literal_count() {
  actual_count=$(count_literal "$1" "$2")
  if [ "$actual_count" -ne "$3" ]; then
    echo "$4: expected $3 occurrence(s), found $actual_count"
    exit 1
  fi
}

count_headers() {
  awk '/^\|[[:space:]]*ID[[:space:]]*\|/ { count++ } END { print count + 0 }' "$1"
}

count_header_cell() {
  awk -v needle="$2" '
  /^\|[[:space:]]*ID[[:space:]]*\|/ {
    remainder = $0
    while ((offset = index(remainder, needle)) != 0) {
      count++
      remainder = substr(remainder, offset + length(needle))
    }
  }
  END { print count + 0 }
  ' "$1"
}

validate_headers() {
  awk -F '|' -v expected="$expected_header" '
  /^\|[[:space:]]*ID[[:space:]]*\|/ {
    headers++
    actual = ""
    for (idx = 2; idx < NF; idx++) {
      value = $idx
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
      actual = actual "| " value " "
    }
    actual = actual "|"
    if (actual != expected) { print "divergent header:", actual; bad = 1 }
  }
  END {
    if (headers != 15) { print "unexpected header count:", headers; bad = 1 }
    exit bad ? 1 : 0
  }
  ' "$1"
}

validate_categories() {
  input_file=$1
  while IFS='|' read -r prefix heading; do
    awk -v heading="$heading" -v prefix="$prefix" '
      $0 == "## " heading { in_section = 1; next }
      in_section && /^## / { in_section = 0 }
      in_section && $0 ~ "^\\| " prefix "-[0-9][0-9][0-9] \\|" { found = 1 }
      END { exit found ? 0 : 1 }
    ' "$input_file" || return 1
  done <<'CATEGORY_MATRIX'
CRE|Character creation
SPL|Spells and casting
ATK|Attacks and consequences
FEA|Features and reactions
ITM|Items and equipment
RST|Rests and action economy
RES|Resources and conversions
EFF|Conditions and effects
SOL|Solo and offline
SHR|Sharing and public projection
CAM|Campaign authority
ENC|Encounters
REC|Planner and chronicle
HBR|Homebrew
OVR|Manual overrides, rulings, and external observations
CATEGORY_MATRIX

  awk -F '|' '
  function trim(value) {
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
    return value
  }
  BEGIN {
    expected["Character creation"] = "CRE"
    expected["Spells and casting"] = "SPL"
    expected["Attacks and consequences"] = "ATK"
    expected["Features and reactions"] = "FEA"
    expected["Items and equipment"] = "ITM"
    expected["Rests and action economy"] = "RST"
    expected["Resources and conversions"] = "RES"
    expected["Conditions and effects"] = "EFF"
    expected["Solo and offline"] = "SOL"
    expected["Sharing and public projection"] = "SHR"
    expected["Campaign authority"] = "CAM"
    expected["Encounters"] = "ENC"
    expected["Planner and chronicle"] = "REC"
    expected["Homebrew"] = "HBR"
    expected["Manual overrides, rulings, and external observations"] = "OVR"
  }
  /^## / { heading = substr($0, 4); next }
  /^\| [A-Z][A-Z][A-Z]-[0-9][0-9][0-9] \|/ {
    id = trim($2)
    prefix = substr(id, 1, 3)
    if (!(heading in expected)) { print "row under unknown heading:", id, heading; bad = 1 }
    else if (prefix != expected[heading]) {
      print "heading/prefix mismatch:", id, heading
      bad = 1
    }
    seenHeading[heading]++
  }
  END {
    for (name in expected) {
      if (!seenHeading[name]) { print "empty category:", name; bad = 1 }
    }
    exit bad ? 1 : 0
  }
  ' "$input_file"
}

validate_rows() {
  awk -F '|' '
  function trim(value) {
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
    return value
  }
  /^\| [A-Z][A-Z][A-Z]-[0-9][0-9][0-9] \|/ {
    rows++
    if (NF != 17) { print "bad field count:", $0; bad = 1; next }
    id = trim($2)
    readiness = trim($16)
    if (id !~ /^(CRE|SPL|ATK|FEA|ITM|RST|RES|EFF|SOL|SHR|CAM|ENC|REC|HBR|OVR)-[0-9][0-9][0-9]$/) {
      print "unknown id prefix:", id
      bad = 1
    }
    if (seen[id]++) { print "duplicate id:", id; bad = 1 }
    if (readiness !~ /^(reuse|rewrite|delete-after-parity|gap):(K1|P1|C1|U1|O1|S1|A1|A2|H1|F[1-6]|X1)$/) {
      print "bad readiness/owner:", id, readiness
      bad = 1
    } else {
      split(readiness, readiness_parts, ":")
      readiness_count[readiness_parts[1]]++
    }
    if (id == "CRE-008") {
      if (readiness != "rewrite:O1" ||
          index($6, "advance-character") == 0 || index($6, "stable choice IDs/config") == 0 ||
          index($6, "expected build/material revisions") == 0 ||
          index($7, "raw observed face of a physical hit die") == 0 ||
          index($7, "1..hitDie") == 0 || index($7, "never generated or rolled") == 0 ||
          index($7, "all knowable advancement choices are command configuration") == 0 ||
          index($8, "sole `resolveCommand` entry point") == 0 ||
          index($9, "locale-free `AdvancementDraft`") == 0 || index($9, "CRE-006") == 0 ||
          index($10, "owner-only personal-state commit") == 0 ||
          index($10, "not a shared encounter mutation") == 0 ||
          index($11, "P1 queues the canonical patch and reconciles server echo") == 0 ||
          index($12, "P1 character build/material repository") == 0 || index($12, "CRE-006") == 0 ||
          index($13, "Task 7") == 0 || index($13, "Task 15") == 0 ||
          index($14, "target-new-file:tests/unit/advancement-domain.test.ts") == 0 ||
          index($14, "tests/unit/level-up-wizard.test.tsx") == 0 ||
          index($14, "tests/unit/level-up.test.ts") == 0 ||
          index($14, "tests/unit/creation-domain.test.ts tests/unit/advancement-domain.test.ts") == 0 ||
          index($15, "LevelUpWizard.tsx:923-1269") == 0 || index($15, "Task 15") == 0) {
        print "invalid CRE-008 O1 advancement contract"
        bad = 1
      }
    }
    for (column = 3; column <= 16; column++) {
      if (trim($column) == "") { print "empty field:", id, column; bad = 1 }
    }
  }
  END {
    if (rows != 83) { print "unexpected row count:", rows + 0; bad = 1 }
    if (readiness_count["reuse"] != 5 || readiness_count["rewrite"] != 72 ||
        readiness_count["delete-after-parity"] != 0 || readiness_count["gap"] != 6) {
      print "unexpected readiness arithmetic:", readiness_count["reuse"] + 0,
        readiness_count["rewrite"] + 0, readiness_count["delete-after-parity"] + 0,
        readiness_count["gap"] + 0
      bad = 1
    }
    if (bad) exit 1
  }
  ' "$1"
}

validate_solo_shared_semantics() {
  awk -F '|' '
  function trim(value) {
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
    return value
  }
  /^\| [A-Z][A-Z][A-Z]-[0-9][0-9][0-9] \|/ {
    id = trim($2)
    solo = tolower(trim($9))
    shared = tolower(trim($10))
    if (solo ~ /(shared-only|shared campaign record)/ &&
        shared ~ /(^|[^[:alpha:]])(solo|local)([^[:alpha:]]|$)/) {
      print "solo/shared semantic contradiction:", id
      bad = 1
    }
  }
  END { exit bad ? 1 : 0 }
  ' "$1"
}

validate_authority_deletion_contracts() {
  awk -F '|' '
  function trim(value) {
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
    return value
  }
  /^\| SHR-001 \|/ {
    shr_rows++
    if (trim($4) != "`src/features/character/SheetExtrasCoin.tsx:43,85-100`" ||
        trim($5) != "`src/features/character/use-share-character.ts:39-75` orchestration → `src/lib/firestore.ts:334-384` atomic parent/projection writer; `src/lib/public-character-projection.ts` read-model seam" ||
        trim($15) != "`src/features/character/use-share-character.ts:39-75` orchestration and `src/lib/firestore.ts:334-384` character-specific `setCharacterSharing` legacy write path after P1 parity") {
      print "authority/deletion contract mismatch: SHR-001"
      bad = 1
    }
  }
  /^\| REC-007 \|/ {
    rec_rows++
    if (trim($4) != "`src/features/campaigns/Chronicle.tsx:212`" ||
        trim($5) != "`src/features/campaigns/chronicle-export.ts:36-41` local `downloadChronicleMarkdown` helper" ||
        trim($15) != "none — retain local export helper; no shared writer") {
      print "authority/deletion contract mismatch: REC-007"
      bad = 1
    }
  }
  END {
    if (shr_rows != 1 || rec_rows != 1) {
      print "authority/deletion contract row count mismatch:", shr_rows + 0, rec_rows + 0
      bad = 1
    }
    exit bad ? 1 : 0
  }
  ' "$1"
}

validate_row_markers() {
  awk -F '|' '
  function trim(value) {
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
    return value
  }
  function allowed_path(token) {
    return token ~ /^(src|tests|functions|scripts)\// ||
      token ~ /^target-new-file:(src|tests|functions|scripts)\// ||
      token ~ /^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|firestore\.rules|storage\.rules|Justfile)$/
  }
  function is_command(token) {
    return token ~ /^(pnpm|npm|asdf|just) /
  }
  /^\| [A-Z][A-Z][A-Z]-[0-9][0-9][0-9] \|/ {
    id = trim($2)
    for (column = 4; column <= 15; column++) {
      if (column != 4 && column != 5 && column != 14 && column != 15) continue
      value = $column
      while (match(value, /`[^`]+`/)) {
        token = substr(value, RSTART + 1, RLENGTH - 2)
        value = substr(value, RSTART + RLENGTH)
        if (token ~ /\.(ts|tsx|json|rules)(:|$)/ &&
            !allowed_path(token) && !(column == 14 && is_command(token))) {
          print "non-exact path:", id, "column", column, token
          bad = 1
        }
      }
      if ((column == 4 || column == 5 || column == 15) &&
          trim($column) ~ /^(none —|target-new-file:|`(src|tests|functions|scripts)\/)/) continue
      if ($column !~ /`(src|tests|functions|scripts)\// &&
          $column !~ /`target-new-file:(src|tests|functions|scripts)\// &&
          trim($column) !~ /^none —/) {
        print "missing exact marker:", id, "column", column
        bad = 1
      }
    }
  }
  END { exit bad ? 1 : 0 }
  ' "$1"
}

validate_current_paths() {
  input_file=$1
  manifest_file=$2
  awk -F '|' '
  /^\| [A-Z][A-Z][A-Z]-[0-9][0-9][0-9] \|/ {
    for (column = 4; column <= 15; column++) {
      if (column != 4 && column != 5 && column != 14 && column != 15) continue
      value = $column
      while (match(value, /`[^`]+`/)) {
        token = substr(value, RSTART + 1, RLENGTH - 2)
        value = substr(value, RSTART + RLENGTH)
        if (token ~ /^(src|tests|functions|scripts)\// ||
            token ~ /^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|firestore\.rules|storage\.rules|Justfile)$/) {
          sub(/:[0-9][0-9,\-]*/, "", token)
          print token
        }
      }
    }
  }
  ' "$input_file" | LC_ALL=C sort -u > "$manifest_file"

  while IFS= read -r entry_path; do
    if [ ! -e "$entry_path" ]; then
      echo "missing current path: $entry_path"
      return 1
    fi
  done < "$manifest_file"
}

# The unmodified artifact must pass every lightweight structural validator before mutation.
validate_headers "$ledger"
validate_categories "$ledger"
validate_rows "$ledger"
validate_solo_shared_semantics "$ledger"
validate_authority_deletion_contracts "$ledger"
validate_row_markers "$ledger"
validate_current_paths "$ledger" "$scratch_dir/valid-current-paths.txt"
echo "valid capability ledger: all Step 8 lightweight validators passed"

source_token='`src/features/character/center/tabs/spells/SpellCard.tsx:268,275,293`'
replacement_path='`src/features/character/center/tabs/spells/EngineCastFlow.tsx`'
marker_source="$scratch_dir/marker-source.md"

# Derive one valid SPL-002 row with the required known-present token exactly once.
awk -F '|' -v OFS='|' -v replacement="$replacement_path" '
/^\| SPL-002 \|/ {
  rows++
  $5 = " " replacement " "
  $15 = " " replacement " "
  print
}
END {
  if (rows != 1) {
    print "expected exactly one SPL-002 source row, found", rows > "/dev/stderr"
    exit 1
  }
}
' "$ledger" > "$marker_source"
require_literal_count "$marker_source" "$source_token" 1 "row-scoped source token"
validate_row_markers "$marker_source"
validate_current_paths "$marker_source" "$scratch_dir/marker-source-paths.txt"

# Probe 1: the row-scoped exact-marker validator must reject one basename mutation.
basename_token='`SpellCard.tsx`'
basename_mutant="$scratch_dir/basename-mutant.md"
sed 's#`src/features/character/center/tabs/spells/SpellCard.tsx:268,275,293`#`SpellCard.tsx`#' \
  "$marker_source" > "$basename_mutant"
require_literal_count "$basename_mutant" "$basename_token" 1 "basename mutant token"
require_literal_count "$basename_mutant" "$source_token" 0 "basename mutant original token"
if validate_row_markers "$basename_mutant" > "$scratch_dir/basename-diagnostic.txt" 2>&1; then
  echo "basename probe unexpectedly passed the row-scoped marker validator"
  exit 1
fi
if ! grep -F "non-exact path: SPL-002 column 4 SpellCard.tsx" \
  "$scratch_dir/basename-diagnostic.txt" >/dev/null; then
  cat "$scratch_dir/basename-diagnostic.txt"
  echo "basename probe failed without the intended row-scoped diagnostic"
  exit 1
fi
cat "$scratch_dir/basename-diagnostic.txt"
echo "basename probe: row-scoped marker validator rejected the mutant as intended"

# Probe 2: prefix syntax remains valid, but the generated current-path existence gate must reject.
missing_token='`src/does-not-exist.ts`'
missing_mutant="$scratch_dir/missing-path-mutant.md"
sed 's#`src/features/character/center/tabs/spells/SpellCard.tsx:268,275,293`#`src/does-not-exist.ts`#' \
  "$marker_source" > "$missing_mutant"
require_literal_count "$missing_mutant" "$missing_token" 1 "missing-path mutant token"
require_literal_count "$missing_mutant" "$source_token" 0 "missing-path mutant original token"
if ! validate_row_markers "$missing_mutant"; then
  echo "missing-path probe was rejected by the wrong validator layer"
  exit 1
fi
if validate_current_paths "$missing_mutant" "$scratch_dir/missing-paths.txt" \
  > "$scratch_dir/missing-path-diagnostic.txt" 2>&1; then
  echo "missing-path probe unexpectedly passed the current-path existence validator"
  exit 1
fi
if ! grep -Fx "missing current path: src/does-not-exist.ts" \
  "$scratch_dir/missing-path-diagnostic.txt" >/dev/null; then
  cat "$scratch_dir/missing-path-diagnostic.txt"
  echo "missing-path probe failed without the intended existence diagnostic"
  exit 1
fi
cat "$scratch_dir/missing-path-diagnostic.txt"
echo "missing-path probe: current-path existence validator rejected the mutant as intended"

# Probe 3: mutate exactly the first of fifteen headers and require the all-header gate to reject it.
source_header_count=$(count_headers "$ledger")
if [ "$source_header_count" -ne 15 ]; then
  echo "header probe source: expected 15 headers, found $source_header_count"
  exit 1
fi
if [ "$(count_header_cell "$ledger" "Capability / manual input")" -ne 15 ]; then
  echo "header probe source: canonical schema cell does not occur exactly fifteen times"
  exit 1
fi
header_mutant="$scratch_dir/header-mutant.md"
awk '
!mutated && /^\|[[:space:]]*ID[[:space:]]*\|/ {
  replacements = gsub(/Capability \/ manual input/, "Capability / mutant input")
  if (replacements != 1) {
    print "first-header mutation changed", replacements, "cells" > "/dev/stderr"
    exit 1
  }
  mutated = 1
}
{ print }
END {
  if (mutated != 1) {
    print "first-header mutation did not run exactly once" > "/dev/stderr"
    exit 1
  }
}
' "$ledger" > "$header_mutant"
if [ "$(count_headers "$header_mutant")" -ne 15 ]; then
  echo "header mutant did not preserve the fifteen-header count"
  exit 1
fi
if [ "$(count_header_cell "$header_mutant" "Capability / mutant input")" -ne 1 ] ||
  [ "$(count_header_cell "$header_mutant" "Capability / manual input")" -ne 14 ]; then
  echo "header mutant did not change exactly one canonical schema cell"
  exit 1
fi
if ! awk '
/^\|[[:space:]]*ID[[:space:]]*\|/ {
  exit index($0, "Capability / mutant input") ? 0 : 1
}
END { if (NR == 0) exit 1 }
' "$header_mutant"; then
  echo "header mutant did not change the first repeated header"
  exit 1
fi
if validate_headers "$header_mutant" > "$scratch_dir/header-diagnostic.txt" 2>&1; then
  echo "header probe unexpectedly passed the all-header canonical/count validator"
  exit 1
fi
if ! grep -F "divergent header:" "$scratch_dir/header-diagnostic.txt" >/dev/null; then
  cat "$scratch_dir/header-diagnostic.txt"
  echo "header probe failed without the intended divergent-header diagnostic"
  exit 1
fi
cat "$scratch_dir/header-diagnostic.txt"
echo "header probe: all-header canonical/count validator rejected the mutant as intended"

# Probe 4: restore the reviewed Solo/Shared inversion and require the semantic gate to reject it.
semantic_mutant="$scratch_dir/solo-shared-semantic-mutant.md"
awk -F '|' -v OFS='|' '
/^\| REC-007 \|/ {
  $9 = " not applicable — shared campaign record "
  $10 = " solo/local; offline works after data loaded "
  mutations++
}
{ print }
END {
  if (mutations != 1) {
    print "semantic mutant expected one row mutation, found", mutations + 0 > "/dev/stderr"
    exit 1
  }
}
' "$ledger" > "$semantic_mutant"
if validate_solo_shared_semantics "$semantic_mutant" \
  > "$scratch_dir/semantic-mutant-diagnostic.txt" 2>&1; then
  echo "solo/shared semantic probe unexpectedly passed"
  exit 1
fi
if ! grep -Fx "solo/shared semantic contradiction: REC-007" \
  "$scratch_dir/semantic-mutant-diagnostic.txt" >/dev/null; then
  cat "$scratch_dir/semantic-mutant-diagnostic.txt"
  echo "solo/shared semantic probe failed without the intended diagnostic"
  exit 1
fi
cat "$scratch_dir/semantic-mutant-diagnostic.txt"
echo "solo/shared semantic probe: targeted gate rejected the mutant as intended"

# Probe 5: move an advancement choice across the ExternalAnswers seam and require CRE-008 rejection.
advancement_mutant="$scratch_dir/advancement-external-answer-mutant.md"
awk -F '|' -v OFS='|' '
/^\| CRE-008 \|/ {
  replacements = gsub(/raw observed face of a physical hit die/, "selected advancement choice", $7)
  if (replacements != 1) {
    print "advancement mutation changed", replacements, "cells" > "/dev/stderr"
    exit 1
  }
  mutations++
}
{ print }
END {
  if (mutations != 1) {
    print "advancement mutant expected one row mutation, found", mutations + 0 > "/dev/stderr"
    exit 1
  }
}
' "$ledger" > "$advancement_mutant"
if validate_rows "$advancement_mutant" \
  > "$scratch_dir/advancement-mutant-diagnostic.txt" 2>&1; then
  echo "advancement ExternalAnswers probe unexpectedly passed"
  exit 1
fi
if ! grep -Fx "invalid CRE-008 O1 advancement contract" \
  "$scratch_dir/advancement-mutant-diagnostic.txt" >/dev/null; then
  cat "$scratch_dir/advancement-mutant-diagnostic.txt"
  echo "advancement ExternalAnswers probe failed without the intended diagnostic"
  exit 1
fi
cat "$scratch_dir/advancement-mutant-diagnostic.txt"
echo "advancement ExternalAnswers probe: targeted CRE-008 gate rejected the mutant as intended"

# Probe 6: restore the unsafe generic-share deletion target and require SHR-001 rejection.
shr_authority_mutant="$scratch_dir/shr-authority-deletion-mutant.md"
awk -F '|' -v OFS='|' '
/^\| SHR-001 \|/ {
  $15 = " `src/components/shared/ShareButton.tsx` client public projection writer "
  mutations++
}
{ print }
END {
  if (mutations != 1) {
    print "SHR-001 authority mutant expected one mutation, found", mutations + 0 > "/dev/stderr"
    exit 1
  }
}
' "$ledger" > "$shr_authority_mutant"
if validate_authority_deletion_contracts "$shr_authority_mutant" \
  > "$scratch_dir/shr-authority-mutant-diagnostic.txt" 2>&1; then
  echo "SHR-001 authority/deletion probe unexpectedly passed"
  exit 1
fi
if ! grep -Fx "authority/deletion contract mismatch: SHR-001" \
  "$scratch_dir/shr-authority-mutant-diagnostic.txt" >/dev/null; then
  cat "$scratch_dir/shr-authority-mutant-diagnostic.txt"
  echo "SHR-001 authority/deletion probe failed without the intended diagnostic"
  exit 1
fi
cat "$scratch_dir/shr-authority-mutant-diagnostic.txt"
echo "SHR-001 authority/deletion probe: targeted gate rejected the mutant as intended"

# Probe 7: restore the false Chronicle caller-as-authority/deletion mapping and require rejection.
rec_authority_mutant="$scratch_dir/rec-authority-deletion-mutant.md"
awk -F '|' -v OFS='|' '
/^\| REC-007 \|/ {
  $5 = " `src/features/campaigns/Chronicle.tsx:212` local `downloadChronicleMarkdown` "
  $15 = " `src/features/campaigns/Chronicle.tsx:212` none "
  mutations++
}
{ print }
END {
  if (mutations != 1) {
    print "REC-007 authority mutant expected one mutation, found", mutations + 0 > "/dev/stderr"
    exit 1
  }
}
' "$ledger" > "$rec_authority_mutant"
if validate_authority_deletion_contracts "$rec_authority_mutant" \
  > "$scratch_dir/rec-authority-mutant-diagnostic.txt" 2>&1; then
  echo "REC-007 authority/deletion probe unexpectedly passed"
  exit 1
fi
if ! grep -Fx "authority/deletion contract mismatch: REC-007" \
  "$scratch_dir/rec-authority-mutant-diagnostic.txt" >/dev/null; then
  cat "$scratch_dir/rec-authority-mutant-diagnostic.txt"
  echo "REC-007 authority/deletion probe failed without the intended diagnostic"
  exit 1
fi
cat "$scratch_dir/rec-authority-mutant-diagnostic.txt"
echo "REC-007 authority/deletion probe: targeted gate rejected the mutant as intended"
```

Expected: every lightweight validator and adversarial probe exits `0`. Independently review every
`gap`, `OVR` row, and `ExternalAnswers` cell: each owned gap has one ratified primary owner plus exact
planned proof; zero `gap:unassigned-owner` rows remain; each manual input has an exact current call
site; and no knowable rule math, configuration choice, or UI-derived consequence is mislabeled as
an external observation. For `CRE-008`, only the bounded raw observed physical hit-die face is an
external answer.

- [ ] **Step 9: Add the G0 Changeset**

Create `.changeset/automation-g0-readiness.md` with exactly:

```markdown
---
"d20-folio": patch
---

Record automation readiness and ratify headless character advancement ownership.
```

- [ ] **Step 10: Prove the causal worktree was untouched**

Run the exact external script from Step 2 again:

```bash
zsh /Users/salvatoredicara/Workspace/Codex/d20-folio-g0-7590b18/causal-fingerprint.zsh
```

Expected: all five output lines, including `UNTRACKED_COUNT`, match the captured pre-inventory output
byte-for-byte. Record both captures and the equality verdict in the causal ledger and external SDD
task report.

- [ ] **Step 11: Run the documentation and scope gates**

Run:

```bash
pnpm exec prettier --check \
  docs/superpowers/plans/2026-08-25-automation-first-wayfinder.md \
  docs/superpowers/plans/2026-08-25-test-portfolio-reset.md \
  docs/superpowers/plans/2026-08-25-g0-automation-readiness.md \
  docs/superpowers/status/2026-08-25-causal-branch-disposition.md \
  docs/superpowers/status/2026-08-25-automation-capability-ledger.md \
  .changeset/automation-g0-readiness.md
git diff --check
git status --porcelain=v1 --untracked-files=all
rg -n '\b(TB[D]|TO[D]O|FIXM[E])\b' \
  docs/superpowers/plans/2026-08-25-automation-first-wayfinder.md \
  docs/superpowers/plans/2026-08-25-test-portfolio-reset.md \
  docs/superpowers/plans/2026-08-25-g0-automation-readiness.md \
  docs/superpowers/status/2026-08-25-causal-branch-disposition.md \
  docs/superpowers/status/2026-08-25-automation-capability-ledger.md
```

Verify the exact touched-path allowlist:

```bash
git status --porcelain=v1 --untracked-files=all | cut -c4- | LC_ALL=C sort \
  > /tmp/d20-g0-touched-paths.txt
printf '%s\n' \
  .changeset/automation-g0-readiness.md \
  docs/superpowers/plans/2026-08-25-automation-first-wayfinder.md \
  docs/superpowers/plans/2026-08-25-g0-automation-readiness.md \
  docs/superpowers/plans/2026-08-25-test-portfolio-reset.md \
  docs/superpowers/status/2026-08-25-automation-capability-ledger.md \
  docs/superpowers/status/2026-08-25-causal-branch-disposition.md \
  | LC_ALL=C sort > /tmp/d20-g0-allowed-paths.txt
diff -u /tmp/d20-g0-allowed-paths.txt /tmp/d20-g0-touched-paths.txt
```

Expected: formatting and diff checks pass; the placeholder and allowlist comparisons have no
output. The status documents contain no React/TSX source, route mount, live call-site edit,
migration apply command, or deploy instruction.

- [ ] **Step 12: Obtain architecture/specification and future-owner review**

Dispatch an independent architecture reviewer and retain its report at
`/Users/salvatoredicara/Workspace/Codex/d20-folio-g0-7590b18/g0-architecture-review.md`. The reviewer
must check:

- every source path appears once with valid hash evidence, disposition, owner, and gate;
- every `extract`/`rewrite` row receives an individual `APPROVED`, `APPROVED_WITH_CONDITION`, or
  `REJECTED` verdict against its named future behavior owner; T0/X1 may not masquerade as behavior
  owners;
- every current capability/manual-input class has a caller, authority, target command/record
  operation, valid observation seam, solo/shared/offline behavior, persistence owner, UI handoff,
  retained proof, deletion target, and future owner;
- U1/O1 are headless, H1/A2 are present, and no UI/call-site cutover is implied;
- G0/T0/K1 ordering matches the final Wayfinder;
- no causal dependency graph, second reducer, persisted command queue, gameplay Rules proof, or
  generated dice result is accepted.

The G0 implementer applies the row verdicts, replaces every `pending-AR1`, resolves every condition,
and appends a review register containing reviewer identity, UTC timestamp, report path, rows reviewed,
and final decision by behavior-owner group. Fix Critical or Important findings through that
implementer and obtain scoped re-review at
`/Users/salvatoredicara/Workspace/Codex/d20-folio-g0-7590b18/g0-architecture-rereview.md`. G0 cannot
continue with `pending-AR1`, `REJECTED`, or unresolved conditions.

- [ ] **Step 13: Obtain independent quality review**

After architecture fixes, dispatch a fresh quality reviewer and retain its report at
`/Users/salvatoredicara/Workspace/Codex/d20-folio-g0-7590b18/g0-quality-review.md`. Require explicit
verdicts for specification compliance and quality. The quality review covers command safety,
reproducibility, normalized-list/table integrity, exact ownership, baseline provenance, diff scope,
placeholder absence, Markdown clarity, and avoidable duplication/complexity.

Fix every Critical or Important finding through the G0 implementer. Any material fix receives a
scoped re-review recorded at
`/Users/salvatoredicara/Workspace/Codex/d20-folio-g0-7590b18/g0-quality-rereview.md`. Both final
verdicts must pass before final verification.

- [ ] **Step 14: Run final immutable-source, structure, scope, and integration gates**

After both scoped amendment reviews pass and their exact report path, UTC timestamp, SHA-256, and
verdict metadata are promoted:

1. rerun the fingerprint script and require byte-for-byte equality with Step 2;
2. rerun the Step 5 path-list/hash/row validator and require no `pending-AR1`, rejected owner review,
   or unresolved condition;
3. rerun the Step 8 capability header/category/row validators;
4. rerun every Step 11 formatting, placeholder, and touched-path allowlist command;
5. run a fresh composed integration gate and retain its provenance even if it fails:

```bash
ci_start=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
ci_head=$(git rev-parse HEAD)
set +e
just ci
ci_exit=$?
set -e
ci_end=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
printf 'just ci start=%s end=%s HEAD=%s exit=%s\n' \
  "$ci_start" "$ci_end" "$ci_head" "$ci_exit"
test "$ci_exit" -eq 0
```

Record UTC start/end, exact `HEAD`, exit, every sub-gate result, and exact file/test/skip counts in
the ignored task report. Omit `just ci-srd-only` because this package does not touch the licensing
seam.

Expected: every lightweight gate and the fresh `just ci` pass. The focused Playwright lane remains
explicitly unproven until correctly provisioned; the composed gate does not relabel it green.

- [ ] **Step 15: Stage, inspect, and commit the reviewed G0 package**

Run:

```bash
git add \
  docs/superpowers/plans/2026-08-25-automation-first-wayfinder.md \
  docs/superpowers/plans/2026-08-25-g0-automation-readiness.md \
  docs/superpowers/plans/2026-08-25-test-portfolio-reset.md \
  docs/superpowers/status/2026-08-25-causal-branch-disposition.md \
  docs/superpowers/status/2026-08-25-automation-capability-ledger.md \
  .changeset/automation-g0-readiness.md
git diff --cached --check
git diff --cached --name-only | LC_ALL=C sort > /tmp/d20-g0-staged-paths.txt
diff -u /tmp/d20-g0-allowed-paths.txt /tmp/d20-g0-staged-paths.txt
git diff --cached --stat
git diff --cached --
git commit -m "docs: record automation readiness"
```

Expected: cached checks and the exact six-file allowlist pass; inspect the complete cached diff
before committing. Produce one owner-authored Conventional Commit with no co-author/footer/trailer.
Stop after G0; report T0 as the unfinished Wave-0 peer and do not begin T0 or K1 in this session.
