/**
 * AdminPage — the role-gated admin console (Phase 6 re-home of the legacy
 * `app/routes/admin.tsx`).
 *
 * A PURE VIEW: it reads the shared `useIsAdmin` gate + `authStore` identity and
 * the admin io functions in `@/lib/firestore` (`listAllUsers`, `setUserStatus`,
 * `countCharactersPerUser`, `listCampaignSummaries`, `listUserCharacters`,
 * `deleteUserAccount`, `listBugReports`), and dispatches to them — no business logic,
 * no Firestore queries of its own. Beyond the stats strip + block/unblock + "new
 * since last visit", each user row carries a per-user metric strip (characters ·
 * campaigns · DM) DERIVED from the same two payloads that feed the overview totals,
 * an inline CHARACTER DRILL-DOWN (open any character as a read-only sheet), and a
 * destructive DELETE behind a typed-email confirm. A minimal BUG INBOX surfaces
 * stranded reports. It wears the shipped folio primitives (`PageHeader`, `Section`,
 * `InfoCard`, `Button`, `Input`, `Badge`, `RunicEmptyState`) and folio semantic
 * tokens, no raw palette hues.
 *
 * `useIsAdmin` is the SINGLE admin gate app-wide; `useAuthStore` is kept only to
 * mark/disable the current admin's own row (you can't block or delete yourself).
 */

import { useState, useEffect } from "react";
import type { ComponentType, SVGProps } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import {
  Shield,
  ShieldOff,
  RefreshCw,
  Users,
  Swords,
  Map,
  Crown,
  Home,
  Trash2,
  Eye,
  ChevronDown,
  Bug,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import { useConfirmStore } from "@/stores/confirmStore";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { PageHeader } from "@/components/shared/PageHeader";
import { Section } from "@/components/shared/Section";
import { InfoCard } from "@/components/shared/InfoCard";
import { Portrait } from "@/components/shared/Portrait";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Icon } from "@/components/ui/icon";
import { RunicEmptyState } from "@/components/ui/runic-empty-state";
import {
  listAllUsers,
  setUserStatus,
  countCharactersPerUser,
  listCampaignSummaries,
  listUserCharacters,
  deleteUserAccount,
  listBugReports,
  type AdminCampaignSummary,
  type AdminUserCharacter,
  type AdminBugReport,
} from "@/lib/firestore";
import { getClosedIssueNumbers } from "@/lib/github-issue-state";

const LAST_VISIT_KEY = "admin_last_visit";

type AdminUser = {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  status: "active" | "blocked";
  role: "admin" | null;
  createdAt: Date | null;
  lastActiveAt: Date | null;
};

/** Per-user metrics derived once from the character-count map + campaign list. */
type UserMetrics = {
  /** Characters in the user's roster, or null until the count resolves. */
  characters: number | null;
  /** Campaigns the user belongs to. */
  campaigns: number;
  /** Campaigns the user runs as DM. */
  dm: number;
};

/** A user's loaded character roster (drill-down): the list, or a status sentinel. */
type RosterState = AdminUserCharacter[] | "loading" | "error";

export function AdminPage() {
  const { t } = useTranslation();
  useDocumentTitle(t("nav.admin"));
  const navigate = useNavigate();
  const isAdmin = useIsAdmin();
  const user = useAuthStore((s) => s.user);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  // Per-user character counts (uid → count) and the slim campaign list — both load
  // after the user list and feed BOTH the per-user metric strip and the overview
  // totals (derived below), so the panel never double-counts or drifts.
  const [charCounts, setCharCounts] = useState<Record<string, number> | null>(null);
  const [campaigns, setCampaigns] = useState<AdminCampaignSummary[] | null>(null);
  // The bug inbox — loaded alongside the roster (non-blocking). null until resolved.
  // Reports whose GitHub issue is CLOSED are filtered out at load (owner ruling: a
  // closed report doesn't render). `bugClosureUnknown` is true when GitHub couldn't
  // be reached (offline / private repo) — the inbox then shows all with a quiet note.
  const [bugReports, setBugReports] = useState<AdminBugReport[] | null>(null);
  const [bugClosureUnknown, setBugClosureUnknown] = useState(false);
  // Character drill-down: which row is expanded + the per-user roster cache.
  const [expandedUid, setExpandedUid] = useState<string | null>(null);
  const [rosters, setRosters] = useState<Record<string, RosterState>>({});
  // Delete flow: which row's typed-confirm is open + the in-flight uid.
  const [deleteOpenUid, setDeleteOpenUid] = useState<string | null>(null);
  const [deletingUid, setDeletingUid] = useState<string | null>(null);
  // Stable "now" value so Date.now() isn't called in render (React purity rule)
  const [now] = useState(() => Date.now());
  // Read last-visit timestamp once at mount — lazy initializer avoids setState in effect
  const [lastVisit] = useState<Date | null>(() => {
    const stored = localStorage.getItem(LAST_VISIT_KEY);
    return stored ? new Date(stored) : null;
  });

  // Bumping this re-runs the load effect — used by the "Refresh" button. Avoids an
  // external `loadUsers` dependency (which the React Compiler lint would flag for
  // calling setState inside the effect).
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!isAdmin) return;
    // Cancellation guard (#59 F19): the admin can navigate away mid-load; without
    // this, the awaited resolves would setState on an unmounted component.
    let alive = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await listAllUsers();
        if (!alive) return;
        setUsers(data);
        // Load per-user metrics + the bug inbox after the roster — non-blocking, so
        // the list paints immediately and the rest fills in.
        const uids = data.map((u) => u.uid);
        countCharactersPerUser(uids)
          .then((counts) => alive && setCharCounts(counts))
          .catch(() => alive && setCharCounts(null));
        listCampaignSummaries()
          .then((list) => alive && setCampaigns(list))
          .catch(() => alive && setCampaigns(null));
        // Load the reports AND the closed-issue set together, then hide any report
        // whose GitHub issue is closed. When GitHub is unreachable (`closed === null`)
        // nothing is hidden and the inbox flags the note (graceful degrade).
        Promise.all([listBugReports(), getClosedIssueNumbers()])
          .then(([reports, closed]) => {
            if (!alive) return;
            if (closed) {
              setBugReports(
                reports.filter(
                  (r) => r.issueNumber === null || !closed.has(r.issueNumber)
                )
              );
              setBugClosureUnknown(false);
            } else {
              setBugReports(reports);
              setBugClosureUnknown(true);
            }
          })
          .catch(() => {
            if (!alive) return;
            setBugReports([]);
            setBugClosureUnknown(false);
          });
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : t("admin.failedLoad"));
      } finally {
        if (alive) setLoading(false);
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, [isAdmin, reloadKey, t]);

  // Record this visit once admin opens the panel, so next open can compute the
  // new-user delta. Separate from data loading so it isn't re-run spuriously.
  useEffect(() => {
    if (!isAdmin) return;
    localStorage.setItem(LAST_VISIT_KEY, new Date().toISOString());
  }, [isAdmin]);

  async function handleToggleBlock(
    uid: string,
    current: "active" | "blocked",
    name: string
  ) {
    const newStatus: "active" | "blocked" = current === "blocked" ? "active" : "blocked";
    // God-mode actions are DELIBERATE: blocking a live user locks them out on the
    // spot, so it goes through the shared confirm (unblocking is restorative and
    // stays one tap). The typed-email delete keeps its own heavier ritual.
    if (newStatus === "blocked") {
      const ok = await useConfirmStore.getState().confirm({
        title: t("admin.blockConfirmTitle", { name }),
        message: t("admin.blockConfirmBody"),
        confirmLabel: t("admin.block"),
        cancelLabel: t("common.cancel"),
        tone: "danger",
      });
      if (!ok) return;
    }
    setToggling(uid);
    try {
      await setUserStatus(uid, newStatus);
      setUsers((prev) =>
        prev.map((u) => (u.uid === uid ? { ...u, status: newStatus } : u))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : t("admin.failedUpdate"));
    } finally {
      setToggling(null);
    }
  }

  // Toggle a user's character drill-down; lazy-load their roster on first open.
  function handleToggleCharacters(uid: string) {
    setExpandedUid((cur) => (cur === uid ? null : uid));
    if (rosters[uid]) return; // cached — don't re-fetch
    setRosters((prev) => ({ ...prev, [uid]: "loading" }));
    listUserCharacters(uid)
      .then((list) => setRosters((prev) => ({ ...prev, [uid]: list })))
      .catch(() => setRosters((prev) => ({ ...prev, [uid]: "error" })));
  }

  async function handleDelete(uid: string, email: string) {
    setDeletingUid(uid);
    setError(null);
    try {
      await deleteUserAccount(uid, email);
      // Drop the row optimistically — the server cascade is authoritative.
      setUsers((prev) => prev.filter((u) => u.uid !== uid));
      setDeleteOpenUid(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("admin.deleteFailed"));
    } finally {
      setDeletingUid(null);
    }
  }

  // Not admin — folio access-denied screen (the gate is useIsAdmin alone).
  if (!isAdmin) {
    return (
      <main
        id="main"
        className="flex min-h-[70vh] items-center justify-center px-4 py-12"
      >
        <RunicEmptyState
          glyph={ShieldOff}
          color="var(--color-danger)"
          title={t("admin.accessRequired")}
          blurb={t("admin.accessDesc")}
          actions={
            <Button variant="secondary" onClick={() => void navigate("/")}>
              <Icon as={Home} size="sm" decorative />
              {t("admin.backToHome")}
            </Button>
          }
        />
      </main>
    );
  }

  const activeCount = users.filter((u) => u.status === "active").length;
  const blockedCount = users.filter((u) => u.status === "blocked").length;
  const newUserCount = lastVisit
    ? users.filter((u) => u.createdAt && u.createdAt > lastVisit).length
    : 0;

  // Overview totals derive from the SAME per-user data the rows show (summed char
  // map · campaign list length), so a row and the strip can never disagree — and
  // there's no separate aggregate query to drift. null until the data resolves.
  const totalCharacters = charCounts
    ? Object.values(charCounts).reduce((sum, n) => sum + n, 0)
    : null;
  const totalCampaigns = campaigns?.length ?? null;
  // Per-user campaign + DM tallies, folded once from the campaign list.
  const { member: campaignsByUser, dm: dmByUser } = campaignTallies(campaigns);

  return (
    <main id="main" className="page-shell on-art-scope py-8">
      <PageHeader
        as="h1"
        crest
        title={t("admin.title")}
        hint={t("admin.subtitle")}
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setReloadKey((k) => k + 1)}
            disabled={loading}
          >
            <Icon
              as={RefreshCw}
              size="sm"
              decorative
              className={cn(loading && "animate-spin")}
            />
            {t("common.refresh")}
          </Button>
        }
      />

      {/* ── Overview: the stats strip ─────────────────────────────────────── */}
      <Section title={t("admin.overview")}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard
            label={t("admin.totalUsers")}
            value={users.length}
            icon={Users}
            tone="text-info"
            badge={
              newUserCount > 0
                ? t("admin.newSinceLastVisit", { count: newUserCount })
                : undefined
            }
          />
          <StatCard
            label={t("admin.activeUsers")}
            value={activeCount}
            icon={Shield}
            tone="text-success"
          />
          <StatCard
            label={t("admin.blockedUsers")}
            value={blockedCount}
            icon={ShieldOff}
            tone="text-error"
          />
          <StatCard
            label={t("admin.totalCharacters")}
            value={totalCharacters ?? "—"}
            icon={Swords}
            tone="text-accent"
          />
          <StatCard
            label={t("admin.totalCampaigns")}
            value={totalCampaigns ?? "—"}
            icon={Map}
            tone="text-warning"
          />
        </div>
      </Section>

      {/* ── Users ─────────────────────────────────────────────────────────── */}
      <Section title={t("admin.users")}>
        {error && (
          <div
            role="alert"
            className="mb-4 rounded border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"
          >
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : users.length === 0 ? (
          <p className="py-10 text-center text-sm text-text-muted">
            {t("admin.noUsers")}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {users.map((u) => (
              <UserRow
                key={u.uid}
                user={u}
                currentUid={user?.uid ?? ""}
                toggling={toggling === u.uid}
                isNew={!!(lastVisit && u.createdAt && u.createdAt > lastVisit)}
                now={now}
                metrics={{
                  characters: charCounts ? (charCounts[u.uid] ?? 0) : null,
                  campaigns: campaignsByUser[u.uid] ?? 0,
                  dm: dmByUser[u.uid] ?? 0,
                }}
                charsExpanded={expandedUid === u.uid}
                roster={rosters[u.uid]}
                deleteOpen={deleteOpenUid === u.uid}
                deleting={deletingUid === u.uid}
                onToggle={() =>
                  void handleToggleBlock(u.uid, u.status, u.displayName || u.email)
                }
                onToggleCharacters={() => handleToggleCharacters(u.uid)}
                onOpenSheet={(charId) =>
                  void navigate(`/admin/users/${u.uid}/characters/${charId}`)
                }
                onToggleDelete={() =>
                  setDeleteOpenUid((cur) => (cur === u.uid ? null : u.uid))
                }
                onConfirmDelete={() => void handleDelete(u.uid, u.email)}
              />
            ))}
          </ul>
        )}
      </Section>

      {/* ── Bug inbox ─────────────────────────────────────────────────────── */}
      <Section title={t("admin.bugInbox")}>
        <BugInbox reports={bugReports} closureUnknown={bugClosureUnknown} />
      </Section>
    </main>
  );
}

// ─── Derivations + sub-components ────────────────────────────────────────────

/**
 * Fold the campaign list into per-user member + DM counts in a single pass. Plain
 * (not memoized) because it runs below the page's early return where hooks are
 * illegal, and the input is small (all campaigns, once). A `null` list (still
 * loading / failed) yields empty maps, so rows read 0 until it resolves.
 */
function campaignTallies(campaigns: AdminCampaignSummary[] | null): {
  member: Record<string, number>;
  dm: Record<string, number>;
} {
  const member: Record<string, number> = {};
  const dm: Record<string, number> = {};
  for (const c of campaigns ?? []) {
    if (c.dmUid) dm[c.dmUid] = (dm[c.dmUid] ?? 0) + 1;
    for (const uid of c.members) member[uid] = (member[uid] ?? 0) + 1;
  }
  return { member, dm };
}

/**
 * One per-user metric: the `.admin-stat` carved chip plus a leading icon.
 * `value === null` shows a tabular placeholder while the count is still loading, so
 * the chip never reflows when it resolves. An `aria-label` carries the full
 * "{n} characters" reading for screen readers (the visible label is abbreviated).
 */
function MetricChip({
  icon,
  value,
  label,
  srLabel,
  tone,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  value: number | null;
  label: string;
  srLabel: string;
  /** Optional folio semantic-token text utility for the icon (e.g. DM = gold). */
  tone?: string;
}) {
  return (
    <span className="admin-stat" aria-label={srLabel}>
      <Icon as={icon} size="xs" decorative className={tone} />
      <span className="cst-val">{value ?? "—"}</span>
      <span className="cst-lbl">{label}</span>
    </span>
  );
}

function StatCard({
  label,
  value,
  icon,
  tone,
  badge,
}: {
  label: string;
  value: number | string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  /** Folio semantic-token text utility for the icon + label tint. */
  tone: string;
  badge?: string;
}) {
  return (
    <InfoCard className="flex flex-col gap-2">
      <div className={cn("flex items-center gap-1.5", tone)}>
        <Icon as={icon} size="sm" decorative />
        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <div className="flex items-end gap-2">
        <span className="font-display text-2xl font-bold text-text-primary">{value}</span>
        {badge && (
          <span className="mb-0.5 rounded bg-success/15 px-1.5 py-0.5 text-[length:var(--text-micro)] font-bold text-success">
            {badge}
          </span>
        )}
      </div>
    </InfoCard>
  );
}

function formatDate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function UserRow({
  user: u,
  currentUid,
  toggling,
  isNew,
  now,
  metrics,
  charsExpanded,
  roster,
  deleteOpen,
  deleting,
  onToggle,
  onToggleCharacters,
  onOpenSheet,
  onToggleDelete,
  onConfirmDelete,
}: {
  user: AdminUser;
  currentUid: string;
  toggling: boolean;
  isNew: boolean;
  now: number;
  metrics: UserMetrics;
  charsExpanded: boolean;
  roster: RosterState | undefined;
  deleteOpen: boolean;
  deleting: boolean;
  onToggle: () => void;
  onToggleCharacters: () => void;
  onOpenSheet: (charId: string) => void;
  onToggleDelete: () => void;
  onConfirmDelete: () => void;
}) {
  const { t } = useTranslation();
  const isYou = u.uid === currentUid;
  const isAdminUser = u.role === "admin";
  const hasCharacters = metrics.characters === null || metrics.characters > 0;

  function formatRelative(d: Date): string {
    const diff = now - d.getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return t("common.today");
    if (days === 1) return t("common.yesterday");
    if (days < 30) return t("common.daysAgo", { count: days });
    return formatDate(d);
  }

  return (
    <li>
      <InfoCard
        className={cn("flex flex-col gap-3", u.status === "blocked" && "bg-danger/5")}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {/* Avatar (#82) — the user's Google photo, or the deterministic tinted
              initial fallback (no more blank rows). */}
          <span className="topbar-avatar grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full text-sm">
            <Portrait
              src={u.photoURL}
              remote
              name={u.displayName || u.email}
              seed={u.uid}
            />
          </span>

          {/* Identity + per-user metrics */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate font-semibold text-text-primary">
                {u.displayName || u.email}
              </span>
              {isAdminUser && <Badge size="sm">{t("admin.adminTag")}</Badge>}
              {isYou && (
                <Badge size="sm" color="var(--semantic-info)">
                  {t("admin.you")}
                </Badge>
              )}
              {isNew && (
                <Badge size="sm" color="var(--semantic-success)">
                  {t("admin.newTag")}
                </Badge>
              )}
              {u.status === "blocked" && (
                <Badge size="sm" color="var(--semantic-danger)">
                  {t("admin.blocked")}
                </Badge>
              )}
            </div>
            <div className="truncate font-mono text-xs text-text-muted">{u.email}</div>

            {/* Per-user metric strip — characters, campaigns, and DM-of. */}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <MetricChip
                icon={Swords}
                value={metrics.characters}
                label={t("admin.metricCharacters", { count: metrics.characters ?? 0 })}
                srLabel={t("admin.charactersAria", {
                  count: metrics.characters ?? 0,
                })}
              />
              <MetricChip
                icon={Map}
                value={metrics.campaigns}
                label={t("admin.metricCampaigns", { count: metrics.campaigns })}
                srLabel={t("admin.campaignsAria", { count: metrics.campaigns })}
              />
              {metrics.dm > 0 && (
                <MetricChip
                  icon={Crown}
                  value={metrics.dm}
                  label={t("admin.metricDm")}
                  srLabel={t("admin.dmAria", { count: metrics.dm })}
                  tone="text-accent"
                />
              )}
            </div>
          </div>

          {/* Dates */}
          <div className="shrink-0 text-xs text-text-muted sm:text-right">
            <div>{t("admin.joined", { date: formatDate(u.createdAt) })}</div>
            {/* "Never active" is its OWN sentence per locale — composing
                "Active {never}" produced "Attivo Mai" in Italian. */}
            <div>
              {u.lastActiveAt
                ? t("admin.active", { when: formatRelative(u.lastActiveAt) })
                : t("admin.neverActive")}
            </div>
          </div>

          {/* Actions: view characters · block/unblock · delete (never on yourself) */}
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-stretch">
            {hasCharacters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggleCharacters}
                aria-expanded={charsExpanded}
                className="justify-center"
              >
                <Icon as={Eye} size="sm" decorative />
                {t("admin.totalCharacters")}
                <Icon
                  as={ChevronDown}
                  size="sm"
                  decorative
                  className={cn("transition-transform", charsExpanded && "rotate-180")}
                />
              </Button>
            )}
            {!isYou && (
              <>
                {/* Block rests in the QUIET danger register (matching Delete below)
                    — the filled destructive dress belongs to the confirm step, not
                    to every row of the ledger at rest. Unblock is restorative. */}
                <Button
                  variant={u.status === "blocked" ? "secondary" : "ghost"}
                  size="sm"
                  loading={toggling}
                  onClick={onToggle}
                  className={cn(
                    "justify-center",
                    u.status !== "blocked" && "text-danger hover:text-danger"
                  )}
                >
                  {u.status === "blocked" ? (
                    <>
                      <Icon as={Shield} size="sm" decorative />
                      {t("admin.unblock")}
                    </>
                  ) : (
                    <>
                      <Icon as={ShieldOff} size="sm" decorative />
                      {t("admin.block")}
                    </>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onToggleDelete}
                  aria-expanded={deleteOpen}
                  className="justify-center text-danger hover:text-danger"
                >
                  <Icon as={Trash2} size="sm" decorative />
                  {t("common.delete")}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* ── Character drill-down (read-only sheet entry) ─────────────────── */}
        {charsExpanded && (
          <CharacterDrillDown roster={roster} onOpenSheet={onOpenSheet} />
        )}

        {/* ── Typed-confirm delete ────────────────────────────────────────── */}
        {deleteOpen && !isYou && (
          <DeleteConfirm
            email={u.email}
            deleting={deleting}
            onConfirm={onConfirmDelete}
            onCancel={onToggleDelete}
          />
        )}
      </InfoCard>
    </li>
  );
}

/** The expanded character roster for one user — each row opens a read-only sheet. */
function CharacterDrillDown({
  roster,
  onOpenSheet,
}: {
  roster: RosterState | undefined;
  onOpenSheet: (charId: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="rounded-md border border-hairline bg-surface-2/40 p-3">
      {roster === "loading" || roster === undefined ? (
        <div className="flex items-center justify-center py-4">
          <Spinner size="sm" />
        </div>
      ) : roster === "error" ? (
        <p className="py-2 text-center text-sm text-danger">
          {t("admin.charactersLoadError")}
        </p>
      ) : roster.length === 0 ? (
        <p className="py-2 text-center text-sm text-text-muted">
          {t("admin.noCharacters")}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {roster.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onOpenSheet(c.id)}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-surface-3/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              >
                <span className="topbar-avatar grid h-6 w-6 shrink-0 place-items-center overflow-hidden rounded-full text-xs">
                  <Portrait src={c.portraitUrl} remote name={c.name} seed={c.id} />
                </span>
                <span className="truncate font-medium text-text-primary">{c.name}</span>
                <Icon as={Eye} size="xs" decorative className="ml-auto text-text-muted" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Destructive delete behind a typed-email confirm — the user must type the target's
 * exact email to enable the irreversible action (so a misclick can never delete the
 * wrong account; the Cloud Function re-verifies the email server-side too).
 */
function DeleteConfirm({
  email,
  deleting,
  onConfirm,
  onCancel,
}: {
  email: string;
  deleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [typed, setTyped] = useState("");
  const matches = typed.trim().toLowerCase() === email.trim().toLowerCase();

  return (
    <div className="rounded-md border border-danger/40 bg-danger/10 p-3">
      <div className="flex items-start gap-2">
        <Icon as={AlertTriangle} size="sm" decorative className="mt-0.5 text-danger" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-danger">{t("admin.deleteTitle")}</p>
          <p className="mt-1 text-xs text-text-muted">{t("admin.deleteWarning")}</p>
          <label className="mt-3 block text-xs font-medium text-text-secondary">
            {t("admin.deleteConfirmPrompt", { email })}
          </label>
          <div className="mt-1.5 flex flex-col gap-2 sm:flex-row sm:items-center">
            {/* Width lives on a WRAPPER: `.input` is width:100% in unlayered
                folio.css, which clobbers layered Tailwind width utilities set
                directly on it (the documented .input constraint). */}
            <div className="w-full sm:max-w-xs">
              <Input
                type="email"
                autoComplete="off"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={email}
                aria-label={t("admin.deleteConfirmPrompt", { email })}
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                size="sm"
                disabled={!matches}
                loading={deleting}
                onClick={onConfirm}
              >
                <Icon as={Trash2} size="sm" decorative />
                {t("admin.confirmDelete")}
              </Button>
              <Button variant="ghost" size="sm" onClick={onCancel} disabled={deleting}>
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The BUG INBOX — a read-only list of bug/feature reports. STRANDED `error` reports
 * (the Cloud Function failed to open a GitHub issue → otherwise invisible) sort first
 * and wear a danger badge with a re-file hint; `opened` reports link their GitHub
 * issue (the canonical tracker). A minimal safety net, not a second tracker.
 *
 * Reports whose GitHub issue is CLOSED are filtered out upstream (owner ruling: a
 * closed report doesn't render). When `closureUnknown` is set, GitHub couldn't confirm
 * issue state (offline / private repo), so the list shows everything behind a quiet
 * note rather than hiding blind.
 */
function BugInbox({
  reports,
  closureUnknown,
}: {
  reports: AdminBugReport[] | null;
  closureUnknown: boolean;
}) {
  const { t } = useTranslation();

  if (reports === null) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner size="md" />
      </div>
    );
  }
  if (reports.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-text-muted">
        {t("admin.noBugReports")}
      </p>
    );
  }

  // Stranded errors first, then by recency.
  const sorted = [...reports].sort((a, b) => {
    const aErr = a.status === "error" ? 0 : 1;
    const bErr = b.status === "error" ? 0 : 1;
    if (aErr !== bErr) return aErr - bErr;
    return (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0);
  });

  return (
    <div className="flex flex-col gap-2">
      {closureUnknown && (
        <p className="text-xs text-text-muted">{t("admin.bugClosureUnknown")}</p>
      )}
      <ul className="flex flex-col gap-2">
        {sorted.map((r) => (
          <li key={r.id}>
            <InfoCard
              className={cn(
                "flex flex-col gap-2 sm:flex-row sm:items-center",
                r.status === "error" && "border-danger/40 bg-danger/5"
              )}
            >
              <Icon
                as={Bug}
                size="sm"
                decorative
                className={r.status === "error" ? "text-danger" : "text-text-muted"}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {/* User-authored titles WRAP (there is no expanded view to read a
                    clipped one) — mid-string truncation hid the tail on mobile. */}
                  <span className="break-words font-medium text-text-primary">
                    {r.title}
                  </span>
                  <Badge size="sm">{t(`report.types.${r.type}`)}</Badge>
                  {r.status === "error" ? (
                    <Badge size="sm" color="var(--semantic-danger)">
                      {t("admin.bugStatusError")}
                    </Badge>
                  ) : r.status === "opened" ? (
                    <Badge size="sm" color="var(--semantic-success)">
                      {t("admin.bugStatusOpened")}
                    </Badge>
                  ) : (
                    <Badge size="sm" color="var(--semantic-info)">
                      {t("admin.bugStatusNew")}
                    </Badge>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-text-muted">
                  {t("admin.bugMeta", {
                    screen: r.screen,
                    severity: r.severity,
                    date: formatDate(r.createdAt),
                  })}
                  {r.status === "error" && (
                    <span className="ml-1 text-danger">· {t("admin.bugErrorHint")}</span>
                  )}
                </div>
              </div>
              {r.issueUrl && r.issueNumber !== null && (
                <a
                  href={r.issueUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="toolbar-chip shrink-0"
                >
                  <Icon as={ExternalLink} size="sm" decorative />
                  {t("admin.viewIssue", { number: r.issueNumber })}
                </a>
              )}
            </InfoCard>
          </li>
        ))}
      </ul>
    </div>
  );
}
