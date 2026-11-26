/**
 * «Scelte da completare»: a saved character whose species still owes choices
 * (a lineage, legacy or ancestry; the spellcasting ability its spells use; Keen
 * Senses, Skillful; the ability a feat's increase raised, never stored) sees them
 * named in a callout, and «Completa» opens the same
 * chips creation uses. Nothing is written until «Salva»; each choice made then
 * leaves the list. The class picks the level table gives and the build lacks
 * (invocations, cantrips, Metamagic, maneuvers, Weapon Mastery) are asked here
 * too, as the creation class step's chips, and so are a Lore Bard's Magical
 * Discoveries held without their always-prepared mark (preselected: one «Salva»
 * marks them, with an undo). A Druid owing Wild Shape known forms picks them here
 * too (this screen only). A class past its subclass level with none (#1393) is
 * asked it with the level-up's subclass cards and reveal, then the choices its
 * features bring (Lore's skills, a land); «Salva» picks it through the level-up's
 * own step, with an undo. Pattern source: D&D Beyond lists an unmade subclass as a
 * required choice on the class panel; BG3 asks it at the level. Hidden on a
 * read-only sheet and when nothing is owed.
 */
import type { InfoKind } from "@/domains/spells/option-info";
import type { ClassPickKind } from "@/lib/owed-class-picks";
import type { ArtKind } from "@/ui";
import { unpickedSpeciesAbility } from "@/lib/resolve-spell-ability";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { choiceSlotRows, toggleChoicePick } from "@/domains/creation/creation-view";
import { ChoiceRowChips } from "@/domains/creation/ui/ChoiceRowChips";
import { PickGrid } from "@/domains/spells/ui/PickGrid";
import { togglePick } from "@/lib/creation/picks";
import { EMPTY_CHOICE_PICKS, type ChoicePicks } from "@/lib/feature-choices";
import type { Locale } from "@/lib/locale";
import { pendingSpeciesChoices } from "@/lib/species-choices";
import { originFeatVMs } from "@/lib/views/feat-pick-view";
import { lineageBundleVMs } from "@/lib/views/creation-view";
import { owedWildShapeForms } from "@/domains/play/wild-shape-forms-owed";
import {
  owedClassPickRows,
  type OwedClassPickRow,
} from "@/lib/views/owed-class-picks-view";
import { owedSubclassAsks } from "@/domains/play/owed-subclass-view";
import { SubclassReveal } from "@/domains/leveling/ui/SubclassReveal";
import {
  discoverySentence,
  pendingSpeciesItems,
  speciesChoicesLine,
} from "@/lib/views/species-choices-view";
import { useCharacterStore } from "@/stores/characterStore";
import { registerUndoableToast } from "@/stores/undoStore";
import type { CharacterDoc } from "@/types/character";
import type { AbilityCode } from "@/types/ability";
import { Button, Chip, Dialog } from "@/ui";

const ABILITIES = ["INT", "WIS", "CHA"] as const;

/** The art and the card each owed class pick wears, as on the level-up. */
const PICK_ART: Partial<Record<ClassPickKind, ArtKind>> = {
  subclass: "subclass",
  weaponMasteries: "equipment",
  fightingStyles: "feat",
};
const PICK_INFO: Partial<Record<ClassPickKind, InfoKind>> = {
  weaponMasteries: "weapon",
  fightingStyles: "feat",
  invocations: "invocation",
  metamagic: "metamagic",
  maneuvers: "maneuver",
};

export function PlaySpeciesChoices({
  doc,
  locale,
  readonly,
}: {
  doc: CharacterDoc;
  locale: Locale;
  readonly: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const items = pendingSpeciesItems(doc.character, doc.session, locale);
  // A Druid's Wild Shape known forms (new Play screen only).
  const forms = owedWildShapeForms(doc, locale);
  if (readonly || (items.length === 0 && !forms)) return null;
  return (
    <div
      className="f-note f-suggest f-species-due"
      role="group"
      aria-label={t("play.speciesChoices.title")}
    >
      <p>
        <b>{t("play.speciesChoices.title")}</b>
        {" · "}
        {speciesChoicesLine(
          items,
          t,
          locale,
          doc.character,
          t(`abilities.${unpickedSpeciesAbility(doc.character)}`),
          forms ? [forms.label] : []
        )}
      </p>
      <Button kind="primary" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        {t("play.speciesChoices.open")}
      </Button>
      {open && (
        <SpeciesChoicesDialog doc={doc} locale={locale} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}

function SpeciesChoicesDialog({
  doc,
  locale,
  onClose,
}: {
  doc: CharacterDoc;
  locale: Locale;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const pending = pendingSpeciesChoices(doc.character, doc.session);
  const bundles = lineageBundleVMs(doc.character.race, locale).filter((b) =>
    pending.bundleKeys.includes(b.bundleKey)
  );
  // The answers, held here until «Salva».
  const [bundlePicks, setBundlePicks] = useState<Record<string, string>>({});
  const [ability, setAbility] = useState<AbilityCode | null>(null);
  const [featId, setFeatId] = useState<string | null>(null);
  // Each feat's answer: which ability its increase raised.
  const [featAbilities, setFeatAbilities] = useState<Record<string, AbilityCode>>({});
  const featItems = pendingSpeciesItems(doc.character, doc.session, locale).flatMap(
    (item) => (item.kind === "feat-ability" ? [item] : [])
  );
  // A Human's Versatile: any origin feat but the one its background already grants.
  const feats = pending.feat
    ? originFeatVMs(locale, new Set(doc.character.bgFeat ? [doc.character.bgFeat] : []))
    : [];
  const [picks, setPicks] = useState<ChoicePicks>(EMPTY_CHOICE_PICKS);
  // Every skill stays offered: a saved character may already hold the one its
  // trait gave (added by hand back then), and picking it only records the choice.
  const owned = {
    skills: new Set<string>(),
    spells: new Set(
      doc.character.spells.flatMap((s) => ("custom" in s ? [] : [s.srdId]))
    ),
  };
  const rows = choiceSlotRows(pending.slots, picks, owned, locale);
  // The class picks owed, answered by row key.
  const allClassRows = owedClassPickRows(
    doc.character,
    locale,
    doc.session.grantBundleChoices
  );
  const classRows = allClassRows.filter((row) => row.pick !== "subclass");
  const [classPicks, setClassPicks] = useState<Record<string, string[]>>({});
  const forms = owedWildShapeForms(doc, locale);
  const [formPicks, setFormPicks] = useState<string[]>([]);
  // The subclass a class never chose (the first one owed), and the choices its
  // features ask, answered here until «Salva».
  const subclassRow = allClassRows.find((row) => row.pick === "subclass");
  const [subclassId, setSubclassId] = useState<string | null>(null);
  const [subclassChoices, setSubclassChoices] = useState<ChoicePicks>(EMPTY_CHOICE_PICKS);
  const [subclassBundles, setSubclassBundles] = useState<Record<string, string>>({});
  const subclassAnswers = { choicePicks: subclassChoices, bundlePicks: subclassBundles };
  const subclass = subclassRow
    ? owedSubclassAsks(doc, subclassRow.classId, subclassId, subclassAnswers, locale)
    : null;
  const pickSubclass = (id: string) => {
    // Another subclass asks other choices: they start over.
    setSubclassId(subclassId === id ? null : id);
    setSubclassChoices(EMPTY_CHOICE_PICKS);
    setSubclassBundles({});
  };
  // A Lore Bard's Magical Discoveries without their mark: the likely ones preselected,
  // so confirming them is the one tap on «Salva».
  const discovery = pendingSpeciesItems(doc.character, doc.session, locale).find(
    (item) => item.kind === "discovery-mark"
  );
  const [discoveryPicks, setDiscoveryPicks] = useState<string[]>(
    discovery?.preselected ?? []
  );
  // A subclass picked with a choice still open can't be saved yet.
  const subclassOpen = subclassId !== null && subclass?.complete !== true;
  const chosen =
    formPicks.length > 0 ||
    subclass?.complete === true ||
    discoveryPicks.length > 0 ||
    Object.values(classPicks).some((ids) => ids.length > 0) ||
    Object.keys(bundlePicks).length > 0 ||
    ability !== null ||
    featId !== null ||
    Object.keys(featAbilities).length > 0 ||
    rows.some((row) => row.picked.length > 0);
  const save = () => {
    const store = useCharacterStore.getState();
    for (const [key, optionId] of Object.entries(bundlePicks))
      store.setGrantBundleChoice(key, optionId);
    if (featId) store.setHumanOriginFeat(featId);
    if (ability) store.setSpeciesSpellAbility(ability);
    for (const [id, code] of Object.entries(featAbilities))
      store.setFeatAbility(id, code);
    store.resolveSpeciesChoices(picks);
    store.resolveClassPicks(
      classRows.map((row) => ({
        classId: row.classId,
        pick: row.pick,
        ids: classPicks[row.key] ?? [],
      }))
    );
    if (formPicks.length > 0) store.learnWildShapeForms(formPicks);
    if (subclassRow && subclassId && subclass?.complete) {
      const classId = subclassRow.classId;
      const name = subclassRow.options.find((o) => o.id === subclassId)?.name ?? "";
      registerUndoableToast(
        { message: t("play.speciesChoices.subclassUndo", { name }) },
        () =>
          useCharacterStore
            .getState()
            .resolveSubclass(classId, subclassId, subclassAnswers),
        { turnScoped: false }
      );
    }
    // Last, so its one undo restores only this mark.
    if (discoveryPicks.length > 0) {
      registerUndoableToast(
        { message: t("play.speciesChoices.discoveryUndo") },
        () => useCharacterStore.getState().confirmDiscoveries(discoveryPicks),
        { turnScoped: false }
      );
    }
    onClose();
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={t("play.speciesChoices.title")}
      closeLabel={t("common.close")}
      actions={
        <>
          <Button kind="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button kind="primary" disabled={!chosen || subclassOpen} onClick={save}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="f-ask">
        {bundles.map((b) => (
          <div key={b.bundleKey} className="f-ask">
            <span className="f-lbl">{b.label}</span>
            <div className="f-chips">
              {b.options.map((o) => (
                <Chip
                  key={o.id}
                  pressed={bundlePicks[b.bundleKey] === o.id}
                  onClick={() => setBundlePicks({ ...bundlePicks, [b.bundleKey]: o.id })}
                >
                  {o.label}
                </Chip>
              ))}
            </div>
          </div>
        ))}
        {pending.feat && (
          <div className="f-ask">
            <span className="f-lbl">{t("create.humanVersatileLabel")}</span>
            <p className="f-help">{t("create.humanVersatileHint")}</p>
            <PickGrid
              label={t("create.humanVersatileLabel")}
              options={feats.map((f) => ({ id: f.id, label: f.name }))}
              picked={featId ? [featId] : []}
              art="feat"
              info="feat"
              count={1}
              locale={locale}
              onToggle={setFeatId}
            />
          </div>
        )}
        {pending.spellAbility && (
          <div className="f-ask">
            <span className="f-lbl">{t("create.screen.speciesAbility")}</span>
            <p className="f-help">{t("create.screen.speciesAbilityHint")}</p>
            <div className="f-chips">
              {ABILITIES.map((code) => (
                <Chip
                  key={code}
                  pressed={ability === code}
                  onClick={() => setAbility(code)}
                >
                  {t(`abilities.${code}`)}
                </Chip>
              ))}
            </div>
          </div>
        )}
        {featItems.map((item) => (
          <div key={item.featId} className="f-ask">
            <span className="f-lbl">
              {t("play.speciesChoices.featAbilityLabel", { feat: item.label })}
            </span>
            <div className="f-chips">
              {item.abilities.map((code) => (
                <Chip
                  key={code}
                  pressed={featAbilities[item.featId] === code}
                  onClick={() =>
                    setFeatAbilities({ ...featAbilities, [item.featId]: code })
                  }
                >
                  {t(`abilities.${code}`)}
                </Chip>
              ))}
            </div>
          </div>
        ))}
        <ChoiceRowChips
          rows={rows}
          onToggle={(row, id) => setPicks(toggleChoicePick(picks, row, id))}
        />
        {subclassRow && subclass && (
          <OwedSubclass
            row={subclassRow}
            picked={subclassId}
            asks={subclass}
            bundlePicks={subclassBundles}
            locale={locale}
            onPick={pickSubclass}
            onBundle={(key, id) => setSubclassBundles({ ...subclassBundles, [key]: id })}
            onChoice={(row, id) =>
              setSubclassChoices(toggleChoicePick(subclassChoices, row, id))
            }
          />
        )}
        {classRows.map((row) => (
          <div key={row.key} className="f-ask">
            <span className="f-lbl">{row.source}</span>
            <p className="f-help">{row.title}</p>
            {/* The level-up's pick grid: art, the card, and a name filter on a long
                list (about 38 weapons to master, a whole spellbook). */}
            <PickGrid
              label={row.title}
              options={row.options.map((o) => ({ id: o.id, label: o.name }))}
              picked={classPicks[row.key] ?? []}
              spells={row.pick === "cantrips" || row.pick === "spellbook"}
              {...(PICK_ART[row.pick] ? { art: PICK_ART[row.pick] } : {})}
              {...(PICK_INFO[row.pick] ? { info: PICK_INFO[row.pick] } : {})}
              count={row.owed}
              locale={locale}
              searchLabel={row.searchPlaceholder}
              onToggle={(id) =>
                setClassPicks({
                  ...classPicks,
                  [row.key]: togglePick(classPicks[row.key] ?? [], id, row.owed),
                })
              }
            />
          </div>
        ))}
        {forms && (
          <div className="f-ask">
            <span className="f-lbl">{forms.source}</span>
            <p className="f-help">{forms.title}</p>
            {/* The level-up's forms step: the beasts' art, their card, a name filter. */}
            <PickGrid
              label={forms.title}
              options={forms.options}
              picked={formPicks}
              art="monster"
              info="beast"
              count={forms.owed}
              locale={locale}
              searchLabel={t("polymorph.search")}
              onToggle={(id) => setFormPicks(togglePick(formPicks, id, forms.owed))}
            />
          </div>
        )}
        {discovery && (
          <div className="f-ask">
            <span className="f-lbl">{t("play.speciesChoices.discoveryLabel")}</span>
            <div className="f-chips">
              {discovery.candidates.map((spell) => (
                <Chip
                  key={spell.id}
                  pressed={discoveryPicks.includes(spell.id)}
                  onClick={() =>
                    setDiscoveryPicks(
                      togglePick(discoveryPicks, spell.id, discovery.missing)
                    )
                  }
                >
                  {spell.label}
                </Chip>
              ))}
            </div>
            <p className="f-help">
              {discoverySentence(doc.character, discoveryPicks, t, locale)}
            </p>
          </div>
        )}
      </div>
    </Dialog>
  );
}

/**
 * The owed subclass: the level-up's subclass cards, then what the pick brings (its
 * features up to the class's level, its spells) and the choices those features ask.
 */
function OwedSubclass({
  row,
  picked,
  asks,
  bundlePicks,
  locale,
  onPick,
  onBundle,
  onChoice,
}: {
  row: OwedClassPickRow;
  picked: string | null;
  asks: ReturnType<typeof owedSubclassAsks>;
  bundlePicks: Readonly<Record<string, string>>;
  locale: Locale;
  onPick: (id: string) => void;
  onBundle: (bundleKey: string, optionId: string) => void;
  onChoice: Parameters<typeof ChoiceRowChips>[0]["onToggle"];
}) {
  return (
    <div className="f-ask">
      <span className="f-lbl">{row.source}</span>
      <p className="f-help">{row.title}</p>
      <PickGrid
        label={row.title}
        options={row.options.map((o) => ({ id: o.id, label: o.name }))}
        picked={picked ? [picked] : []}
        art="subclass"
        count={1}
        locale={locale}
        onToggle={onPick}
      />
      {asks.reveal && <SubclassReveal reveal={asks.reveal} locale={locale} />}
      {asks.bundles.map((b) => (
        <div key={b.bundleKey} className="f-ask">
          <span className="f-lbl">{b.label}</span>
          <div className="f-chips">
            {b.options.map((o) => (
              <Chip
                key={o.id}
                pressed={bundlePicks[b.bundleKey] === o.id}
                onClick={() => onBundle(b.bundleKey, o.id)}
              >
                {o.label}
              </Chip>
            ))}
          </div>
        </div>
      ))}
      <ChoiceRowChips rows={asks.rows} onToggle={onChoice} />
    </div>
  );
}
