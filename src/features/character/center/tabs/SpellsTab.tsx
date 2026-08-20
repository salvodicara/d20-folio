/**
 * SpellsTab — the cockpit's Spells domain (blueprint §2.4): a THIN orchestrator.
 *
 * It reads the character from the store, builds ONE localized view-model via the
 * pure {@link buildSpellsViewModel} presenter (`lib/views/spells-view`), holds the
 * local UI state (search / level filter / expanded row / modals), delegates every
 * cast to the cockpit's canonical transaction, and renders the presentational section
 * components — the brass cast-summary strip, the prepared-over-limit banner, the
 * level filters, and one `SpellCard` per spell grouped by level. SRD content is
 * pre-localized on the VM, so THIS file makes ZERO direct `[locale]`/BiText reads
 * (docs/ARCHITECTURE.md; golden rules 5 + 7).
 *
 * (folio §5.7 — the canonical card-page reference.)
 *
 * Play and Spells share one provider-owned cast flow: configuration, targets,
 * payment, economy, concentration, effects, logging, and undo cannot drift.
 */

import { useState, useMemo, useCallback, useRef, useEffect, lazy, Suspense } from "react";
import { primaryClassId } from "@/lib/classes";
import { useTranslation } from "react-i18next";
import { Sparkles, Plus } from "lucide-react";
import { useCharacterStore } from "@/stores/characterStore";
import { useLibraryStore } from "@/stores/libraryStore";
import { useUIStore } from "@/stores/uiStore";
import { registerUndoableToast } from "@/stores/undoStore";
import { useLocale } from "@/hooks/useLocale";
import { matchesSearch } from "@/lib/search";
import { Icon } from "@/components/ui/icon";
import { CollapsibleSearch } from "@/components/shared/CollapsibleSearch";
import { Button } from "@/components/ui/button";
import { RunicEmptyState } from "@/components/ui/runic-empty-state";
import { WizardSpellChoices } from "./WizardSpellChoices";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { GlossaryTip } from "@/components/shared/GlossaryTip";
import { SpellAddModal } from "@/components/sheet/SpellAddModal";
import { BeastFormPicker } from "@/components/sheet/BeastFormPicker";
import { resolvePolymorphForms } from "@/lib/polymorph";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { ensureSrdKind } from "@/i18n";
import { slotUsageKey } from "@/lib/cast-options";
import { deriveSpellSlots, applySlotMaxOverrides } from "@/lib/multiclass-slots";
import { resolveSpellCastOptions } from "@/lib/views/spell-cast-sources";
import { localizeSrd } from "@/i18n/resolver";
import { buildSpellsViewModel, type SpellCardVM } from "@/lib/views/spells-view";
import { useSheetCombat } from "../turn-state";
import { useAuthStore } from "@/stores/authStore";
import { confirmConcentrationSwap } from "@/features/character/confirm-concentration";
import {
  engineSpellCastRequest,
  type EngineSpellCastRequest,
} from "./spells/engine-spell-gate";
import type { SrdSpellData } from "@/data/types";
import type { SpellcastingConfig } from "@/types/character";
import {
  SpellCastSummary,
  PreparedOverLimitWarning,
  SpellLevelFilter,
} from "./spells/SpellCastSummary";
import { SpellCard, type SpellCardCallbacks } from "./spells/SpellCard";
import { localizeActions, type CombatAction } from "@/lib/views/combat-action-view";
import { useTurnEconomy } from "../useTurnEconomy";

// The Find Familiar form picker joins the monster corpus, so it rides a LAZY leaf
// mounted only when the affordance is tapped — the Spells tab gains zero corpus
// bytes until then (the encounter-bestiary recipe; the eager-partition sweep pins it).
// The engine cast flow joins the deterministic runtime, so it rides a lazy
// leaf mounted only when an engine-executable spell is cast.
const EngineCastFlow = lazy(() =>
  import("./spells/EngineCastFlow").then((m) => ({ default: m.EngineCastFlow }))
);
const EnginePulseStrip = lazy(() =>
  import("./spells/EnginePulseStrip").then((m) => ({ default: m.EnginePulseStrip }))
);
const EngineConsumablesStrip = lazy(() =>
  import("./spells/EngineConsumablesStrip").then((m) => ({
    default: m.EngineConsumablesStrip,
  }))
);

const FamiliarFormPicker = lazy(() =>
  Promise.all([
    import("../../companions/familiar-picker"),
    ensureSrdKind("monster"),
  ]).then(([m]) => ({ default: m.FamiliarFormPicker }))
);

export function SpellsTab() {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const character = useCharacterStore((s) => s.character);
  const { executeAction } = useTurnEconomy();
  const assumePolymorphForm = useCharacterStore((s) => s.assumePolymorphForm);
  const dropPolymorphForm = useCharacterStore((s) => s.dropPolymorphForm);

  const [filterLevel, setFilterLevel] = useState<number | "all">("all");
  // Concentration facet (Constitution §2.5) — one tap answers "which of my
  // spells require concentration?".
  const [concOnly, setConcOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedSpellId, setExpandedSpellId] = useState<string | null>(null);
  const [spellModalOpen, setSpellModalOpen] = useState(false);
  /** S7 — when non-null, the Beast-form picker is open for this Polymorph spell id. */
  const [transformSpellId, setTransformSpellId] = useState<string | null>(null);
  /** When true, the Find Familiar form picker is open. */
  const [familiarPickerOpen, setFamiliarPickerOpen] = useState(false);
  /** Engine dual-dispatch (rollout): the open engine-driven cast, if any. */
  const [engineCast, setEngineCast] = useState<EngineSpellCastRequest | null>(null);
  const sheetCombat = useSheetCombat();
  const sheetMode = useUIStore((s) => s.sheetMode);
  const isEdit = sheetMode === "edit";

  /** Resolved class id ("" when character is not loaded). */
  const classId = useMemo(
    () => (character ? primaryClassId(character.character) : ""),
    [character]
  );

  /** The Find Familiar eligible special-form ids (Pact of the Chain widens them). */
  const familiarFormIds = useMemo(
    () =>
      character
        ? aggregateCharacterGrants(character.character, character.session).familiarFormIds
        : new Set<string>(),
    [character]
  );

  // The ONE localized view-model (presenter). Stable across search/filter — those
  // operate on top of `view.levels` without recreating any card VM, so the memo'd
  // cards bail on a search keystroke (the perf contract `spells-tab-memo` pins).
  const view = useMemo(
    () => (character ? buildSpellsViewModel(character, classId, locale, isEdit) : null),
    [character, classId, locale, isEdit]
  );

  // The spellbook and Play cards resolve from the same action model. Spellbook
  // scope retains extended and currently-unprepared rows; the card owns their
  // preparation gate, while the transaction owner handles every cast consequence.
  const allSpellbookActions = useMemo(
    () => (character ? localizeActions(character, locale, "spellbook") : []),
    [character, locale]
  );
  const spellActions = useMemo(
    () =>
      allSpellbookActions.filter(
        (action) => action.source === "spell" && !action.summary.recurringUse
      ),
    [allSpellbookActions]
  );
  /** Spells whose casts can ride an item/feature pool — always legacy-routed. */
  const pooledSpellIds = useMemo(
    () =>
      new Set(
        allSpellbookActions.flatMap((action) =>
          action.castPoolSourceId !== undefined && action.spellId !== undefined
            ? [action.spellId]
            : []
        )
      ),
    [allSpellbookActions]
  );
  const actionForSpell = useCallback(
    (vm: SpellCardVM): CombatAction | undefined =>
      vm.kind === "srd"
        ? spellActions.find((action) => action.spellId === vm.data?.id)
        : spellActions.find((action) => action.customSpellIndex === vm.idx),
    [spellActions]
  );

  // ── store mutators (override-first) ──────────────────────────────────────────

  const togglePrepared = useCallback(
    (spellIdx: number) => {
      if (!character) return;
      const store = useCharacterStore.getState();
      const spells = [...character.character.spells];
      const ref = spells[spellIdx];
      if (!ref) return;
      // A2 — subclass-granted "always prepared" spells can't be unprepared.
      if (!("custom" in ref) && ref.alwaysPrepared === true) return;
      spells[spellIdx] = { ...ref, prepared: !ref.prepared };
      store.setCharacter({ ...character, character: { ...character.character, spells } });
    },
    [character]
  );

  const updateSpellField = useCallback(
    (spellIdx: number, field: string, value: string | boolean | number | null) => {
      if (!character) return;
      const store = useCharacterStore.getState();
      const spells = [...character.character.spells];
      const ref = spells[spellIdx];
      if (!ref) return;
      const stored =
        typeof value === "string" ? value || undefined : (value ?? undefined);
      // Identity is (kind, name), so a RENAME must move the library entry rather than
      // strand the old-named one — capture the name as it read before this edit.
      const previousName = "custom" in ref ? ref.name : undefined;
      spells[spellIdx] = { ...ref, [field]: stored };
      const next = { ...character.character, spells };
      store.setCharacter({ ...character, character: next });
      // Custom IS the library: an edited homebrew spell updates its entry (no-op for
      // an SRD ref). The library write itself is debounced in the persistence seam.
      useLibraryStore.getState().syncFromCharacter(next, "spell", spellIdx, previousName);
    },
    [character]
  );

  const updateSpellComponent = useCallback(
    (spellIdx: number, key: "v" | "s" | "m" | "material", value: boolean | string) => {
      if (!character) return;
      const store = useCharacterStore.getState();
      const spells = [...character.character.spells];
      const ref = spells[spellIdx];
      if (!ref || !("custom" in ref)) return;
      const prev = ref.components;
      spells[spellIdx] = { ...ref, components: { ...prev, [key]: value } };
      const next = { ...character.character, spells };
      store.setCharacter({ ...character, character: next });
      useLibraryStore.getState().syncFromCharacter(next, "spell", spellIdx);
    },
    [character]
  );

  // RA-33 — a durable per-slot-level count edit. For a table/subclass caster the
  // count is pinned as a `slotMaxOverrides` entry on the spellcasting config (so it
  // survives reconcile + level-up), and `character.spellSlots` is re-materialized in
  // the SAME write so every reader updates immediately. Keyed by `slotUsageKey`, so a
  // Sorlock's normal and Pact rows at one level pin independently.
  const updateSlotTotal = useCallback(
    (slotLevel: number, newTotal: number, pactMagic: boolean) => {
      if (!character) return;
      const store = useCharacterStore.getState();
      const cd = character.character;
      const sc = cd.spellcasting;
      if (sc) {
        const key = slotUsageKey({ level: slotLevel, pactMagic });
        const nextOverrides = { ...(sc.slotMaxOverrides ?? {}), [key]: newTotal };
        store.setCharacter({
          ...character,
          character: {
            ...cd,
            spellcasting: { ...sc, slotMaxOverrides: nextOverrides },
            spellSlots: applySlotMaxOverrides(
              deriveSpellSlots(cd.classes),
              nextOverrides
            ),
          },
        });
        return;
      }
      // Non-caster homebrew (no spellcasting config to pin an override on): its
      // `spellSlots` array is already durable (reconcile keeps stored manual slots),
      // so edit the array in place, distinguishing pact vs normal at the same level.
      const slots = [...cd.spellSlots];
      const idx = slots.findIndex(
        (s) => s.level === slotLevel && (s.pactMagic ?? false) === pactMagic
      );
      if (idx >= 0) {
        const existing = slots[idx];
        if (existing) slots[idx] = { ...existing, total: newTotal };
      } else if (newTotal > 0) {
        slots.push({
          level: slotLevel,
          total: newTotal,
          ...(pactMagic ? { pactMagic: true } : {}),
        });
      }
      const filtered = slots.filter((s) => s.total > 0);
      store.setCharacter({ ...character, character: { ...cd, spellSlots: filtered } });
    },
    [character]
  );

  // RA-33 — reset ONE slot level back to its derived count: drop its
  // `slotMaxOverrides` key, and when the map empties, drop the key ENTIRELY
  // (never store `{}`) so the block minimizes back to the inferred default.
  const resetSlotTotal = useCallback(
    (slotLevel: number, pactMagic: boolean) => {
      if (!character) return;
      const store = useCharacterStore.getState();
      const cd = character.character;
      const sc = cd.spellcasting;
      if (!sc?.slotMaxOverrides) return;
      const key = slotUsageKey({ level: slotLevel, pactMagic });
      const rest: Record<string, number> = Object.fromEntries(
        Object.entries(sc.slotMaxOverrides).filter(([k]) => k !== key)
      );
      const hasRest = Object.keys(rest).length > 0;
      const nextSc: SpellcastingConfig = {
        ability: sc.ability,
        preparedCaster: sc.preparedCaster,
        preparedMax: sc.preparedMax,
        saveDCOverride: sc.saveDCOverride,
        attackBonusOverride: sc.attackBonusOverride,
        ...(sc.preparedMaxOverride != null
          ? { preparedMaxOverride: sc.preparedMaxOverride }
          : {}),
        ...(hasRest ? { slotMaxOverrides: rest } : {}),
      };
      store.setCharacter({
        ...character,
        character: {
          ...cd,
          spellcasting: nextSc,
          spellSlots: applySlotMaxOverrides(
            deriveSpellSlots(cd.classes),
            hasRest ? rest : undefined
          ),
        },
      });
    },
    [character]
  );

  const patchSpellcasting = useCallback(
    (patch: Partial<NonNullable<typeof character>["character"]["spellcasting"]>) => {
      const store = useCharacterStore.getState();
      const current = store.character;
      if (!current?.character.spellcasting) return;
      store.setCharacter({
        ...current,
        character: {
          ...current.character,
          spellcasting: { ...current.character.spellcasting, ...patch },
        },
      });
    },
    []
  );
  const updatePreparedMax = useCallback(
    (value: number) => patchSpellcasting({ preparedMaxOverride: value }),
    [patchSpellcasting]
  );

  // ── canonical cast transaction ──────────────────────────────────────────────

  const handleCast = useCallback(
    (vm: SpellCardVM) => {
      // Engine dual-dispatch (rollout bridge): outside a SHARED encounter —
      // solo combat included, whose turn boundaries now live in the
      // character's own engine world — an engine-executable SRD spell
      // resolves through the deterministic runtime; everything else still
      // rides the legacy transaction until its cutover wave deletes it. The
      // layered gates live in the ONE shared `engineSpellCastRequest` (golden
      // rule 6 — the Play board's spell cards run the same gate). A spell any
      // OTHER row can cast through an item/feature pool keeps the legacy
      // option flow (the picker owns those sources).
      const action = actionForSpell(vm);
      const request =
        character !== null &&
        vm.kind === "srd" &&
        vm.data !== null &&
        action !== undefined &&
        !pooledSpellIds.has(vm.data.id)
          ? engineSpellCastRequest({
              action,
              badges: {
                mastery: t("spellPrep.spellMasteryBadge"),
                signature: t("spellPrep.signatureSpellBadge"),
              },
              character,
              locale,
              sheetCombat: sheetCombat !== null,
              spell: vm.data,
              spellName: vm.name,
              uid: useAuthStore.getState().user?.uid ?? null,
            })
          : null;
      if (request !== null) {
        // Replacing a held concentration always ASKS first through the ONE
        // shared gate; a declined swap cancels the cast entirely (never a
        // silent fallback to the legacy transaction). On yes, NOTHING ends
        // yet: the engine flow replays against the world still holding the
        // old spell, and the kernel's concentration-replacement coordination
        // commits the whole swap as ONE causal action at Apply (backing out
        // of the modal keeps the old spell held).
        if (request.concentrationSwap !== null) {
          void confirmConcentrationSwap(
            { concentration: true, name: request.spellName, spellId: request.spellId },
            t,
            locale
          ).then((confirmed) => {
            if (confirmed) setEngineCast(request);
          });
          return;
        }
        setEngineCast(request);
        return;
      }
      if (action) executeAction(action);
    },
    [actionForSpell, character, executeAction, locale, pooledSpellIds, sheetCombat, t]
  );

  /** Cast a spell as a ritual (no slot expended). */
  const handleCastRitual = useCallback(
    (vm: SpellCardVM) => {
      const action = actionForSpell(vm);
      if (action) executeAction(action, { ritual: true });
    },
    [actionForSpell, executeAction]
  );

  const handleDeleteSpell = useCallback(
    (idx: number) => {
      const char = useCharacterStore.getState().character;
      if (!char) return;
      const removed = char.character.spells[idx];
      if (!removed) return;
      const name =
        "custom" in removed
          ? removed.name
          : localizeSrd("spell", removed.srdId, "name", locale);
      const message = t("common.deleted", { name });
      registerUndoableToast(
        { message },
        () => {
          const cur = useCharacterStore.getState().character;
          if (!cur) return null;
          const spells = [...cur.character.spells];
          spells.splice(idx, 1);
          useCharacterStore
            .getState()
            .setCharacter({ ...cur, character: { ...cur.character, spells } });
          return () => {
            const current = useCharacterStore.getState().character;
            if (!current) return;
            const restored = [...current.character.spells];
            restored.splice(idx, 0, removed);
            useCharacterStore.getState().setCharacter({
              ...current,
              character: { ...current.character, spells: restored },
            });
          };
        },
        { turnScoped: false }
      );
    },
    [locale, t]
  );

  // S7 — Polymorph: open the Beast-form picker for THIS spell (self-swap or the
  // read-only reference card); the applied swap + the revert are both undoable.
  const handleTransform = useCallback((vm: SpellCardVM) => {
    setTransformSpellId(vm.data?.id ?? "polymorph");
  }, []);

  const handleAssumeForm = useCallback(
    (beastId: string) => {
      const spellId = transformSpellId ?? "polymorph";
      const message = t("polymorph.activeForm", {
        name: localizeSrd("beasts", beastId, "name", locale),
      });
      registerUndoableToast({ message }, () => assumePolymorphForm(beastId, spellId), {
        turnScoped: false,
      });
    },
    [transformSpellId, assumePolymorphForm, t, locale]
  );

  const handleRevertForm = useCallback(() => {
    const message = t("polymorph.revert");
    registerUndoableToast({ message }, () => dropPolymorphForm(), {
      turnScoped: false,
    });
  }, [dropPolymorphForm, t]);

  // Find Familiar — open the lazy form picker (the corpus-joining leaf). The commit
  // (summon / change form) + its undo live inside the picker.
  const handleSummonFamiliar = useCallback(() => {
    setFamiliarPickerOpen(true);
  }, []);

  // ── stable per-card callbacks (#59 F4) ───────────────────────────────────────
  // Keep the LATEST handlers in a ref and expose STABLE wrappers, so a search
  // keystroke never changes a card's callback props (the memo bail precondition).
  const handlersRef = useRef({
    handleCast,
    handleCastRitual,
    handleTransform,
    handleSummonFamiliar,
    togglePrepared,
    handleDeleteSpell,
    updateSpellField,
    updateSpellComponent,
  });
  useEffect(() => {
    handlersRef.current = {
      handleCast,
      handleCastRitual,
      handleTransform,
      handleSummonFamiliar,
      togglePrepared,
      handleDeleteSpell,
      updateSpellField,
      updateSpellComponent,
    };
  });
  const cardCallbacks = useMemo<SpellCardCallbacks>(
    () => ({
      onToggle: (key, open) => setExpandedSpellId(open ? key : null),
      onCast: (vm) => handlersRef.current.handleCast(vm),
      onCastRitual: (vm) => handlersRef.current.handleCastRitual(vm),
      onTransform: (vm) => handlersRef.current.handleTransform(vm),
      onSummonFamiliar: () => handlersRef.current.handleSummonFamiliar(),
      onTogglePrepared: (idx) => handlersRef.current.togglePrepared(idx),
      onDelete: (idx) => handlersRef.current.handleDeleteSpell(idx),
      onUpdateField: (idx, field, value) =>
        handlersRef.current.updateSpellField(idx, field, value),
      onUpdateComponent: (idx, key, value) =>
        handlersRef.current.updateSpellComponent(idx, key, value),
    }),
    []
  );

  // Filtered groups (search + level + concentration facets) on top of the
  // stable VM list.
  const filteredLevels = useMemo(() => {
    if (!view) return [];
    let groups = view.levels;
    if (filterLevel !== "all") groups = groups.filter((g) => g.level === filterLevel);
    if (concOnly) {
      groups = groups
        .map((g) => ({
          level: g.level,
          spells: g.spells.filter((s) => s.concentration),
        }))
        .filter((g) => g.spells.length > 0);
    }
    const query = search.trim();
    if (query) {
      groups = groups
        .map((g) => ({
          level: g.level,
          spells: g.spells.filter((s) => matchesSearch(query, s.name, s.searchEn)),
        }))
        .filter((g) => g.spells.length > 0);
    }
    return groups;
  }, [view, filterLevel, concOnly, search]);

  /** Concentration spells across the whole book (the facet chip's count). */
  const concCount = useMemo(
    () =>
      view
        ? view.levels.reduce(
            (acc, g) => acc + g.spells.filter((s) => s.concentration).length,
            0
          )
        : 0,
    [view]
  );

  // A level heading's slot count is not the whole castability verdict: item,
  // feature, scoped-slot, and mastery sources can cast a spell with zero normal
  // slots. Resolve the same source options used by the click handler so the card
  // never disables a valid source-backed cast.
  const castableSrdSpellKeys = useMemo(() => {
    const keys = new Set<string>();
    if (!character || !view) return keys;
    for (const group of view.levels) {
      for (const vm of group.spells) {
        if (vm.kind !== "srd" || !vm.data || vm.data.level === 0) continue;
        if (
          resolveSpellCastOptions(character, vm.data.id, vm.data.level, true, locale, {
            mastery: t("spellPrep.spellMasteryBadge"),
            signature: t("spellPrep.signatureSpellBadge"),
          }).length > 0
        ) {
          keys.add(vm.key);
        }
      }
    }
    return keys;
  }, [character, locale, t, view]);

  if (!character || !view) return null;
  const { castSummary, slots } = view;

  return (
    <div>
      <div className="tab-toolbar">
        <CollapsibleSearch
          value={search}
          onChange={setSearch}
          placeholder={t("spells.searchPlaceholder")}
        />
        {isEdit && (
          <div className="toolbar-end">
            <Button size="sm" onClick={() => setSpellModalOpen(true)}>
              <Icon as={Plus} size="sm" decorative />
              {t("spells.addSpell")}
            </Button>
          </div>
        )}
      </div>

      <SpellAddModal open={spellModalOpen} onClose={() => setSpellModalOpen(false)} />

      <Suspense fallback={null}>
        <EnginePulseStrip maxHp={character.character.hp.max} />
        <EngineConsumablesStrip maxHp={character.character.hp.max} />
      </Suspense>

      {engineCast !== null && (
        <Suspense fallback={null}>
          <EngineCastFlow
            concentrationSwap={engineCast.concentrationSwap}
            economy={engineCast.economy}
            hasAttack={engineCast.hasAttack}
            onClose={() => setEngineCast(null)}
            slots={view.slots}
            spellId={engineCast.spellId}
            spellName={engineCast.spellName}
            summary={view.castSummary}
          />
        </Suspense>
      )}

      <BeastFormPicker
        open={transformSpellId !== null}
        forms={resolvePolymorphForms(character)}
        locale={locale}
        onAssume={handleAssumeForm}
        onClose={() => setTransformSpellId(null)}
      />

      {familiarPickerOpen && (
        <Suspense fallback={null}>
          <FamiliarFormPicker
            formIds={familiarFormIds}
            currentType={character.session.familiar?.creatureType}
            onClose={() => setFamiliarPickerOpen(false)}
          />
        </Suspense>
      )}

      {character.session.polymorphForm && (
        <div className="polymorph-banner" role="status">
          <span>
            {t("polymorph.activeForm", {
              name: localizeSrd(
                "beasts",
                character.session.polymorphForm.beastId,
                "name",
                locale
              ),
            })}
          </span>
          <Button size="sm" variant="secondary" onClick={handleRevertForm}>
            {t("polymorph.revert")}
          </Button>
        </div>
      )}

      {castSummary && (
        <SpellCastSummary
          summary={castSummary}
          slots={slots}
          isEdit={isEdit}
          onSaveDCOverride={(v) => patchSpellcasting({ saveDCOverride: v })}
          onAttackOverride={(v) => patchSpellcasting({ attackBonusOverride: v })}
          onPreparedMaxOverride={updatePreparedMax}
          onPreparedMaxReset={() => patchSpellcasting({ preparedMaxOverride: null })}
          onSlotTotal={updateSlotTotal}
          onSlotReset={resetSlotTotal}
        />
      )}

      {castSummary?.isPreparedCaster && castSummary.overLimit && (
        <PreparedOverLimitWarning
          preparedCount={castSummary.preparedCount}
          preparedMax={castSummary.preparedMax}
          isEdit={isEdit}
          onPreparedMaxOverride={updatePreparedMax}
        />
      )}

      <SpellLevelFilter
        levels={view.levels}
        filterLevel={filterLevel}
        onFilter={setFilterLevel}
        concOnly={concOnly}
        onToggleConc={() => setConcOnly((v) => !v)}
        concCount={concCount}
      />

      {filteredLevels.map((group) => {
        const slot = slots.find((s) => s.level === group.level);
        const slotsRemaining = slot?.remaining ?? 0;
        const slotsTotal = slot?.total ?? 0;
        return (
          <div key={group.level}>
            <SectionHeader
              title={
                group.level === 0 ? (
                  // P2 — "Cantrips" glosses what a cantrip is on demand.
                  <GlossaryTip term="cantrip" rubric={t("spells.cantrip")}>
                    {t("spells.cantrips")}
                  </GlossaryTip>
                ) : (
                  t("spells.level", { level: group.level })
                )
              }
              meta={
                group.level === 0 ? (
                  t("spells.cantripsMeta")
                ) : slotsTotal > 0 ? (
                  // P2 — the "n of m slots" meta glosses how spell slots work.
                  <GlossaryTip term="spellSlot" rubric={t("character.spellSlots")}>
                    {t("spells.slotsOf", {
                      remaining: slotsRemaining,
                      total: slotsTotal,
                    })}
                  </GlossaryTip>
                ) : undefined
              }
            />
            <div className="uc-stack">
              {group.spells.map((vm) => {
                const castAvailability =
                  slotsRemaining > 0 || castableSrdSpellKeys.has(vm.key) ? 1 : 0;
                return (
                  <SpellCard
                    key={vm.key}
                    vm={vm}
                    isEdit={isEdit}
                    slotsRemaining={castAvailability}
                    expanded={expandedSpellId === vm.key}
                    familiarSummoned={character.session.familiar != null}
                    {...cardCallbacks}
                  />
                );
              })}
            </div>
          </div>
        );
      })}

      {view.spellCount === 0 ? (
        <RunicEmptyState
          glyph={Sparkles}
          eyebrow={t("spells.spellbook")}
          title={t("spells.emptyTitle")}
          blurb={t("spells.emptyBlurb")}
          actions={
            isEdit ? (
              <Button onClick={() => setSpellModalOpen(true)}>
                <Icon as={Plus} size="sm" decorative />
                {t("spells.addSpell")}
              </Button>
            ) : undefined
          }
        />
      ) : filteredLevels.length === 0 ? (
        <RunicEmptyState
          glyph={Sparkles}
          size="sm"
          title={t("spells.noSpellsMatch")}
          blurb={t("spells.noSpellsFilter")}
        />
      ) : null}

      <WizardSpellChoices />
    </div>
  );
}

// Re-export the SRD type so existing imports of this module keep resolving.
export type { SrdSpellData };
