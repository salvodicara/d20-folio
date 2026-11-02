// The new campaign page (approved prototype camp-*.html, 2026-11-02), behind VITE_NEW_UI.
// It reads the core only: the campaign store, the members' live docs and pure view models.
import { DiaryTab } from "@/domains/chronicle/ui/DiaryTab";
import { FightTab } from "@/domains/combat/ui/FightTab";
import { NotesTab } from "@/domains/notes/ui/NotesTab";
import { Coins } from "@/domains/treasury/ui/Coins";
import { TreasuryTab } from "@/domains/treasury/ui/TreasuryTab";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useParams } from "react-router";

import { PERSONAL_CAMPAIGN_ID } from "@/app/_data/personal-campaign";
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import { inviteLinkFromCode } from "@/features/campaigns/invite-code";
import { useCampaignSubscription } from "@/features/campaigns/useCampaignSubscription";
import { useSessionLogMirror } from "@/features/campaigns/useSessionLogMirror";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useLocale } from "@/hooks/useLocale";
import { asLocale, intlTag, type Locale } from "@/lib/locale";
import { useAuthStore } from "@/stores/authStore";
import type { CampaignDoc } from "@/types/campaign";
import { Button, Chip, HpRing, Panel, Tabs, Toast } from "@/ui";

import { partyRows, type PartyRow } from "../party-rows-view";
import { useLiveDocs } from "./use-party";

type Tab = "party" | "fight" | "journal" | "treasure" | "notes";

export function CampaignScreen() {
  const { campaignId } = useParams();
  if (!campaignId || campaignId === PERSONAL_CAMPAIGN_ID)
    return <Navigate to="/campaigns" replace />;
  return <Campaign campaignId={campaignId} />;
}

function Campaign({ campaignId }: { campaignId: string }) {
  const { t } = useTranslation();
  const locale = asLocale(useLocale().language);
  useCampaignSubscription(campaignId);
  const campaign = useCampaignStore((s) => s.campaign);
  const error = useCampaignStore((s) => s.error);
  const uid = useAuthStore((s) => s.user?.uid);
  // The DM's app writes the fight into the session log; the new page must keep doing it.
  useSessionLogMirror(campaignId, uid, campaign?.dmUid);
  useDocumentTitle(campaign?.name);
  const [tab, setTab] = useState<Tab>("party");
  const [toast, setToastState] = useState<{ text: string; undo?: () => void } | null>(
    null
  );
  const setToast = (text: string, undo?: () => void) => setToastState({ text, undo });

  if (!campaign || campaign.id !== campaignId) {
    return (
      <main id="main" className="f-page">
        <p role="status">
          {t(error ? "campaignScreen.notFound" : "campaignScreen.loading")}
        </p>
      </main>
    );
  }

  const copyInvite = () => {
    void navigator.clipboard
      .writeText(inviteLinkFromCode(campaign.inviteCode))
      .then(() => {
        setToast(t("campaignScreen.inviteCopied"));
      });
  };

  return (
    <>
      <main id="main" className="f-page">
        <Header campaign={campaign} locale={locale} onCopyInvite={copyInvite} />
        <Tabs
          label={t("campaignScreen.tabsLabel")}
          items={[
            { id: "party" as const, label: t("campaignHub.party") },
            { id: "fight" as const, label: t("campaignScreen.tabFight") },
            { id: "journal" as const, label: t("campaignHub.workspaceJournal") },
            { id: "treasure" as const, label: t("campaignHub.treasury") },
            { id: "notes" as const, label: t("notes.combatRubric") },
          ]}
          value={tab}
          onChange={setTab}
        />
        {tab === "party" ? (
          <PartyTab campaign={campaign} locale={locale} />
        ) : tab === "fight" ? (
          <FightTab campaign={campaign} locale={locale} onToast={setToast} />
        ) : tab === "treasure" ? (
          <TreasuryTab campaign={campaign} locale={locale} onToast={setToast} />
        ) : tab === "notes" ? (
          <NotesTab campaign={campaign} onToast={setToast} />
        ) : (
          <DiaryTab campaign={campaign} locale={locale} onToast={setToast} />
        )}
      </main>
      {toast && (
        <Toast
          action={toast.undo && t("common.undo")}
          onAction={() => {
            toast.undo?.();
            setToastState(null);
          }}
        >
          {toast.text}
        </Toast>
      )}
    </>
  );
}

function Header({
  campaign,
  locale,
  onCopyInvite,
}: {
  campaign: CampaignDoc;
  locale: Locale;
  onCopyInvite: () => void;
}) {
  const { t } = useTranslation();
  const dm = campaign.memberDetails[campaign.dmUid]?.displayName;
  const characters = Object.values(campaign.memberDetails).filter(
    (m) => m.character
  ).length;
  const next = campaign.nextSessionAt
    ? new Date(campaign.nextSessionAt).toLocaleString(intlTag(locale), {
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
  return (
    <section className="f-hero" data-identity>
      <img
        className="f-crest"
        src={campaign.bannerUrl ?? "/assets/backgrounds/room-war-room.webp"}
        alt=""
      />
      <div className="f-hero-id">
        <h1>{campaign.name}</h1>
        <div className="f-hero-sub">
          {[
            t("roster.count", { count: characters }),
            dm && t("campaignScreen.master", { name: dm }),
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>
        <div className="f-kv">
          <span className="f-lbl">{t("campaignHub.nextSession")}</span>
          <b>{next ?? t("campaignScreen.noNextSession")}</b>
        </div>
      </div>
      <div className="f-hero-acts">
        <Button icon="u-link" onClick={onCopyInvite}>
          {t("campaignScreen.copyInvite")}
        </Button>
      </div>
    </section>
  );
}

function PartyTab({ campaign, locale }: { campaign: CampaignDoc; locale: Locale }) {
  const { t } = useTranslation();
  const live = useLiveDocs(campaign);
  const rows = partyRows(campaign, live, locale);
  const encounter = campaign.encounter;
  return (
    <div className="f-split">
      <div className="f-stack">
        <Panel
          color="grp"
          title={t("campaignHub.party")}
          aside={rows.length > 0 && t("campaignScreen.partyHint")}
        >
          {rows.length === 0 && (
            <p className="f-note">{t("campaignScreen.noCharacters")}</p>
          )}
          {rows.map((row) => (
            <PartyLine
              key={row.uid}
              row={row}
              href={`/campaigns/${campaign.id}/sheets/${row.uid}`}
            />
          ))}
        </Panel>
        <Panel color="tes" title={t("campaignScreen.chest")}>
          <Coins treasury={campaign.treasury} />
        </Panel>
      </div>
      <Panel color="ini" title={t("campaignScreen.tabFight")}>
        <p>
          {encounter
            ? t("campaignScreen.fightRunning", { round: encounter.round })
            : t("campaignScreen.fightIdle")}
        </p>
      </Panel>
    </div>
  );
}

function PartyLine({ row, href }: { row: PartyRow; href: string }) {
  const { t } = useTranslation();
  const hp = row.hp;
  const share = hp && hp.max > 0 ? hp.current / hp.max : 1;
  if (row.loading) {
    return (
      <Link className="f-row" to={href} aria-busy="true">
        <HpRing hp={0} max={0} size={48} />
        <div className="f-row-main">
          <span className="f-skel" style={{ width: "50%" }} />
          <span className="f-skel" style={{ width: "30%" }} />
          <span className="f-sr">{t("character.loading")}</span>
        </div>
      </Link>
    );
  }
  return (
    <Link className="f-row" to={href}>
      <HpRing
        hp={hp?.current ?? 0}
        max={hp?.max ?? 0}
        temp={hp?.temp}
        size={48}
        portrait={row.portraitUrl ?? undefined}
        name={row.name}
      />
      <div className="f-row-main">
        <div className="f-row-t">{row.name}</div>
        <div className="f-row-s">
          {[row.classLine, row.player].filter(Boolean).join(" · ")}
        </div>
      </div>
      {row.chips.length > 0 && (
        <div className="f-chips">
          {row.chips.map((c) => (
            <Chip key={c.kind + c.label} kind={c.kind}>
              {c.label}
            </Chip>
          ))}
        </div>
      )}
      <div className="f-row-end">
        <Stat
          value={hp ? `${hp.current}/${hp.max}` : "—"}
          label={t("units.hp")}
          hp={hp ? (share > 0.5 ? "ok" : share > 0.25 ? "low" : "bad") : undefined}
        />
        <Stat value={row.ac ?? "—"} label={t("stats.ac")} />
        <Stat value={row.perception ?? "—"} label={t("skills.perception")} />
      </div>
    </Link>
  );
}

function Stat({
  value,
  label,
  hp,
}: {
  value: string | number;
  label: string;
  hp?: "ok" | "low" | "bad";
}) {
  return (
    <div className="f-stat">
      <div className="f-stat-v" data-hp={hp}>
        {value}
      </div>
      <div className="f-lbl">{label}</div>
    </div>
  );
}
