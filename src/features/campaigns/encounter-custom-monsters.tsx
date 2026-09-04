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

import { lazy, Suspense, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Camera, PencilLine, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { ModalScroll } from "@/components/ui/modal-head";
import { Portrait } from "@/components/shared/Portrait";
import {
  PickerDetailFooter,
  PickerRow,
  PickerSearch,
} from "@/components/sheet/picker-parts";
import { GlossaryTip } from "@/components/shared/GlossaryTip";
import { useConfirmStore } from "@/stores/confirmStore";
import { useAuthStore } from "@/stores/authStore";
import { useLibraryStore } from "@/stores/libraryStore";
import { useToastStore } from "@/stores/toastStore";
import { compressImage } from "@/lib/image-compress";
import { uploadMonsterPortrait } from "@/lib/storage";
import { readFileAsDataUrl } from "@/lib/image-crop";
import { normalizePortraitCrop } from "@/lib/portrait-crop";
import { matchesSearch } from "@/lib/search";
import { xpForCr } from "@/lib/monster";
import { fmtXp, formatCr } from "@/lib/utils";
import { useLocale } from "@/hooks/useLocale";
import type { LibraryEntry } from "@/lib/library";
import type { CustomMonster } from "@/types/campaign";
import type { PortraitCrop } from "@/types/character";
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
const PortraitCropModal = lazy(() =>
  import("@/components/shared/PortraitCropModal").then((m) => ({
    default: m.PortraitCropModal,
  }))
);

interface DraftPortrait {
  blob: Blob;
  previewUrl: string;
  crop: PortraitCrop;
}

/** Portrait selection belongs to creation, not to a hidden post-save screen. Bytes are
 * uploaded only after the library entry has an id; to the DM this remains one direct
 * create flow: choose, crop, save. */
function DraftMonsterPortrait({
  name,
  value,
  onChange,
}: {
  name: string;
  value: DraftPortrait | null;
  onChange: (portrait: DraftPortrait | null) => void;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [preparing, setPreparing] = useState(false);

  async function choose(file: File | undefined): Promise<void> {
    if (!file) return;
    if (inputRef.current) inputRef.current.value = "";
    setPreparing(true);
    try {
      const compressed = await compressImage(file);
      const previewUrl = await readFileAsDataUrl(
        new File([compressed], file.name, { type: "image/jpeg" })
      );
      setBlob(compressed);
      setCropSrc(previewUrl);
    } catch {
      useToastStore.getState().showToast({
        message: t("portrait.crop.readError"),
        duration: 4000,
      });
    } finally {
      setPreparing(false);
    }
  }

  return (
    <section className="custom-monster-portrait-field">
      <div className="custom-monster-portrait-heading">
        <strong>{t("character.portrait")}</strong>
      </div>
      <div className="custom-monster-portrait-control">
        <button
          type="button"
          className="custom-monster-portrait-button"
          onClick={() => inputRef.current?.click()}
          disabled={preparing}
          aria-label={value ? t("portrait.menu.replace") : t("portrait.crop.add")}
        >
          <span className="seal custom-monster-portrait-preview">
            <Portrait
              src={value?.previewUrl ?? null}
              crop={value?.crop ?? null}
              name={name}
              seed={name || "custom-monster"}
              className="h-full w-full"
            />
            <span className="monster-portrait-empty-cta" aria-hidden>
              <Camera className="h-6 w-6" />
            </span>
          </span>
          <span>
            <strong>{value ? t("portrait.menu.replace") : t("portrait.crop.add")}</strong>
          </span>
        </button>
        {value && (
          <IconButton
            aria-label={t("portrait.menu.remove")}
            onClick={() => onChange(null)}
          >
            <Icon as={X} size="sm" decorative />
          </IconButton>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => void choose(event.target.files?.[0])}
      />
      <Suspense fallback={null}>
        <PortraitCropModal
          key={cropSrc ?? ""}
          open={cropSrc !== null}
          imageSrc={cropSrc ?? ""}
          onConfirm={(area) => {
            const crop = normalizePortraitCrop(area);
            if (!crop || !blob || !cropSrc) return;
            onChange({ blob, previewUrl: cropSrc, crop });
            setCropSrc(null);
            setBlob(null);
          }}
          onClose={() => {
            setCropSrc(null);
            setBlob(null);
          }}
        />
      </Suspense>
    </section>
  );
}

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
  const uid = useAuthStore((s) => s.user?.uid) ?? "dev";

  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<MonsterEntry | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [count, setCount] = useState(1);
  const [pendingInitiative, setPendingInitiative] = useState<number | null>(null);
  const [draftPortrait, setDraftPortrait] = useState<DraftPortrait | null>(null);

  const mine = useMemo(() => entries.filter(isMonsterEntry), [entries]);
  const rows = useMemo(() => {
    if (!search.trim()) return mine;
    return mine.filter((e) => matchesSearch(search, e.item.name));
  }, [mine, search]);
  // Read the open detail from the LIVE library, never a captured row. Portrait edits
  // mutate the entry in place; a stale snapshot used to hide the new art and then add
  // the portrait-less template to the encounter.
  const viewing = viewingId
    ? (mine.find((entry) => entry.id === viewingId) ?? null)
    : null;

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
    const { outcome, id } = saveToLibrary({ kind: "monster", item: template });
    if (outcome === "full") {
      showToast({ message: t("custom.libraryFull"), duration: 4000 });
      return;
    }
    if (!id) return;
    setCount(addCount);
    setPendingInitiative(initiative);
    setViewingId(id);
    setCreating(false);
    const portrait = draftPortrait;
    setDraftPortrait(null);
    if (portrait) {
      void uploadMonsterPortrait(uid, id, portrait.blob)
        .then((portraitUrl) =>
          useLibraryStore.getState().setEntryPortrait(id, {
            portraitUrl,
            portraitCrop: portrait.crop,
          })
        )
        .catch(() =>
          showToast({ message: t("portrait.crop.saveError"), duration: 5000 })
        );
    }
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

  // CREATE / EDIT — one shared form with a Back bar whenever a prior surface exists.
  if (creating || editing || mine.length === 0) {
    const isEdit = editing !== null;
    const back = isEdit
      ? () => setEditing(null)
      : mine.length === 0
        ? null
        : () => setCreating(false);
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        {back && (
          <div className="border-b border-border-subtle px-4 py-2">
            <Button size="sm" variant="ghost" onClick={back}>
              <Icon as={ArrowLeft} size="sm" decorative />
              {t("common.back")}
            </Button>
          </div>
        )}
        <ModalScroll className="flex-1">
          <AddMonsterForm
            initial={editing?.item}
            showCount={!isEdit}
            intro={
              isEdit ? undefined : (
                <DraftMonsterPortrait
                  name=""
                  value={draftPortrait}
                  onChange={setDraftPortrait}
                />
              )
            }
            submitLabel={
              isEdit ? t("common.save") : t("campaignHub.encounterCustomSaveContinue")
            }
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
          <div className="custom-monster-detail-identity">
            <Suspense fallback={<span className="seal h-24 w-24 shrink-0" aria-hidden />}>
              <MonsterPortraitPanel
                entryId={viewing.id}
                portraitUrl={m.portraitUrl ?? null}
                portraitCrop={m.portraitCrop ?? null}
                name={m.name}
                seed={viewing.id}
                className="h-24 w-24"
              />
            </Suspense>
            <div className="custom-monster-detail-copy">
              <h3>{m.name}</h3>
              <p>{meta(m)}</p>
              {m.cr && (
                <p className="custom-monster-detail-cr">
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
            onAdd(customMonsterToInput(m, count, pendingInitiative));
            showToast({
              message: t("campaignHub.encounterCustomAdded", { name: m.name }),
              duration: 3000,
            });
          }}
          onBack={() => {
            setViewingId(null);
            setPendingInitiative(null);
          }}
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
                      setPendingInitiative(null);
                      setViewingId(entry.id);
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
