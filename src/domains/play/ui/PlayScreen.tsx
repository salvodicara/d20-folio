/**
 * The new character sheet's Play screen (approved prototype x-play), behind VITE_NEW_UI.
 * It loads the character exactly as today's sheet does (the live doc with its combat
 * state, the session-log recorder, pickups collected on load) and shows it through the
 * engine's pure views only. This first slice is the identity band: portrait in its HP
 * ring, name and identity line, what is going on, the six abilities, the four header
 * numbers and HP.
 */
import { lazy, Suspense, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, useMatch, useNavigate, useParams } from "react-router";

import { playHeaderView, type PlayHeaderView } from "@/domains/play/play-header-view";
import { PlayCentre } from "@/domains/play/ui/PlayCentre";
import { PlayEffects } from "./PlayEffects";
import { PlayAbilitySave } from "./PlayAbilitySave";
import { PlayInspiration } from "./PlayInspiration";
import { PlayConcentration } from "./PlayConcentration";
import { PlayConditions } from "@/domains/play/ui/PlayConditions";
import { PlayDown } from "@/domains/play/ui/PlayDown";
import { PlayConcentrationSave } from "@/domains/play/ui/PlayConcentrationSave";
import { ActionRepeatSaves } from "@/domains/combat/ui/ActionRepeatSaves";
import { RepeatSavePrompts } from "@/domains/combat/ui/RepeatSavePrompt";
import { PlayHp } from "@/domains/play/ui/PlayHp";
import { PlayLeft } from "@/domains/play/ui/PlayLeft";
import { PlayPrompts } from "@/domains/play/ui/PlayPrompts";
import { HelpedCheck } from "@/domains/combat/ui/HelpedCheck";
import { PlaySpeciesChoices } from "@/domains/play/ui/PlaySpeciesChoices";
import { PlayRest } from "@/domains/play/ui/PlayRest";
import { PlayTime } from "@/domains/play/ui/PlayTime";
import { PlayRight } from "@/domains/play/ui/PlayRight";
import { useAttachedCampaign } from "@/domains/play/use-attached-campaign";
import { ItemResourceCommandProvider } from "@/features/character/center/ItemResourceCommandProvider";
import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import { useSheetCombat } from "@/features/character/center/turn-state";
import { useFormActions } from "@/features/character/center/tabs/spells/use-form-actions";
import { useCollectPickups } from "@/features/character/useCollectPickups";
import { useSessionLogPlayerRecorder } from "@/features/character/useSessionLogPlayerRecorder";
import { useCharacterSubscription } from "@/hooks/useCharacterSubscription";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useLocale } from "@/hooks/useLocale";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useSheetReadonly } from "@/hooks/useSheetReadonly";
import { totalLevel } from "@/lib/classes";
import { xpProgress } from "@/lib/experience";
import { asLocale, type Locale } from "@/lib/locale";
import { localeDistance } from "@/lib/utils";
import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import type { CharacterDoc } from "@/types/character";
import {
  Button,
  Chip,
  HpRing,
  Icon,
  type IconName,
  Menu,
  PhoneBar,
  usePageMenuActions,
  useShellMenu,
  StatBadge,
  Toast,
} from "@/ui";
import type { CampaignDoc } from "@/types/campaign";
import type { RestKind } from "@/lib/play/rest-preview";

// «Sali di livello» loads only when it opens.
const LevelUpScreen = lazy(() =>
  import("@/domains/leveling/ui/LevelUpScreen").then((m) => ({
    default: m.LevelUpScreen,
  }))
);

type Section = "actions" | "resources" | "fight";
const SECTION_KEY: Record<Section, string> = {
  actions: "combat.actions",
  resources: "play.sections.resources",
  fight: "play.sections.fight",
};
const SECTION_ICON: Record<Section, IconName> = {
  actions: "g-mace",
  resources: "g-gem",
  fight: "g-journal",
};

const signed = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);

export function PlayScreen() {
  const { characterId } = useParams<{ characterId: string }>();
  const { t } = useTranslation();
  useCharacterSubscription(characterId);
  useSessionLogPlayerRecorder(characterId);
  useCollectPickups(characterId);
  const campaign = useAttachedCampaign(characterId ?? "");
  return (
    <PlaySheet
      characterId={characterId}
      campaign={campaign}
      back={{ to: "/characters", label: t("nav.characters") }}
    />
  );
}

/**
 * The Play sheet itself, for whoever loaded the character into the store: the owner's
 * route above, or the DM's read-only view of a party member (`MemberSheetScreen`),
 * which brings its own campaign and its way back.
 */
export function PlaySheet({
  characterId,
  campaign,
  back,
}: {
  characterId: string | undefined;
  campaign: CampaignDoc | null;
  /** The way back; `crumb` also draws it above the sheet on a laptop (the DM's view of
   *  a member, D&D Beyond's «back to campaign»), where the owner has the app's nav. */
  back: { to: string; label: string; crumb?: boolean };
}) {
  const { t } = useTranslation();
  const locale = asLocale(useLocale().language);
  const doc = useCharacterStore((s) => s.character);
  const [toast, setToast] = useState<string | null>(null);
  const error = useCharacterStore((s) => s.error);
  useDocumentTitle(doc?.character.name);
  const openMenu = useShellMenu();
  const fight = useSheetCombat();
  // A fight, the table's or a solo one (started, or past round 1): no rest in it.
  const soloFight = useCombatStore((s) => s.fightStarted || s.round > 1);
  const inFight = !!fight || soloFight;
  // The phone shows one section at a time (D&D Beyond's model), picked from «Sezioni».
  const [section, setSection] = useState<Section>("actions");
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const [resting, setResting] = useState<RestKind | null>(null);
  const [passing, setPassing] = useState(false);
  const readonly = useSheetReadonly();
  const navigate = useNavigate();
  const levelling = useMatch("/characters/:characterId/level-up") !== null;
  // «Sali di livello» lives in the menu (⋯), so the rest row stays one line (x-play)
  const levelUp =
    doc && doc.id === characterId && !readonly && totalLevel(doc.character) < 20
      ? () => void navigate(`/characters/${doc.id}/level-up`)
      : null;
  usePageMenuActions(
    levelUp
      ? [{ label: t("levelUp.screen.levelUp"), icon: "g-create", onSelect: levelUp }]
      : []
  );

  if (!doc || doc.id !== characterId) {
    return (
      <main id="main" className="f-page f-sheet">
        <p role="status">{t(error ? "campaignScreen.notFound" : "character.loading")}</p>
      </main>
    );
  }
  // «Sali di livello» takes the whole page (the moment, not a dialog over the sheet).
  if (levelling && !readonly && totalLevel(doc.character) < 20) {
    return (
      <Suspense fallback={null}>
        <LevelUpScreen
          doc={doc}
          locale={locale}
          onClose={() => void navigate(`/characters/${doc.id}`, { replace: true })}
        />
      </Suspense>
    );
  }
  const view = playHeaderView(doc, locale);
  const rests = (
    <>
      <Button
        icon="g-rest-short"
        aria-haspopup="dialog"
        disabled={inFight}
        title={inFight ? t("play.rest.inFight") : undefined}
        onClick={() => setResting("short")}
      >
        {t("play.rest.short")}
      </Button>
      <Button
        icon="g-rest-long"
        aria-haspopup="dialog"
        disabled={inFight}
        title={inFight ? t("play.rest.inFight") : undefined}
        onClick={() => setResting("long")}
      >
        {t("play.rest.long")}
      </Button>
      {/* In a fight the rounds keep the time (prototype: exploration only). */}
      {!inFight && (
        <Button icon="u-time" aria-haspopup="dialog" onClick={() => setPassing(true)}>
          {t("play.time.title")}
        </Button>
      )}
    </>
  );
  const sections: Section[] = [
    "actions",
    "resources",
    // the fight and the session report: always there (a solo hero's report, too)
    "fight",
  ];
  return (
    <main id="main" className="f-page f-sheet">
      <PhoneBar>
        <Link className="f-tb-back" to={back.to} aria-label={back.label}>
          <Icon name="u-back" size={20} />
        </Link>
        <span className="f-tb-gap" />
        <button
          type="button"
          className="f-tb-back"
          aria-label={t("shell.menu")}
          aria-haspopup="dialog"
          onClick={openMenu}
        >
          <Icon name="u-more" size={20} />
        </button>
      </PhoneBar>
      {back.crumb && (
        <div className="f-crumbs">
          <Link className="f-crumb" to={back.to}>
            <Icon name="u-back" size={16} />
            {back.label}
          </Link>
          {/* someone else's sheet: every control is read-only, and it says so */}
          {readonly && <Chip>{t("dmView.readonly")}</Chip>}
        </div>
      )}
      <PlayHeader
        doc={doc}
        view={view}
        locale={locale}
        campaign={campaign}
        rests={rests}
        onLevelUp={levelUp}
      />
      {/* an XP table that reached the next level: the note, its one action */}
      {levelUp &&
        doc.character.experience !== undefined &&
        xpProgress(doc.character.experience, totalLevel(doc.character)).canLevelUp && (
          <div className="f-note f-save-due" data-c="res" role="status">
            <p>{t("character.levelUpReady")}</p>
            <div className="f-acts">
              <Button kind="primary" onClick={levelUp}>
                {t("levelUp.screen.levelUp")}
              </Button>
            </div>
          </div>
        )}
      <PlaySpeciesChoices doc={doc} locale={locale} readonly={readonly} />
      {/* The engine's turn context, the same one the cockpit mounts, so a turn is
          committed one way only; its questions are drawn here (PlayPrompts). */}
      <ItemResourceCommandProvider renderPrompts={false}>
        <TurnEconomyProvider renderPrompts={false}>
          <div className="f-play" data-section={section}>
            <PlayLeft doc={doc} locale={locale} rests={readonly ? undefined : rests} />
            <PlayCentre
              doc={doc}
              locale={locale}
              campaign={campaign}
              onShortRest={readonly ? undefined : () => setResting("short")}
            />
            <PlayRight campaign={campaign} locale={locale} onToast={setToast} />
          </div>
          <PlayPrompts locale={locale} />
          {passing && (
            <PlayTime doc={doc} locale={locale} onClose={() => setPassing(false)} />
          )}
          {resting && (
            <PlayRest
              doc={doc}
              kind={resting}
              locale={locale}
              onClose={() => setResting(null)}
            />
          )}
        </TurnEconomyProvider>
      </ItemResourceCommandProvider>
      <nav className="f-secbar" aria-label={t("palette.groupSections")}>
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => setSectionsOpen(true)}
        >
          <Icon name="u-sections" size={24} />
          {t("palette.groupSections")}
        </button>
      </nav>
      <Menu
        open={sectionsOpen}
        onClose={() => setSectionsOpen(false)}
        title={t("palette.groupSections")}
      >
        {sections.map((id) => (
          <button
            key={id}
            type="button"
            className="f-menu-it"
            aria-current={section === id || undefined}
            onClick={() => {
              setSection(id);
              setSectionsOpen(false);
              window.scrollTo({ top: 0 });
            }}
          >
            <Icon name={SECTION_ICON[id]} />
            {t(SECTION_KEY[id])}
          </button>
        ))}
      </Menu>
      {toast && <Toast>{toast}</Toast>}
    </main>
  );
}

function PlayHeader({
  doc,
  view,
  locale,
  campaign,
  rests,
  onLevelUp,
}: {
  doc: CharacterDoc;
  view: PlayHeaderView;
  locale: Locale;
  campaign: CampaignDoc | null;
  rests: ReactNode;
  onLevelUp: (() => void) | null;
}) {
  const { t } = useTranslation();
  const readonly = useSheetReadonly();
  // The player's own combatant: a repeat save due on it waits here.
  const fight = useCombatStatusStore((st) => st.status);
  const uid = useAuthStore((st) => st.user?.uid);
  // «Danni e cure», and which of its actions leads (the button that opened it).
  const [hpOpen, setHpOpen] = useState<false | "damage" | "heal">(false);
  const [moreOpen, setMoreOpen] = useState(false);
  // The phone's band is D&D Beyond's: a smaller portrait beside the name.
  const narrow = useMediaQuery("(max-width: 800px)");
  const tiny = useMediaQuery("(max-width: 400px)");
  return (
    <section className="f-hero f-char" data-identity="" aria-label={view.name}>
      <div className="f-char-medal">
        <HpRing
          hp={view.hp.current}
          max={view.hp.max}
          temp={view.hp.temp}
          size={tiny ? 86 : narrow ? 88 : 120}
          portrait={view.portraitUrl ?? undefined}
          name={view.name}
          ornate
        />
      </div>
      <div className="f-char-id">
        <h1>{view.name}</h1>
        {/* the phone keeps the prototype's short line (x-play-m): classes and species */}
        <p className="f-hero-sub">
          {(tiny ? view.identityShort : view.identity).join(" · ")}
        </p>
        {/* D&D Beyond's header buttons: the rests, the campaign. */}
        {(!readonly || campaign) && (
          <div className="f-char-acts">
            {!readonly && rests}
            {campaign && (
              <Link
                className="f-btn f-char-camp"
                data-kind="ghost"
                to={`/campaigns/${campaign.id}`}
                title={campaign.name}
              >
                <Icon name="g-campaign" />
                <span>{campaign.name}</span>
              </Link>
            )}
          </div>
        )}
        {(!readonly ||
          view.form ||
          view.concentration ||
          view.effects > 0 ||
          view.conditions > 0 ||
          doc.session.inspiration ||
          Boolean(doc.session.bardicInspirationDie)) && (
          <div className="f-char-chips">
            {/* What the character is now (a form, a held spell) on its own line, then
                the three status chips always on one line, so the row never reflows. */}
            {(view.form || view.concentration) && (
              <div className="f-chips">
                {/* In a form the sheet is the beast's: say so first (the source, then it). */}
                {view.form && (
                  <Chip kind="form">{`${view.form.source}: ${view.form.beast}`}</Chip>
                )}
                {view.form && !readonly && <RevertForm />}
                <PlayConcentration doc={doc} locale={locale} />
              </div>
            )}
            <div className="f-chips f-chips-status">
              <PlayInspiration doc={doc} />
              <PlayEffects doc={doc} locale={locale} />
              <PlayConditions doc={doc} locale={locale} />
            </div>
          </div>
        )}
      </div>
      <dl className="f-abilities f-char-abil">
        {view.abilities.map((a) => (
          <div key={a.id} className="f-ability" data-save={a.save || undefined}>
            <dt className="f-lbl">{t(`abilities.${a.id}_short`)}</dt>
            <dd>
              <b>{signed(a.mod)}</b>
              <span>{a.score}</span>
            </dd>
            <PlayAbilitySave ability={a} />
          </div>
        ))}
      </dl>
      <div className="f-char-stats">
        <StatBadge shape="shield" value={String(view.numbers.ac)} label={t("stats.ac")} />
        <StatBadge
          shape="hex"
          value={signed(view.numbers.initiative)}
          label={t("character.vitals.initAria")}
        />
        <StatBadge
          shape="hex"
          value={localeDistance(view.numbers.speedFt, locale)}
          label={t("character.speed")}
        />
        {/* The phone's band keeps D&D Beyond's three: CA, Initiative, Speed. */}
        {!narrow && (
          <StatBadge
            shape="hex"
            value={signed(view.numbers.proficiency)}
            label={t("play.proficiency")}
          />
        )}
      </div>
      {/* The Hit Points open «Danni e cure» (a read-only sheet only shows them). */}
      {readonly ? (
        <div className="f-char-hp">
          <HpReadout view={view} />
        </div>
      ) : (
        <div className="f-char-hp">
          <button
            type="button"
            className="f-char-hp-open"
            aria-haspopup="dialog"
            aria-label={`${t("play.hp.title")}: ${String(view.hp.current)} / ${String(view.hp.max)}`}
            onClick={() => setHpOpen("damage")}
          >
            <HpReadout view={view} />
          </button>
          {/* D&D Beyond's two buttons under the Hit Points; both open «Danni e cure». */}
          <div className="f-char-hp-acts">
            <Button
              icon="g-hp-damage"
              aria-haspopup="dialog"
              onClick={() => setHpOpen("damage")}
            >
              {t("mechanics.cast.optionDamage")}
            </Button>
            <Button
              icon="g-hp-heal"
              aria-haspopup="dialog"
              onClick={() => setHpOpen("heal")}
            >
              {t("combat.heal")}
            </Button>
          </div>
          <PlayDown doc={doc} />
          {/* What waits on this character (a save due, Help's Advantage): one
              container with its own row on a phone, never a stray grid cell. */}
          <div className="f-char-notes">
            <PlayConcentrationSave doc={doc} />
            {uid && <RepeatSavePrompts targetIds={[`pc-${uid}`]} locale={locale} />}
            {fight && (
              <HelpedCheck
                campaignId={fight.campaignId}
                effectOps={fight.encounter.effectOps}
                targetId={fight.myId}
              />
            )}
            {fight?.isMyTurn && (
              <ActionRepeatSaves
                campaignId={fight.campaignId}
                effectOps={fight.encounter.effectOps}
                targetId={fight.myId}
                locale={locale}
                spendAction
              />
            )}
          </div>
        </div>
      )}
      {hpOpen && (
        <PlayHp
          doc={doc}
          locale={locale}
          intent={hpOpen}
          onClose={() => setHpOpen(false)}
        />
      )}
      {/* the character's other actions (⋯, D&D Beyond's header menu): «Sali di livello» */}
      {onLevelUp && (
        <>
          <button
            type="button"
            className="f-btn f-char-more"
            data-kind="ghost"
            aria-label={t("shell.menu")}
            aria-haspopup="dialog"
            onClick={() => setMoreOpen(true)}
          >
            <Icon name="u-more" />
          </button>
          <Menu open={moreOpen} onClose={() => setMoreOpen(false)} title={view.name}>
            <button
              type="button"
              className="f-menu-it"
              onClick={() => {
                setMoreOpen(false);
                onLevelUp();
              }}
            >
              <Icon name="g-create" />
              {t("levelUp.screen.levelUp")}
            </button>
          </Menu>
        </>
      )}
    </section>
  );
}

/** The header's Hit Points: label, temporary HP, current / max (phrasing only, so it
 *  can sit inside the button that opens «Danni e cure»). */
function HpReadout({ view }: { view: PlayHeaderView }) {
  const { t } = useTranslation();
  const share = view.hp.max > 0 ? view.hp.current / view.hp.max : 0;
  return (
    <>
      <span className="f-char-hp-head">
        <span className="f-lbl">{t("play.hpTitle")}</span>
        {view.hp.temp > 0 && (
          <span className="f-char-temp">{t("play.temp", { count: view.hp.temp })}</span>
        )}
      </span>
      <span className="f-char-hp-v">
        <b data-hp={share > 0.5 ? "ok" : share > 0.25 ? "low" : "bad"}>
          {view.hp.current}
        </b>
        <span>{"/ " + String(view.hp.max)}</span>
      </span>
    </>
  );
}

/** Back to your own form in one tap, with its undo toast. */
function RevertForm() {
  const { t } = useTranslation();
  const { revert } = useFormActions();
  return <Chip onClick={revert}>{t("polymorph.revert")}</Chip>;
}
