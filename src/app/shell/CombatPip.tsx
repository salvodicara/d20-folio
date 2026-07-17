/**
 * CombatPip — the persistent GLOBAL combat indicator in the topbar (spec §5), the headline
 * VISUAL of the encounter re-arch. It reads the shell's ONE pip model
 * ({@link usePipCombat}, published by {@link "@/features/campaigns/global-combat"}) and
 * renders as a PORTRAIT-SOCKET SPLIT PILL (spec §5, P1):
 *
 *     [ ⚔ R{n} · {state} ] [ {portrait|party} {verb} › ]
 *
 * a pure-STATUS left segment + a raised carved-button destination chip that WEARS its
 * identity (the hero's portrait/monogram seal, or the party glyph). The state word is the
 * only state sentence (COLOUR carries the rest):
 *   • needs-roll → loud RED, pulsing — the viewer hasn't rolled this fight;
 *   • your-turn  → GOLD, pulsing — the pointer is on the viewer's PC;
 *   • actor-turn → quiet — "{actor}'s turn" (the current PC/monster);
 *   • gathering  → quiet — pre-Begin, players rolling.
 *
 * It is a CONTEXTUAL SWITCH: on the viewer's SHEET it flips to the encounter (dest =
 * "Party"); on the encounter it flips to the viewer's HERO sheet (dest = the hero name).
 * A PC-less DM gets a ONE-WAY pip → the group (never "Your turn"). When the viewer is in
 * SEVERAL fights at once a count chip opens a chooser that PINS one (a local pref) and jumps
 * to it. On mobile (≤720px) the destination chip drops the verb, keeping the glyph/portrait +
 * a short name/"Party" + chevron (space-constrained).
 *
 * The ONE EXCEPTION to the switch is the loud RED `needs-roll` pip: it is an ACTION, not a
 * destination. Tapping it opens an inline {@link InitVital} roll-to-total popover anchored
 * to the pip — roll your initiative FROM ANYWHERE (no trip to the sheet/encounter), exactly
 * the convenience the pre-switch pip had. So that state DROPS the trailing `→ {dest}` and
 * carries no arrow. It is RENDER-RECONCILED to the STATE, not the status: a `needs-roll` pip
 * renders the roller trigger the instant its state is red — even in the brief window before
 * the live {@link useGlobalCombat} status (the roll payload) lands — so a fresh-start red
 * never flashes the navigating `<Link>` fallthrough (no arrow-then-morph). The popover shows
 * a one-tick pending spinner until the status arrives, then the roll-to-total widget.
 *
 * Always-eager topbar chrome: it reads only the LIGHT pip model + the live status + the pin
 * store + the router location — NO firebase/engine graph (the heavy producer is lazy-mounted
 * in AppShell; the roll-COMMIT module is lazy-imported only when the viewer commits a roll).
 * {@link InitVital} is imported SYNCHRONOUSLY (its own light leaf module — a few KB) so the
 * roll popover renders its final content on the first paint (no React.lazy/Suspense flicker).
 */

import { useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import { Swords, ChevronRight, Users } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { InitVital } from "@/features/campaigns/init-vital";
import { Portrait } from "@/components/shared/Portrait";
import { useAuthStore } from "@/stores/authStore";
import { useToastStore } from "@/stores/toastStore";
import {
  usePipCombat,
  useGlobalCombat,
  usePinStore,
  type PipEntry,
} from "@/features/campaigns/global-combat-context";

/** First name only (the split-pill / portrait-chip variants show "Open {firstName}",
 *  not the full character name) — a plain space-split, no shared helper needed for
 *  this one caller. */
function firstNameOf(name: string): string {
  return name.split(" ")[0] ?? name;
}

export function CombatPip() {
  const { t } = useTranslation();
  const pip = usePipCombat();
  const status = useGlobalCombat();
  const uid = useAuthStore((s) => s.user?.uid);
  const setPin = usePinStore((s) => s.setPin);
  const showToast = useToastStore((s) => s.showToast);
  const { pathname } = useLocation();
  // CONTROLLED so a dismissal closes the roll popover WITHOUT the InitVital morphing
  // edit→display mid-exit-animation (the dismiss-flicker root cause): the roller stays the
  // edit layout through the close, then unmounts. Hoisted above the early returns (hooks
  // must run unconditionally).
  const [rollOpen, setRollOpen] = useState(false);
  // The pip OWNS the roller popover, so it also OWNS the commit: the InitVital tile mirrors
  // the live typed draft into `rollDraftRef` (synchronously, every keystroke) and flags Escape
  // in `rollCancelRef`. Any dismissal that Radix reports through `onOpenChange(false)` — an
  // outside-click or a trigger re-click — commits that live draft ONCE, from the ref (never a
  // stale render closure, never a spurious-remount unmount that wrote an empty draft — the
  // deleted failed-fix machinery). Enter commits inside InitVital (it closes via the controlled
  // `open` prop, which Radix does not surface through `onOpenChange`).
  const rollDraftRef = useRef("");
  const rollCancelRef = useRef(false);

  if (!pip || pip.entries.length === 0) return null;
  const primary =
    pip.entries.find((e) => e.campaignId === pip.primaryId) ?? pip.entries[0];
  if (!primary) return null;

  // The middle STATE word — the only state sentence (colour carries the rest, spec §5). The
  // "Roll initiative" / "Your turn" words REUSE the canonical encounter/cockpit strings (one
  // string per concept — the i18n-dedup discipline), never a pip-local duplicate.
  const stateWord = (e: PipEntry): string => {
    switch (e.state) {
      case "needs-roll":
        return t("campaignHub.encounterRollInitiative");
      case "your-turn":
        return t("character.yourTurn");
      case "gathering":
        return t("combatPip.stateGathering");
      case "actor-turn":
        return e.actorName
          ? t("combatPip.stateActorTurn", { actor: e.actorName })
          : t("combatPip.stateActorTurnUnknown");
    }
  };

  // CONTEXTUAL DESTINATION: on the encounter the pill flips to the viewer's hero sheet;
  // everywhere else (their sheet, the compendium, anywhere) it points at the group. A
  // PC-less DM never flips — one-way to the group. The hero flip needs BOTH the sheet link
  // and the name, so it's resolved as one narrowed object (no non-null assertion).
  const onEncounter = pathname.startsWith(`/campaigns/${primary.campaignId}`);
  const heroFlip =
    onEncounter && primary.characterId !== null && primary.heroName !== null
      ? { dest: primary.heroName, to: `/characters/${primary.characterId}` }
      : null;
  // "Party" REUSES the canonical campaign-hub string (i18n-dedup — one string per concept).
  const dest = heroFlip ? heroFlip.dest : t("campaignHub.party");
  // A plain navigation to the group destination — the campaign hub. It lands like any other
  // PUSH: the `ScrollRestorer` starts it at the top (owner 2026-07-11: the old auto-scroll to
  // the encounter read as a JUMP; the standing navigation doctrine is "never surprise").
  const to = heroFlip ? heroFlip.to : `/campaigns/${primary.campaignId}`;

  const word = stateWord(primary);

  // RENDER-RECONCILED needs-roll (spec §5): a `needs-roll` pip is an INLINE ROLLER, NOT a
  // navigating switch — so it renders the roller TRIGGER (red, no `→ dest` arrow, opens the
  // popover) as soon as the STATE is needs-roll, even during the brief window before the live
  // status (the roll payload) lands. This is what prevents the arrow-then-morph the prior fix
  // was rejected for: the pip never flashes the navigating `<Link>` fallthrough for a
  // fresh-start red. `pipState` only ever yields `needs-roll` for a PC row, so this is always
  // the viewer's own roll prompt.
  const isNeedsRoll = primary.state === "needs-roll";
  // The roll-commit fields ride the live status (the SAME override-first init bonus / raw roll
  // / max HP the party card derives — golden rule 6); the hero name comes off the pip entry.
  // Resolved as one narrowed object (status + uid + name all required — no defaulting); `null`
  // ⇒ the payload isn't ready yet, so the popover shows a brief pending spinner (it NEVER
  // falls back to the navigating switch — the trigger stays the roller).
  const rollName = primary.heroName;
  const rollTarget =
    isNeedsRoll && status !== null && uid !== undefined && rollName !== null
      ? { uid, status, name: rollName }
      : null;

  // Commit a raw d20 roll for the viewer's OWN PC: a single per-key field-path write to
  // the CAMPAIGN doc's `encounterInit` table (the initiative SSOT — the member's own-row
  // grant in firestore.rules always authorizes it). It touches NOTHING else — no combat
  // subdoc, no HP base, no max-HP hydration gate (the old `maxHp > 0` guard existed only
  // because the roll used to rewrite the whole combat subdoc). Lazy-imported so the
  // topbar stays firebase-free. A rejected write SURFACES (toast) — never a silent
  // swallow that reads as the roll "not saving".
  const commitRoll = (roll: number | null): void => {
    if (!rollTarget) return;
    void import("@/features/campaigns/campaign-io")
      .then(({ setEncounterInitiative }) =>
        setEncounterInitiative(rollTarget.status.campaignId, rollTarget.uid, roll)
      )
      .catch((e: unknown) => {
        console.error("Initiative roll failed", e);
        showToast({ message: t("campaignHub.combatWriteFailed"), duration: 6000 });
      });
  };

  // The shared glyph + round prefix both pip controls open with.
  const lead = (
    <>
      <span className="cp-glyph" aria-hidden="true">
        <Swords width={13} height={13} />
      </span>
      <span className="cp-round tnum" aria-hidden="true">
        <span className="cp-r">R</span>
        {primary.round}
      </span>
    </>
  );

  const primaryControl = isNeedsRoll ? (
    // ROLL pip — an ACTION, not a switch: no `→ {dest}` arrow. Tapping opens the inline
    // roll-to-total popover (controlled — see `rollOpen`). The trigger carries `data-phase`
    // (NOT `data-state`, which Radix owns as open/closed on a trigger) so the red phase
    // colour survives the popover toggling open.
    <Popover
      open={rollOpen}
      onOpenChange={(open) => {
        if (open) {
          // Seed the live draft with the current roll + clear any prior cancel, so a dismissal
          // unchanged re-commits the same value (never an empty draft on the first frame).
          rollCancelRef.current = false;
          rollDraftRef.current =
            rollTarget?.status.initiativeRoll != null
              ? String(rollTarget.status.initiativeRoll)
              : "";
        } else if (!rollCancelRef.current) {
          // Outside-click / trigger re-click closed it → commit the live draft ONCE. (Enter
          // commits inside InitVital; Escape set the cancel flag so nothing commits here.)
          const d = rollDraftRef.current;
          commitRoll(d === "" ? null : Math.round(Number(d)));
        }
        setRollOpen(open);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="combat-pip"
          data-phase={primary.state}
          aria-label={t("combatPip.rollPipAria", { round: primary.round })}
          title={t("combatPip.rollPipAria", { round: primary.round })}
        >
          {lead}
          <span className="cp-body" aria-hidden="true">
            <span className="cp-sep">·</span>
            <span className="cp-state">{word}</span>
          </span>
          <ChevronRight
            className="cp-chevron"
            width={14}
            height={14}
            aria-hidden="true"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        rubric={
          rollName !== null
            ? t("combatPip.initiativeRubric", { name: rollName })
            : undefined
        }
        align="end"
      >
        {rollTarget ? (
          <div className="party-vitals">
            <InitVital
              value={rollTarget.status.initiativeRoll}
              bonus={rollTarget.status.initiativeBonus}
              canEdit
              autoEdit
              name={rollTarget.name}
              // The pip OWNS the popover + the commit: InitVital mirrors the live draft into
              // `rollDraftRef` and flags Escape in `rollCancelRef`; a dismissal commits exactly
              // ONCE (Enter inside InitVital; outside-click / trigger via `onOpenChange` above).
              onDismiss={() => setRollOpen(false)}
              draftRef={rollDraftRef}
              cancelRef={rollCancelRef}
              onCommit={commitRoll}
            />
          </div>
        ) : (
          // The roll payload (live status) hasn't landed yet — a brief pending beat, never
          // a navigate. The trigger already shows the red needs-roll pip; this fills once
          // the atomic status publish arrives (typically the very next tick).
          <div className="cp-roll-pending">
            <Spinner size="sm" />
          </div>
        )}
      </PopoverContent>
    </Popover>
  ) : (
    // PORTRAIT SOCKET (spec §5, P1): the switch is a split pill — a pure-status LEFT
    // segment (decorative — its content is restated in the chip's aria-label) + a
    // raised carved-button RIGHT segment that is the ONLY interactive element (no
    // nested-interactive: the outer wrapper is a plain div). The destination WEARS
    // its identity: the group glyph (Users) for the party, or the hero's portrait
    // seal (monogram fallback — the light topbar pip model carries no portrait URL)
    // for the own-character flip. The chip is a plain navigation to the hub.
    <div className="combat-pip combat-pip-split" data-phase={primary.state}>
      <span className="cp-status" aria-hidden="true">
        {lead}
        <span className="cp-body">
          <span className="cp-sep">·</span>
          <span className="cp-state">{word}</span>
        </span>
      </span>
      <Link
        to={to}
        className="cp-dest-chip"
        aria-label={t("combatPip.pipAria", { round: primary.round, state: word, dest })}
        title={t("combatPip.pipAria", { round: primary.round, state: word, dest })}
      >
        {/* Mobile-tightest (≤640px, pip present): the split pill collapses to a single
            glyph+count tap target (⚔ {round}). The topbar's brand / search / account are
            fixed-size invariants (owner 2026-07-11) — the pip is the ONE element that
            adapts, so on the phone the decorative status segment + destination seal/label
            step aside and this compact lead becomes the whole (still-tappable) chip. It
            reuses the same `lead` fragment; hidden on desktop, where the full split pill
            shows. Pinned by topbar-brand-invariant.spec.ts. */}
        <span className="cp-dest-lead" aria-hidden="true">
          {lead}
        </span>
        <span className="cp-dest-glyph" aria-hidden="true">
          {heroFlip ? (
            <Portrait
              src={null}
              name={dest}
              seed={heroFlip.to}
              className="cp-dest-portrait"
            />
          ) : (
            <Users width={13} height={13} />
          )}
        </span>
        <span className="cp-dest-label cp-dest-label-desktop">
          {/* "Open {name}" REUSES the canonical campaigns string (i18n-dedup — one
              string per concept; the campaigns-list card's "Open" CTA says the same
              thing). */}
          {heroFlip
            ? t("campaigns.openHubNamed", { name: firstNameOf(dest) })
            : t("combatPip.destGroup")}
        </span>
        <span className="cp-dest-label cp-dest-label-mobile">
          {heroFlip ? firstNameOf(dest) : t("campaignHub.party")}
        </span>
        <ChevronRight
          className="cp-chevron cp-dest-chevron"
          width={14}
          height={14}
          aria-hidden="true"
        />
      </Link>
    </div>
  );

  return (
    <div className="combat-pip-wrap">
      {primaryControl}

      {/* A-STICKY MULTI (spec §5): a count chip → a chooser; tapping a row PINS that fight
          (a local pref) and jumps to it. One tap target per row. */}
      {pip.entries.length > 1 && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="cp-count"
              aria-label={t("combatPip.chooserOpen", { count: pip.entries.length })}
            >
              {/* A ⚔ glyph rides the count on the phone: at ≤640px the collapsed primary
                  pill + this chip can't both fit the topbar spacer's slack, so the primary
                  steps aside and this chip stands alone (⚔ N → chooser). The glyph is
                  hidden on desktop, where the full primary pip already carries it. */}
              <span className="cp-count-glyph" aria-hidden="true">
                <Swords width={13} height={13} />
              </span>
              <span className="tnum">{pip.entries.length}</span>
            </button>
          </PopoverTrigger>
          <PopoverContent rubric={t("combatPip.chooserTitle")} align="end">
            <ul className="cp-chooser">
              {pip.entries.map((e) => (
                <li key={e.campaignId}>
                  <Link
                    // A plain navigation to the encounter's hub — like the single-pip
                    // destination, it lands at the top (no auto-scroll surprise).
                    to={`/campaigns/${e.campaignId}`}
                    className="cp-row"
                    data-state={e.state}
                    onClick={() => setPin(e.campaignId)}
                  >
                    <span className="cp-row-glyph" aria-hidden="true">
                      <Swords width={14} height={14} />
                    </span>
                    <span className="cp-row-main">
                      <span className="cp-row-title">
                        {e.heroName
                          ? `${e.heroName} · ${e.campaignName}`
                          : e.campaignName}
                      </span>
                      <span className="cp-row-sub">
                        {t("combatPip.chooserRowState", {
                          round: e.round,
                          state: stateWord(e),
                        })}
                      </span>
                    </span>
                    <ChevronRight
                      className="cp-row-chev"
                      width={16}
                      height={16}
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
