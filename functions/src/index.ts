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
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";
import { isDeepStrictEqual } from "node:util";
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
  parseOgImagePath,
  characterCard,
  campaignCard,
  characterImageUrl,
  campaignImageUrl,
  injectOgTags,
  shellOrigin,
  SITE,
  CARD_GENERIC,
  CARD_CHARACTER,
  CARD_CAMPAIGN,
  type OgCard,
} from "./og-meta";
import {
  characterImageData,
  campaignImageData,
  characterSvg,
  campaignSvg,
  tryRender,
  makeImageMemo,
  ogImageKey,
  type ImageMemoEntry,
} from "./og-image";
import { asOgLocale, type OgLocale } from "./og-i18n";

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

type PublicCharacterStatus = "active" | "retired" | "dead" | "archived";

interface PublicPortraitCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PublicCharacterProjection {
  publicSchema: 1;
  schema: 3;
  build: Record<string, unknown>;
  cache: Record<string, unknown>;
  status: PublicCharacterStatus;
  hasPortrait: boolean;
  portraitCrop: PublicPortraitCrop | null;
  sourceUpdatedAt: Timestamp;
}

const PUBLIC_PROJECTION_KEYS = [
  "publicSchema",
  "schema",
  "build",
  "cache",
  "status",
  "hasPortrait",
  "portraitCrop",
  "sourceUpdatedAt",
] as const;
const PUBLIC_CACHE_KEYS = ["name", "ac", "hpMax", "speed", "raceId", "classes"] as const;
const PUBLIC_CLASS_KEYS = [
  "classId",
  "level",
  "subclassId",
  "weaponMasteries",
  "metamagicChoices",
  "invocationChoices",
  "maneuverChoices",
  "fightingStyles",
] as const;
const PUBLIC_CLASS_OPTIONAL_LIST_KEYS = [
  "weaponMasteries",
  "metamagicChoices",
  "invocationChoices",
  "maneuverChoices",
  "fightingStyles",
] as const;
const PUBLIC_STATUSES = new Set<PublicCharacterStatus>([
  "active",
  "retired",
  "dead",
  "archived",
]);

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[]
): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every((key) => expected.includes(key));
}

function nonEmptyString(value: unknown, maxLength?: number): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    (maxLength === undefined || value.length <= maxLength)
  );
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function validStringList(value: unknown): boolean {
  return Array.isArray(value) && value.every((entry) => nonEmptyString(entry));
}

function validPublicClass(value: unknown): boolean {
  if (!plainRecord(value)) return false;
  const keys = Object.keys(value);
  if (
    !keys.includes("classId") ||
    !keys.includes("level") ||
    keys.some(
      (key) => !PUBLIC_CLASS_KEYS.includes(key as (typeof PUBLIC_CLASS_KEYS)[number])
    )
  ) {
    return false;
  }
  if (
    !nonEmptyString(value.classId) ||
    !Number.isInteger(value.level) ||
    !(typeof value.level === "number" && value.level > 0)
  ) {
    return false;
  }
  if (Object.hasOwn(value, "subclassId") && !nonEmptyString(value.subclassId))
    return false;
  return PUBLIC_CLASS_OPTIONAL_LIST_KEYS.every(
    (key) => !Object.hasOwn(value, key) || validStringList(value[key])
  );
}

function validPublicCache(value: unknown): value is Record<string, unknown> {
  if (!plainRecord(value) || !hasExactKeys(value, PUBLIC_CACHE_KEYS)) return false;
  return (
    nonEmptyString(value.name, 200) &&
    finiteNonNegative(value.ac) &&
    finiteNonNegative(value.hpMax) &&
    typeof value.speed === "string" &&
    typeof value.raceId === "string" &&
    Array.isArray(value.classes) &&
    value.classes.every(validPublicClass)
  );
}

function validPublicCrop(value: unknown): value is PublicPortraitCrop | null {
  if (value === null) return true;
  if (!plainRecord(value) || !hasExactKeys(value, ["x", "y", "width", "height"])) {
    return false;
  }
  const { x, y, width, height } = value;
  return (
    typeof x === "number" &&
    Number.isFinite(x) &&
    x >= 0 &&
    x < 100 &&
    typeof y === "number" &&
    Number.isFinite(y) &&
    y >= 0 &&
    y < 100 &&
    typeof width === "number" &&
    Number.isFinite(width) &&
    width > 0 &&
    x + width <= 100 &&
    typeof height === "number" &&
    Number.isFinite(height) &&
    height > 0 &&
    y + height <= 100
  );
}

/**
 * Validate the public projection against the current private parent. The Admin SDK
 * bypasses Firestore Rules, so every anonymous server read crosses this exact gate:
 * current share grant, current ownership generation, exact closed projection schema,
 * and byte-equivalent exposed facts stamped by the same parent revision.
 */
export function validatePublicCharacterProjection(
  parentValue: unknown,
  projectionValue: unknown
): PublicCharacterProjection | null {
  if (!plainRecord(parentValue) || !plainRecord(projectionValue)) return null;
  if (
    parentValue.shared !== true ||
    parentValue.playStateVersion !== 1 ||
    !plainRecord(parentValue.state) ||
    Object.keys(parentValue.state).length !== 0 ||
    parentValue.schema !== 3 ||
    !plainRecord(parentValue.build) ||
    !(parentValue.updatedAt instanceof Timestamp) ||
    !hasExactKeys(projectionValue, PUBLIC_PROJECTION_KEYS) ||
    projectionValue.publicSchema !== 1 ||
    projectionValue.schema !== 3 ||
    !plainRecord(projectionValue.build) ||
    !validPublicCache(projectionValue.cache) ||
    typeof projectionValue.status !== "string" ||
    !PUBLIC_STATUSES.has(projectionValue.status as PublicCharacterStatus) ||
    typeof projectionValue.hasPortrait !== "boolean" ||
    !validPublicCrop(projectionValue.portraitCrop) ||
    !(projectionValue.sourceUpdatedAt instanceof Timestamp)
  ) {
    return null;
  }

  const hasPortrait =
    typeof parentValue.portraitUrl === "string" && parentValue.portraitUrl.length > 0;
  const expectedPortraitCrop = hasPortrait ? (parentValue.portraitCrop ?? null) : null;
  if (
    projectionValue.hasPortrait !== hasPortrait ||
    !projectionValue.sourceUpdatedAt.isEqual(parentValue.updatedAt) ||
    !isDeepStrictEqual(projectionValue.build, parentValue.build) ||
    !isDeepStrictEqual(projectionValue.cache, parentValue.cache) ||
    projectionValue.status !== parentValue.status ||
    !isDeepStrictEqual(projectionValue.portraitCrop, expectedPortraitCrop)
  ) {
    return null;
  }
  return projectionValue as unknown as PublicCharacterProjection;
}

const PUBLIC_PARENT_FIELD_MASK = [
  "shared",
  "playStateVersion",
  "state",
  "schema",
  "build",
  "cache",
  "status",
  "portraitUrl",
  "portraitCrop",
  "updatedAt",
];

/** One Admin-side loader shared by the HTML card, rendered card, and portrait route. */
async function loadPublicCharacterProjection(
  uid: string,
  charId: string
): Promise<PublicCharacterProjection | null> {
  const db = getFirestore();
  const parentRef = db.collection("users").doc(uid).collection("characters").doc(charId);
  const projectionRef = parentRef.collection("public").doc("sheet");
  const [parentSnaps, projectionSnap] = await Promise.all([
    db.getAll(parentRef, { fieldMask: PUBLIC_PARENT_FIELD_MASK }),
    projectionRef.get(),
  ]);
  const parentSnap = parentSnaps[0];
  if (!parentSnap?.exists || !projectionSnap.exists) return null;
  return validatePublicCharacterProjection(parentSnap.data(), projectionSnap.data());
}

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

/**
 * The OWNER's stored UI locale (`users/{uid}.settings.language`) — the locale the
 * DYNAMIC card + meta render in. The crawler carries no recipient locale and a card is
 * cached once for everyone, so the OWNER's locale is the only cache-consistent choice:
 * it is a stable property of the identity, so the render stays deterministic per link
 * (the memo key can stay locale-free). NEVER throws — an absent/unreadable value falls
 * to EN so a locale-read failure can never break the preview.
 */
async function ownerLocale(uid: string): Promise<OgLocale> {
  try {
    const snap = await getFirestore().collection("users").doc(uid).get();
    return asOgLocale(snap.get("settings.language"));
  } catch (e) {
    logger.warn("og: owner locale read failed; rendering EN", {
      uid,
      error: e instanceof Error ? e.message : String(e),
    });
    return "en";
  }
}

/** Resolve the card for a shared path, or null to serve the shell as-built. */
async function resolveCard(pathname: string, url: string): Promise<OgCard | null> {
  const target = parseSharePath(pathname);
  if (!target) return null;
  const db = getFirestore();
  if (target.kind === "character") {
    const projection = await loadPublicCharacterProjection(target.uid, target.charId);
    if (!projection) return null;
    return characterCard(
      projection.cache,
      url,
      characterImageUrl(target.uid, target.charId),
      await ownerLocale(target.uid)
    );
  }
  const camp = await db.collection("campaigns").doc(target.code).get();
  if (!camp.exists) return null;
  // `campaignCard` re-checks the joins lock — the DM's kill switch for a leaked link
  // (the Admin SDK bypasses the rules that enforce it on the join itself). Localise to
  // the DM's locale (the campaign's owner).
  const dmUid =
    typeof camp.get("dmUid") === "string" ? (camp.get("dmUid") as string) : "";
  return campaignCard(
    camp.data() ?? {},
    url,
    campaignImageUrl(target.code),
    dmUid ? await ownerLocale(dmUid) : "en"
  );
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
      // No card ⇒ `injectOgTags` hands back the shell EXACTLY as built, baseline tags
      // and all. One copy of the generic card, in `index.html`, so nothing can drift.
      .send(injectOgTags(shell, card));
  } catch (e) {
    // The shell itself is unreachable — redirect rather than serve a broken page.
    logger.error("ogShell: could not load the app shell", {
      error: e instanceof Error ? e.message : String(e),
    });
    res.redirect(302, `${origin}/`);
  }
});

// ── ogImage: the DYNAMIC per-link preview PNG the og:image tag points at ──────
//
// `ogShell` splices an `og:image` that points HERE (`/og/character/:uid/:id.png`,
// `/og/campaign/:code.png` — Hosting rewrites `/og/**` to this function). A crawler
// reads the shell, then fetches that URL and receives a 1200×630 PNG rendered per
// link (`og-image.ts`): the folio card art with the entity's own name / level / class
// / AC · HP / portrait painted over the static placeholder.
//
// SAME GATE, RE-ASSERTED: a character renders only from its current validated
// `public/sheet` projection; a campaign only while joins are unlocked. Anything
// unshared / stale / locked / unknown, and any render or lookup failure, redirects to
// the static per-type card. Portrait bytes are fetched only when that projection says
// they exist; the private parent's cache and Storage URL never enter a public render.
//
// CACHE: content now varies per link, so this is tuned SHORTER than the shell — a
// revoked link's rendered card can linger at the CDN for ≤ `s-maxage` (~15 min), but
// it shows only a name + portrait (the same facts the shell's title already cached);
// the SHEET behind it is denied immediately by `firestore.rules`. An ETag lets a warm
// CDN/crawler revalidate with a 304 instead of re-downloading the PNG.
const OG_IMAGE_CACHE = "public, max-age=300, s-maxage=900";

// The render is anonymous, uncached-per-query at the CDN (Firebase Hosting keys its
// cache on the FULL URL incl. query string — docs/hosting/manage-cache — so a
// `…png?i=1,2,3…` flood misses the CDN every time), and does real per-request CPU
// (resvg raster + a Firestore read + a Storage download). Two belts bound the blast
// radius on a zero-budget project WITHOUT reaching for the SAFE-01 billing kill-switch
// (that is the nuclear money backstop, never the routine DoS control):
//   1. `maxInstances` on the route (below) caps concurrent renders regardless of the
//      CDN key — the app stays UP under a flood instead of fanning out to 100 instances.
//   2. A warm-instance memo keyed on the PARSED IDENTITY (query-agnostic AND
//      path-spelling-agnostic) folds a junk-query OR path-fuzzing flood back onto ONE
//      render, re-serving cached bytes + ETag from memory.
// TTL tracks `s-maxage` (900s); the cap bounds memory (~64 cards ≈ a few MB of PNG).
const ogImageMemo = makeImageMemo(64, 900_000);

/** Reproduce the app's percentage crop inside a square SVG portrait source. */
function framePortrait(dataUri: string, crop: PublicPortraitCrop | null): string {
  if (!crop) return dataUri;
  const size = 100;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"` +
    ` viewBox="0 0 ${size} ${size}">` +
    `<image href="${dataUri}" x="${(-crop.x / crop.width) * size}"` +
    ` y="${(-crop.y / crop.height) * size}"` +
    ` width="${(100 / crop.width) * size}" height="${(100 / crop.height) * size}"` +
    ` preserveAspectRatio="xMidYMid slice"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/** A projection-gated portrait as a data URI, or null on a missing Storage object. */
async function fetchPortrait(
  uid: string,
  charId: string,
  crop: PublicPortraitCrop | null
): Promise<string | null> {
  try {
    const [buf] = await getStorage()
      .bucket()
      .file(`users/${uid}/portraits/${charId}.jpeg`)
      .download();
    return framePortrait(`data:image/jpeg;base64,${buf.toString("base64")}`, crop);
  } catch (e) {
    logger.warn("ogImage: portrait read failed; rendering the initial instead", {
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

/**
 * Render the PNG for a shared-image path, or `null` to serve the static fallback.
 * `null` covers every non-render outcome — unshared / locked / unknown id — and
 * `tryRender` folds a rasterise failure into `null` too, so the caller's ONE branch
 * (`null` ⇒ redirect to the static card) covers them all.
 */
async function resolveImage(pathname: string): Promise<Buffer | null> {
  const target = parseOgImagePath(pathname);
  if (!target) return null;
  const db = getFirestore();
  if (target.kind === "character") {
    const projection = await loadPublicCharacterProjection(target.uid, target.charId);
    if (!projection) return null;
    const portrait = projection.hasPortrait
      ? await fetchPortrait(target.uid, target.charId, projection.portraitCrop)
      : null;
    const data = characterImageData(projection.cache, portrait);
    // Owner locale = the path uid. Deterministic per identity, so the memo key stays
    // locale-free (the same link always renders the same locale ⇒ the same bytes).
    return data ? tryRender(characterSvg(data, await ownerLocale(target.uid))) : null;
  }
  const camp = await db.collection("campaigns").doc(target.code).get();
  if (!camp.exists) return null;
  const data = campaignImageData(camp.data() ?? {});
  const dmUid =
    typeof camp.get("dmUid") === "string" ? (camp.get("dmUid") as string) : "";
  return data
    ? tryRender(campaignSvg(data, dmUid ? await ownerLocale(dmUid) : "en"))
    : null;
}

/** The static per-type card a failed/ungated image request redirects to. */
function fallbackCard(pathname: string): string {
  const target = parseOgImagePath(pathname);
  if (target?.kind === "character") return CARD_CHARACTER;
  if (target?.kind === "campaign") return CARD_CAMPAIGN;
  return CARD_GENERIC;
}

interface PublicPortraitTarget {
  uid: string;
  charId: string;
}

/** Exact parser for `/og/portrait/{uid}/{charId}.jpeg`; malformed encoding fails shut. */
export function parsePublicPortraitPath(pathname: string): PublicPortraitTarget | null {
  const parts = pathname.split("/").filter(Boolean);
  if (
    parts.length !== 4 ||
    parts[0] !== "og" ||
    parts[1] !== "portrait" ||
    !parts[2] ||
    !parts[3]?.endsWith(".jpeg")
  ) {
    return null;
  }
  const encodedCharId = parts[3].slice(0, -".jpeg".length);
  if (!encodedCharId) return null;
  try {
    const uid = decodeURIComponent(parts[2]);
    const charId = decodeURIComponent(encodedCharId);
    if (!uid || !charId || uid.includes("/") || charId.includes("/")) return null;
    return { uid, charId };
  } catch {
    return null;
  }
}

const PORTRAIT_CACHE_CONTROL = "private, no-store, max-age=0";

interface PortraitResponse extends NodeJS.WritableStream {
  headersSent: boolean;
  writableEnded: boolean;
  status(code: number): PortraitResponse;
  set(name: string, value: string): PortraitResponse;
}

function portraitNotFound(res: PortraitResponse): void {
  res.status(404).set("Cache-Control", PORTRAIT_CACHE_CONTROL).end();
}

async function servePublicPortrait(
  target: PublicPortraitTarget,
  res: PortraitResponse
): Promise<void> {
  const projection = await loadPublicCharacterProjection(target.uid, target.charId);
  if (!projection?.hasPortrait) {
    portraitNotFound(res);
    return;
  }

  const stream = getStorage()
    .bucket()
    .file(`users/${target.uid}/portraits/${target.charId}.jpeg`)
    .createReadStream();
  await new Promise<void>((resolve) => {
    let connected = false;
    stream.once("response", () => {
      connected = true;
      res
        .status(200)
        .set("Cache-Control", PORTRAIT_CACHE_CONTROL)
        .set("Content-Type", "image/jpeg")
        .set("X-Content-Type-Options", "nosniff");
      stream.pipe(res).once("finish", resolve);
    });
    stream.once("error", () => {
      if (!connected && !res.headersSent) portraitNotFound(res);
      else if (!res.writableEnded) res.end();
      resolve();
    });
  });
}

// `maxInstances: 3` OVERRIDES the package default (gen-2's up-to-100) for THIS route
// only — the other functions keep the global. It is the hard ceiling on concurrent
// renders: a flood queues against 3 instances rather than fanning out and running up
// CPU-seconds. See the memo note above for why the CDN can't be relied on to dedupe.
export const ogImage = onRequest({ maxInstances: 3 }, async (req, res) => {
  if (req.path === "/og/portrait" || req.path.startsWith("/og/portrait/")) {
    const target = parsePublicPortraitPath(req.path);
    if (!target) {
      portraitNotFound(res);
      return;
    }
    try {
      await servePublicPortrait(target, res);
    } catch (e) {
      logger.warn("ogImage: portrait lookup failed", {
        error: e instanceof Error ? e.message : String(e),
      });
      if (!res.headersSent) portraitNotFound(res);
    }
    return;
  }

  let entry: ImageMemoEntry | null = null;
  try {
    // Memoised per PARSED IDENTITY (query-agnostic AND path-spelling-agnostic) — a burst
    // on one link, however its path/query is fuzzed, rasterises ONCE and re-serves the
    // same bytes + ETag from memory (see `ogImageMemo`/`ogImageKey` notes above). An
    // unparseable path never reaches the memo: it falls straight to the static card.
    const target = parseOgImagePath(req.path);
    entry = target
      ? await ogImageMemo(ogImageKey(target), () => resolveImage(req.path))
      : null;
  } catch (e) {
    // A lookup failure is a PREVIEW failure, never a page failure — fall to the static
    // card (handled below by the `null` branch), never a 500 that could leak.
    logger.warn("ogImage: entity lookup failed; serving the static card", {
      path: req.path,
      error: e instanceof Error ? e.message : String(e),
    });
  }
  if (!entry) {
    // Unshared / locked / unknown / any error → the designed static per-type card.
    res.redirect(302, fallbackCard(req.path));
    return;
  }
  const { etag, png } = entry;
  if (req.headers["if-none-match"] === etag) {
    res.status(304).set("Cache-Control", OG_IMAGE_CACHE).set("ETag", etag).end();
    return;
  }
  res
    .status(200)
    .set("Cache-Control", OG_IMAGE_CACHE)
    .set("Content-Type", "image/png")
    .set("ETag", etag)
    .send(png);
});
