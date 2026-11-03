/**
 * The new character sheet's Play screen (approved prototype x-play), behind VITE_NEW_UI.
 * It loads the character exactly as today's sheet does (the live doc with its combat
 * state, the session-log recorder, pickups collected on load) and shows it through the
 * engine's pure views only. This first slice is the identity band: portrait in its HP
 * ring, name and identity line, what is going on, the six abilities, the four header
 * numbers and HP.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";

import { playHeaderView, type PlayHeaderView } from "@/domains/play/play-header-view";
import { PlayCentre } from "@/domains/play/ui/PlayCentre";
import { PlayHp } from "@/domains/play/ui/PlayHp";
import { PlayLeft } from "@/domains/play/ui/PlayLeft";
import { PlayPrompts } from "@/domains/play/ui/PlayPrompts";
import { PlayRight } from "@/domains/play/ui/PlayRight";
import { ItemResourceCommandProvider } from "@/features/character/center/ItemResourceCommandProvider";
import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import { useFormActions } from "@/features/character/center/tabs/spells/use-form-actions";
import { useCollectPickups } from "@/features/character/useCollectPickups";
import { useSessionLogPlayerRecorder } from "@/features/character/useSessionLogPlayerRecorder";
import { useCharacterSubscription } from "@/hooks/useCharacterSubscription";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useLocale } from "@/hooks/useLocale";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useSheetReadonly } from "@/hooks/useSheetReadonly";
import { asLocale, type Locale } from "@/lib/locale";
import { localeDistance } from "@/lib/utils";
import { useCharacterStore } from "@/stores/characterStore";
import type { CharacterDoc } from "@/types/character";
import { Chip, HpRing, StatBadge, Toast } from "@/ui";

const signed = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);

export function PlayScreen() {
  const { characterId } = useParams<{ characterId: string }>();
  const { t } = useTranslation();
  const locale = asLocale(useLocale().language);
  useCharacterSubscription(characterId);
  useSessionLogPlayerRecorder(characterId);
  useCollectPickups(characterId);
  const doc = useCharacterStore((s) => s.character);
  const [toast, setToast] = useState<string | null>(null);
  const error = useCharacterStore((s) => s.error);
  useDocumentTitle(doc?.character.name);

  if (!doc || doc.id !== characterId) {
    return (
      <main id="main" className="f-page f-sheet">
        <p role="status">{t(error ? "campaignScreen.notFound" : "character.loading")}</p>
      </main>
    );
  }
  return (
    <main id="main" className="f-page f-sheet">
      <PlayHeader doc={doc} view={playHeaderView(doc, locale)} locale={locale} />
      {/* The engine's turn context, the same one the cockpit mounts, so a turn is
          committed one way only; its questions are drawn here (PlayPrompts). */}
      <ItemResourceCommandProvider renderPrompts={false}>
        <TurnEconomyProvider renderPrompts={false}>
          <div className="f-play">
            <PlayLeft doc={doc} locale={locale} />
            <PlayCentre doc={doc} locale={locale} />
            <PlayRight characterId={doc.id} locale={locale} onToast={setToast} />
          </div>
          <PlayPrompts locale={locale} />
        </TurnEconomyProvider>
      </ItemResourceCommandProvider>
      {toast && <Toast>{toast}</Toast>}
    </main>
  );
}

function PlayHeader({
  doc,
  view,
  locale,
}: {
  doc: CharacterDoc;
  view: PlayHeaderView;
  locale: Locale;
}) {
  const { t } = useTranslation();
  const readonly = useSheetReadonly();
  const [hpOpen, setHpOpen] = useState(false);
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
          size={tiny ? 64 : narrow ? 88 : 136}
          portrait={view.portraitUrl ?? undefined}
          name={view.name}
        />
      </div>
      <div className="f-char-id">
        <h1>{view.name}</h1>
        <p className="f-hero-sub">{view.identity.join(" · ")}</p>
        {(view.form || view.concentration || view.effects > 0 || view.conditions > 0) && (
          <div className="f-chips">
            {/* In a form the sheet is the beast's: say so first (the source, then it). */}
            {view.form && (
              <Chip kind="form">{`${view.form.source}: ${view.form.beast}`}</Chip>
            )}
            {view.form && !readonly && <RevertForm />}
            {view.concentration && <Chip kind="conc">{view.concentration}</Chip>}
            {view.effects > 0 && (
              <Chip kind="buff">{`${t("play.effects")} ${String(view.effects)}`}</Chip>
            )}
            {view.conditions > 0 && (
              <Chip kind="cond">{`${t("combat.effectReview.conditions")} ${String(view.conditions)}`}</Chip>
            )}
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
        <button
          type="button"
          className="f-char-hp"
          aria-haspopup="dialog"
          aria-label={`${t("play.hp.title")}: ${String(view.hp.current)} / ${String(view.hp.max)}`}
          onClick={() => setHpOpen(true)}
        >
          <HpReadout view={view} />
        </button>
      )}
      {hpOpen && <PlayHp doc={doc} locale={locale} onClose={() => setHpOpen(false)} />}
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
