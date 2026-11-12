/**
 * A character share link on the new frame (`/view/:uid/:charId`, public: the reader has
 * no account): the same Play sheet the player sees, every control read-only, with «Sola
 * lettura» beside the way to Folio. A link that no longer shares the character says so in
 * one tile (the unknown page's grammar). The same loader as the old view (one source),
 * and the page asks search engines not to index it.
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";

import { PlaySheet } from "@/domains/play/ui/PlayScreen";
import { loadSharedCharacter, useNoIndex } from "@/features/character/shared-character";
import { useCharacterStore } from "@/stores/characterStore";
import { Button, Icon } from "@/ui";

export function SharedScreen() {
  const { uid, charId } = useParams<{ uid: string; charId: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  useNoIndex();
  const link = `${uid ?? ""}/${charId ?? ""}`;
  const [settled, setSettled] = useState<{ link: string; shared: boolean } | null>(null);
  useEffect(() => {
    if (!uid || !charId) return;
    let cancelled = false;
    const settle = (shared: boolean) => {
      if (!cancelled) setSettled({ link: `${uid}/${charId}`, shared });
    };
    loadSharedCharacter(uid, charId)
      .then((doc) => {
        if (cancelled || !doc) return settle(false);
        useCharacterStore.getState().loadReadonly(doc);
        settle(true);
      })
      .catch(() => settle(false));
    return () => {
      cancelled = true;
      useCharacterStore.getState().loadReadonly(null);
    };
  }, [uid, charId]);
  const state =
    !uid || !charId
      ? "unavailable"
      : settled?.link !== link
        ? "loading"
        : settled.shared
          ? "shared"
          : "unavailable";
  if (state === "loading")
    return (
      <main id="main" className="f-page f-sheet">
        <p role="status">{t("character.loading")}</p>
      </main>
    );
  if (state === "unavailable")
    return (
      <main id="main" className="f-page f-roster">
        <section className="f-roster-empty f-notfound">
          <div className="f-tile">
            <Icon name="u-link" size={48} />
            <h1>{t("share.unavailableTitle")}</h1>
            <span>{t("share.unavailableBlurb")}</span>
            <Button kind="primary" onClick={() => void navigate("/")}>
              {t("share.unavailableCta")}
            </Button>
          </div>
        </section>
      </main>
    );
  return (
    <PlaySheet
      characterId={charId}
      campaign={null}
      back={{ to: "/", label: t("share.unavailableCta"), crumb: true }}
    />
  );
}
