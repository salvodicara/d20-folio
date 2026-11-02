/**
 * The new character sheet's Play screen (approved prototype x-play), behind VITE_NEW_UI.
 * It loads the character exactly as today's sheet does (the live doc with its combat
 * state, the session-log recorder, pickups collected on load) and shows it through the
 * engine's pure views only. This first slice is the identity band: portrait in its HP
 * ring, name and identity line, what is going on, the six abilities, the four header
 * numbers and HP.
 */
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";

import { playHeaderView, type PlayHeaderView } from "@/domains/play/play-header-view";
import { useCollectPickups } from "@/features/character/useCollectPickups";
import { useSessionLogPlayerRecorder } from "@/features/character/useSessionLogPlayerRecorder";
import { useCharacterSubscription } from "@/hooks/useCharacterSubscription";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useLocale } from "@/hooks/useLocale";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { asLocale } from "@/lib/locale";
import { localeDistance } from "@/lib/utils";
import { useCharacterStore } from "@/stores/characterStore";
import { Chip, HpRing, StatBadge } from "@/ui";

const signed = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);

export function PlayScreen() {
  const { characterId } = useParams<{ characterId: string }>();
  const { t } = useTranslation();
  const locale = asLocale(useLocale().language);
  useCharacterSubscription(characterId);
  useSessionLogPlayerRecorder(characterId);
  useCollectPickups(characterId);
  const doc = useCharacterStore((s) => s.character);
  const error = useCharacterStore((s) => s.error);
  useDocumentTitle(doc?.character.name);

  if (!doc || doc.id !== characterId) {
    return (
      <main id="main" className="f-page">
        <p role="status">{t(error ? "campaignScreen.notFound" : "character.loading")}</p>
      </main>
    );
  }
  return (
    <main id="main" className="f-page">
      <PlayHeader view={playHeaderView(doc, locale)} locale={locale} />
    </main>
  );
}

function PlayHeader({ view, locale }: { view: PlayHeaderView; locale: string }) {
  const { t } = useTranslation();
  // The phone's band is D&D Beyond's: a smaller portrait beside the name.
  const narrow = useMediaQuery("(max-width: 800px)");
  const tiny = useMediaQuery("(max-width: 400px)");
  const share = view.hp.max > 0 ? view.hp.current / view.hp.max : 0;
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
        {(view.concentration || view.effects > 0 || view.conditions > 0) && (
          <div className="f-chips">
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
      <div className="f-char-hp">
        <div className="f-char-hp-head">
          <span className="f-lbl">{t("play.hpTitle")}</span>
          {view.hp.temp > 0 && (
            <span className="f-char-temp">{t("play.temp", { count: view.hp.temp })}</span>
          )}
        </div>
        <div className="f-char-hp-v">
          <b data-hp={share > 0.5 ? "ok" : share > 0.25 ? "low" : "bad"}>
            {view.hp.current}
          </b>
          <span>{"/ " + String(view.hp.max)}</span>
        </div>
      </div>
    </section>
  );
}
