/**
 * Cloud Functions for d20 Folio (2nd gen, region europe-west1).
 *
 *  - onBugReportCreated (OWN-37): a Firestore `onCreate` on `/bug_reports/{id}`
 *    opens a GitHub issue on the configured tracker (`GITHUB_REPO`, token in
 *    Secret Manager) via Octokit, then writes the issue number/url + status back
 *    to the doc. Guards against double-processing. The tracker is PUBLIC, so the
 *    issue body is PRIVACY-STRIPPED (`issue-format.ts`): no uid, no character /
 *    campaign ids, no screenshot — identifying details stay in the Firestore doc
 *    (the admin inbox).
 *
 *  - onUserCreated (OWN-38): a Firestore `onCreate` on `/users/{uid}` emails the
 *    owner the new user's details + a deep-link to /admin so abuse can be blocked
 *    fast. Fails soft — it never throws in a way that retries forever.
 *
 *  - onBudgetAlert (SAFE-01): a Pub/Sub trigger on the `budget-kill` topic that the
 *    Cloud Billing £1 budget publishes to. When ACTUAL cost exceeds the budget it
 *    DETACHES the billing account from the project (Google's documented "disable
 *    billing to stop usage" kill-switch), forcing spend to zero. Idempotent, loud,
 *    and never acts on forecasts. The zero-budget hard guarantee.
 *
 * All secrets use `defineSecret` (Secret Manager). See `docs/BUG_REPORTING.md`
 * for the exact owner setup runbook.
 */

import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { onMessagePublished } from "firebase-functions/v2/pubsub";
import { defineSecret } from "firebase-functions/params";
import { setGlobalOptions, logger } from "firebase-functions/v2";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";
import { CloudBillingClient } from "@google-cloud/billing";
import { Octokit } from "@octokit/rest";
import nodemailer from "nodemailer";
import {
  formatIssueBody,
  formatIssueTitle,
  formatLabels,
  parseRepo,
  type ReportLike,
} from "./issue-format";
import { formatSignupEmail, resolveMailConfig, type NewUserLike } from "./signup-email";
import {
  planCampaignUpdate,
  coMemberAclTargets,
  emailMatches,
  type CampaignLike,
} from "./delete-user-plan";
import { parseBudgetNotification, decideBudgetKill } from "./budget-kill";
import {
  parseSharePath,
  characterCard,
  campaignCard,
  injectOgTags,
  shellOrigin,
  SITE,
  type OgCard,
} from "./og-meta";

initializeApp();

// Region + sane resource defaults for the whole package (matches the project).
setGlobalOptions({ region: "europe-west1", memory: "256MiB", timeoutSeconds: 60 });

// ── Secrets (Secret Manager) ────────────────────────────────────────────────
const GITHUB_TOKEN = defineSecret("GITHUB_TOKEN");
const GITHUB_REPO = defineSecret("GITHUB_REPO"); // "owner/repo"; parseRepo defaults it when unset
const MAIL_HOST = defineSecret("MAIL_HOST");
const MAIL_USER = defineSecret("MAIL_USER");
const MAIL_PASS = defineSecret("MAIL_PASS");
const MAIL_FROM = defineSecret("MAIL_FROM");
const OWNER_EMAIL = defineSecret("OWNER_EMAIL");

// ── OWN-37 — bug report → GitHub issue ──────────────────────────────────────
export const onBugReportCreated = onDocumentCreated(
  {
    document: "bug_reports/{id}",
    secrets: [GITHUB_TOKEN, GITHUB_REPO],
  },
  async (event) => {
    const snap = event.data;
    if (!snap) {
      logger.warn("bug report create event had no snapshot");
      return;
    }
    const report = snap.data() as ReportLike & {
      status?: string;
      issueNumber?: number;
    };

    // Idempotency guard — never open a second issue for the same doc (a retry, or
    // our own status write-back re-triggering, must be a no-op).
    if (report.status === "opened" || typeof report.issueNumber === "number") {
      logger.info("bug report already processed; skipping", { id: event.params.id });
      return;
    }

    const token = GITHUB_TOKEN.value();
    if (!token) {
      logger.error("GITHUB_TOKEN secret is empty; cannot open issue");
      await snap.ref.update({ status: "error" }).catch(() => undefined);
      return;
    }

    // NB: the screenshot is deliberately NOT embedded — its download URL carries the
    // reporter's uid in the Storage path and its pixels can show a character sheet.
    // Admins view it from the Firestore doc (`screenshotUrl`), never the public issue.
    const { owner, repo } = parseRepo(GITHUB_REPO.value());
    const octokit = new Octokit({ auth: token });

    try {
      const issue = await octokit.issues.create({
        owner,
        repo,
        title: formatIssueTitle(report),
        body: formatIssueBody(report, event.params.id),
        labels: formatLabels(report),
      });
      await snap.ref.update({
        status: "opened",
        issueNumber: issue.data.number,
        issueUrl: issue.data.html_url,
      });
      logger.info("opened GitHub issue for bug report", {
        id: event.params.id,
        issue: issue.data.number,
      });
    } catch (err) {
      logger.error("failed to open GitHub issue", err);
      // Mark the doc so the client can show a soft error and we don't loop.
      await snap.ref.update({ status: "error" }).catch(() => undefined);
    }
  }
);

// ── OWN-38 — new user → owner notification email ────────────────────────────
export const onUserCreated = onDocumentCreated(
  {
    document: "users/{uid}",
    secrets: [MAIL_HOST, MAIL_USER, MAIL_PASS, MAIL_FROM, OWNER_EMAIL],
  },
  async (event) => {
    const snap = event.data;
    if (!snap) {
      logger.warn("user create event had no snapshot");
      return;
    }
    const data = snap.data() as {
      email?: string;
      displayName?: string;
      createdAt?: { toDate?: () => Date };
    };

    // The OWNER_EMAIL secret is the ONLY source of the destination — no fallback.
    // Fail LOUD but not forever — a missing mail config must not crash the trigger
    // (which would retry on every new sign-up). Error-log and return.
    const config = resolveMailConfig({
      host: MAIL_HOST.value(),
      user: MAIL_USER.value(),
      pass: MAIL_PASS.value(),
      from: MAIL_FROM.value(),
      to: OWNER_EMAIL.value(),
    });
    if (!config) {
      logger.error(
        "mail configuration incomplete (MAIL_USER / MAIL_PASS / OWNER_EMAIL secrets); signup email NOT sent"
      );
      return;
    }

    const createdAt =
      typeof data.createdAt?.toDate === "function"
        ? data.createdAt.toDate().toISOString()
        : new Date().toISOString();

    const newUser: NewUserLike = {
      uid: event.params.uid,
      email: data.email,
      displayName: data.displayName,
      createdAt,
    };
    const message = formatSignupEmail(newUser);

    try {
      const transport = nodemailer.createTransport({
        host: config.host,
        port: 465,
        secure: true,
        auth: { user: config.user, pass: config.pass },
      });
      await transport.sendMail({
        from: config.from,
        to: config.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      logger.info("sent signup notification email", { uid: event.params.uid });
    } catch (err) {
      // Fail soft — log, never re-throw (a thrown error would retry indefinitely).
      logger.error("failed to send signup email (non-fatal)", err);
    }
  }
);

// ── ADMIN — destructive account deletion (admin-godmode part b) ─────────────
/**
 * `deleteUser` — an ADMIN-ONLY callable that fully removes a target account and
 * every trace of it. Server-authoritative on TWO axes the client can never forge:
 *
 *   1. ADMIN GATE — the CALLER's authority is verified by READING their own
 *      `/users/{callerUid}` doc and checking `role == "admin"`. We never trust a
 *      client-supplied claim/flag; the same `role` field the rules' `isAdmin()`
 *      reads is the source of truth.
 *   2. TYPED-CONFIRM — the payload carries the target's `email`; we RE-READ the
 *      target `/users` doc and assert the stored email matches before ANY delete, so
 *      a wrong/stale `uid` can never nuke a different account than the admin
 *      confirmed (the UI makes the admin type the email to enable the control).
 *
 * The cascade is ordered DATA-before-AUTH and is idempotent (every step tolerates
 * already-gone state):
 *   a. recursive-delete the target's `characters` subcollection (each char's
 *      `combat/` + `snapshots/` subdocs go with it);
 *   b. purge the target's Storage prefix `users/{uid}/` (portraits);
 *   c. for every campaign the target belongs to: strip them from `members` +
 *      `memberDetails`, PROMOTE a remaining member if they were the DM (or delete the
 *      campaign if no members remain), AND remove them from every co-member's
 *      character `campaignReaders` / `dmReaders` ACL;
 *   d. delete the `/users/{uid}` doc;
 *   e. write the immutable `/admin_audit` record (who deleted whom, when, + counts);
 *   f. delete the Firebase Auth user (LAST — data before Auth).
 */
export const deleteUser = onCall(async (request) => {
  const db = getFirestore();

  // ── 1. Admin gate — verify the CALLER, server-side (never trust the client) ──
  const callerUid = request.auth?.uid;
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Sign-in required.");
  }
  const callerSnap = await db.collection("users").doc(callerUid).get();
  if (callerSnap.get("role") !== "admin") {
    throw new HttpsError("permission-denied", "Admin only.");
  }

  const targetUid = String((request.data as { targetUid?: unknown })?.targetUid ?? "");
  const confirmEmail = String(
    (request.data as { targetEmail?: unknown })?.targetEmail ?? ""
  );
  if (!targetUid || !confirmEmail) {
    throw new HttpsError("invalid-argument", "targetUid and targetEmail are required.");
  }
  // An admin deleting THEMSELVES would orphan the console + their own auth mid-run.
  if (targetUid === callerUid) {
    throw new HttpsError(
      "failed-precondition",
      "An admin cannot delete their own account."
    );
  }

  // ── 2. Typed-confirm — re-read the target + assert the email matches ─────────
  const targetSnap = await db.collection("users").doc(targetUid).get();
  if (!targetSnap.exists) {
    throw new HttpsError("not-found", "Target user not found (already deleted?).");
  }
  const storedEmail = targetSnap.get("email") as string | undefined;
  if (!emailMatches(storedEmail, confirmEmail)) {
    throw new HttpsError(
      "failed-precondition",
      "Confirmation email does not match the target account."
    );
  }

  const counts = {
    characters: 0,
    campaignsUpdated: 0,
    campaignsDeleted: 0,
    aclsCleaned: 0,
  };

  // ── 3a. Characters subcollection (recursive — combat/ + snapshots/ go too) ───
  const charsCol = db.collection("users").doc(targetUid).collection("characters");
  const charDocs = await charsCol.get();
  counts.characters = charDocs.size;
  // recursiveDelete removes each char doc AND its `combat/` + `snapshots/` subdocs.
  await db.recursiveDelete(charsCol);

  // ── 3b. Storage portraits — the whole `users/{uid}/` prefix ──────────────────
  try {
    await getStorage()
      .bucket()
      .deleteFiles({ prefix: `users/${targetUid}/` });
  } catch (err) {
    // Non-fatal: a missing bucket/object must not strand the rest of the cascade.
    logger.warn("deleteUser: storage purge failed (non-fatal)", err);
  }

  // ── 3c. Campaigns — membership, DM-orphaning, and co-member ACL cleanup ──────
  const campaignsSnap = await db
    .collection("campaigns")
    .where("members", "array-contains", targetUid)
    .get();
  for (const campDoc of campaignsSnap.docs) {
    const camp = campDoc.data() as CampaignLike;

    // Remove the leaver from every co-member's character ACLs FIRST (before the
    // campaign doc itself changes), so a re-run after a partial failure still finds
    // them. Each is a field-only arrayRemove (idempotent).
    for (const target of coMemberAclTargets(camp, targetUid)) {
      try {
        await db
          .collection("users")
          .doc(target.ownerUid)
          .collection("characters")
          .doc(target.charId)
          .update({
            campaignReaders: FieldValue.arrayRemove(targetUid),
            dmReaders: FieldValue.arrayRemove(targetUid),
          });
        counts.aclsCleaned++;
      } catch (err) {
        // The co-member's char may be gone — tolerate it (idempotent cascade).
        logger.warn("deleteUser: ACL cleanup skipped a missing char", err);
      }
    }

    const plan = planCampaignUpdate(camp, targetUid);
    if (plan.kind === "delete") {
      await db.recursiveDelete(campDoc.ref);
      counts.campaignsDeleted++;
    } else {
      await campDoc.ref.update({
        members: plan.members,
        memberDetails: plan.memberDetails,
        dmUid: plan.dmUid,
      });
      counts.campaignsUpdated++;
    }
  }

  // ── 3d. The user doc itself ──────────────────────────────────────────────────
  await db.collection("users").doc(targetUid).delete();

  // ── 3e. Immutable audit record (who deleted whom, when, + cascade counts) ────
  await db.collection("admin_audit").add({
    action: "deleteUser",
    actorUid: callerUid,
    targetUid,
    targetEmail: storedEmail ?? confirmEmail,
    counts,
    at: FieldValue.serverTimestamp(),
  });

  // ── 3f. Auth user LAST (data before Auth) — idempotent on already-gone ───────
  try {
    await getAuth().deleteUser(targetUid);
  } catch (err: unknown) {
    // `auth/user-not-found` is fine (a re-run, or never-signed-in record).
    if ((err as { code?: string })?.code !== "auth/user-not-found") {
      logger.error("deleteUser: Auth deletion failed", err);
      throw new HttpsError("internal", "Account data removed, but Auth deletion failed.");
    }
  }

  logger.info("deleteUser cascade complete", { actorUid: callerUid, targetUid, counts });
  return { ok: true, counts };
});

// ── SAFE-01 — budget kill-switch (the zero-budget hard guarantee) ────────────
/**
 * `onBudgetAlert` — the standard Google-documented spend kill-switch. The Cloud
 * Billing £1 budget publishes a JSON notification to the `budget-kill` Pub/Sub topic
 * on every threshold crossing; when the ACTUAL accumulated cost exceeds the budget
 * amount this DETACHES the billing account from the project
 * (`updateProjectBillingInfo` with an empty `billingAccountName`), which forces all
 * billable usage to stop — spend can never run past ~£1.
 *
 * Guard rails (see `budget-kill.ts` for the pure decision + `docs/BUG_REPORTING.md`
 * for the setup + emergency-restore runbook):
 *   - ACTS ONLY ON ACTUAL OVERRUN — `costAmount > budgetAmount`; a forecast alert
 *     still carries the real `costAmount`, so a forecast trip never detaches billing.
 *   - IDEMPOTENT — reads the current billing state first; already-detached ⇒ no-op.
 *   - LOUD — logs at ERROR around the detach so it's unmissable in Cloud Logging.
 *
 * The runtime service account needs Billing Account Administrator (or Project Billing
 * Manager) on the billing account — a manual IAM grant (documented in the runbook);
 * it is NOT granted here.
 */
const BUDGET_KILL_TOPIC = "budget-kill";

export const onBudgetAlert = onMessagePublished(
  { topic: BUDGET_KILL_TOPIC },
  async (event) => {
    // Decode the Pub/Sub payload defensively — a non-JSON body must not crash-loop.
    let raw: unknown;
    try {
      raw = event.data.message.json;
    } catch {
      logger.error("budget kill-switch: message payload was not valid JSON; ignoring");
      return;
    }

    const notification = parseBudgetNotification(raw);
    const decision = decideBudgetKill(notification);
    logger.info("budget kill-switch: alert received", {
      budget: notification?.budgetDisplayName,
      costAmount: notification?.costAmount,
      budgetAmount: notification?.budgetAmount,
      decision,
    });

    if (!decision.disable) {
      logger.info(`budget kill-switch: no action — ${decision.reason}`);
      return;
    }

    // GCLOUD_PROJECT is set in the Functions runtime; guard anyway.
    const projectId = process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT;
    if (!projectId) {
      logger.error(
        "budget kill-switch: project id unavailable in env; cannot detach billing"
      );
      return;
    }
    const projectName = `projects/${projectId}`;
    const billing = new CloudBillingClient();

    // Idempotency — already detached ⇒ no-op (a re-published alert must not error).
    const [info] = await billing.getProjectBillingInfo({ name: projectName });
    if (!info.billingEnabled) {
      logger.warn("budget kill-switch: billing ALREADY disabled — no-op", {
        projectName,
      });
      return;
    }

    logger.error(`budget kill-switch: DETACHING billing — ${decision.reason}`, {
      projectName,
      costAmount: notification?.costAmount,
      budgetAmount: notification?.budgetAmount,
    });
    const [result] = await billing.updateProjectBillingInfo({
      name: projectName,
      projectBillingInfo: { billingAccountName: "" }, // "" ⇒ detach billing account
    });
    logger.error("budget kill-switch: billing DETACHED — usage will now stop", {
      projectName,
      billingEnabled: result.billingEnabled,
    });
  }
);

// ── ogShell: per-link Open Graph previews for the two shared route families ──
//
// A crawler (WhatsApp · Discord · Slack · iMessage · Telegram · X · Google) fetches
// a shared URL once with NO JavaScript, so a client-rendered SPA cannot have
// per-link previews on its own: every URL would unfurl as the same generic card.
// Firebase Hosting rewrites `/view/**` and `/join/**` here (see `firebase.json`);
// this serves the SAME built `index.html` with the entity's tags spliced in between
// its `og:start` / `og:end` markers. The page a human then gets is the identical
// SPA shell — this adds a preview, never a second rendering path.
//
// EXPOSURE (enforced in `og-meta.ts`, and re-asserted here at the read): a character
// only when its document carries `shared: true`, and then only name / level / class;
// a campaign only its NAME, and only for an invite code that resolves to a campaign
// whose joins are still open (the code IS the campaign's doc id — the same secret the
// join flow already treats as the grant). Everything else is served the UNTOUCHED
// shell, i.e. the baseline branded card `index.html` already carries: an unshared,
// locked or unknown id is then byte-identical to any other route.
//
// ZERO-BUDGET: the response is CDN-cacheable per URL (`s-maxage`), so in practice
// this runs on a crawl or a cold first hit, not per pageview — and returning users
// never reach it at all (the service worker answers those navigations from the
// precached shell). A revoked link can keep its cached TITLE until `s-maxage`
// expires; the sheet behind it is denied immediately by `firestore.rules`, so the
// stale value is a name, never access.
const OG_CACHE_CONTROL = "public, max-age=300, s-maxage=3600";

/** The built shell, fetched once per warm instance from Hosting's own origin. */
let shellCache: { origin: string; html: string } | null = null;
async function loadShell(origin: string): Promise<string> {
  if (shellCache?.origin === origin) return shellCache.html;
  const res = await fetch(`${origin}/index.html`);
  if (!res.ok) throw new Error(`shell fetch failed: ${res.status}`);
  const html = await res.text();
  shellCache = { origin, html };
  return html;
}

/** Resolve the card for a shared path, or null to serve the shell as-built. */
async function resolveCard(pathname: string, url: string): Promise<OgCard | null> {
  const target = parseSharePath(pathname);
  if (!target) return null;
  const db = getFirestore();
  if (target.kind === "character") {
    const snap = await db
      .collection("users")
      .doc(target.uid)
      .collection("characters")
      .doc(target.charId)
      .get();
    // The Admin SDK bypasses firestore.rules, so the share grant is re-checked HERE.
    if (!snap.exists || snap.get("shared") !== true) return null;
    return characterCard((snap.get("cache") ?? {}) as Record<string, unknown>, url);
  }
  const camp = await db.collection("campaigns").doc(target.code).get();
  if (!camp.exists) return null;
  // `campaignCard` re-checks the joins lock — the DM's kill switch for a leaked link
  // (the Admin SDK bypasses the rules that enforce it on the join itself).
  return campaignCard(camp.data() ?? {}, url);
}

export const ogShell = onRequest(async (req, res) => {
  // Fetch the shell from whoever served this request (prod / preview / emulator);
  // advertise the CANONICAL origin in og:url regardless.
  const origin = shellOrigin(req.headers as Record<string, string | undefined>);
  const url = `${SITE}${req.path}`;
  let card: OgCard | null = null;
  try {
    card = await resolveCard(req.path, url);
  } catch (e) {
    // A lookup failure is a PREVIEW failure, never a page failure: fall through to
    // the shell's baseline card so the link still opens.
    logger.warn("ogShell: entity lookup failed; serving the shell untouched", {
      path: req.path,
      error: e instanceof Error ? e.message : String(e),
    });
  }
  try {
    const shell = await loadShell(origin);
    res
      .status(200)
      .set("Cache-Control", OG_CACHE_CONTROL)
      .set("Content-Type", "text/html; charset=utf-8")
      // No card ⇒ the shell EXACTLY as built, baseline tags and all. One copy of the
      // generic card, in `index.html`, so the two can never drift apart.
      .send(card ? injectOgTags(shell, card) : shell);
  } catch (e) {
    // The shell itself is unreachable — redirect rather than serve a broken page.
    logger.error("ogShell: could not load the app shell", {
      error: e instanceof Error ? e.message : String(e),
    });
    res.redirect(302, `${origin}/`);
  }
});
