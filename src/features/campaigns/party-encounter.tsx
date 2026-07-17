/**
 * party-encounter — the lifted, REUSABLE rendering for the unified Party section.
 *
 * The campaign hub's {@link "@/features/campaigns/Party"} section is the ONE team
 * surface (no overlay, no portal). At rest it is the live party dashboard; with a
 * running `campaign.encounter` the SAME cards gain an optional combat LAYER — a
 * roll-to-total INIT vital tile + turn highlight, a round/turn header strip, and monster
 * combatant rows interleaved by initiative. This module holds the presentation those parts share,
 * lifted out of the former full-screen overlay (golden rule 10 — the overlay/dashboard
 * are deleted, their rendering moved here, never duplicated):
 *
 *   • {@link PcCombatantCard} — one member's LIVE stat body (AC · HP · passives ·
 *     senses · conditions), derived from their real sheet hydrated with their live
 *     `combat/state` ({@link derivePartyMemberStats} over {@link hydrateMemberDoc}),
 *     with progressive disclosure + Open sheet. Open to EVERY member (C5 authorizes the
 *     peer read), not just the DM.
 *   • {@link EncounterRoundBar} / {@link EncounterTurnControls} — the combat-layer
 *     header strip + turn stepper. The DM gets the editable controls (End, Prev/Next);
 *     a player sees the round + whose turn it is.
 *   • {@link MonsterCard} — a monster/NPC combatant row (genuine encounter-owned state).
 *     The DM edits it (typed initiative, clamped HP steppers, conditions, hidden toggle,
 *     remove); a player gets the SAME read-only row.
 *
 * PCs are NEVER a separate combat row — every PC renders through its live member card
 * (single source of truth — golden rule 6); only monsters get a {@link MonsterCard}.
 *
 * Every mutation is a PURE reducer from {@link "@/features/campaigns/encounter"}
 * applied to the live `campaign.encounter` through `campaignStore.setEncounter` — the
 * SAME optimistic-set + debounced-writer path as `setName` / `setTreasury`. The
 * read-only player path performs NO writes (firestore.rules' `encounterUnchanged`
 * rejects a non-DM encounter write), so `apply` is simply absent for players.
 *
 * NO DICE (constitution 2.2): initiative is TYPED. Every numeric input is clamped to
 * its domain (golden rule 20) via the shared {@link NumberStepper}. IDs only (golden
 * rule 7): condition ids resolve to localized chips only at the render edge.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type Ref,
} from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Crown,
  Dices,
  Eye,
  EyeOff,
  Footprints,
  GripVertical,
  Heart,
  Plus,
  ScrollText,
  Shield,
  Skull,
  Trash2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input, NumberStepper, Textarea } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip";
import { Kbd } from "@/components/ui/kbd";
import { Portrait } from "@/components/shared/Portrait";
import { StatBadge, HpBadge, InitBadge, StatLabel } from "@/components/shared/StatBadge";
import { AutoAnimateHeight } from "@/components/shared/AutoAnimateHeight";
import {
  CardEditorScopeContext,
  useReportEditorOpen,
  type EditorOpenReporter,
} from "@/components/shared/card-editor-scope";
import { InfoCard } from "@/components/shared/InfoCard";
import { GlossaryTip } from "@/components/shared/GlossaryTip";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { cn, formatSpeed, localeDistance } from "@/lib/utils";
import { useLocale } from "@/hooks/useLocale";
import { conditionChips } from "@/lib/views/tracker-view";
import { bloodiedFromHp } from "@/lib/aggregate-character";
import {
  hpState,
  hpBand,
  bandHpState,
  bandFillPct,
} from "@/features/character/molecules/hp-tier";
import {
  HpEditPopover,
  BloodiedMark,
} from "@/features/character/molecules/HpEditPopover";
import { ConditionEditor } from "@/features/character/molecules/ConditionEditor";
import {
  derivePartyMemberStats,
  hydrateMemberDoc,
} from "@/features/campaigns/party-stats";
import { InitVital } from "@/features/campaigns/init-vital";
import { parseInitInput, sanitizeInitInput } from "@/features/campaigns/init-input";
import type { MemberDocState } from "@/features/campaigns/useMemberCharacterDocs";
import {
  isDown,
  removeCombatant,
  setHidden,
  setHp,
  setInitiative,
  setMonsterNotes,
  setRevealed,
  toggleCondition,
  type MonsterInput,
} from "@/features/campaigns/encounter";
import { setEncounterInitiative } from "@/features/campaigns/campaign-io";
import {
  applyHpDelta,
  setCombatCondition,
  setCombatTempHp,
  tickDeathSave,
} from "@/lib/combat-state-io";
import { useToastStore } from "@/stores/toastStore";
import type { CharacterDoc } from "@/types/character";
import type { CombatState } from "@/types/combat-state";
import type {
  EncounterMonster,
  EncounterState,
  MemberCharacterSnapshot,
} from "@/types/campaign";

/** A reducer applied to the live encounter — present for the DM, absent (read-only)
 *  for a player. */
export type ApplyFn = (fn: (e: EncounterState) => EncounterState) => void;

/**
 * DM DRAG-TO-REORDER controls for ONE combat row (C3) — present ONLY for the DM/admin and
 * ONLY once turns have begun (the frozen order is theirs to own); absent everywhere else, so
 * a player's card never shows the affordance. The pointer path is LIFT & FOLLOW
 * ({@link "@/features/campaigns/use-lift-reorder".useLiftReorder}): Pointer Events on the
 * grip (mouse + touch + pen, one path) lift the card into a floating clone that follows the
 * pointer while the others FLIP-slide apart. The keyboard path (ArrowUp / ArrowDown on the
 * focused grip) is unchanged. Both resolve to
 * {@link "@/features/campaigns/encounter".reorderCombatant}. Pure presentation — the
 * persistence (a DM structural write) lives in the Party closure.
 */
export interface ReorderRow {
  /** This combatant's id — stamped on the card `<li>` (`data-combatant-id`) so the drag
   *  hook can find it by query for FLIP measurement / the lifted clone. */
  id: string;
  /** True while THIS row is the one being held — its card renders as the faded gap. */
  isLifted: boolean;
  /** STARTS the pointer drag (mouse + touch + pen). The live move/up/cancel stream is then
   *  owned by `document` listeners inside the drag hook, so the floating-clone follow
   *  survives the FLIP re-renders + any `lostpointercapture` the card-move triggers. */
  onGripPointerDown: (e: ReactPointerEvent) => void;
  /** Keyboard reorder one slot up / down (ArrowUp / ArrowDown on the grip). */
  onMoveUp: () => void;
  onMoveDown: () => void;
}

/**
 * The leading-edge REORDER grip for a combat row (C3, DM-only). A single focusable handle:
 * `onPointerDown` STARTS the lift-&-follow drag (mouse + touch + pen) — the live move/up
 * stream is then owned by `document` listeners in the drag hook (re-render-proof) — and
 * ArrowUp / ArrowDown while focused give an accessible keyboard reorder (WCAG 2.1.1 — drag
 * is never the ONLY way). Its accessible name carries the combatant's name so a
 * screen-reader hears "Reorder Goblin Boss"; the arrow-key hint rides the `title`.
 * `touch-action: none` (in CSS) lets a touch drag start without scrolling the list. NOT a
 * card-disclosure trigger (it's an interactive descendant, so the card-surface click
 * handler ignores it).
 */
function ReorderHandle({ reorder, name }: { reorder: ReorderRow; name: string }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className="combat-reorder-grip"
      aria-label={t("campaignHub.encounterReorder", { name })}
      title={t("campaignHub.encounterReorderHint")}
      onPointerDown={reorder.onGripPointerDown}
      onKeyDown={(e) => {
        if (e.key === "ArrowUp") {
          e.preventDefault();
          reorder.onMoveUp();
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          reorder.onMoveDown();
        }
      }}
    >
      <Icon as={GripVertical} size="sm" decorative />
    </button>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// COMBATANT CARD — the ONE shell shared by PC + monster combatants (CARD-1)
// ════════════════════════════════════════════════════════════════════════════

/** The selector matching any INTERACTIVE descendant — a click inside one does its own
 *  thing and never toggles the card (CARD-4). Shared by the card-surface handler. */
const INTERACTIVE =
  "button,a,input,select,textarea,label,[role='spinbutton'],[role='button']";

/**
 * CombatantCard — the SINGLE card primitive every combatant renders on (CARD-1): both a
 * player and a monster ride this exact `.party-card` shell, one header layout, one
 * disclosure model. Ally vs enemy differ ONLY by a `data-side` accent (mirroring the
 * `data-role` crown idiom) — never a different shape. The owner's complaint (PC + monster
 * "look designed by different people") is closed here: the markup is literally the same.
 *
 * The RESTING card (CARD-6) is minimal — leading INIT chip (`lead`) + portrait `seal` +
 * `title` (+ `subline`) + the AC/HP `cluster` + status `badges` + `conditions` chips +
 * the chevron. Everything else lives in `body`, revealed through the shared
 * {@link AutoAnimateHeight} disclosure.
 *
 * Disclosure (CARD-4) is identical for both card types and in the resting grid AND the
 * in-combat list: the accessible `.party-head-toggle` button carries `aria-expanded` /
 * `aria-controls` + the chevron (keyboard / SR), AND the whole card surface toggles on a
 * click that is NOT on an interactive descendant. A card with no `body` (a player's
 * monster — nothing to disclose) renders a static, non-expandable head.
 */
export function CombatantCard({
  side,
  role,
  isCurrent,
  dimmed,
  dashed,
  seal,
  lead,
  title,
  subline,
  cluster,
  badges,
  conditions,
  body,
  open,
  onToggle,
  detailId,
  toggleLabel,
  cardRef,
  reorder,
}: {
  /** The accent side — `ally` (PC, neutral) or `enemy` (monster, danger edge). */
  side: "ally" | "enemy";
  /** The PC role for the crown idiom (`dm` = gold crown-line); omit for monsters. */
  role?: "dm" | "player";
  isCurrent?: boolean;
  /** Down / defeated — dims the card. */
  dimmed?: boolean;
  /** Hidden ambush monster — dashed border. */
  dashed?: boolean;
  seal: ReactNode;
  /** The leading-edge node (the INIT chip in combat), immediately ahead of the seal. */
  lead?: ReactNode;
  title: ReactNode;
  subline?: ReactNode;
  /** The at-a-glance AC/HP stat cluster (resting). */
  cluster: ReactNode;
  /** Status badges (defeated / hidden). */
  badges?: ReactNode;
  /** Collapsed condition chips. */
  conditions?: ReactNode;
  /** The progressive-disclosure body; absent → a non-expandable card (player monster). */
  body?: ReactNode;
  open: boolean;
  onToggle: () => void;
  detailId: string;
  /** The accessible name for the disclosure toggle (the combatant's name). */
  toggleLabel: string;
  /** Optional ref to the card `<li>` (the combat layer scrolls the current turn into
   *  view). */
  cardRef?: Ref<HTMLLIElement>;
  /** C3 — the DM drag-to-reorder controls for this row (DM + turns-begun only); absent =
   *  no reorder affordance (every player card, and every card before Begin-turns). */
  reorder?: ReorderRow;
}) {
  const expandable = body != null;
  const headInner = (
    <>
      <span className="party-id">
        {/* CARD-NAMES (owner 2026-07-07 re-decision, golden rule 26): the NAME owns the
            row (the player tag moved to the subtitle) and WRAPS at spaces, balanced — the
            same No-Truncation recipe as every other card/row name family. No `title`
            tooltip: a wrapped name is never clipped, so there is nothing to recover. */}
        <span className="party-id-name party-id-hero">{title}</span>
        {subline}
      </span>
      {expandable && (
        <span className="party-head-meta">
          <Icon
            as={ChevronDown}
            size="sm"
            decorative
            className={cn(
              "shrink-0 text-text-muted transition-transform",
              open && "rotate-180"
            )}
          />
        </span>
      )}
    </>
  );

  // CARD-4 — a click anywhere on the RESTING region that is NOT an interactive descendant
  // toggles disclosure (the keyboard/SR path stays the `.party-head-toggle` button). The
  // handler is scoped to the resting wrapper (head + cluster + badges + conditions), NOT
  // the expanded body, so clicking inside the detail never collapses the card. Mouse-only
  // convenience: no role/tabindex, so no redundant tab stop is created.
  //
  // CARD-4 EXCEPTION (BUG: open-editor dismiss double-fired the toggle): a click that
  // merely DISMISSES an open inline editor (the HP popover, the conditions popover, an
  // initiative input, …) must JUST close the editor — never ALSO toggle the card (the
  // owner's "the HP dialog just has to behave like an overlay"). The detection is
  // PORTAL-AWARE: each editor the card contains reports its open-state through the
  // CardEditorScope ({@link useReportEditorOpen}), holding a +1 on `openEditors` while open,
  // even when its content portals to `document.body` (a DOM-subtree probe misses that — the
  // prior fix's failure). At pointer-DOWN — before the editor's own outside-dismiss closes
  // it — we snapshot whether any editor was open and, if so, swallow the resulting toggle
  // ONCE. The flag is re-armed on every press from the LIVE count, so it can never get
  // stuck; a later click with nothing open toggles as normal. One mechanism for every
  // editor — no per-control HP/init hack.
  const openEditors = useRef(0);
  const reportEditorOpen = useCallback<EditorOpenReporter>((delta) => {
    openEditors.current = Math.max(0, openEditors.current + delta);
  }, []);
  const suppressNextToggle = useRef(false);
  const onSurfacePointerDownCapture = expandable
    ? () => {
        suppressNextToggle.current = openEditors.current > 0;
      }
    : undefined;
  // The ONE guarded disclosure toggle shared by BOTH entry points: the whole-surface mouse
  // click AND the accessible header button (keyboard / SR). The earlier fix guarded only the
  // surface click, so a dismiss-click that landed on the HEADER BUTTON (the name / chevron)
  // still fired the button's own toggle — the owner's lingering "clicking the control expands
  // the card" bug. Routing the button through here too swallows that dismiss identically.
  const toggleDisclosure = () => {
    if (suppressNextToggle.current) {
      suppressNextToggle.current = false; // consume — this click only closed an editor
      return;
    }
    onToggle();
  };
  const onSurface = expandable
    ? (e: MouseEvent<HTMLDivElement>) => {
        // Interactive descendants (the HP / init controls, the reorder grip) handle their
        // own click; the header button routes through `toggleDisclosure` directly, so it is
        // an interactive descendant here and correctly ignored (no double toggle).
        if ((e.target as HTMLElement).closest(INTERACTIVE)) return;
        toggleDisclosure();
      }
    : undefined;

  return (
    <li
      ref={cardRef}
      className={cn(
        "party-card combatant-card",
        isCurrent && "combat-current",
        dimmed && "opacity-65",
        dashed && "border-dashed"
      )}
      data-side={side}
      data-role={role}
      aria-current={isCurrent ? "true" : undefined}
      // C3 — DM lift-&-follow reorder: the grip owns the pointer drag (Pointer Events) +
      // keyboard. The id is stamped here so the drag hook can query the card for FLIP
      // measurement / the lifted clone; while this row is the one being held it renders as
      // the faded GAP placeholder (`data-lifted`) so the list keeps its height under the
      // floating clone.
      data-combatant-id={reorder?.id}
      data-lifted={reorder?.isLifted ? "" : undefined}
    >
      <CardEditorScopeContext.Provider value={reportEditorOpen}>
        <div
          className={cn("combatant-resting", expandable && "combatant-resting-clickable")}
          onPointerDownCapture={onSurfacePointerDownCapture}
          onClick={onSurface}
        >
          <div className="party-card-head">
            {reorder && <ReorderHandle reorder={reorder} name={toggleLabel} />}
            {lead}
            {seal}
            {expandable ? (
              <button
                type="button"
                className="party-head-toggle"
                onClick={toggleDisclosure}
                aria-expanded={open}
                aria-controls={detailId}
                aria-label={toggleLabel}
              >
                {headInner}
              </button>
            ) : (
              <div className="party-head-toggle party-head-static">{headInner}</div>
            )}
          </div>

          {cluster}
          {badges}
          {conditions}
        </div>

        {expandable && (
          <AutoAnimateHeight>
            {open && (
              <div
                id={detailId}
                className="flex flex-col gap-3 border-t border-border-subtle pt-3"
              >
                {/* CARD-NAMES (owner 2026-06-29) — the body NO LONGER repeats the name:
                    the card header already shows it in full (`.party-id-hero` wraps, never
                    clips), so a second heading here just read as "Bo" under "Bo". Removed
                    as redundant. */}
                {body}
              </div>
            )}
          </AutoAnimateHeight>
        )}
      </CardEditorScopeContext.Provider>
    </li>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// LIVE MEMBER STATS — one member's live stat body (open to every member)
// ════════════════════════════════════════════════════════════════════════════

/** The card-head slots a PC card receives from the Party closure (computed from the
 *  member snapshot, available BEFORE the heavy doc loads). Shared by every doc-state
 *  branch so the shell stays identical while the stat cluster / body fill in. */
interface PcCardHead {
  /** The PC role for the crown idiom (`dm` → gold crown-line). */
  role: "dm" | "player";
  /** Combat turn highlight (combat only). */
  isCurrent?: boolean;
  seal: ReactNode;
  title: ReactNode;
  subline?: ReactNode;
  /** The accessible name for the disclosure toggle (the hero name). */
  toggleLabel: string;
  open: boolean;
  onToggle: () => void;
  detailId: string;
}

/**
 * PcCombatantCard — ONE attached member rendered on the shared {@link CombatantCard}
 * shell (CARD-1, the `ally` side). Routes the member's doc-load state: a quiet skeleton
 * cluster while it one-shots in, the saved snapshot vitals on a denied/absent read
 * (never a stuck spinner), else the full live card hydrated with the member's
 * `combat/state`. The minimal RESTING card shows the AC/HP cluster + the leading INIT
 * chip (combat); everything else (PP · Speed · senses · saves · conditions · death
 * saves · Open sheet) lives in the disclosure body (CARD-6).
 */
export function PcCombatantCard({
  state,
  snapshot,
  memberUid,
  campaignId,
  isMe,
  isDm,
  combat,
  inCombat,
  initLocked,
  initRoll,
  head,
  reorder,
  selfAttach,
}: {
  state: MemberDocState;
  snapshot: MemberCharacterSnapshot;
  memberUid: string;
  campaignId: string;
  /** My OWN card suppresses the Open-sheet action (I have my editable cockpit). */
  isMe: boolean;
  /** The viewer is this campaign's DM (or an admin) — authorized to combat-WRITE every
   *  member's PC (mirrors `firestore.rules`: the DM's authority derives LIVE from the
   *  campaign doc via the char's `attachedCampaignId`). */
  isDm: boolean;
  /** The member's live combat trio (`null` = absent subdoc → full HP; `undefined` =
   *  still loading → the parent-doc default until it lands). */
  combat: CombatState | null | undefined;
  /** An encounter is running — surfaces the leading INIT roll-to-total chip. */
  inCombat: boolean;
  /** C3 — turns have BEGUN (the order is frozen): the initiative chip goes READ-ONLY (the
   *  player's roll locks; the DM owns the order via drag-to-reorder). */
  initLocked: boolean;
  /** This member's raw d20 roll for the CURRENT fight, off the campaign's
   *  `encounterInit` table (`null` = not rolled) — the initiative SSOT. */
  initRoll: number | null;
  head: PcCardHead;
  /** C3 — the DM drag-to-reorder controls for this row (DM + turns-begun only). */
  reorder?: ReorderRow;
  /** My OWN card's attach/swap/detach picker (owner-reported 2026-07-02) — rendered in
   *  the disclosure body so an attached hero is always swappable/detachable in place.
   *  Present only on my card, and only outside combat (the caller gates it). */
  selfAttach?: ReactNode;
}) {
  if (state.status === "ready") {
    return (
      <PcReadyCard
        doc={state.doc}
        combat={combat ?? null}
        memberUid={memberUid}
        campaignId={campaignId}
        isMe={isMe}
        isDm={isDm}
        inCombat={inCombat}
        initLocked={initLocked}
        initRoll={initRoll}
        head={head}
        reorder={reorder}
        selfAttach={selfAttach}
      />
    );
  }
  // Loading AND error both show the saved snapshot vitals (stale-while-revalidate):
  // real AC/HP at a glance from the first paint, and — because the loading cluster
  // is the SAME chips the live card renders — the doc landing swaps values IN PLACE
  // with zero height change (the old gray skeleton bars were 3px shorter than the
  // chips, so every card below nudged when the doc hydrated — a nav-feel jump).
  const cluster = (
    <FallbackVitals snapshot={snapshot} busy={state.status === "loading"} />
  );
  return (
    <CombatantCard
      side="ally"
      role={head.role}
      isCurrent={head.isCurrent}
      seal={head.seal}
      title={head.title}
      subline={head.subline}
      cluster={cluster}
      open={head.open}
      onToggle={head.onToggle}
      detailId={head.detailId}
      toggleLabel={head.toggleLabel}
      body={
        // The unreadable-doc state is exactly where detaching a broken attachment
        // matters, so the self picker rides the fallback body too.
        <>
          <DocStateNote loading={state.status === "loading"} />
          {selfAttach}
        </>
      }
      reorder={reorder}
    />
  );
}

/** The saved snapshot vitals as the resting cluster — shown while the doc one-shots
 *  in (`busy`, stale-while-revalidate) AND when it can't be read (absent / denied),
 *  never a stuck spinner (gotcha 8). Same chips as the live card, so hydration swaps
 *  values in place with zero height change. */
function FallbackVitals({
  snapshot,
  busy,
}: {
  snapshot: MemberCharacterSnapshot;
  busy: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="party-vitals" aria-busy={busy || undefined}>
      {snapshot.ac != null && (
        <StatBadge
          density="chip"
          icon={Shield}
          acronym={t("character.vitals.ac")}
          fullLabel={t("character.vitals.acFull")}
          value={snapshot.ac}
          valueText={snapshot.ac}
        />
      )}
      {snapshot.hpMax != null && (
        // The SAME barred HP chip the live card renders (not a bar-less plain chip),
        // at the absent-subdoc default the whole combat model uses — full effective
        // HP — so the live doc landing swaps values in place with ZERO height change
        // (the bar-less chip was ~8px shorter and nudged everything below the party
        // band on every hub entry).
        <ReadOnlyHpChip current={snapshot.hpMax} max={snapshot.hpMax} temp={0} />
      )}
    </div>
  );
}

/** The disclosure-body content while the doc loads / can't be read — a quiet honest line
 *  (the cluster carries the at-a-glance fallback above). */
function DocStateNote({ loading }: { loading: boolean }) {
  const { t } = useTranslation();
  if (loading) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true">
        <span className="h-3 w-1/2 animate-pulse rounded bg-bg-tertiary" />
        <span className="h-3 w-2/3 animate-pulse rounded bg-bg-tertiary" />
      </div>
    );
  }
  return (
    <span className="text-2xs italic text-text-muted">
      {t("campaignHub.statsUnavailableHint")}
    </span>
  );
}

/** The live PC card (doc READY): the minimal resting cluster (AC/HP) + a leading INIT
 *  chip (combat) on the shared {@link CombatantCard} shell, with PP · Speed · senses ·
 *  saves · the conditions editor · death saves · Open sheet behind the disclosure body
 *  (CARD-6). Computed live from `doc` hydrated with the member's `combat/state` trio. */
function PcReadyCard({
  doc,
  combat,
  memberUid,
  campaignId,
  isMe,
  isDm,
  inCombat,
  initLocked,
  initRoll,
  head,
  reorder,
  selfAttach,
}: {
  doc: CharacterDoc;
  combat: CombatState | null;
  memberUid: string;
  campaignId: string;
  isMe: boolean;
  isDm: boolean;
  inCombat: boolean;
  initLocked: boolean;
  /** This member's raw d20 roll for the CURRENT fight, off the campaign's
   *  `encounterInit` table (`null` = not rolled) — the initiative SSOT. */
  initRoll: number | null;
  head: PcCardHead;
  reorder?: ReorderRow;
  /** My OWN card's attach/swap/detach picker (see {@link PcCombatantCard}). */
  selfAttach?: ReactNode;
}) {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const navigate = useNavigate();

  // The edit gate, mirroring `firestore.rules` EXACTLY (owner ∪ admin ∪ the campaign's
  // DM — the DM's authority derives LIVE from the campaign doc) so the UI never offers
  // a write the rules reject: my OWN PC (isMe → owner) or any PC when I'm the DM/admin.
  // A non-DM peer card stays read-only.
  const canEdit = isMe || isDm;
  // The ONE combat-write failure surface (an honest toast, never a silent swallow)
  // shared by the HP tile, the INIT chip, and the conditions / death-save block.
  const write = useCombatWrite();

  // Fold the LIVE combat trio onto the parent doc BEFORE deriving (golden rule 6) so
  // HP / conditions reflect the member's `combat/state` subdoc, not the stripped
  // parent-doc default. AC / passives / senses / max HP keep deriving from the doc.
  const hydrated = useMemo(() => hydrateMemberDoc(doc, combat), [doc, combat]);
  const stats = useMemo(() => derivePartyMemberStats(hydrated), [hydrated]);
  const charId = doc.id;
  const maxHp = stats.maxHp;
  const conditionList = stats.conditions;
  const deathSaves = combat?.deathSaves ?? { successes: 0, failures: 0 };
  // The LIVE base every combat-state write reduces over: the member's `combat/state`
  // subdoc, or `null` when it is absent — the IO helper then seeds the full-HP default
  // (a genuinely fresh/undamaged PC). Recomputed each render, so a write always starts
  // from the latest subscription value (different-time DM/player edits compose).
  const writeBase = combat;

  // The leading-edge INIT chip (combat only) — the roll-to-TOTAL `.vital` chip moved out
  // of the vitals band to the card's leading edge (CARD-3). `value` is the raw roll; the
  // chip displays roll + bonus and commits the raw roll (the global pip is the loud
  // missing-initiative prompt now, so no per-card nudge — INIT-2).
  // C3 — once turns BEGIN (the order is frozen) initiative LOCKS: the chip is read-only for
  // everyone (the player's roll is fixed; the DM owns the sequence via drag-to-reorder, never
  // a silent live re-sort). During the gathering phase it stays editable so the table rolls.
  const canEditInit = canEdit && !initLocked;
  const lead = inCombat ? (
    <InitVital
      value={initRoll}
      bonus={stats.initiativeBonus}
      canEdit={canEditInit}
      name={doc.character.name}
      // F2 — glow EVERY un-rolled chip the viewer may write, not just my own: a player
      // (canEdit = isMe) is unchanged, but a DM/admin (canEdit = isMe || isDm) now sees the
      // whole table's missing rolls light up, making it discoverable they can roll for all.
      // The write targets the CAMPAIGN doc's `encounterInit` table (the initiative SSOT):
      // the DM writes any row, a member their own — both rules-proven on the one doc both
      // are already authorized on (never a cross-user character write, never a grant).
      // No nudge once the order is frozen (the roll can no longer change).
      urgent={canEditInit && initRoll === null}
      onCommit={(roll) =>
        write(() => setEncounterInitiative(campaignId, memberUid, roll))
      }
    />
  ) : null;

  // The resting cluster — AC · HP · Speed (B3, the cockpit vocabulary); PP · senses move
  // to the body.
  const cluster = (
    <>
      <div className="party-vitals">
        <StatBadge
          density="chip"
          icon={Shield}
          acronym={t("character.vitals.ac")}
          fullLabel={t("character.vitals.acFull")}
          value={stats.ac}
          valueText={stats.ac}
        />
        <HpVital
          uid={memberUid}
          charId={charId}
          base={writeBase}
          current={stats.currentHp}
          max={maxHp}
          temp={stats.tempHp}
          canEdit={canEdit}
          write={write}
        />
        <StatBadge
          density="chip"
          icon={Footprints}
          acronym={t("character.vitals.spd")}
          fullLabel={t("character.vitals.speed")}
          value={formatSpeed(stats.walkingSpeedFt, locale)}
          valueText={formatSpeed(stats.walkingSpeedFt, locale)}
        />
      </div>
    </>
  );

  // The collapsed condition summary (read-only chips) — hidden only while the body editor
  // is showing them (canEdit + open), so they never duplicate. A non-edit peer keeps the
  // chips even when expanded (their body has no editor). Nothing when there are none.
  const conditions =
    conditionList.length > 0 && !(head.open && canEdit) ? (
      <div className="flex flex-wrap gap-1">
        {conditionChips(conditionList, locale).map((chip) => (
          <span
            key={chip.id}
            className="co-chip"
            style={{ ["--co" as string]: chip.color, ["--co-ink" as string]: chip.ink }}
          >
            {chip.label}
          </span>
        ))}
      </div>
    ) : null;

  // The disclosure body — editable conditions + death saves (canEdit), then the full
  // detail (saves · passives · senses · speeds) + Open sheet.
  const body = (
    <>
      {canEdit && (
        <PcCombatExtras
          uid={memberUid}
          charId={charId}
          base={writeBase}
          currentHp={stats.currentHp}
          maxHp={maxHp}
          conditions={conditionList}
          deathSaves={deathSaves}
          write={write}
        />
      )}

      <DetailGroup title={t("character.savingThrows")}>
        <div className="grid grid-cols-3 gap-1.5">
          {stats.saves.map((s) => (
            <span
              key={s.code}
              className={cn(
                "flex items-center justify-between rounded-md border border-border-subtle px-2 py-1 text-xs tabular-nums",
                s.proficient ? "bg-bg-tertiary text-text-primary" : "text-text-secondary"
              )}
            >
              <span className="uppercase tracking-wide text-text-muted">
                {t(`abilities.${s.code}_short`)}
              </span>
              <span>{fmtMod(s.bonus)}</span>
            </span>
          ))}
        </div>
      </DetailGroup>

      <DetailGroup title={t("character.hud.passives")}>
        <DetailRow label={t("skills.perception")} value={stats.passivePerception} />
        <DetailRow label={t("skills.insight")} value={stats.passiveInsight} />
        <DetailRow label={t("skills.investigation")} value={stats.passiveInvestigation} />
      </DetailGroup>

      {stats.senses.length > 0 && (
        <DetailGroup title={t("character.hud.senses")}>
          {stats.senses.map((sense) => (
            <DetailRow
              key={sense.kind}
              label={t(`character.sense_${sense.kind}`)}
              value={localeDistance(sense.rangeFt, locale)}
            />
          ))}
        </DetailGroup>
      )}

      {stats.speeds.length > 0 && (
        <DetailGroup title={t("character.speed")}>
          {stats.speeds.map((speed) => (
            <DetailRow
              key={speed.kind}
              label={t(`character.speed_${speed.kind}`)}
              value={localeDistance(speed.rangeFt, locale)}
            />
          ))}
        </DetailGroup>
      )}

      {/* Open sheet — MY card routes to my editable cockpit; a teammate's to the
          read-only member view. C5 authorizes a co-member to open it. */}
      <Button
        variant="secondary"
        size="sm"
        className="self-start"
        onClick={() =>
          void navigate(
            isMe
              ? `/characters/${doc.id}`
              : `/campaigns/${campaignId}/sheets/${memberUid}`
          )
        }
      >
        <Icon as={ScrollText} size="sm" decorative />
        {t("campaignHub.encounterSheet")}
      </Button>

      {/* My own attachment management (owner-reported 2026-07-02): swap or detach the
          attached hero in place — never a dead end once attached. */}
      {selfAttach}
    </>
  );

  return (
    <CombatantCard
      side="ally"
      role={head.role}
      isCurrent={head.isCurrent}
      seal={head.seal}
      lead={lead}
      title={head.title}
      subline={head.subline}
      cluster={cluster}
      conditions={conditions}
      body={body}
      open={head.open}
      onToggle={head.onToggle}
      detailId={head.detailId}
      toggleLabel={head.toggleLabel}
      reorder={reorder}
    />
  );
}

/** A combat-write failure surface. EVERY rejected write surfaces visibly (a toast +
 *  console error), never a silent swallow that reads as the edit "not saving" (the
 *  owner-reported flash-then-revert). There is NO retry / grant-recompute machinery
 *  anymore: initiative writes moved to the campaign doc (both writers always
 *  authorized), and the remaining combat-subdoc grants derive LIVE from the campaign
 *  doc in `firestore.rules` — a denial here is a REAL, terminal authorization fact
 *  (e.g. removed from the campaign mid-fight), not a stale cache to retry. The live
 *  subscription still reconciles the UI to the truth. ONE seam shared by the HP tile,
 *  the INIT chip, and the conditions / death-save block (golden rule 3). */
type CombatWrite = (run: () => Promise<void>) => void;

function useCombatWrite(): CombatWrite {
  const { t } = useTranslation();
  const showToast = useToastStore((s) => s.showToast);
  return useCallback(
    (run: () => Promise<void>): void => {
      void run().catch((e: unknown) => {
        console.error("Combat write failed", e);
        showToast({ message: t("campaignHub.combatWriteFailed"), duration: 6000 });
      });
    },
    [t, showToast]
  );
}

/**
 * HP as the compact sheet `.vital-hp` tile (owner-3) — `heart current/max(+temp)` with
 * the slim Liquid-Mercury bar BELOW the number and the "HP" label, exactly the cockpit
 * {@link HeaderHpControl} recipe (golden rule 10 — no parallel HP widget). EDITABLE for
 * the owner / DM (the tile is the SHARED {@link HpEditPopover} trigger, DELTA + absolute
 * `combat-state-io` writes through the shared `write` seam), else a static readout.
 */
/** The read-only barred HP chip — ONE recipe for every static member-HP readout
 *  (a non-editable peer's live card, the doc-loading/denied snapshot fallback). */
function ReadOnlyHpChip({
  current,
  max,
  temp,
}: {
  current: number;
  max: number;
  temp: number;
}) {
  const { t } = useTranslation();
  const state = hpState(current, max);
  const bloodied = bloodiedFromHp(current, max);
  return (
    <span
      className="vital vital-hp"
      data-density="chip"
      data-state={state}
      title={t("character.hpControlAria", { cur: current, max })}
    >
      <HpBadge
        density="chip"
        current={current}
        max={max}
        temp={temp}
        state={state}
        pct={max > 0 ? Math.round((current / max) * 100) : 0}
        hpLabel={t("character.health.hpAbbr")}
        bloodiedMark={
          bloodied ? (
            <BloodiedMark
              label={t("character.health.bloodied")}
              hint={t("character.health.bloodiedHint")}
            />
          ) : null
        }
      />
    </span>
  );
}

function HpVital({
  uid,
  charId,
  base,
  current,
  max,
  temp,
  canEdit,
  write,
}: {
  uid: string;
  charId: string;
  base: CombatState | null;
  current: number;
  max: number;
  temp: number;
  canEdit: boolean;
  write: CombatWrite;
}) {
  const { t } = useTranslation();
  const state = hpState(current, max);
  const pct = max > 0 ? Math.round((current / max) * 100) : 0;
  const bloodied = bloodiedFromHp(current, max);

  if (!canEdit) {
    return <ReadOnlyHpChip current={current} max={max} temp={temp} />;
  }

  const inner = (
    <HpBadge
      density="chip"
      current={current}
      max={max}
      temp={temp}
      state={state}
      pct={pct}
      hpLabel={t("character.health.hpAbbr")}
      bloodiedMark={
        bloodied ? (
          <BloodiedMark
            label={t("character.health.bloodied")}
            hint={t("character.health.bloodiedHint")}
          />
        ) : null
      }
    />
  );

  return (
    <HpEditPopover
      current={current}
      max={max}
      temp={temp}
      // The DM books FINAL numbers here (no defense data on this surface), so
      // the popover renders no intake section and the parts are a single
      // untyped amount — summed for safety.
      onDamage={(parts) =>
        write(() =>
          applyHpDelta(
            uid,
            charId,
            base,
            { kind: "damage", amount: parts.reduce((s, p) => s + p.amount, 0) },
            max
          )
        )
      }
      onHeal={(n) =>
        write(() => applyHpDelta(uid, charId, base, { kind: "heal", amount: n }, max))
      }
      onTemp={(n) =>
        write(() => setCombatTempHp(uid, charId, base, Math.max(temp, n), max))
      }
      onClearTemp={() => write(() => setCombatTempHp(uid, charId, base, 0, max))}
      ariaLabel={t("character.hitPoints")}
      align="start"
      // B4 — the SHARED HpEditPopover's optional rubric slot is the sheet's glossary
      // header; pass it here too (the cockpit HeaderHpControl does) so the campaign
      // HP popover opens with the same "Punti ferita" rubric — pixel parity.
      rubric={
        <GlossaryTip term="hitPoints" rubric={t("character.hitPoints")} side="bottom" />
      }
    >
      <button
        type="button"
        data-state={state}
        data-density="chip"
        aria-label={t("character.hpControlAria", { cur: current, max })}
        className="vital vital-hp"
      >
        {inner}
      </button>
    </HpEditPopover>
  );
}

/**
 * The EDITABLE conditions editor + (while downed) the death-save pips for one PC card,
 * rendered in the disclosure BODY (CARD-6) for the owner / DM only (the caller gates on
 * `canEdit`). Each interaction is a commutative / transactional `combat-state-io` write
 * via the shared `write` seam. The collapsed read-only condition chips live in the
 * card's `conditions` slot, so this is purely the editor.
 */
function PcCombatExtras({
  uid,
  charId,
  base,
  currentHp,
  maxHp,
  conditions,
  deathSaves,
  write,
}: {
  uid: string;
  charId: string;
  base: CombatState | null;
  currentHp: number;
  maxHp: number;
  conditions: string[];
  deathSaves: { successes: number; failures: number };
  write: CombatWrite;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      {/* Conditions — add/remove through the SHARED editor (whole-object writes). */}
      <ConditionEditor
        conditions={conditions}
        onToggle={(conditionId) =>
          write(() =>
            setCombatCondition(
              uid,
              charId,
              base,
              {
                kind: conditions.includes(conditionId) ? "remove" : "add",
                conditionId,
              },
              maxHp
            )
          )
        }
      />

      {/* Death saves — only while downed; each tick is a transactional +1 that composes
          with the player's own cockpit tick. */}
      {currentHp === 0 && (
        <DeathSaveTicks
          deathSaves={deathSaves}
          onTick={(outcome) =>
            write(() => tickDeathSave(uid, charId, base, outcome, maxHp))
          }
        />
      )}
    </div>
  );
}

/** The two death-save tracks (success · failure) as tappable pips — increment-only
 *  (a tick is a transactional +1; corrections happen in the owner's cockpit). */
function DeathSaveTicks({
  deathSaves,
  onTick,
}: {
  deathSaves: { successes: number; failures: number };
  onTick: (outcome: "success" | "failure") => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      <DeathPipRow
        icon={Heart}
        kind="success"
        label={t("deathSaves.successes")}
        count={deathSaves.successes}
        onTick={() => onTick("success")}
      />
      <DeathPipRow
        icon={Skull}
        kind="fail"
        label={t("deathSaves.failures")}
        count={deathSaves.failures}
        onTick={() => onTick("failure")}
      />
    </div>
  );
}

/** One death-save track of three pips. Only the NEXT unfilled pip is tappable (adds one
 *  mark); filled pips and the rest are static. Mirrors the cockpit `DeathSaves` vocab. */
function DeathPipRow({
  icon,
  kind,
  label,
  count,
  onTick,
}: {
  icon: typeof Heart;
  kind: "success" | "fail";
  label: string;
  count: number;
  onTick: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon
        as={icon}
        size="sm"
        decorative
        className={kind === "success" ? "text-success" : "text-error"}
      />
      <div className="flex items-center gap-1.5" role="group" aria-label={label}>
        {[0, 1, 2].map((i) => {
          const on = i < count;
          return (
            <button
              key={i}
              type="button"
              aria-label={`${label} ${i + 1}`}
              aria-pressed={on}
              disabled={i !== count}
              onClick={onTick}
              className={cn(
                "h-5 w-5 rounded-full border transition-colors",
                on
                  ? kind === "success"
                    ? "border-success bg-success shadow-[var(--elev-resting)]"
                    : "border-error bg-error shadow-[var(--elev-resting)]"
                  : "border-[color:var(--pip-empty-border)] bg-[var(--pip-empty-fill)] shadow-[var(--elev-recessed)]",
                i !== count && !on && "opacity-40"
              )}
            />
          );
        })}
      </div>
    </div>
  );
}

/** Folio modifier convention: U+2212 minus, explicit + for non-negatives. */
function fmtMod(mod: number): string {
  return mod >= 0 ? `+${mod}` : `−${Math.abs(mod)}`;
}

/** A labelled detail block inside the expanded card. */
function DetailGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[0.7rem] uppercase tracking-[0.12em] text-text-muted">
        {title}
      </span>
      {children}
    </div>
  );
}

/** One label · value row in a detail group. */
function DetailRow({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="flex items-center justify-between text-xs text-text-secondary">
      <span>{label}</span>
      <span className="tabular-nums text-text-primary">{value}</span>
    </span>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// COMBAT LAYER — round bar · turn controls · per-card initiative chip
// ════════════════════════════════════════════════════════════════════════════

/** The combat-layer header strip: the round badge + (DM) End-encounter. */
export function EncounterRoundBar({
  round,
  isDm,
  onEnd,
}: {
  round: number;
  isDm: boolean;
  onEnd: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge
        variant="emphasized"
        color="var(--accent-primary)"
        size="md"
        style={{ ["--bd-ink" as string]: "var(--accent-text)" }}
      >
        {t("campaignHub.encounterRound", { round })}
      </Badge>
      {isDm && (
        <Button variant="destructive" size="sm" className="ml-auto" onClick={onEnd}>
          <Icon as={X} size="sm" decorative />
          {t("campaignHub.encounterEnd")}
        </Button>
      )}
    </div>
  );
}

/** B6 — the "gathering initiative" phase cue, as ONE shared tonal chip (the same {@link
 *  Badge} atom the IN COMBAT / Your-turn chips use), NOT muted prose. The short label
 *  reads at a glance; the explanatory half ("the DM begins turns when everyone has
 *  rolled") lives in the hover/long-press tooltip. Rendered identically by the encounter
 *  panel (Party) and the cockpit combat region (in-combat-chip) — one element, no drift. */
export function GatheringInitiativeChip() {
  const { t } = useTranslation();
  return (
    <Badge
      variant="tonal"
      color="var(--accent-primary)"
      size="sm"
      glyph={<Dices width={12} height={12} aria-hidden="true" />}
      title={t("campaignHub.encounterGatheringHint")}
    >
      {t("campaignHub.encounterGatheringChip")}
    </Badge>
  );
}

/** The turn stepper. Offered to whoever may advance the SHARED turn: the DM (always)
 *  OR the player whose PC is the current combatant (P2 — `canAdvance`). Both write the
 *  same `campaign.encounter.{currentCombatantId, round}` source of truth (the DM via the
 *  optimistic store path, a player via the scoped `advanceEncounterTurn` transaction).
 *  Whose turn it is still reads off the lit card frame (`.combat-current`) +
 *  `aria-current`; a viewer who can't advance gets no controls (the frame is the cue). */
export function EncounterTurnControls({
  canAdvance,
  empty,
  pending = false,
  onPrev,
  onNext,
}: {
  canAdvance: boolean;
  empty: boolean;
  /** An advance is in flight — disarm both buttons so a rapid second press can't
   *  fire a second write (the UX half of the double-click turn-skip fix). */
  pending?: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  const { t } = useTranslation();
  if (!canAdvance) return null;
  // The arrow-key accelerator (owner-7) is now DISCOVERABLE: each button carries the
  // branded EditingPill tooltip naming ←/→ as a kbd chip + `aria-keyshortcuts`, so the
  // one shipped-but-invisible power shortcut is suggested like ⌘K (owner's ask).
  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex items-center justify-between">
        <Tooltip
          content={<TurnHint label={t("campaignHub.encounterPrevTurn")} glyph="←" />}
        >
          <Button
            variant="secondary"
            onClick={onPrev}
            disabled={empty || pending}
            aria-keyshortcuts="ArrowLeft"
          >
            <Icon as={ChevronLeft} size="sm" decorative />
            {t("campaignHub.encounterPrevTurn")}
          </Button>
        </Tooltip>
        <Tooltip
          content={<TurnHint label={t("campaignHub.encounterNextTurn")} glyph="→" />}
        >
          <Button
            variant="primary"
            onClick={onNext}
            disabled={empty || pending}
            aria-keyshortcuts="ArrowRight"
          >
            {t("campaignHub.encounterNextTurn")}
            <Icon as={ChevronRight} size="sm" decorative />
          </Button>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}

/** The turn button's tooltip: the verb + its arrow key as a `<kbd>` chip (the
 *  topbar / EditingPill kbd recipe), teaching the ←/→ accelerator. */
function TurnHint({ label, glyph }: { label: string; glyph: string }) {
  return (
    <span className="flex items-center gap-2">
      {label}
      <Kbd>{glyph}</Kbd>
    </span>
  );
}

// ─── Monster combatant row ──────────────────────────────────────────────────────

/**
 * One monster/NPC combatant on the SHARED {@link CombatantCard} shell (CARD-1, the
 * `enemy` side) — identical markup to a PC card, differentiated only by the `data-side`
 * accent. The READ parts (initial · name · ×count · AC · HP-or-band · defeated/hidden
 * badge · conditions · turn highlight) always render — that IS the player read-only
 * view. The EDIT parts (typed initiative chip, per-token HP steppers, conditions, reveal
 * HP, hidden toggle, remove) live in the disclosure body, gated behind `apply` (DM-only);
 * a player gets a static, non-expandable card.
 *
 * HIDDEN ENEMY HP (CARD-5): the DM/admin (`apply` present) always sees the EXACT summed
 * HP; a player sees only a qualitative BAND (Healthy / Bloodied / Near Death) unless the
 * DM has flipped `revealed`, in which case the player reads the exact number.
 */
export function MonsterCard({
  monster,
  isCurrent,
  initLocked = false,
  apply,
  reorder,
}: {
  monster: EncounterMonster;
  isCurrent: boolean;
  /** C3 — turns have BEGUN (the order is frozen): the typed-initiative chip goes READ-ONLY
   *  (the DM reorders via drag, never a silent live re-sort of a retyped value). */
  initLocked?: boolean;
  apply?: ApplyFn;
  /** C3 — the DM drag-to-reorder controls for this row (DM + turns-begun only). */
  reorder?: ReorderRow;
}) {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const cardRef = useRef<HTMLLIElement>(null);
  const editable = !!apply;
  const [open, setOpen] = useState(isCurrent && editable);
  // Auto-EXPAND the card the moment the turn lands on it (DM only) — the documented
  // "adjust state when a prop changes" pattern, not a setState-in-effect.
  const [wasCurrent, setWasCurrent] = useState(isCurrent);
  if (isCurrent !== wasCurrent) {
    setWasCurrent(isCurrent);
    if (isCurrent && editable) setOpen(true);
  }

  // Scroll the current combatant into view when the turn lands on it (DOM effect).
  useEffect(() => {
    if (isCurrent)
      cardRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [isCurrent]);

  const down = isDown(monster);
  const groupCurrent = monster.tokens.reduce((sum, hp) => sum + hp, 0);
  const groupMax = monster.maxHp * monster.tokens.length;
  const aliveTokens = monster.tokens.filter((hp) => hp > 0).length;
  // The DM/admin always sees the exact number; a player only when the DM has revealed it.
  const showExactHp = editable || !!monster.revealed;
  const hasConditions = monster.conditions.length > 0;

  const subline =
    monster.tokens.length > 1 ? (
      <span className="flex items-center gap-1.5 text-xs">
        <Badge variant="muted" size="sm">{`×${monster.tokens.length}`}</Badge>
        <span className="tabular-nums text-text-muted">
          {`${aliveTokens}/${monster.tokens.length}`}
        </span>
      </span>
    ) : null;

  const badges =
    down || monster.hidden ? (
      <div className="flex flex-wrap gap-1.5">
        {down && (
          <Badge
            variant="solid"
            color="var(--semantic-danger)"
            size="sm"
            glyph={<Skull className="h-3 w-3" />}
          >
            {t("campaignHub.encounterDefeated")}
          </Badge>
        )}
        {monster.hidden && (
          <Badge
            variant="solid"
            color="var(--accent-primary)"
            size="sm"
            glyph={<EyeOff className="h-3 w-3" />}
            style={{ ["--bd-ink" as string]: "var(--accent-text)" }}
          >
            {t("campaignHub.encounterHidden")}
          </Badge>
        )}
      </div>
    ) : null;

  // The at-a-glance cluster — AC + HP (or band), in the SAME `.party-vitals` band a PC
  // card uses, so the two read identically.
  const cluster = (
    <div className="party-vitals">
      <StatBadge
        density="chip"
        icon={Shield}
        acronym={t("character.vitals.ac")}
        fullLabel={t("character.vitals.acFull")}
        value={monster.ac}
        valueText={monster.ac}
      />
      <MonsterHpStat current={groupCurrent} max={groupMax} showExact={showExactHp} />
    </div>
  );

  // Collapsed condition chips — hidden only while the editor is showing them (DM, open).
  const conditions =
    hasConditions && !(open && editable) ? (
      <div className="flex flex-wrap gap-1">
        {conditionChips(monster.conditions, locale).map((chip) => (
          <span
            key={chip.id}
            className="co-chip"
            style={{ ["--co" as string]: chip.color, ["--co-ink" as string]: chip.ink }}
          >
            {chip.label}
          </span>
        ))}
      </div>
    ) : null;

  // The DM-only disclosure body — HP steppers + conditions editor + reveal/hide/remove.
  const body = apply ? (
    <>
      <MonsterTokens
        monster={monster}
        onSet={(tokenIndex, v) => apply((e) => setHp(e, monster.id, tokenIndex, v))}
      />

      <ConditionEditor
        conditions={monster.conditions}
        onToggle={(conditionId) =>
          apply((e) => toggleCondition(e, monster.id, conditionId))
        }
      />

      {/* DM-only free-text notes — tactics, legendary-resistance tally, spell list,
          motivations. Lives INSIDE the DM disclosure body, so it's never visible to a
          player (no rules change). Auto-grows with content (`field-sizing-content`). */}
      <Textarea
        className="field-sizing-content min-h-[3.5rem]"
        rows={2}
        value={monster.notes ?? ""}
        onChange={(e) => apply((en) => setMonsterNotes(en, monster.id, e.target.value))}
        placeholder={t("campaignHub.encounterMonsterNotesPlaceholder")}
        aria-label={t("campaignHub.encounterMonsterNotes")}
        maxLength={2000}
      />

      <div className="flex flex-wrap items-center gap-2">
        {/* CARD-5 — flip players between the concealed band and the exact number. Routed
            through `apply` → the SAME debounced structural encounter writer as every
            other monster edit (no rules change: the DM owns the encounter). */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => apply((e) => setRevealed(e, monster.id, !monster.revealed))}
        >
          <Icon as={monster.revealed ? EyeOff : Eye} size="sm" decorative />
          {monster.revealed
            ? t("campaignHub.encounterHideHp")
            : t("campaignHub.encounterRevealHp")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => apply((e) => setHidden(e, monster.id, !monster.hidden))}
        >
          <Icon as={monster.hidden ? Eye : EyeOff} size="sm" decorative />
          {monster.hidden
            ? t("campaignHub.encounterReveal")
            : t("campaignHub.encounterHide")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-danger"
          onClick={() => apply((e) => removeCombatant(e, monster.id))}
        >
          <Icon as={Trash2} size="sm" decorative />
          {t("campaignHub.encounterRemove")}
        </Button>
      </div>
    </>
  ) : undefined;

  return (
    <CombatantCard
      cardRef={cardRef}
      side="enemy"
      isCurrent={isCurrent}
      dimmed={down}
      dashed={monster.hidden}
      seal={
        <span className="seal party-avatar" aria-hidden>
          <Portrait
            src={null}
            name={monster.name}
            seed={monster.id}
            className="h-full w-full"
          />
        </span>
      }
      lead={
        // Editable typed-init chip ONLY for the DM and ONLY before turns begin; once the
        // order is frozen (initLocked) every viewer — DM included — reads a static chip.
        apply && !initLocked ? (
          <MonsterInitChip
            value={monster.initiative}
            ariaLabel={t("campaignHub.encounterInitiativeFor", { name: monster.name })}
            onCommit={(v) => apply((e) => setInitiative(e, monster.id, v))}
          />
        ) : (
          <span
            className="vital vital-init"
            data-density="chip"
            title={t("character.vitals.initAria")}
          >
            <InitBadge
              value={monster.initiative ?? "—"}
              acronym={t("character.vitals.init")}
              icon={Dices}
            />
          </span>
        )
      }
      title={monster.name}
      subline={subline}
      cluster={cluster}
      badges={badges}
      conditions={conditions}
      body={body}
      open={open}
      onToggle={() => setOpen((v) => !v)}
      detailId={`monster-detail-${monster.id}`}
      toggleLabel={monster.name}
      reorder={reorder}
    />
  );
}

/**
 * MonsterHpStat — the monster's HP as the shared `.vital-hp` chip. The DM/admin (and a
 * player on a revealed monster) sees the EXACT summed HP + bar via {@link HpBadge}; a
 * player on a concealed monster sees only the qualitative BAND label + a bar SNAPPED to
 * the band (CARD-5) — never the number, never a blank tile.
 */
function MonsterHpStat({
  current,
  max,
  showExact,
}: {
  current: number;
  max: number;
  showExact: boolean;
}) {
  const { t } = useTranslation();
  const hpLabel = t("character.health.hpAbbr");

  if (showExact) {
    const state = hpState(current, max);
    const pct = max > 0 ? Math.round((current / max) * 100) : 0;
    return (
      <span
        className="vital vital-hp"
        data-density="chip"
        data-state={state}
        title={t("character.hpControlAria", { cur: current, max })}
      >
        <HpBadge
          density="chip"
          current={current}
          max={max}
          temp={0}
          state={state}
          pct={pct}
          hpLabel={hpLabel}
        />
      </span>
    );
  }

  const band = hpBand(current, max);
  const state = bandHpState(band);
  const fill = bandFillPct(band);
  // Reuse the canonical 2024 "Bloodied" keyword (character.health.*) + the Defeated
  // badge; only the two band-specific labels are net-new.
  const bandLabelKey: Record<typeof band, string> = {
    healthy: "campaignHub.hpBand.healthy",
    bloodied: "character.health.bloodied",
    nearDeath: "campaignHub.hpBand.nearDeath",
    down: "campaignHub.encounterDefeated",
  };
  const label = t(bandLabelKey[band]);
  return (
    <span className="vital vital-hp" data-density="chip" data-state={state} title={label}>
      <span className="vhp-line">
        <Icon as={Heart} size="xs" decorative className="v-ico" />
        <span className="v-acr">{hpLabel}</span>
        <span className="vhp-val">
          <span className="vhp-band">{label}</span>
        </span>
      </span>
      <span className="hp-bar" data-state={state} aria-hidden>
        <span className="hp-fill" style={{ ["--w" as string]: `${fill}%` }} />
      </span>
    </span>
  );
}

/**
 * MonsterInitChip — the DM's typed initiative as a `.vital vital-init` chip, so a
 * monster's initiative reads with the SAME vocabulary + leading-edge placement as a PC's
 * (CARD-3). No dice / no bonus — the DM enters the final value directly; `null` = blank.
 */
function MonsterInitChip({
  value,
  ariaLabel,
  onCommit,
}: {
  value: number | null;
  ariaLabel: string;
  onCommit: (value: number | null) => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const acr = t("character.vitals.init");
  // Report the inline edit's open-state to the enclosing card so a click that dismisses
  // it only commits + closes, never ALSO toggling the card (one mechanism, every editor).
  useReportEditorOpen(editing);

  useEffect(() => {
    // preventScroll: focusing a chip that morphs into an input partly outside the
    // viewport (a tap near the bottom on mobile) must never yank the page (B27).
    if (editing) inputRef.current?.focus({ preventScroll: true });
  }, [editing]);

  function start(): void {
    setDraft(value === null ? "" : String(value));
    setEditing(true);
  }
  function commit(): void {
    setEditing(false);
    // B05 — a single-leading-minus + finite guard (never `NaN`): a mid-string/trailing
    // minus (`"5-"`, `"1-2"`) or a lone `"-"` can no longer corrupt the sort/gate/display.
    onCommit(parseInitInput(draft));
  }

  // The floating typed-init edit box — the popover CONTENT, never placed in the card's
  // flow (mirrors the PC {@link InitVital} float: no in-place morph = no card reflow).
  const editBox = (
    <span className="vital vital-init vital-init-edit" data-density="chip">
      <span className="vi-input">
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          value={draft}
          onChange={(e) => setDraft(sanitizeInitInput(e.target.value))}
          onFocus={(e) => e.target.select()}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") setEditing(false);
          }}
          aria-label={ariaLabel}
          className="init-edit-input"
        />
      </span>
      <StatLabel icon={Dices} acronym={acr} />
    </span>
  );

  // FLOAT the edit box in a popover anchored to the compact resting chip, so opening the
  // typed-init editor never widens `.party-card-head` and never reflows the card or the ones
  // below (the same fix as the PC InitVital). The resting chip stays IN FLOW as the trigger;
  // controlled by `editing` so a commit (Enter/blur) or dismissal (Escape/outside) closes it.
  return (
    <Popover open={editing} onOpenChange={(open) => (open ? start() : setEditing(false))}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="vital vital-init"
          data-density="chip"
          // A BLANK monster initiative blocks Begin-turns exactly like an un-rolled PC —
          // the DM's editable chip wears the same urgent gold ring/pulse the PC InitVital
          // does (B8), so the "rolled/total" gate's missing entry is findable at a glance.
          // This editable chip renders only for the DM during gathering; a player's static
          // read (the caller's else-branch) never glows.
          data-urgent={value === null ? "" : undefined}
          title={ariaLabel}
          aria-label={ariaLabel}
        >
          <InitBadge value={value ?? "—"} acronym={acr} icon={Dices} />
        </button>
      </PopoverTrigger>
      <PopoverContent rubric={ariaLabel} align="start">
        <div className="party-vitals">{editBox}</div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Per-token HP for a monster group ("Goblin ×3" → three independent tokens). Each
 * token reuses the EXACT PC-card HP recipe (golden rule 10): the {@link HpBadge}
 * `.vital-hp` chip as the trigger for the SHARED {@link HpEditPopover}, so monster
 * + character HP editing look + behave identically. Monsters have no temp pool, so
 * the popover is opened with `hideTemp`. The popover emits DAMAGE/HEAL DELTAS; the
 * engine's absolute `onSet` (→ `setHp` → `clampHp`) clamps `hp ± n` to `[0, maxHp]`,
 * so no clamp is needed here (the seam already owns it). A lone token is just the
 * monster, so it labels with the monster NAME (the card title already names it, so
 * no extra visible label); a group shows a compact "Token N" lead-in to tell the
 * otherwise-identical tokens apart.
 */
function MonsterTokens({
  monster,
  onSet,
}: {
  monster: EncounterMonster;
  onSet: (tokenIndex: number, value: number) => void;
}) {
  const { t } = useTranslation();
  const hpLabel = t("character.health.hpAbbr");
  const many = monster.tokens.length > 1;
  return (
    <div className="party-vitals">
      {monster.tokens.map((hp, i) => {
        const state = hpState(hp, monster.maxHp);
        const pct = monster.maxHp > 0 ? Math.round((hp / monster.maxHp) * 100) : 0;
        const aria = many
          ? t("campaignHub.encounterTokenHp", { name: monster.name, n: i + 1 })
          : monster.name;
        return (
          // Tokens are positional + identical by construction; the index IS the
          // stable key here (no id to key on, never reordered).
          <div
            key={i}
            className={cn("flex items-center gap-1.5", hp === 0 && "opacity-60")}
          >
            {many && (
              <span className="text-xs tabular-nums text-text-muted">
                {t("campaignHub.encounterTokenLabel", { n: i + 1 })}
              </span>
            )}
            <HpEditPopover
              current={hp}
              max={monster.maxHp}
              temp={0}
              hideTemp
              // DELTA → absolute: `onSet` writes through `setHp`/`clampHp`, which
              // clamps to `[0, maxHp]` — hence the raw `hp ± n` (no local clamp).
              onDamage={(parts) => onSet(i, hp - parts.reduce((s, p) => s + p.amount, 0))}
              onHeal={(n) => onSet(i, hp + n)}
              // Unreachable under `hideTemp` (monsters have no temp pool) — the TEMP
              // + clear-temp verbs are not rendered, so these are never invoked.
              onTemp={() => {}}
              onClearTemp={() => {}}
              ariaLabel={aria}
              align="start"
              // B4 — pass the SAME glossary rubric as the PC HpVital so the monster
              // token popover opens with the matching "Punti ferita" header (parity).
              rubric={
                <GlossaryTip
                  term="hitPoints"
                  rubric={t("character.hitPoints")}
                  side="bottom"
                />
              }
            >
              <button
                type="button"
                data-state={state}
                data-density="chip"
                aria-label={aria}
                className="vital vital-hp"
              >
                <HpBadge
                  density="chip"
                  current={hp}
                  max={monster.maxHp}
                  temp={0}
                  state={state}
                  pct={pct}
                  hpLabel={hpLabel}
                />
              </button>
            </HpEditPopover>
          </div>
        );
      })}
    </div>
  );
}

// ─── Add monster / NPC form ───────────────────────────────────────────────────

/** Inline form to add a monster/NPC group — name + count are the only fields typed
 *  from scratch; every numeric is a clamped NumberStepper (no dice, no invalid state
 *  reachable — golden rule 20). DM-only. CONTROLLED: the open/closed toggle lives with
 *  the banner so its trigger can sit inline next to Begin-turns; this renders only the
 *  full-width body, and `onClose` (Cancel) collapses it back to the banner trigger. */
export function AddMonsterForm({
  onAdd,
  onClose,
}: {
  /** Add the typed monster group. Routed by the caller through the REINFORCEMENT auto-slot
   *  ({@link "@/features/campaigns/encounter-view".addReinforcement}) so a monster added
   *  mid-combat slots into the FROZEN order at its initiative (C3, item 4). */
  onAdd: (input: MonsterInput) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [initiative, setInitiativeVal] = useState(10);
  const [ac, setAc] = useState(12);
  const [maxHp, setMaxHp] = useState(10);
  const [count, setCount] = useState(1);
  const [notes, setNotes] = useState("");

  function add(): void {
    const trimmed = name.trim();
    if (trimmed === "") return;
    onAdd({ name: trimmed, ac, maxHp, count, initiative, notes });
    // Each "Add" is a DISTINCT creature (identical copies use `count`) — reset EVERY
    // field, not just name/count/notes, so the next (different) monster never silently
    // inherits this group's AC/HP/initiative (B25).
    setName("");
    setInitiativeVal(10);
    setAc(12);
    setMaxHp(10);
    setCount(1);
    setNotes("");
  }

  return (
    // FOCUSED COLUMN (CARD-7 polish) — the form body is capped to a ~24rem reading
    // column, left-aligned in the panel, so the name/notes inputs span that column
    // (not the full ~1140px desktop panel) and the stat rows can hug their labels.
    // No breakpoint: on mobile the column cap sits below the viewport, so it just
    // fills width exactly as before — identical markup, no regression.
    <InfoCard className="flex max-w-sm flex-col gap-3">
      <SectionHeader as="h3" tight title={t("campaignHub.encounterAddForm")} />
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t("campaignHub.encounterMonsterNamePlaceholder")}
        aria-label={t("campaignHub.encounterMonsterName")}
        maxLength={60}
      />
      {/* CARD-7 — sheet-style LABEL-LEFT rows in a TWO-COLUMN GRID: a `max-content`
          label column (auto-sized to the widest label, locale-proof — no magic width,
          no truncation) + a small gap + the compact stepper hugging it. Each
          {@link FormStepper} is `display:contents`, so its label and stepper drop
          straight into the grid: all four labels share the same column width and every
          stepper's LEFT edge lines up — a tight block, NOT spread across the panel.
          IDENTICAL on desktop + mobile (no breakpoints). */}
      <div className="grid grid-cols-[max-content_max-content] items-center gap-x-3 gap-y-2">
        <FormStepper
          label={t("character.vitals.initAria")}
          value={initiative}
          onChange={setInitiativeVal}
          min={0}
          max={99}
          digits={2}
        />
        <FormStepper
          label={t("character.armorClassShort")}
          value={ac}
          onChange={setAc}
          min={0}
          max={40}
          digits={2}
        />
        <FormStepper
          label={t("campaignHub.encounterMonsterMaxHp")}
          value={maxHp}
          onChange={setMaxHp}
          min={0}
          max={999}
          digits={3}
        />
        <FormStepper
          label={t("campaignHub.encounterMonsterCount")}
          value={count}
          onChange={setCount}
          min={1}
          max={20}
          digits={2}
        />
      </div>
      {/* Optional DM notes — same free-text field the card's DM disclosure shows. */}
      <Textarea
        className="field-sizing-content min-h-[3.5rem]"
        rows={2}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder={t("campaignHub.encounterMonsterNotesPlaceholder")}
        aria-label={t("campaignHub.encounterMonsterNotes")}
        maxLength={2000}
      />
      <div className="flex items-center gap-2">
        <Button variant="primary" onClick={add} disabled={name.trim() === ""}>
          <Icon as={Plus} size="sm" decorative />
          {t("campaignHub.encounterAddMonster")}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          {t("common.cancel")}
        </Button>
      </div>
    </InfoCard>
  );
}

/** A sheet-style LABEL-LEFT row for the add-monster form. The `<label>` is
 *  `display:contents`, so its text and the compact NumberStepper become direct items
 *  of the parent two-column grid: the label lands in the shared `max-content` label
 *  column and the stepper hugs it in the next column (no flush-right gap). The label
 *  still focuses the stepper on click (DOM-descendant association survives `contents`),
 *  and the stepper carries its own `aria-label`, so the accessible name is intact. */
function FormStepper({
  label,
  value,
  onChange,
  min,
  max,
  digits,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  digits: number;
}) {
  const { t } = useTranslation();
  return (
    <label className="contents">
      <span className="text-sm text-text-secondary">{label}</span>
      <NumberStepper
        value={value}
        onChange={onChange}
        min={min}
        max={max}
        digits={digits}
        compact
        ariaLabel={label}
        decrementLabel={t("common.remove")}
        incrementLabel={t("common.add")}
      />
    </label>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// DM CONTROL BANNER — the full-width DM identity + contextual control strip
// ════════════════════════════════════════════════════════════════════════════

/**
 * DmControlBanner — a slim FULL-WIDTH strip at the top of the Party surface that
 * carries the DM (owner-decided Option C). The DM is NOT a combatant, so they no
 * longer take a half-width identity card in the party grid (which left an ugly gap);
 * this banner is their dedicated surface instead.
 *
 *   • LEFT (always) — the gold DM accent: a crown glyph + the DM name (or "Narrated
 *     by {name}" for a non-DM viewer) + the DUNGEON MASTER {@link Badge}.
 *   • RIGHT, DM VIEWER ONLY (`isDmViewer`) — the contextual encounter `controls`
 *     cluster (the Run-encounter button at rest; the inline Add-monster + Begin-turns
 *     pair during an encounter, surfaced by the caller per the real encounter phase).
 *     A non-DM viewer sees the identity ONLY, no controls.
 *   • BELOW, DM VIEWER ONLY — the full-width `extra` slot (the OPEN Add-monster form,
 *     toggled from the controls trigger during an encounter; the optional attach-a-DMPC
 *     affordance at rest), so the banner's closed state stays a single slim row.
 *
 * A DM WITH a character (rare DMPC) still renders as a normal gold-accented combatant
 * card in the grid; this banner remains the control surface above it — the two are
 * independent.
 */
export function DmControlBanner({
  dmName,
  isDmViewer,
  controls,
  extra,
}: {
  dmName: string;
  /** The viewer is this campaign's DM (or an admin) — gates the controls + extra. */
  isDmViewer: boolean;
  /** The phase-appropriate right-aligned control cluster (DM only). */
  controls?: ReactNode;
  /** The full-width slot below the identity row (DM only) — the add-monster form / DMPC attach. */
  extra?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="dm-banner">
      <div className="dm-banner-row" data-role="dm">
        <span className="dm-banner-identity">
          <span className="dm-banner-glyph" aria-hidden>
            <Icon as={Crown} size="sm" decorative />
          </span>
          <span className="dm-banner-name">
            {isDmViewer ? dmName : t("campaignHub.narratedBy", { name: dmName })}
          </span>
          <Badge variant="tonal" color="var(--accent-primary)" size="sm">
            {t("campaign.dm")}
          </Badge>
        </span>
        {isDmViewer && controls ? (
          <span className="dm-banner-controls">{controls}</span>
        ) : null}
      </div>
      {isDmViewer && extra ? <div className="dm-banner-extra">{extra}</div> : null}
    </div>
  );
}
