/**
 * CharacterCard — one roster tile (Phase 6).
 *
 * Ports the folio `.ch-*` card recipe (previews/folio_design/home.html, shipped
 * in folio.css "HOME / ROSTER"): a carved/embossed tile whose whole surface is a
 * stretched `.ch-open` <button> that opens the cockpit at /characters/:id. The
 * portrait carries the class domain pigment via `data-class`; HP (only while the
 * character is active) renders the shared Liquid-Mercury `.hp-bar` using the
 * single-source `hpState` tier so the colour always matches the cockpit.
 *
 * A `.ch-overflow` kebab opens the `.ch-menu` row-actions popover (Export JSON ·
 * Clone · Retire/Restore · Delete). The card itself stays a PURE VIEW — it only
 * renders the menu and dispatches to `useRosterActions`, which owns every
 * Firestore / business concern. The kebab + menu are raised above `.ch-open` by
 * the recipe; while the menu is open the stretched open-button is disabled so a
 * dismiss-click on the card body can't accidentally navigate to the cockpit.
 */

import { useState } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import {
  Skull,
  Download,
  FileText,
  Copy,
  Archive,
  ArchiveRestore,
  Trash2,
  Shield,
  Footprints,
  Award,
} from "lucide-react";
import type { RosterCharacterDoc } from "@/lib/character-cache";
import { useLongPress } from "@/hooks/useLongPress";
import { formatSpeed, cn, displayAc } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import {
  CardOverflowMenu,
  type CardMenuItem,
} from "@/components/shared/CardOverflowMenu";
import { useCardMenuGuard } from "@/components/shared/use-card-menu-guard";
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip";
import { localizeClassName, localizeRaceName } from "@/lib/views/srd-i18n";
import { totalLevel, primaryClassId } from "@/lib/classes";
import { useLocale } from "@/hooks/useLocale";
import { formatRelativeTime, isRecent } from "./relative-time";
import { Portrait } from "@/components/shared/Portrait";
import { StatBadge } from "@/components/shared/StatBadge";
import { CharacterIdentityLine } from "@/components/shared/CharacterIdentityLine";
// Reuse the single-source HP tier (shared with the §22/§24 bar recipe) so the
// roster card's HP colour can never disagree with the cockpit's for the same
// character. Pure helper — the stores it ships beside are already in the eager
// route bundle, so this adds no new cost.
import { hpState } from "@/features/character/molecules/hp-tier";
// AC reads the denormalized `data.ac` SNAPSHOT (override-first), which the cockpit
// auto-save stamps with the SAME grant-aware `effectiveAC` formula the sheet
// renders (lib/aggregate-character → acFromAggregate). The roster therefore shows
// the identical AC WITHOUT importing the SRD-heavy grant engine — pulling
// aggregateCharacterGrants/computeAC here used to drag the entire ~450 KB-gzip SRD
// into the landing bundle just to show a chip. PB is a pure level formula from the
// SRD-free `@/lib/proficiency` module (compute.ts re-exports it).
import { proficiencyBonus } from "@/lib/proficiency";
import { isCharacterDead } from "@/lib/character-status";
import { useRosterActions } from "./use-roster-actions";

/**
 * Multi-select wiring (owner 2026-06-07). When present, the card is a SELECTION
 * TOGGLE rather than a navigator: tapping it toggles membership, a checkbox mirrors
 * the state, and the kebab is hidden. Absent → the card behaves as a pure navigator
 * (its original contract), so non-roster callers and tests are unaffected.
 */
export interface CharacterCardSelection {
  /** Is selection mode active? */
  selecting: boolean;
  /** Is THIS card selected? */
  selected: boolean;
  /** Toggle this card's membership in the selection. */
  onToggle: (id: string) => void;
  /** Enter selection mode selecting this card (long-press / ⌘-click accelerator). */
  onEnterWith: (id: string) => void;
}

export interface CharacterCardProps {
  /** The SRD-free roster projection (Layer 2) — the card reads only projected
   *  fields; the cockpit opens the full parsed character on activation. */
  character: RosterCharacterDoc;
  selection?: CharacterCardSelection;
  /** Has this tile's `combat/state` subdoc HYDRATED (present or confirmed-absent)?
   *  The roster streams parent docs first — painting each tile at the full-HP
   *  placeholder `cacheToRosterDoc` seeds — then folds the real combat subdoc a beat
   *  later. Until that fold, `session.hp` is the placeholder, so we gate the HP number
   *  + gold fill on this bit: the fill renders ONLY once the real width is known, so it
   *  MOUNTS at that width (a fresh element has no prior value to transition FROM) rather
   *  than painting a full bar that then slides down. Defaults to `true` for synchronous
   *  callers (dev-bypass, unit tests) whose session HP is already authoritative. */
  hpReady?: boolean;
}

export function CharacterCard({
  character,
  selection,
  hpReady = true,
}: CharacterCardProps) {
  const { t, i18n } = useTranslation();
  const { language: locale } = useLocale();
  const navigate = useNavigate();
  const {
    character: data,
    session,
    status,
    portraitUrl,
    portraitCrop,
    updatedAt,
  } = character;

  // Localized identity parts (shared srd-i18n source of truth) — race/class/
  // subclass are stored as English strings/slugs and must not leak in IT.
  // raceLabel/classLabel feed the search/aria `summary` below; the visible identity
  // line is rendered by the shared <CharacterIdentityLine> (single-source chrome).
  const raceLabel = data.race ? localizeRaceName(data.race, locale) : "";
  // R4 — class/level DERIVE from `classes[]` (the source of truth) via the SRD-free
  // helpers; the headline (primary) class drives the search label + the art slug.
  const charLevel = totalLevel(data);
  const classSlug = primaryClassId(data);
  const classLabel = classSlug ? localizeClassName(classSlug, locale) : "";

  // "Fallen" derives from BOTH the roster lifecycle (`status: "dead"`) AND an
  // in-play death (three failed death saves), via the shared `isCharacterDead` so
  // this tile can never disagree with the cockpit's death-save track (golden rule
  // 6b). A character who died in play still carries `status: "active"`, so `isDead`
  // — not `status` — is what drives the dimmed tile / hidden HP / skull below.
  const isDead = isCharacterDead(status, session);
  const isActive = status === "active" && !isDead;

  const hpMax = data.hp.max;
  const hpCurrent = session.hp.current;
  const showHp = isActive && hpMax > 0;
  const tier = hpState(hpCurrent, hpMax);
  const pct =
    hpMax > 0 ? Math.max(0, Math.min(100, Math.round((hpCurrent / hpMax) * 100))) : 0;

  // Scannable combat stats for the foot (#21 — was speed-only). AC is the marquee
  // defensive glance; PB rounds out a quick read of the character's tier. The
  // projection's `ac` is ALREADY the effective AC (the cache writer applied any
  // override at stamp time — `acOverride`/`proficiencyBonusOverride` are `null` on
  // the projection), so the card reads the stamped value directly and never pulls
  // the SRD; PB is a pure level formula.
  const ac = data.ac;
  const pb = proficiencyBonus(charLevel);

  const updatedValid =
    updatedAt instanceof Date && !Number.isNaN(updatedAt.getTime()) ? updatedAt : null;
  // Stable "now" captured ONCE per mount (not read in render) so relative-time
  // formatting stays pure — `Date.now()` in render is a React-rules violation the
  // linter can't see through the helper's default param (#59 F16).
  const [now] = useState(() => Date.now());
  // Scannable relative time ("2 days ago" / "2 giorni fa"); the absolute date is
  // preserved as the hover title (H2).
  const updated = updatedValid
    ? formatRelativeTime(updatedValid, i18n.language, now)
    : null;
  const updatedAbsolute = updatedValid
    ? updatedValid.toLocaleDateString(i18n.language, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : undefined;
  const updatedRecent = updatedValid ? isRecent(updatedValid, now) : false;

  // `data.name` is a `NonEmptyString` (the roster projection's branded name; a
  // corrupt/nameless cache was already REJECTED at the read boundary, so no card is
  // ever rendered for one) — it displays directly, never a placeholder.
  const displayName = data.name;

  // Accessible name for the stretched primary action — always carries the
  // character name (+ a short identity summary when available).
  const summary = [raceLabel, classLabel && `${classLabel} ${charLevel}`]
    .filter(Boolean)
    .join(" · ");
  const cardLabel = summary ? `${displayName}, ${summary}` : displayName;

  // ─── Row-actions menu (view state only; the data lives in the hook) ──────────
  // The kebab + popover + roving keyboard + the no-navigate guard all live in the
  // shared <CardOverflowMenu> / useCardMenuGuard — the campaign cards reuse the
  // exact same component, so a fix to either propagates to both. We only describe
  // the actions; the guard keeps the stretched `.ch-open` button from navigating
  // on the trailing click that dismisses an open menu.
  const actions = useRosterActions(character);
  const {
    open: menuOpen,
    setOpen: setMenuOpen,
    openBtnRef,
    guardProps,
  } = useCardMenuGuard();

  // ─── Multi-select (owner 2026-06-07) ─────────────────────────────────────────
  // In selection mode the card toggles instead of navigating; a long-press (touch)
  // or ⌘/Ctrl-click (desktop) ENTERS the mode selecting this card.
  const selecting = selection?.selecting ?? false;
  const selected = selection?.selected ?? false;
  const longPress = useLongPress(() => selection?.onEnterWith(character.id), {
    enabled: Boolean(selection) && !selecting,
  });

  const menuItems: CardMenuItem[] = [
    {
      key: "export",
      label: t("roster.exportJson"),
      icon: Download,
      onSelect: () => void actions.exportJson(),
    },
    {
      key: "export-pdf",
      label: t("roster.exportPdf"),
      icon: FileText,
      onSelect: () => void actions.exportPdf(),
    },
    {
      key: "clone",
      label: t("roster.clone"),
      icon: Copy,
      onSelect: () => void actions.clone(),
    },
    isActive
      ? {
          key: "retire",
          label: t("roster.retire"),
          icon: Archive,
          onSelect: () => void actions.retire(),
        }
      : {
          key: "restore",
          label: t("roster.restore"),
          icon: ArchiveRestore,
          onSelect: () => void actions.restore(),
        },
    {
      key: "delete",
      label: t("roster.delete"),
      icon: Trash2,
      danger: true,
      dividerBefore: true,
      onSelect: () => void actions.remove(),
    },
  ];

  return (
    <article
      className={isActive ? "ch-card" : "ch-card retired"}
      // Carries the class domain pigment to the card's top accent (H8) so
      // same-class / class-less rosters still read as a varied gallery.
      data-class={classSlug || undefined}
      data-selecting={selecting || undefined}
      data-selected={selected || undefined}
      // Capture-phase no-navigate guard (shared): the article is never disabled,
      // so its capture listeners always fire — even over the disabled `.ch-open`.
      {...guardProps}
    >
      <button
        ref={openBtnRef}
        type="button"
        className="ch-open"
        // Inert while the menu is open (the synchronous half of the no-navigate
        // guard; the capture handler above covers the async re-enable race).
        disabled={menuOpen}
        {...longPress.handlers}
        onClick={(e) => {
          // A long-press just fired (it entered selection mode) — swallow the
          // trailing click so it doesn't also navigate/toggle.
          if (longPress.consume()) return;
          if (selecting) {
            selection?.onToggle(character.id);
            return;
          }
          // Desktop accelerator: ⌘/Ctrl-click enters selection with this card.
          if (selection && (e.metaKey || e.ctrlKey)) {
            selection.onEnterWith(character.id);
            return;
          }
          void navigate(`/characters/${character.id}`);
        }}
        aria-pressed={selecting ? selected : undefined}
        aria-label={
          selecting
            ? t("roster.selectCardAria", { label: cardLabel })
            : t("roster.cardAria", { label: cardLabel })
        }
      />

      {/* Selection mirror — REUSES the brass `.cb` checkbox atom (its checked gold +
          ✓ stay identical to every other checkbox), positioned as a click-through
          overlay; the stretched `.ch-open` button above is the real toggle, so this
          is aria-hidden + pointer-events:none. */}
      {selecting ? (
        <span
          className="cb ch-select"
          data-checked={selected ? "true" : undefined}
          aria-hidden="true"
        />
      ) : null}

      {/* The per-card kebab is hidden in selection mode — the bulk bar owns the
          actions there, so the two affordances never compete. */}
      {selecting ? null : (
        <CardOverflowMenu
          open={menuOpen}
          onOpenChange={setMenuOpen}
          items={menuItems}
          triggerLabel={t("roster.moreActions")}
          menuLabel={t("roster.actionsFor", {
            name: displayName,
          })}
        />
      )}

      <div className="ch-top">
        <span className="ch-portrait" data-class={classSlug || undefined}>
          {isDead ? (
            <Skull className="skull" aria-hidden="true" />
          ) : (
            // Shared Portrait (#92): crop-aware + lazy/async (a roster of N cards no
            // longer eager-downloads N full-res JPEGs), with the deterministic
            // per-character tinted-initial fallback when there's no portrait.
            <Portrait
              src={portraitUrl}
              crop={portraitCrop}
              name={data.name}
              seed={character.id}
              loading="lazy"
            />
          )}
        </span>
        <div className="ch-id">
          <span className="ch-name">{displayName}</span>
          {/* Shared identity-line chrome (also drives the campaign party card) so the
              two surfaces never drift — race · class level, class in gilt, subclass
              on its own line, all localized reactively. */}
          <CharacterIdentityLine race={data.race} classes={data.classes} />
          {isDead ? (
            <span className="ch-deadtag">
              <Icon as={Skull} size="xs" decorative />
              {t("roster.fallen")}
            </span>
          ) : status !== "active" ? (
            // A living non-active hero (retired/archived) names its state — the
            // dimmed tile alone reads as "missing HP bar", not as a lifecycle
            // (the fallen tile already gets its tag above). Same tag anatomy,
            // quiet ink: rest, not danger.
            <span className="ch-deadtag quiet">
              <Icon as={Archive} size="xs" decorative />
              {t("roster.retiredTag")}
            </span>
          ) : null}
        </div>
      </div>

      {showHp ? (
        // pointer-events:none so the display-only HP region (raised above the
        // stretched .ch-open button by the recipe) never creates a dead click
        // zone — taps fall through to "open character".
        <div className="ch-hp pointer-events-none">
          <div className="ch-hp-label">
            <span className="hl-lbl">{t("character.hitPoints")}</span>
            {/* The current/max readout waits for the `combat/state` subdoc to HYDRATE:
                until then the parent-doc tile carries only the full-HP placeholder, so
                we show the honest "—" blank (the same one AC uses) rather than flashing
                a wrong full-HP number for a wounded hero. */}
            <span className="hl-num">{hpReady ? `${hpCurrent} / ${hpMax}` : "—"}</span>
          </div>
          <div
            className="hp-bar"
            data-state={tier}
            role="img"
            aria-label={t("character.hpSummaryAria", {
              cur: hpCurrent,
              max: hpMax,
            })}
          >
            {/* Gate the fill on HP hydration (root cause of the roster placeholder
                slide): rendering it only once the real width is known means it MOUNTS at
                that width — a freshly-mounted element has no prior value, so the §22
                `width` transition never fires on first paint (no full-HP frame, no
                slide). A genuine later HP change re-uses the already-mounted fill, so
                damage/heal still animates. Empty `.hp-bar` before that IS the subtle
                rail. Roster-only. */}
            {hpReady ? (
              <span className="hp-fill" style={{ ["--w" as string]: `${pct}%` }} />
            ) : null}
          </div>
        </div>
      ) : null}

      {/* `flex-wrap` + `shrink-0` chips: at the ~280px multi-column floor the
          three stats keep their natural width and the date gracefully drops to its
          own line instead of the chips squeezing / the date clipping. Wide cards
          stay a single row. */}
      <div className="ch-foot flex-wrap">
        {/* The shared StatBadge CHIPS (icon + acronym + value) — the SAME atom the
            cockpit hero bar and the campaign party card render, so a character's
            stats read identically wherever they appear (golden rule 6). */}
        <StatBadge
          density="chip"
          className="shrink-0"
          icon={Shield}
          acronym={t("character.vitals.ac")}
          fullLabel={t("character.vitals.acFull")}
          // "—" for a stale/un-stamped snapshot (never the lie "0"); honest blank,
          // self-heals on the hero's next save. Same helper as the party card so
          // both surfaces blank identically (rule 6).
          value={displayAc(ac)}
          valueText={displayAc(ac)}
        />
        <StatBadge
          density="chip"
          className="shrink-0"
          icon={Footprints}
          acronym={t("character.vitals.spd")}
          fullLabel={t("character.vitals.speed")}
          value={formatSpeed(data.speed, i18n.language)}
          valueText={formatSpeed(data.speed, i18n.language)}
        />
        <StatBadge
          density="chip"
          className="shrink-0"
          icon={Award}
          acronym={t("character.vitals.pb")}
          fullLabel={t("character.vitals.pbAria")}
          value={`+${pb}`}
          valueText={`+${pb}`}
        />
        {updated ? (
          // Exact date on hover, via the shipped branded Tooltip. It PORTALS out of
          // the card's `overflow:hidden` clip (a CSS / native `title` tooltip would
          // be clipped) and is hover-reliable; the native `title` never fired
          // because the stretched `.ch-open` button overlays the foot. The trigger
          // is raised above that button (`relative z-[2]`) so the pointer reaches
          // it — only this small date corner is non-navigating; the rest of the foot
          // still opens the character.
          <TooltipProvider delayDuration={200}>
            <Tooltip content={updatedAbsolute} side="top" align="end">
              <span
                className={cn(
                  "ch-played relative z-[2]",
                  updatedRecent && "now",
                  // In selection mode the whole card toggles, so let taps on the
                  // raised date corner fall through to the toggle button.
                  selecting && "pointer-events-none"
                )}
              >
                {t("roster.updated", { date: updated })}
              </span>
            </Tooltip>
          </TooltipProvider>
        ) : null}
      </div>
    </article>
  );
}
