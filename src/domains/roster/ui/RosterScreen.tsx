/**
 * «I tuoi personaggi» on the new frame (approved prototypes chars, chars-menu,
 * chars-delete, chars-empty): the study above the page, the count, «Importa» and «Crea
 * personaggio», then one card per character (portrait in its Hit Points ring, class
 * line, species, PF · CA · Velocità, the campaign and when it was last touched) with a
 * ⋮ menu, and «Crea un personaggio» last. The old roster's data and actions, one path.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";

import { rosterCards, type RosterCard } from "@/domains/roster/roster-view";
import { deleteCharacterAndDetach } from "@/features/roster/delete-character";
import { ImportCharacterHost } from "@/features/roster/ImportCharacterHost";
import { triggerCharacterImport } from "@/features/roster/import-trigger";
import { useRosterActions } from "@/features/roster/use-roster-actions";
import { listSharedCampaigns } from "@/features/campaigns/campaign-io";
import { useCharacters } from "@/hooks/useCharacters";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useLocale } from "@/hooks/useLocale";
import type { RosterCharacterDoc } from "@/lib/character-cache";
import { useAuthStore } from "@/stores/authStore";
import { useToastStore } from "@/stores/toastStore";
import { Button, Dialog, Field, HpRing, Icon, Room } from "@/ui";

export function RosterScreen() {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  useDocumentTitle(t("nav.characters"));
  const navigate = useNavigate();
  const uid = useAuthStore((s) => s.user?.uid);
  const { characters, loading } = useCharacters();
  const [campaignOf, setCampaignOf] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!uid) return;
    let live = true;
    listSharedCampaigns(uid)
      .then((all) => {
        if (!live) return;
        const map: Record<string, string> = {};
        for (const c of all) {
          const id = c.memberDetails[uid]?.characterId;
          if (id) map[id] = c.name;
        }
        setCampaignOf(map);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [uid]);
  const [now] = useState(Date.now);
  const cards = useMemo(
    () => rosterCards(characters, campaignOf, locale, now),
    [characters, campaignOf, locale, now]
  );
  const docs = useMemo(() => new Map(characters.map((c) => [c.id, c])), [characters]);
  const create = () => void navigate("/characters/new");
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);
  return (
    <>
      <Room room="study" />
      <main id="main" className="f-page f-roster">
        <ImportCharacterHost />
        <header className="f-ph">
          <div>
            <h1>{t("roster.screenTitle")}</h1>
            {!loading && <p>{t("roster.count", { count: cards.length })}</p>}
          </div>
          <div className="f-ph-acts">
            <Button icon="u-download" onClick={triggerCharacterImport}>
              {t("roster.importJson")}
            </Button>
            <Button kind="primary" icon="u-add" onClick={create}>
              {t("roster.create")}
            </Button>
          </div>
        </header>
        {!loading && cards.length === 0 ? (
          <section className="f-roster-empty">
            <EmptyTiles onCreate={create} onImport={triggerCharacterImport} />
          </section>
        ) : (
          <div className="f-roster-grid">
            {cards.map((card) => {
              const doc = docs.get(card.id);
              return doc ? (
                <CharacterCard
                  key={card.id}
                  card={card}
                  doc={doc}
                  onDelete={() => setDeleting({ id: card.id, name: card.name })}
                />
              ) : null;
            })}
            {!loading && <NewTile />}
          </div>
        )}
      </main>
      {deleting && (
        <DeleteDialog
          name={deleting.name}
          id={deleting.id}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  );
}

/** No character yet (prototype chars-empty): guided creation, the quick one, an import. */
function EmptyTiles({
  onCreate,
  onImport,
}: {
  onCreate: () => void;
  onImport: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <>
      <div className="f-tile">
        <Icon name="g-create" size={48} />
        <b>{t("palette.actionNewCharacter")}</b>
        <span>{t("create.screen.subtitle")}</span>
        <Button kind="primary" onClick={onCreate}>
          {t("roster.create")}
        </Button>
      </div>
      <div className="f-tile">
        <Icon name="g-roll" size={48} />
        <b>{t("create.screen.rapid")}</b>
        <span>{t("create.screen.rapidSub")}</span>
        <Button onClick={() => void navigate("/characters/new?rapid=1")}>
          {t("create.screen.rapidGo")}
        </Button>
      </div>
      <div className="f-tile">
        <Icon name="g-import" size={48} />
        <b>{t("roster.emptyImportTitle")}</b>
        <span>{t("roster.emptyImportSub")}</span>
        <Button icon="u-download" onClick={onImport}>
          {t("roster.importJson")}
        </Button>
      </div>
    </>
  );
}

function NewTile() {
  const { t } = useTranslation();
  return (
    <Link className="f-tile" to="/characters/new">
      <Icon name="g-create" size={48} />
      <b>{t("palette.actionNewCharacter")}</b>
      <span>{t("roster.createTileSub")}</span>
    </Link>
  );
}

function CharacterCard({
  card,
  doc,
  onDelete,
}: {
  card: RosterCard;
  doc: RosterCharacterDoc;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const actions = useRosterActions(doc);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (
        e instanceof KeyboardEvent
          ? e.key === "Escape"
          : !menuRef.current?.contains(e.target as Node)
      )
        setMenu(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [menu]);
  return (
    <article className="f-pn f-ccard" data-state={card.state}>
      <Link className="f-ccard-link" to={`/characters/${card.id}`}>
        <span className="f-ccard-who">
          <HpRing
            hp={card.hp.current}
            max={card.hp.max}
            size={56}
            name={card.name}
            {...(card.portrait ? { portrait: card.portrait } : {})}
          />
          <span className="f-ccard-id">
            <span className="f-ccard-name">{card.name}</span>
            <span className="f-ccard-class">
              {/* the last two words together: the line never ends on one alone */}
              {card.classLine.replace(/ (\S+)$/, "\u00a0$1")}
            </span>
            {card.species && <span className="f-ccard-sub">{card.species}</span>}
          </span>
        </span>
        <span className="f-ccard-stats">
          <span>
            <b data-hp={card.state === "active" ? hpTone(card.hp) : undefined}>
              {`${String(card.hp.current)}/${String(card.hp.max)}`}
            </b>
            <span className="f-lbl">
              <span className="f-full">{t("roster.hp")}</span>
              <span className="f-abbr">{t("character.health.hpAbbr")}</span>
            </span>
          </span>
          <span>
            <b>{card.ac > 0 ? card.ac : "—"}</b>
            <span className="f-lbl">
              <span className="f-full">{t("roster.ac")}</span>
              <span className="f-abbr">{t("character.armorClassShort")}</span>
            </span>
          </span>
          <span>
            <b>{card.speed}</b>
            <span className="f-lbl">{t("character.speed")}</span>
          </span>
        </span>
        <span className="f-ccard-foot">
          <span>
            {card.state === "fallen"
              ? t("roster.fallen")
              : card.state === "retired"
                ? t("roster.retiredTag")
                : (card.campaign ?? "")}
          </span>
          {card.updated && (
            <span className="f-ccard-when">
              {t("roster.updatedWhen", { when: card.updated })}
            </span>
          )}
        </span>
      </Link>
      <div className="f-ccard-menu" ref={menuRef}>
        <button
          type="button"
          className="f-tb-back"
          aria-haspopup="menu"
          aria-expanded={menu}
          aria-label={t("roster.menuFor", { name: card.name })}
          onClick={() => setMenu((open) => !open)}
        >
          <Icon name="u-more" size={20} />
        </button>
        {menu && (
          <div className="f-cmenu f-pop" role="menu" aria-label={card.name}>
            <div className="f-cmenu-head">{card.name}</div>
            <Link
              role="menuitem"
              to={`/characters/${card.id}`}
              onClick={() => setMenu(false)}
            >
              <Icon name="u-next" />
              {t("roster.openSheet")}
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenu(false);
                void actions.clone();
              }}
            >
              <Icon name="u-copy" />
              {t("roster.clone")}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenu(false);
                void actions.exportJson();
              }}
            >
              <Icon name="u-export" />
              {t("roster.exportFile")}
            </button>
            <hr />
            <button
              type="button"
              role="menuitem"
              className="f-cmenu-danger"
              onClick={() => {
                setMenu(false);
                onDelete();
              }}
            >
              <Icon name="u-delete" />
              {t("roster.deleteCharacter")}
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

/** «Elimina per sempre»: the name typed to confirm (prototype chars-delete); no undo. */
function DeleteDialog({
  name,
  id,
  onClose,
}: {
  name: string;
  id: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const uid = useAuthStore((s) => s.user?.uid);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const match = typed.trim() === name.trim();
  const remove = () => {
    if (!uid || !match) return;
    setBusy(true);
    deleteCharacterAndDetach(uid, id)
      .then(() =>
        useToastStore
          .getState()
          .showToast({ message: t("roster.deleted", { name }), duration: 4000 })
      )
      .catch(() =>
        useToastStore
          .getState()
          .showToast({ message: t("roster.deleteFailed", { name }), duration: 6000 })
      )
      .finally(onClose);
  };
  return (
    <Dialog
      open
      onClose={onClose}
      color="ini"
      title={t("common.deleteTitle", { name })}
      closeLabel={t("common.close")}
      actions={
        <>
          <Button kind="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button kind="primary" disabled={!match || busy} onClick={remove}>
            {t("roster.deleteForever")}
          </Button>
        </>
      }
    >
      <p>{t("roster.deleteMessage", { name })}</p>
      <Field
        label={t("roster.typeName")}
        autoComplete="off"
        value={typed}
        help={name}
        onChange={(e) => setTyped(e.target.value)}
      />
    </Dialog>
  );
}

function hpTone(hp: { current: number; max: number }): "full" | "hurt" | "low" {
  const share = hp.max > 0 ? hp.current / hp.max : 0;
  return share >= 0.75 ? "full" : share > 0.25 ? "hurt" : "low";
}
