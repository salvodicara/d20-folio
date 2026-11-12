/**
 * «Campagne» on the new frame (D&D Beyond's campaign list: one card per table, create
 * and join at the top). The roster's grammar: the page header with its actions, one
 * card per campaign (name, DM and start, Gruppo · Liv · Cassa, last active) with a ⋮
 * menu (copy the invite link; delete, for the DM), the empty tiles when there is none.
 * Create and join are new-frame dialogs over the same campaign writers the old list
 * used; the old list's data and actions, one path.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";

import { campaignCards, type CampaignCard } from "@/domains/campaign/campaigns-list-view";
import {
  createCampaign,
  deleteCampaign,
  joinCampaign,
  listSharedCampaigns,
} from "@/features/campaigns/campaign-io";
import {
  inviteCodeFromInput,
  inviteLinkFromCode,
} from "@/features/campaigns/invite-code";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useLocale } from "@/hooks/useLocale";
import { FREE_TIER_LIMITS } from "@/lib/limits";
import { useAuthStore } from "@/stores/authStore";
import { useToastStore } from "@/stores/toastStore";
import type { CampaignDoc } from "@/types/campaign";
import { Button, Dialog, Field, Icon, Room } from "@/ui";

const toast = (message: string, duration = 3000) =>
  useToastStore.getState().showToast({ message, duration });

const copyInvite = (code: string, done: string) =>
  void navigator.clipboard.writeText(inviteLinkFromCode(code)).then(() => toast(done));

export function CampaignsScreen() {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  useDocumentTitle(t("nav.campaigns"));
  const uid = useAuthStore((s) => s.user?.uid);
  const isAdmin = useIsAdmin();
  const [campaigns, setCampaigns] = useState<CampaignDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [refresh, setRefresh] = useState(0);
  // «Cerca nel Folio → Crea una campagna» opens here with ?new=1.
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(() => params.get("new") === "1");
  const [joining, setJoining] = useState(false);
  const [deleting, setDeleting] = useState<CampaignCard | null>(null);
  useEffect(() => {
    if (!uid) return;
    let live = true;
    listSharedCampaigns(uid)
      .then((all) => {
        if (!live) return;
        setCampaigns(all);
        setFailed(false);
      })
      .catch(() => live && setFailed(true))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [uid, refresh]);
  const [now] = useState(Date.now);
  const cards = useMemo(
    () => campaignCards(campaigns, uid, isAdmin, locale, now),
    [campaigns, uid, isAdmin, locale, now]
  );
  const reload = () => setRefresh((n) => n + 1);
  const atCap = cards.length >= FREE_TIER_LIMITS.campaigns;
  const closeCreate = () => {
    setCreating(false);
    if (params.get("new") !== null) {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("new");
          return next;
        },
        { replace: true }
      );
    }
    reload();
  };
  return (
    <>
      <Room room="war-room" />
      <main id="main" className="f-page f-roster f-camps">
        <header className="f-ph">
          <div>
            <h1>{t("nav.campaigns")}</h1>
            <p>{t("campaigns.hint")}</p>
          </div>
          {cards.length > 0 && (
            <div className="f-ph-acts">
              <Button icon="g-invite" onClick={() => setJoining(true)}>
                {t("campaigns.joinShort")}
              </Button>
              <Button
                kind="primary"
                icon="u-add"
                disabled={atCap}
                title={
                  atCap
                    ? t("campaigns.atCap", { max: FREE_TIER_LIMITS.campaigns })
                    : undefined
                }
                onClick={() => setCreating(true)}
              >
                {t("campaigns.new")}
              </Button>
            </div>
          )}
        </header>
        {loading ? null : failed ? (
          <section className="f-roster-empty">
            <div className="f-tile">
              <Icon name="g-error" size={48} />
              <b>{t("campaigns.errorTitle")}</b>
              <span>{t("campaigns.errorBlurb")}</span>
              <Button
                kind="primary"
                onClick={() => {
                  setLoading(true);
                  reload();
                }}
              >
                {t("common.retry")}
              </Button>
            </div>
          </section>
        ) : cards.length === 0 ? (
          <section className="f-roster-empty">
            <div className="f-tile">
              <Icon name="g-campaign" size={48} />
              <b>{t("campaigns.createFirst")}</b>
              <span>{t("campaigns.emptyBlurb")}</span>
              <Button kind="primary" onClick={() => setCreating(true)}>
                {t("campaigns.createFirst")}
              </Button>
            </div>
            <div className="f-tile">
              <Icon name="g-invite" size={48} />
              <b>{t("campaigns.joinWithCode")}</b>
              <span>{t("campaigns.joinBlurb")}</span>
              <Button onClick={() => setJoining(true)}>{t("campaigns.joinShort")}</Button>
            </div>
          </section>
        ) : (
          <div className="f-roster-grid">
            {cards.map((card) => (
              <CampaignCardView
                key={card.id}
                card={card}
                onDelete={() => setDeleting(card)}
              />
            ))}
          </div>
        )}
      </main>
      {creating && <CreateDialog onClose={closeCreate} />}
      {joining && (
        <JoinDialog
          onClose={() => {
            setJoining(false);
            reload();
          }}
        />
      )}
      {deleting && (
        <DeleteDialog
          card={deleting}
          onClose={(gone) => {
            setDeleting(null);
            if (gone) reload();
          }}
        />
      )}
    </>
  );
}

function CampaignCardView({
  card,
  onDelete,
}: {
  card: CampaignCard;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
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
    <article className="f-pn f-ccard">
      <Link className="f-ccard-link" to={`/campaigns/${card.id}`}>
        <span className="f-ccard-who">
          <span className="f-ccard-id">
            <span className="f-ccard-name">{card.name}</span>
            <span className="f-ccard-class">
              {card.dm
                ? t("campaigns.cardDm", { name: card.dm })
                : t("campaigns.cardNoDm")}
            </span>
            {card.started && (
              <span className="f-ccard-sub">
                {t("campaigns.cardStarted", { date: card.started })}
              </span>
            )}
          </span>
        </span>
        <span className="f-ccard-stats">
          <span>
            <b>{card.party}</b>
            <span className="f-lbl">{t("campaigns.cardParty")}</span>
          </span>
          <span>
            <b>{card.levels ?? "—"}</b>
            <span className="f-lbl">{t("campaigns.cardLevels")}</span>
          </span>
          <span>
            <b>{`${String(card.potGp)} ${t("equipment.currencyAbbr.gp")}`}</b>
            <span className="f-lbl">{t("campaigns.cardPot")}</span>
          </span>
        </span>
        <span className="f-ccard-foot">
          <span />
          {card.active && (
            <span className="f-ccard-when">
              {t("campaigns.cardActive", { date: card.active })}
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
          aria-label={t("campaigns.cardActionsFor", { name: card.name })}
          onClick={() => setMenu((open) => !open)}
        >
          <Icon name="u-more" size={20} />
        </button>
        {menu && (
          <div className="f-cmenu f-pop" role="menu" aria-label={card.name}>
            <div className="f-cmenu-head">{card.name}</div>
            <Link
              role="menuitem"
              to={`/campaigns/${card.id}`}
              onClick={() => setMenu(false)}
            >
              <Icon name="u-next" />
              {t("campaigns.openHub")}
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenu(false);
                copyInvite(card.inviteCode, t("campaigns.linkCopied"));
              }}
            >
              <Icon name="u-link" />
              {t("campaigns.copyInviteLink")}
            </button>
            {card.canDelete && (
              <>
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
                  {t("campaignHub.deleteCampaignConfirm")}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

/** «Crea una campagna»: the name, then the invite link to hand out (DDB's create flow). */
function CreateDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const uid = useAuthStore((s) => s.user?.uid);
  const displayName = useAuthStore((s) => s.profile?.displayName ?? "");
  const photoURL = useAuthStore((s) => s.user?.photoURL ?? null);
  const [name, setName] = useState("");
  const [id, setId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const create = () => {
    const trimmed = name.trim();
    if (!uid || !trimmed || busy) return;
    setBusy(true);
    setError(undefined);
    createCampaign(uid, { name: trimmed, displayName, photoURL })
      .then(setId)
      .catch(() => setError(t("campaigns.createError")))
      .finally(() => setBusy(false));
  };
  return (
    <Dialog
      open
      onClose={onClose}
      color="grp"
      title={t(id ? "campaigns.createdTitle" : "campaigns.createTitle")}
      closeLabel={t("common.close")}
      actions={
        id ? (
          <>
            <Button
              onClick={() => copyInvite(id, t("campaigns.linkCopied"))}
              icon="u-link"
            >
              {t("campaigns.copyInviteLink")}
            </Button>
            <Button kind="primary" onClick={() => void navigate(`/campaigns/${id}`)}>
              {t("campaigns.openHub")}
            </Button>
          </>
        ) : (
          <>
            <Button kind="ghost" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button kind="primary" disabled={!name.trim() || busy} onClick={create}>
              {t("campaigns.create")}
            </Button>
          </>
        )
      }
    >
      {id ? (
        <p>{t("campaigns.createdBlurb")}</p>
      ) : (
        <>
          <p>{t("campaigns.createBlurb")}</p>
          <Field
            label={t("campaigns.nameLabel")}
            value={name}
            maxLength={60}
            autoFocus
            enterKeyHint="done"
            placeholder={t("campaigns.namePlaceholder")}
            error={error}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
          />
        </>
      )}
    </Dialog>
  );
}

/** «Unisciti a una campagna»: paste the invite link the DM shared. */
function JoinDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const uid = useAuthStore((s) => s.user?.uid);
  const displayName = useAuthStore((s) => s.profile?.displayName ?? "");
  const photoURL = useAuthStore((s) => s.user?.photoURL ?? null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const code = inviteCodeFromInput(text);
  const join = () => {
    if (!uid || !code || busy) return;
    setBusy(true);
    setError(undefined);
    joinCampaign(uid, code, displayName, photoURL)
      .then((id) => void navigate(`/campaigns/${id}`))
      .catch(() => setError(t("campaigns.joinError")))
      .finally(() => setBusy(false));
  };
  return (
    <Dialog
      open
      onClose={onClose}
      color="grp"
      title={t("campaigns.joinTitle")}
      closeLabel={t("common.close")}
      actions={
        <>
          <Button kind="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button kind="primary" disabled={!code || busy} onClick={join}>
            {t("campaigns.join")}
          </Button>
        </>
      }
    >
      <p>{t("campaigns.joinBlurb")}</p>
      <Field
        label={t("campaigns.inviteLink")}
        value={text}
        autoFocus
        spellCheck={false}
        autoComplete="off"
        enterKeyHint="go"
        placeholder={t("campaigns.joinInvitePlaceholder")}
        help={t("campaigns.joinInviteHint")}
        error={error}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && join()}
      />
    </Dialog>
  );
}

/** «Eliminare questa campagna?» — for every member, no undo. */
function DeleteDialog({
  card,
  onClose,
}: {
  card: CampaignCard;
  onClose: (gone: boolean) => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const remove = () => {
    setBusy(true);
    deleteCampaign(card.id)
      .then(() => {
        toast(t("campaignHub.deletedToast"));
        onClose(true);
      })
      .catch(() => {
        toast(t("campaignHub.deleteError"));
        onClose(false);
      });
  };
  return (
    <Dialog
      open
      onClose={() => onClose(false)}
      color="ini"
      title={t("campaignHub.deleteCampaignTitle")}
      closeLabel={t("common.close")}
      actions={
        <>
          <Button kind="ghost" onClick={() => onClose(false)}>
            {t("common.cancel")}
          </Button>
          <Button kind="danger" disabled={busy} onClick={remove}>
            {t("campaignHub.deleteCampaignConfirm")}
          </Button>
        </>
      }
    >
      <p>{t("campaignHub.deleteCampaignMessage")}</p>
    </Dialog>
  );
}
