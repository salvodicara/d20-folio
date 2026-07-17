/**
 * InitVital — the INIT roll-to-total `.vital` tile (owner-8), extracted to its OWN light
 * leaf module so the always-eager topbar pip ({@link CombatPip}) can import it SYNCHRONOUSLY
 * (no `React.lazy`/`Suspense` flicker) without pulling the heavy `party-encounter` card graph
 * (HpEditPopover / engine / firebase). Its only deps are React, react-i18next, one lucide
 * glyph, and the shared {@link InitBadge}/{@link StatLabel} atoms — a few KB.
 *
 * NO DICE (constitution 2.2): the user types their PHYSICAL d20 ROLL and the app ADDS the
 * engine-derived initiative `bonus` (DEX mod + Alert PB + grants, override-first — from
 * `derivePartyMemberStats`) to DISPLAY the total. The single source is the RAW ROLL — `value`
 * IS that raw roll and `onCommit` yields the raw roll (NEVER the total); every consumer derives
 * `total = roll + bonus` (golden rule 6 — never store the derived total). The displayed value
 * is the total so the chip reads as the turn-order number. Editable by the OWNING player (isMe)
 * AND the DM (canEdit); a non-DM peer is a static read. Models a BLANK (not-yet-rolled) value.
 */
import { useEffect, useRef, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Dices } from "lucide-react";
import { InitBadge, StatLabel } from "@/components/shared/StatBadge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useReportEditorOpen } from "@/components/shared/card-editor-scope";

export function InitVital({
  value,
  bonus,
  canEdit,
  name,
  onCommit,
  onDismiss,
  draftRef: draftRefProp,
  cancelRef: cancelRefProp,
  urgent = false,
  autoEdit = false,
}: {
  /** The stored raw d20 ROLL (`null` = not yet rolled). */
  value: number | null;
  bonus: number;
  canEdit: boolean;
  name: string;
  /** Yields the raw d20 ROLL (`null` clears) — never the total. */
  onCommit: (roll: number | null) => void;
  /** Set ONLY when this tile lives inside a popover the CALLER owns (the {@link CombatPip}
   *  loud-tier roller, mounted `autoEdit`). A dismissal (Enter / Escape) CLOSES the caller's
   *  popover via this callback. In that mode the CALLER is the SOLE committer: it reads the
   *  live typed draft from {@link draftRef} on close (see CombatPip), so a dismissal by ANY
   *  path — Enter, Escape (skipped via {@link cancelRef}), outside-click, trigger re-click —
   *  commits exactly once from the current text, and a spurious remount can never write a
   *  stale/empty draft. The party-card path OWNS its own popover and commits itself. */
  onDismiss?: () => void;
  /** autoEdit ONLY — the caller's live mirror of the typed draft (the raw d20 STRING). The
   *  tile writes it SYNCHRONOUSLY on every keystroke, so the caller's close handler always
   *  reads the current text (never a render-lagged copy). */
  draftRef?: RefObject<string>;
  /** autoEdit ONLY — the caller's cancel flag. Escape sets it `true` so the caller's close
   *  handler skips the commit (a genuine cancel); reset by the caller on open. */
  cancelRef?: RefObject<boolean>;
  /** B8 — pulse + gold ring the un-rolled chip to pull focus (set only when in combat
   *  and the roll is still missing). No effect once a roll is entered. */
  urgent?: boolean;
  /** B9b — mount DIRECTLY in the edit state (the pip popover opens straight onto the
   *  auto-focused d20 input), so there's no dangling dash to tap twice. */
  autoEdit?: boolean;
}) {
  const { t } = useTranslation();
  // Entering edit PRE-FILLS the current raw roll (owner: re-open shows the committed value,
  // overtype to re-roll — onFocus selects all; closing unchanged re-commits the same roll,
  // never a destructive reset). `value` IS the raw d20 roll, never the total; "" stays blank.
  const seed = value === null ? "" : String(value);
  const [editing, setEditing] = useState(autoEdit);
  const [draft, setDraft] = useState(seed); // autoEdit (pip popover) mounts pre-filled too
  const inputRef = useRef<HTMLInputElement>(null);
  // The LIVE draft mirror the close-time commit reads — kept current SYNCHRONOUSLY in the
  // change handler (never a render-lagged copy), so whichever handler fires the commit always
  // sees the latest typed text. autoEdit shares the CALLER's ref (the caller commits); the
  // party-card path uses its own (it commits itself).
  const localDraftRef = useRef(seed);
  const draftRef = draftRefProp ?? localDraftRef;
  // Escape = cancel. autoEdit shares the caller's flag (the caller skips its commit); the
  // party-card path uses its own local flag.
  const localCancelRef = useRef(false);
  const cancelRef = cancelRefProp ?? localCancelRef;
  const setDraftLive = (v: string): void => {
    draftRef.current = v;
    setDraft(v);
  };
  const parseRoll = (d: string): number | null =>
    d === "" ? null : Math.round(Number(d));
  // Report the inline edit's open-state to a host combatant card (the party-card `lead`),
  // so a click that dismisses it only commits + closes, never ALSO toggling the card. A
  // no-op for the topbar combat pip (no card scope) — pure open-state reporting, the value
  // logic is untouched.
  useReportEditorOpen(editing);

  useEffect(() => {
    // preventScroll: focusing a chip that morphs into an input partly outside the
    // viewport (a tap near the bottom on mobile) must never yank the page (B27).
    if (editing) inputRef.current?.focus({ preventScroll: true });
  }, [editing]);

  const bonusLabel = bonus >= 0 ? `+${bonus}` : `−${Math.abs(bonus)}`;
  const liveRoll = parseRoll(draft);
  const liveTotal = liveRoll === null ? null : liveRoll + bonus;
  // The TOTAL shown when not editing = the stored raw roll + the engine bonus.
  const total = value === null ? null : value + bonus;

  function start(): void {
    cancelRef.current = false;
    setDraftLive(seed); // re-open pre-fills the committed roll (selected on focus → overtype)
    setEditing(true);
  }
  // The party-card close path (the tile OWNS its popover): `onOpenChange(false)` — an
  // outside-click / trigger re-click / Enter — commits the CURRENT typed draft from the live
  // ref (never a blur that raced the teardown, never a render-lagged closure), unless Escape
  // cancelled. One commit per dismissal; the ratified trigger-re-click-closes / outside-click /
  // Escape-cancel behaviours all hold. (The autoEdit / pip path never reaches here — its caller
  // owns the popover AND the commit.)
  function close(): void {
    if (!cancelRef.current) onCommit(parseRoll(draftRef.current));
    setEditing(false);
  }

  // Escape CANCELS — mark it at the CAPTURE phase, BEFORE Radix's Escape handler fires
  // `onOpenChange(false)` → `close()` (party card) or the caller's popover close (autoEdit).
  // Radix's Escape runs ahead of React's `onKeyDown`, so a capture listener is what makes the
  // cancel ordering-independent: whichever close path fires next reads `cancelRef` already set
  // and commits nothing. (`onKeyDown` still owns CLOSING for the autoEdit path — see below.)
  useEffect(() => {
    if (!editing) return;
    const markCancel = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancelRef.current = true;
    };
    document.addEventListener("keydown", markCancel, true);
    return () => document.removeEventListener("keydown", markCancel, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  // The shared init acronym + full term — the icon-label (Dices) is rendered by
  // {@link InitBadge} for the display states; the edit state reuses {@link StatLabel}.
  const acr = t("character.vitals.init");
  const fullLabel = t("character.vitals.initAria");

  // The floating d20 → total edit box: the compact input + the live `+bonus = total`
  // readout. It is the popover CONTENT in every editable presentation — for the party
  // card the popover this tile OWNS (below), and for the CombatPip loud-tier roller
  // (`autoEdit`) the caller-owned popover. NEVER placed in the card's flow (the reflow bug).
  const editBox = (
    <span className="vital vital-init vital-init-edit" data-density="chip">
      <span className="vi-edit-row">
        <span className="vi-input">
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            value={draft}
            onChange={(e) => setDraftLive(e.target.value.replace(/[^\d]/g, ""))}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => {
              // Enter = COMMIT (the live draft) + CLOSE. It commits HERE (not via the caller's
              // popover close) because Enter closes through the controlled `open` prop, which
              // Radix does NOT report through `onOpenChange` — so the caller's close-commit
              // would miss it. Escape = CANCEL + close (the capture listener already set
              // `cancelRef`, so neither this nor the caller's close-commit fires).
              if (e.key === "Enter") {
                e.preventDefault();
                if (!cancelRef.current) onCommit(parseRoll(draftRef.current));
                if (onDismiss) onDismiss();
                else setEditing(false);
              } else if (e.key === "Escape") {
                cancelRef.current = true;
                if (onDismiss) onDismiss();
                else close();
              }
            }}
            aria-label={t("campaignHub.encounterInitiativeRollAria", { name })}
            className="init-edit-input"
            placeholder="d20"
          />
        </span>
        <span
          className="vi-math"
          aria-hidden
        >{`${bonusLabel} = ${liveTotal ?? "—"}`}</span>
      </span>
      <StatLabel icon={Dices} acronym={acr} />
    </span>
  );

  // CombatPip loud-tier roller (`autoEdit`): the CALLER owns the popover and this tile IS
  // its content — render the floating edit box directly, dismissing through `onDismiss`
  // (never an in-place edit→display flip). The party card path below OWNS its own popover.
  if (autoEdit) return editBox;

  // The resting chip face: an un-rolled dash (glowing when `urgent` — in combat, roll still
  // missing, B8) or the derived TOTAL (stored raw roll + engine bonus).
  const badge = (
    <InitBadge value={value === null ? "—" : total} acronym={acr} icon={Dices} />
  );
  const mathTitle = t("campaignHub.encounterInitiativeMath", {
    bonus: bonusLabel,
    total,
  });

  // A non-editable peer reads a STATIC chip — never a popover. Un-rolled shows a dash (with
  // the in-combat urgent glow); rolled shows the total. Byte-identical to the prior read.
  if (!canEdit) {
    return (
      <span
        className="vital vital-init"
        data-density="chip"
        data-urgent={value === null && urgent ? "" : undefined}
        title={value === null ? fullLabel : mathTitle}
      >
        {badge}
      </span>
    );
  }

  // Editable — FLOAT the wide edit box in a popover anchored to the compact resting chip, so
  // opening the editor never widens/reshapes `.party-card-head` and never reflows the card or
  // the cards below (the bug: the in-place morph shoved the seal + name column right and
  // re-wrapped the hero name). The resting chip keeps its width IN FLOW; the roller floats.
  // Controlled by `editing`: the trigger opens it (`start` pre-fills the committed roll), and
  // Enter commits + closes; a dismissal (Escape / outside-click / trigger re-click) commits
  // the typed roll on close then closes (never a blur that raced the teardown). Mirrors the shipped
  // CombatPip roller pattern. `useReportEditorOpen(editing)` still tells the host card an
  // editor is open, so a dismissing click closes the popover without also toggling the card.
  return (
    <Popover open={editing} onOpenChange={(open) => (open ? start() : close())}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="vital vital-init"
          data-density="chip"
          data-urgent={value === null && urgent ? "" : undefined}
          title={value === null ? t("campaignHub.encounterRollInitiative") : mathTitle}
          aria-label={
            value === null
              ? t("campaignHub.encounterRollInitiative")
              : `${fullLabel}: ${total}`
          }
        >
          {badge}
        </button>
      </PopoverTrigger>
      <PopoverContent rubric={t("combatPip.initiativeRubric", { name })} align="start">
        <div className="party-vitals">{editBox}</div>
      </PopoverContent>
    </Popover>
  );
}
