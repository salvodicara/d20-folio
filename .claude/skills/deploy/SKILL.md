---
name: deploy
description: Ship a verified main SHA to production (Hosting, Functions, rules, the runtime pack). Use when asked to deploy, promote, or put a merged change live.
---

# Deploy

Production is live: two groups play on it with real characters. A deploy **promotes** a SHA that CI and
Verify already proved green; it never re-verifies or builds anything new.

1. **Owner's word.** Get an explicit yes for this deploy, in this conversation. Done when the owner has
   said yes to this SHA.
2. **Migrations first.** If the SHA reads a new stored shape, run the `live-data-migration` skill to
   completion first. Done when every pending migration's `--check` is green against production.
3. **Dispatch.** From a clean checkout equal to `origin/main`: `just deploy`. It only dispatches
   `deploy.yml`, which waits for green CI + Verify, refuses an unverified content-pack commit, backs up
   Firestore, deploys Functions, then Hosting with the Firestore/Storage rules, and requires SAFE-01
   armed. If Verify was superseded or the pack moved, `gh workflow run verify.yml --ref main` first.
   Runtime pack: pass `-f runtime_pack=true` (`gh workflow run deploy.yml --ref main -f runtime_pack=true`)
   only after every account in `scripts/pack/pack-access.ts list` holds the claim.
4. **Watch it land.** `gh run watch` on the run. Done when every job is green; on a red job, report
   the failing step and its log to the owner, never retry blindly.
5. **Tell the owner** in two lines: what is live, and that open tabs need a reload.

Reference: `docs/RELEASE.md` → "Deploying". Hosting and rules always ship in one run.
