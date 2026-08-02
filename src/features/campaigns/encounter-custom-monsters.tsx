/**
 * EncounterCustomMonsters (Part A) — the "Custom" tab of the DM's Add-monster modal,
 * reworked from a one-shot form into a reusable LIBRARY of custom monsters. "Custom IS
 * the library" — the same doctrine as the sheet's Custom tabs ({@link
 * import("@/components/sheet/CustomTabBody").CustomTabBody}), applied to encounter
 * monsters: creating one SAVES it (5th library kind `monster`), and every saved monster
 * is re-addable to any encounter, with its art (Part B) kept on the template.
 *
 * The proven three-leg shape (list · detail · create/edit), reusing the picker parts:
 *   • LIST   — search + one row per saved monster (name · type · CR · AC/HP) + the two
 *              management actions (edit · delete); an EMPTY library opens on the create
 *              form (a blank list is a dead end).
 *   • DETAIL — tap a row → the monster's PORTRAIT (editable seal) + a stat summary + the
 *              standard footer's count stepper + Add-to-encounter (re-seeds fresh play
 *              state via `customMonsterToInput` → the encounter reducers).
 *   • CREATE / EDIT — the shared {@link AddMonsterForm}: create SAVES + adds one; the
 *              pencil edits the TEMPLATE in place (the art, edited on the seal, is
 *              preserved). Commits route through `libraryStore` (debounced full-doc write).
 */

import { lazy, Suspense, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, PencilLine, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { ModalScroll } from "@/components/ui/modal-head";
import {
  PickerDetailFooter,
  PickerRow,
  PickerSearch,
} from "@/components/sheet/picker-parts";
import { GlossaryTip } from "@/components/shared/GlossaryTip";
import { useConfirmStore } from "@/stores/confirmStore";
import { useLibraryStore } from "@/stores/libraryStore";
import { useToastStore } from "@/stores/toastStore";
import { matchesSearch } from "@/lib/search";
import { xpForCr } from "@/lib/monster";
import { fmtXp, formatCr } from "@/lib/utils";
import { useLocale } from "@/hooks/useLocale";
import type { LibraryEntry } from "@/lib/library";
import type { CustomMonster } from "@/types/campaign";
import { AddMonsterForm } from "./party-encounter";
import { customMonsterToInput } from "./encounter-monster-input";
import type { MonsterInput } from "./encounter";

// The portrait editor pulls the crop UI (react-easy-crop); load it only when a saved
// monster's DETAIL opens, so the common list + create-form paths stay light.
const MonsterPortraitPanel = lazy(() =>
  import("@/components/shared/MonsterPortraitPanel").then((m) => ({
    default: m.MonsterPortraitPanel,
  }))
);

/** A library entry known to carry a custom monster. */
type MonsterEntry = LibraryEntry & { kind: "monster"; item: CustomMonster };

const isMonsterEntry = (e: LibraryEntry): e is MonsterEntry => e.kind === "monster";

export function EncounterCustomMonsters({
  onAdd,
}: {
  /** Add the built monster group to the encounter (the reinforcement auto-slot path). */
  onAdd: (input: MonsterInput) => void;
}) {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const entries = useLibraryStore((s) => s.entries);
  const saveToLibrary = useLibraryStore((s) => s.saveToLibrary);
  const updateEntry = useLibraryStore((s) => s.updateEntry);
  const removeFromLibrary = useLibraryStore((s) => s.removeFromLibrary);
  const showToast = useToastStore((s) => s.showToast);

  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<MonsterEntry | null>(null);
  const [viewing, setViewing] = useState<MonsterEntry | null>(null);
  const [count, setCount] = useState(1);

  const mine = useMemo(() => entries.filter(isMonsterEntry), [entries]);
  const rows = useMemo(() => {
    if (!search.trim()) return mine;
    return mine.filter((e) => matchesSearch(search, e.item.name));
  }, [mine, search]);

  /** The one-line reading under the name: type · CR · AC/HP. */
  function meta(m: CustomMonster): string {
    return [
      m.creatureType ? t(`srd.creatureType_${m.creatureType}`) : undefined,
      m.cr ? t("polymorph.crShort", { cr: formatCr(Number(m.cr)) }) : undefined,
      `${t("character.armorClassShort")} ${m.ac}`,
      `${m.maxHp} ${t("character.hp")}`,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  function commitCreate(
    template: CustomMonster,
    addCount: number,
    initiative: number | null
  ): void {
    const outcome = saveToLibrary({ kind: "monster", item: template });
    if (outcome === "full") {
      showToast({ message: t("custom.libraryFull"), duration: 4000 });
      return;
    }
    onAdd(customMonsterToInput(template, addCount, initiative));
    showToast({
      message: t("campaignHub.encounterCustomAdded", { name: template.name }),
      duration: 3000,
    });
    setCreating(false);
  }

  async function handleDelete(entry: MonsterEntry): Promise<void> {
    const name = entry.item.name;
    const ok = await useConfirmStore.getState().confirm({
      title: t("common.deleteTitle", { name }),
      message: t("custom.libraryDeleteMessage"),
      confirmLabel: t("common.delete"),
      tone: "danger",
    });
    if (ok) removeFromLibrary(entry.id);
  }

  // CREATE / EDIT — the shared form with a Back bar (create shows the "kept" hint).
  if (creating || editing || mine.length === 0) {
    const isEdit = editing !== null;
    const back = isEdit
      ? () => setEditing(null)
      : mine.length === 0
        ? null
        : () => setCreating(false);
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        {back ? (
          <div className="border-b border-border-subtle px-4 py-2">
            <Button size="sm" variant="ghost" onClick={back}>
              <Icon as={ArrowLeft} size="sm" decorative />
              {t("common.back")}
            </Button>
          </div>
        ) : (
          <p className="border-b border-border-subtle px-4 py-2 text-[0.72rem] italic text-text-secondary">
            {t("campaignHub.encounterCustomAutoHint")}
          </p>
        )}
        <ModalScroll className="flex-1">
          <AddMonsterForm
            initial={editing?.item}
            showCount={!isEdit}
            submitLabel={isEdit ? t("common.save") : t("campaignHub.encounterAddMonster")}
            onSubmit={(template, addCount, initiative) => {
              if (editing) {
                updateEntry(editing.id, { kind: "monster", item: template });
                setEditing(null);
              } else {
                commitCreate(template, addCount, initiative);
              }
            }}
          />
        </ModalScroll>
      </div>
    );
  }

  // DETAIL — the portrait (editable) + stat summary + count + Add-to-encounter.
  if (viewing) {
    const m = viewing.item;
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <ModalScroll className="flex-1 p-4">
          <div className="mb-4 flex items-start gap-4">
            <Suspense fallback={<span className="seal h-24 w-24 shrink-0" aria-hidden />}>
              <MonsterPortraitPanel
                target={{ kind: "entry", entryId: viewing.id }}
                portraitUrl={m.portraitUrl ?? null}
                portraitCrop={m.portraitCrop ?? null}
                name={m.name}
                seed={viewing.id}
                creatureType={m.creatureType}
                className="h-24 w-24"
              />
            </Suspense>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-text-primary">{m.name}</h3>
              <p className="mt-0.5 text-xs text-text-secondary">{meta(m)}</p>
              {m.cr && (
                <p className="mt-1 text-xs text-text-muted">
                  <GlossaryTip term="challengeRating" rubric={t("monster.crRubric")}>
                    {t("campaignHub.encounterCrOption", {
                      cr: formatCr(Number(m.cr)),
                      xp: fmtXp(xpForCr(Number(m.cr)), locale),
                    })}
                  </GlossaryTip>
                </p>
              )}
            </div>
          </div>
          {m.notes && (
            <p className="whitespace-pre-wrap text-sm text-text-secondary">{m.notes}</p>
          )}
        </ModalScroll>
        <PickerDetailFooter
          alreadyAdded={false}
          addLabel={t("campaignHub.encounterAddMonster")}
          onAdd={() => {
            onAdd(customMonsterToInput(m, count));
            showToast({
              message: t("campaignHub.encounterCustomAdded", { name: m.name }),
              duration: 3000,
            });
          }}
          onBack={() => setViewing(null)}
          quantity={{ value: count, onChange: setCount, min: 1, max: 20 }}
        />
      </div>
    );
  }

  // LIST — search + rows with edit/delete, and a create button in the footer.
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PickerSearch
        value={search}
        onChange={setSearch}
        placeholder={t("campaignHub.encounterCustomSearch")}
      />
      <ModalScroll className="flex-1">
        {rows.length === 0 ? (
          <p className="py-6 text-center text-[0.72rem] italic text-text-secondary">
            {t("common.noResults")}
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {rows.map((entry) => (
              <li key={entry.id} className="flex items-start gap-1">
                <span className="min-w-0 flex-1">
                  <PickerRow
                    name={entry.item.name}
                    meta={meta(entry.item)}
                    ariaLabel={entry.item.name}
                    onClick={() => {
                      setCount(1);
                      setViewing(entry);
                    }}
                  />
                </span>
                <span className="flex shrink-0 items-start gap-0.5">
                  <IconButton
                    aria-label={t("common.editNamed", { name: entry.item.name })}
                    onClick={() => setEditing(entry)}
                  >
                    <Icon as={PencilLine} size="sm" decorative />
                  </IconButton>
                  <IconButton
                    aria-label={t("custom.libraryDelete", { name: entry.item.name })}
                    className="hover:text-error"
                    onClick={() => void handleDelete(entry)}
                  >
                    <Icon as={Trash2} size="sm" decorative />
                  </IconButton>
                </span>
              </li>
            ))}
          </ul>
        )}
      </ModalScroll>
      <div className="border-t border-border px-4 py-3">
        <Button variant="secondary" block onClick={() => setCreating(true)}>
          <Icon as={Plus} size="sm" decorative />
          {t("campaignHub.encounterCustomCreate")}
        </Button>
      </div>
    </div>
  );
}
