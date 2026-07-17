/**
 * SpellsTab — the cockpit's Spells domain (blueprint §2.4): a THIN orchestrator.
 *
 * It reads the character from the store, builds ONE localized view-model via the
 * pure {@link buildSpellsViewModel} presenter (`lib/views/spells-view`), holds the
 * local UI state (search / level filter / expanded row / modals) + the cast
 * handlers (immediate-commit + 5 s undo), and renders the presentational section
 * components — the brass cast-summary strip, the prepared-over-limit banner, the
 * level filters, and one `SpellCard` per spell grouped by level. SRD content is
 * pre-localized on the VM, so THIS file makes ZERO direct `[locale]`/BiText reads
 * (docs/ARCHITECTURE.md; golden rules 5 + 7).
 *
 * (folio §5.7 — the canonical card-page reference.)
 *
 * Casting is IMMEDIATE outside combat: tapping Cast spends a slot / free-cast
 * tracker / at-will mastery, fires a 5 s undo toast, and sets concentration.
 * Ritual cast spends no slot. Upcasting routes through the CastLevelModal.
 */

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { primaryClassId } from "@/lib/classes";
import { useTranslation } from "react-i18next";
import { Sparkles, Plus } from "lucide-react";
import { useCharacterStore } from "@/stores/characterStore";
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
import {
  CastLevelModal,
  type CastLevelOption,
  type MetamagicCastRow,
} from "@/components/sheet/CastLevelModal";
import { buildCastOptions } from "@/lib/cast-options";
import {
  resolveSpellCastOptions,
  resolveMetamagicForCast,
  remainingSorceryPoints,
} from "@/lib/views/spell-cast-sources";
import { METAMAGIC_BY_ID } from "@/data/metamagic";
import { localizeSrd } from "@/i18n/resolver";
import { buildSpellsViewModel, type SpellCardVM } from "@/lib/views/spells-view";
import { concentrationValue, customConcentrationValue } from "@/lib/concentration";
import { confirmConcentrationSwap } from "@/features/character/confirm-concentration";
import type { SrdSpellData } from "@/data/types";
import type { CustomSpell } from "@/types/character";
import {
  SpellCastSummary,
  PreparedOverLimitWarning,
  SpellLevelFilter,
} from "./spells/SpellCastSummary";
import { SpellCard, type SpellCardCallbacks } from "./spells/SpellCard";

export function SpellsTab() {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const character = useCharacterStore((s) => s.character);
  const consumeSpellSlot = useCharacterStore((s) => s.useSpellSlot);
  const restoreSpellSlot = useCharacterStore((s) => s.restoreSpellSlot);
  const setConcentration = useCharacterStore((s) => s.setConcentration);
  // Renamed to side-step react-hooks/rules-of-hooks — `useTracker` is a regular
  // store action, not a React hook.
  const spendTracker = useCharacterStore((s) => s.useTracker);
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
  /** When non-null, the cast-level picker modal is open for this spell. */
  const [castRequest, setCastRequest] = useState<{
    name: string;
    baseLevel: number;
    options: CastLevelOption[];
    higherLevels?: string;
    metamagic?: MetamagicCastRow[];
    sorceryRemaining?: number;
    // S12c — the spell's structured damage facts so each slot row previews the
    // dice it deals at that level (Fireball L5 → "10d6").
    upcast?: {
      level: number;
      damageDice?: string;
      damageDicePerUpcast?: string;
      healDice?: string;
      healDicePerUpcast?: string;
      instances?: number;
      instancesPerUpcast?: number;
      secondaryDamage?: { dice: string; damageType: string; dicePerUpcast?: string };
    };
    onConfirm: (level: number, opt: CastLevelOption, metamagicIds: string[]) => void;
  } | null>(null);
  const sheetMode = useUIStore((s) => s.sheetMode);
  const isEdit = sheetMode === "edit";

  /** Resolved class id ("" when character is not loaded). */
  const classId = useMemo(
    () => (character ? primaryClassId(character.character) : ""),
    [character]
  );

  // The ONE localized view-model (presenter). Stable across search/filter — those
  // operate on top of `view.levels` without recreating any card VM, so the memo'd
  // cards bail on a search keystroke (the perf contract `spells-tab-memo` pins).
  const view = useMemo(
    () => (character ? buildSpellsViewModel(character, classId, locale, isEdit) : null),
    [character, classId, locale, isEdit]
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
      spells[spellIdx] = { ...ref, [field]: stored };
      store.setCharacter({ ...character, character: { ...character.character, spells } });
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
      store.setCharacter({ ...character, character: { ...character.character, spells } });
    },
    [character]
  );

  const updateSlotTotal = useCallback(
    (slotLevel: number, newTotal: number) => {
      if (!character) return;
      const store = useCharacterStore.getState();
      const slots = [...character.character.spellSlots];
      const idx = slots.findIndex((s) => s.level === slotLevel);
      if (idx >= 0) {
        const existing = slots[idx];
        if (existing) slots[idx] = { ...existing, total: newTotal };
      } else if (newTotal > 0) {
        slots.push({ level: slotLevel, total: newTotal });
      }
      const filtered = slots.filter((s) => s.total > 0);
      store.setCharacter({
        ...character,
        character: { ...character.character, spellSlots: filtered },
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

  // ── cast handlers (immediate-commit + 5 s undo) ─────────────────────────────

  // Per-cast Metamagic — debit one Sorcery-Point cost per selected option from
  // the `sorcerer-font-of-magic` pool, returning the inverse closure the cast's
  // undo toast folds in (golden rule 8 — undoable, override-first). Branches on
  // the stable option id only (golden rule 7). A no-op for an empty selection.
  const applyMetamagic = useCallback(
    (metamagicIds: ReadonlyArray<string>): (() => void) => {
      const cost = metamagicIds.reduce(
        (sum, id) => sum + (METAMAGIC_BY_ID.get(id)?.cost ?? 0),
        0
      );
      if (cost <= 0) return () => {};
      spendTracker("sorcerer-font-of-magic", cost);
      return () => spendTracker("sorcerer-font-of-magic", -cost);
    },
    [spendTracker]
  );

  const castAtLevel = useCallback(
    (args: {
      displayName: string;
      concentration: boolean;
      level: number;
      pactMagic?: boolean;
      spellId?: string;
      metamagicIds?: ReadonlyArray<string>;
    }) => {
      const {
        displayName,
        concentration,
        level,
        pactMagic = false,
        spellId,
        metamagicIds = [],
      } = args;
      const prevConc = character?.session.concentration ?? "";
      const message = t("combat.castToast", { name: displayName, level });
      // Spend from the CHOSEN pool — normal vs Pact Magic (Sorlock) — so the two
      // same-level pools never share a counter (B3).
      registerUndoableToast(
        { message },
        () => {
          consumeSpellSlot(level, pactMagic);
          const undoMetamagic = applyMetamagic(metamagicIds);
          // SRD spell → its stable id; a custom (homebrew) spell → its user-authored
          // name behind the marker (golden rule 7 — never store an SRD display name).
          if (concentration)
            setConcentration(
              spellId
                ? concentrationValue(spellId)
                : customConcentrationValue(displayName)
            );
          return () => {
            restoreSpellSlot(level, pactMagic);
            undoMetamagic();
            if (concentration) setConcentration(prevConc);
          };
        },
        { turnScoped: false }
      );
    },
    [character, consumeSpellSlot, restoreSpellSlot, applyMetamagic, setConcentration, t]
  );

  const castMastery = useCallback(
    (args: {
      displayName: string;
      concentration: boolean;
      sourceName: string;
      spellId?: string;
      metamagicIds?: ReadonlyArray<string>;
    }) => {
      const { displayName, concentration, sourceName, spellId, metamagicIds = [] } = args;
      const prevConc = character?.session.concentration ?? "";
      const message = t("combat.masteryCastToast", {
        name: displayName,
        source: sourceName,
      });
      registerUndoableToast(
        { message },
        () => {
          const undoMetamagic = applyMetamagic(metamagicIds);
          // SRD spell → stable id; custom → authored name behind the marker (rule 7).
          if (concentration)
            setConcentration(
              spellId
                ? concentrationValue(spellId)
                : customConcentrationValue(displayName)
            );
          return () => {
            undoMetamagic();
            if (concentration) setConcentration(prevConc);
          };
        },
        { turnScoped: false }
      );
    },
    [character, applyMetamagic, setConcentration, t]
  );

  // G6/W3 — cast a cantrip: slotless (spends NO spell slot) but DOES debit the
  // per-cast Metamagic Sorcery Points, mirroring the leveled debit/undo exactly.
  const castCantrip = useCallback(
    (args: {
      displayName: string;
      concentration: boolean;
      spellId?: string;
      metamagicIds?: ReadonlyArray<string>;
    }) => {
      const { displayName, concentration, spellId, metamagicIds = [] } = args;
      const prevConc = character?.session.concentration ?? "";
      const message = t("combat.cantripCastToast", { name: displayName });
      registerUndoableToast(
        { message },
        () => {
          const undoMetamagic = applyMetamagic(metamagicIds);
          // SRD spell → stable id; custom → authored name behind the marker (rule 7).
          if (concentration)
            setConcentration(
              spellId
                ? concentrationValue(spellId)
                : customConcentrationValue(displayName)
            );
          return () => {
            undoMetamagic();
            if (concentration) setConcentration(prevConc);
          };
        },
        { turnScoped: false }
      );
    },
    [character, applyMetamagic, setConcentration, t]
  );

  const castFreeAt = useCallback(
    (args: {
      displayName: string;
      concentration: boolean;
      sourceId: string;
      sourceName: string;
      spellId?: string;
      metamagicIds?: ReadonlyArray<string>;
    }) => {
      const { displayName, concentration, sourceId, sourceName, spellId } = args;
      const { metamagicIds = [] } = args;
      const prevConc = character?.session.concentration ?? "";
      const message = t("combat.freeCastToast", {
        name: displayName,
        source: sourceName,
      });
      registerUndoableToast(
        { message },
        () => {
          spendTracker(sourceId, 1);
          const undoMetamagic = applyMetamagic(metamagicIds);
          // SRD spell → stable id; custom → authored name behind the marker (rule 7).
          if (concentration)
            setConcentration(
              spellId
                ? concentrationValue(spellId)
                : customConcentrationValue(displayName)
            );
          return () => {
            spendTracker(sourceId, -1);
            undoMetamagic();
            if (concentration) setConcentration(prevConc);
          };
        },
        { turnScoped: false }
      );
    },
    [character, spendTracker, applyMetamagic, setConcentration, t]
  );

  /** Cast an SRD spell (auto-casts when there's a single option). */
  const handleCastSrd = useCallback(
    async (vm: SpellCardVM) => {
      if (!character || vm.kind !== "srd" || !vm.data) return;
      const spell = vm.data;
      const level = spell.level;
      const displayName = vm.name;
      // The ONE concentration-conflict gate (shared with the Combat tab, golden
      // rule 6): already concentrating on a DIFFERENT spell → ask before the
      // cast (level picker included) can end it. Backing out costs nothing.
      if (
        !(await confirmConcentrationSwap(
          { concentration: spell.concentration, spellId: spell.id, name: displayName },
          t,
          locale
        ))
      )
        return;
      // G6/W3 — a cantrip spends no slot, so it never opens the level picker for
      // an upcast; it opens the modal ONLY to attach a per-cast Metamagic option
      // (which debits Sorcery Points). With no Metamagic to offer, cast directly.
      if (level === 0) {
        const cantripMetamagic: MetamagicCastRow[] = resolveMetamagicForCast(
          character,
          spell.id
        ).map((m) => ({
          id: m.id,
          name: localizeSrd("metamagic", m.id, "name", locale),
          cost: m.cost,
          affordable: m.affordable,
          appliesToSpell: m.appliesToSpell,
          stacksWithPrimary: m.stacksWithPrimary,
        }));
        if (cantripMetamagic.length === 0) {
          castCantrip({
            displayName,
            concentration: spell.concentration,
            spellId: spell.id,
          });
          return;
        }
        setCastRequest({
          name: displayName,
          baseLevel: 0,
          options: [],
          higherLevels: vm.higherLevels ?? undefined,
          metamagic: cantripMetamagic,
          sorceryRemaining: remainingSorceryPoints(character),
          onConfirm: (_chosenLevel, _opt, metamagicIds) =>
            castCantrip({
              displayName,
              concentration: spell.concentration,
              spellId: spell.id,
              metamagicIds,
            }),
        });
        return;
      }
      // The Spells page and the Combat page resolve cast options from the SAME
      // shared seam so they can't drift (golden rule 6) — `resolveSpellCastOptions`
      // folds in upcast slots, per-spell free casts (feat grants + the chosen-spell
      // stamp), Wizard Signature/Mastery, scoped heritage-feat slots, and at-will
      // invocations, each with a properly localized source name (no raw-key leak).
      const options = resolveSpellCastOptions(character, spell.id, level, true, locale, {
        mastery: t("spellPrep.spellMasteryBadge"),
        signature: t("spellPrep.signatureSpellBadge"),
      });
      if (options.length === 0) return;
      // Per-cast Metamagic (Sorcerer) — from the SAME shared seam as the Combat
      // page (golden rule 6). Localize each option's name from its stable id
      // (golden rule 7). Empty for a non-Sorcerer / cantrip.
      const metamagicRows: MetamagicCastRow[] = resolveMetamagicForCast(
        character,
        spell.id
      ).map((m) => ({
        id: m.id,
        name: localizeSrd("metamagic", m.id, "name", locale),
        cost: m.cost,
        affordable: m.affordable,
        appliesToSpell: m.appliesToSpell,
        stacksWithPrimary: m.stacksWithPrimary,
      }));
      const sorceryRemaining = remainingSorceryPoints(character);

      // One-tap dispatch for a chosen cast option + selected Metamagic ids.
      const dispatch = (
        chosenLevel: number,
        opt: CastLevelOption,
        metamagicIds: string[]
      ) => {
        if (opt.kind === "cantrip") {
          castCantrip({
            displayName,
            concentration: spell.concentration,
            spellId: spell.id,
            metamagicIds,
          });
          return;
        }
        if (opt.kind === "free-cast") {
          castFreeAt({
            displayName,
            concentration: spell.concentration,
            sourceId: opt.sourceId,
            sourceName: opt.sourceName,
            spellId: spell.id,
            metamagicIds,
          });
          return;
        }
        if (opt.kind === "mastery") {
          castMastery({
            displayName,
            concentration: spell.concentration,
            sourceName: opt.sourceName,
            spellId: spell.id,
            metamagicIds,
          });
          return;
        }
        castAtLevel({
          displayName,
          concentration: spell.concentration,
          level: chosenLevel,
          pactMagic: opt.kind === "slot" ? opt.pactMagic : false,
          spellId: spell.id,
          metamagicIds,
        });
      };

      // Auto-cast ONLY when there is a single cast option AND no Metamagic to
      // offer — otherwise open the modal so the player can pick a level / toggle
      // Metamagic before committing.
      if (options.length === 1 && metamagicRows.length === 0) {
        const onlyOpt = options[0];
        if (onlyOpt) dispatch(onlyOpt.level, onlyOpt, []);
        return;
      }
      setCastRequest({
        name: displayName,
        baseLevel: level,
        options,
        higherLevels: vm.higherLevels ?? undefined,
        metamagic: metamagicRows.length > 0 ? metamagicRows : undefined,
        sorceryRemaining,
        // S12c — the structured damage facts so each slot row previews the dice
        // (or ray count) it deals at that level (Fireball L5 → "10d6").
        upcast: {
          level: spell.level,
          damageDice: spell.damageDice,
          damageDicePerUpcast: spell.damageDicePerUpcast,
          // RA-07 — heal-side upcast facts, previewed exactly like damage.
          healDice: spell.healDice,
          healDicePerUpcast: spell.healDicePerUpcast,
          instances: spell.instances,
          instancesPerUpcast: spell.instancesPerUpcast,
          secondaryDamage: spell.secondaryDamage,
        },
        onConfirm: dispatch,
      });
    },
    [character, locale, t, castAtLevel, castFreeAt, castMastery, castCantrip]
  );

  /** Cast a custom (homebrew) spell. */
  const handleCastCustom = useCallback(
    async (vm: SpellCardVM) => {
      if (!character || vm.kind !== "custom") return;
      const customSpell = vm.ref as CustomSpell;
      if (customSpell.level === 0) return;
      // The shared concentration-conflict gate (golden rule 6) — a custom spell
      // stores its user-authored name behind the marker, never an SRD id.
      if (
        !(await confirmConcentrationSwap(
          { concentration: customSpell.concentration, name: customSpell.name },
          t,
          locale
        ))
      )
        return;
      const options = buildCastOptions(
        character.character.spellSlots,
        character.session.spellSlots,
        customSpell.level
      );
      if (options.length === 0) return;
      if (options.length === 1) {
        const onlyOpt = options[0];
        castAtLevel({
          displayName: customSpell.name,
          concentration: customSpell.concentration,
          level: onlyOpt?.level ?? customSpell.level,
          // Spend from the CHOSEN pool — a Sorlock's single L1 option may be the
          // Pact pool, which keys its own usage counter (B3).
          pactMagic: onlyOpt?.kind === "slot" ? onlyOpt.pactMagic : false,
        });
        return;
      }
      setCastRequest({
        name: customSpell.name,
        baseLevel: customSpell.level,
        options,
        higherLevels: customSpell.higherLevels,
        onConfirm: (chosenLevel, opt) => {
          castAtLevel({
            displayName: customSpell.name,
            concentration: customSpell.concentration,
            level: chosenLevel,
            // Honour the picked pool (normal vs Pact Magic) just like the SRD
            // cast path — never silently spend the normal pool (B3).
            pactMagic: opt.kind === "slot" ? opt.pactMagic : false,
          });
        },
      });
    },
    [character, castAtLevel, t, locale]
  );

  /** Cast button dispatcher (SRD vs custom). */
  const handleCast = useCallback(
    (vm: SpellCardVM) => (vm.kind === "srd" ? handleCastSrd(vm) : handleCastCustom(vm)),
    [handleCastSrd, handleCastCustom]
  );

  /** Cast a spell as a ritual (no slot expended). */
  const handleCastRitual = useCallback(
    async (vm: SpellCardVM) => {
      if (!character || vm.kind !== "srd" || !vm.data) return;
      const spell = vm.data;
      if (!spell.ritual || spell.level === 0) return;
      // The shared concentration-conflict gate (golden rule 6) — a ritual cast
      // still takes over concentration.
      if (
        !(await confirmConcentrationSwap(
          { concentration: spell.concentration, spellId: spell.id, name: vm.name },
          t,
          locale
        ))
      )
        return;
      const prevConc = character.session.concentration;
      const message = t("combat.castRitualToast", { name: vm.name });
      // A ritual is always an SRD spell → store its stable id (golden rule 7).
      registerUndoableToast(
        { message },
        () => {
          if (spell.concentration) setConcentration(concentrationValue(spell.id));
          return () => {
            if (spell.concentration) setConcentration(prevConc);
          };
        },
        { turnScoped: false }
      );
    },
    [character, setConcentration, t, locale]
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

  // ── stable per-card callbacks (#59 F4) ───────────────────────────────────────
  // Keep the LATEST handlers in a ref and expose STABLE wrappers, so a search
  // keystroke never changes a card's callback props (the memo bail precondition).
  const handlersRef = useRef({
    handleCast,
    handleCastRitual,
    handleTransform,
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
      togglePrepared,
      handleDeleteSpell,
      updateSpellField,
      updateSpellComponent,
    };
  });
  const cardCallbacks = useMemo<SpellCardCallbacks>(
    () => ({
      onToggle: (key, open) => setExpandedSpellId(open ? key : null),
      onCast: (vm) => void handlersRef.current.handleCast(vm),
      onCastRitual: (vm) => void handlersRef.current.handleCastRitual(vm),
      onTransform: (vm) => handlersRef.current.handleTransform(vm),
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

      <CastLevelModal
        request={
          castRequest
            ? {
                spellName: castRequest.name,
                baseLevel: castRequest.baseLevel,
                options: castRequest.options,
                higherLevels: castRequest.higherLevels,
                metamagic: castRequest.metamagic,
                sorceryRemaining: castRequest.sorceryRemaining,
                upcast: castRequest.upcast,
              }
            : null
        }
        onConfirm={(level, opt, metamagicIds) => {
          castRequest?.onConfirm(level, opt, metamagicIds);
          setCastRequest(null);
        }}
        onCancel={() => setCastRequest(null)}
      />

      <BeastFormPicker
        open={transformSpellId !== null}
        forms={resolvePolymorphForms(character)}
        locale={locale}
        onAssume={handleAssumeForm}
        onClose={() => setTransformSpellId(null)}
      />

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
              {group.spells.map((vm) => (
                <SpellCard
                  key={vm.key}
                  vm={vm}
                  isEdit={isEdit}
                  slotsRemaining={slotsRemaining}
                  expanded={expandedSpellId === vm.key}
                  {...cardCallbacks}
                />
              ))}
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
