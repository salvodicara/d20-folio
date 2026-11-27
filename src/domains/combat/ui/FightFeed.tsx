/**
 * «In questo scontro»: what has happened in this fight, newest first, the same feed
 * every member reads (the classic Combat Chronicle, on the new screen). A line the
 * reader may act on ends in «⋯» (the Play screen's menu): the DM's undo on a monster's
 * HP or condition line, striking a line from the record (its author or the DM), and
 * «Chi ha colpito?», which an open hit also shows as a chip on its line. Anyone writes a
 * note into the log at the foot. History is never deleted: a struck line stays in the log
 * as struck.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useReportNames } from "@/domains/chronicle/ui/report-names";
import { usePartyNames } from "@/domains/campaign/ui/use-party";
import { feedLineActions, strikerChoices } from "@/domains/combat/feed-line-actions";
import type { Toaster } from "@/domains/combat/ui/fight-moves";
import { undoFeedBeat } from "@/features/campaigns/combat-lifecycle-io";
import { useSessionLog, type SessionDraft } from "@/features/campaigns/useSessionLog";
import type { Locale } from "@/lib/locale";
import {
  attributionCorrection,
  encounterFeed,
  hideCombatants,
  NOTE_MAX,
  noteDraft,
  strikeDraft,
  type FeedLine,
} from "@/lib/session-log";
import { localizePlayEvent } from "@/lib/views/session-report-view";
import type { CampaignDoc, EncounterState } from "@/types/campaign";
import { Button, Chip, Field, Icon, Menu, Panel } from "@/ui";

const FEED_LINES = 8;

export function FightFeed({
  campaign,
  encounter,
  isDm,
  uid,
  locale,
  onToast,
}: {
  campaign: CampaignDoc;
  encounter: EncounterState;
  isDm: boolean;
  uid: string | undefined;
  locale: Locale;
  onToast: Toaster;
}) {
  const { t } = useTranslation();
  const names = useReportNames(campaign, locale, usePartyNames(campaign));
  const log = useSessionLog(campaign.id, uid, campaign.dmUid, encounter.epoch);
  const viewer = useMemo(() => ({ uid, isDm }), [uid, isDm]);
  const encounterId = String(encounter.epoch);
  const lines = useMemo(() => {
    const all = encounterFeed(log.entries, encounterId);
    if (isDm) return all;
    return hideCombatants(
      all,
      new Set(encounter.combatants.filter((c) => c.hidden).map((c) => c.id))
    );
  }, [log.entries, encounterId, isDm, encounter.combatants]);
  const foes = useMemo(() => {
    const start = log.entries.find(
      (e) => e.event.kind === "encounter-start" && e.event.encounterId === encounterId
    );
    return start?.event.kind === "encounter-start" ? (start.event.names ?? {}) : {};
  }, [log.entries, encounterId]);
  const who = (id: string | undefined): string =>
    (id && (foes[id] ?? names.pc(id))) || t("combatChronicle.someone");
  const [menu, setMenu] = useState<{ line: FeedLine; text: string } | null>(null);
  const [asking, setAsking] = useState<{ line: FeedLine; all: boolean } | null>(null);
  const [note, setNote] = useState("");

  const write = (drafts: SessionDraft[]) =>
    void log.append(drafts).catch(() => onToast(t("fight.failed")));
  const undo = (beatId: string) =>
    // Undone, the line leaves the feed (the mirror strikes it); a stale one says so.
    void undoFeedBeat(campaign.id, { uid: uid ?? "", beatId })
      .then((ok) => ok || onToast(t("fight.moved")))
      .catch(() => onToast(t("fight.failed")));
  const addNote = () => {
    const draft = noteDraft(note, viewer);
    if (!draft) return;
    write([draft]);
    setNote("");
  };

  const shown = lines.slice(-FEED_LINES).reverse();
  const open = menu && feedLineActions(menu.line, viewer, encounter);
  const strikers =
    asking &&
    strikerChoices(asking.line, encounter, viewer, encounter.currentCombatantId);
  return (
    <Panel
      color="log"
      title={t("fight.feedTitle")}
      foot={
        <form
          className="f-feed-note"
          onSubmit={(e) => {
            e.preventDefault();
            addNote();
          }}
        >
          <Field
            label={t("combatChronicle.noteLabel")}
            placeholder={t("combatChronicle.notePlaceholder")}
            autoComplete="off"
            maxLength={NOTE_MAX}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button type="submit" disabled={note.trim() === ""}>
            {t("common.add")}
          </Button>
        </form>
      }
    >
      {shown.length === 0 && <p className="f-quiet">{t("fight.feedEmpty")}</p>}
      {shown.map((line) => {
        const text = localizePlayEvent(line.event, t, who, names);
        if (!text) return null;
        const acts = feedLineActions(line, viewer, encounter);
        const said = line.round
          ? t("fight.roundLine", { n: line.round, line: text })
          : text;
        return (
          <div
            key={line.id}
            className="f-tl"
            data-note={line.event.kind === "note" || undefined}
          >
            <span>
              {said}
              {acts.ask && (
                <span className="f-tl-ask">
                  <Chip pressed={false} onClick={() => setAsking({ line, all: false })}>
                    {t("combatChronicle.attributeLabel")}
                  </Chip>
                </span>
              )}
            </span>
            {(acts.undo !== null || acts.retract || acts.ask) && (
              <button
                type="button"
                className="f-btn f-tl-more"
                data-kind="quiet"
                aria-label={t("fight.feedLineMenu", { line: text })}
                aria-haspopup="dialog"
                onClick={() => setMenu({ line, text })}
              >
                <Icon name="u-more" />
              </button>
            )}
          </div>
        );
      })}
      <Menu open={menu !== null} onClose={() => setMenu(null)} title={menu?.text ?? ""}>
        {menu && open?.undo && (
          <MenuItem
            icon="u-back"
            label={t("combatChronicle.undoLine")}
            onSelect={() => {
              if (open.undo) undo(open.undo);
              setMenu(null);
            }}
          />
        )}
        {menu && open?.ask && (
          <MenuItem
            label={t("combatChronicle.attributeLabel")}
            onSelect={() => {
              setAsking({ line: menu.line, all: false });
              setMenu(null);
            }}
          />
        )}
        {menu && open?.retract && (
          <MenuItem
            icon="u-close"
            label={t("combatChronicle.retractLine")}
            onSelect={() => {
              write([strikeDraft(menu.line)]);
              setMenu(null);
            }}
          />
        )}
      </Menu>
      <Menu
        open={asking !== null}
        onClose={() => setAsking(null)}
        title={t("combatChronicle.attributeLabel")}
      >
        {asking &&
          strikers &&
          [...strikers.primary, ...(asking.all ? strikers.more : [])].map((id) => (
            <MenuItem
              key={id}
              label={who(id)}
              onSelect={() => {
                write([
                  {
                    type: "correct",
                    target: asking.line.id,
                    event: attributionCorrection(asking.line, id),
                  },
                ]);
                setAsking(null);
              }}
            />
          ))}
        {asking && strikers && !asking.all && strikers.more.length > 0 && (
          <MenuItem
            label={t("combatChronicle.attributeMore", { count: strikers.more.length })}
            onSelect={() => setAsking({ ...asking, all: true })}
          />
        )}
        {asking && (
          <MenuItem
            label={t("combatChronicle.attributeSkip")}
            onSelect={() => {
              write([
                {
                  type: "correct",
                  target: asking.line.id,
                  event: attributionCorrection(asking.line, null),
                },
              ]);
              setAsking(null);
            }}
          />
        )}
      </Menu>
    </Panel>
  );
}

function MenuItem({
  icon,
  label,
  onSelect,
}: {
  icon?: Parameters<typeof Icon>[0]["name"];
  label: string;
  onSelect: () => void;
}) {
  return (
    <button type="button" className="f-menu-it" onClick={onSelect}>
      {icon && <Icon name={icon} />}
      {label}
    </button>
  );
}
