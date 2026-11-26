/**
 * The DM's monster card on the Scontro tab (the classic MonsterCard body; D&D Beyond's
 * combat tracker keeps the stat block beside the tracker): the creature's name, Armor
 * Class and private notes, edited in place with one «Salva», and its stat block below.
 */
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { MonsterEdit } from "@/features/campaigns/combat-lifecycle";
import { Button, Dialog, Field, TextArea } from "@/ui";

/** A whole Armor Class from 0 to 40; null for anything else. */
function parseAc(text: string): number | null {
  const s = text.trim();
  if (!/^\d{1,2}$/.test(s)) return null;
  const n = Number(s);
  return n <= 40 ? n : null;
}

export function MonsterCardDialog({
  monster,
  statBlock,
  onSave,
  onClose,
}: {
  monster: MonsterEdit;
  /** The creature's stat block, when the catalogue has one. */
  statBlock?: ReactNode;
  onSave: (edit: MonsterEdit) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(monster.name);
  const [ac, setAc] = useState(String(monster.ac));
  const [notes, setNotes] = useState(monster.notes);
  const acValue = parseAc(ac);
  const ready =
    name.trim() !== "" &&
    acValue !== null &&
    (name.trim() !== monster.name ||
      acValue !== monster.ac ||
      notes.trim() !== monster.notes.trim());
  return (
    <Dialog
      open
      onClose={onClose}
      color="ini"
      title={monster.name}
      closeLabel={t("common.close")}
      actions={
        <Button
          kind="primary"
          wide
          disabled={!ready}
          onClick={() => {
            if (acValue === null) return;
            onSave({ name: name.trim(), ac: acValue, notes: notes.trim() });
            onClose();
          }}
        >
          {t("common.save")}
        </Button>
      }
    >
      <div className="f-ask f-card-fields">
        <Field
          label={t("common.name")}
          autoComplete="off"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Field
          label={t("stats.ac")}
          inputMode="numeric"
          autoComplete="off"
          value={ac}
          onChange={(e) => setAc(e.target.value)}
        />
      </div>
      <div className="f-ask">
        <TextArea
          label={t("campaignHub.encounterMonsterNotes")}
          placeholder={t("campaignHub.encounterMonsterNotesPlaceholder")}
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      {statBlock && (
        <div className="f-ask">
          <span className="f-lbl">{t("campaignHub.encounterStatblock")}</span>
          <div className="f-cmp-extras" data-audit-skip="">
            {statBlock}
          </div>
        </div>
      )}
    </Dialog>
  );
}
