/**
 * The unknown page on the new frame: one tile that says so and leads back to the
 * characters (the roster's empty-tile grammar; D&D Beyond's 404 is the same single
 * message and one way home).
 */
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";

import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { Button, Icon } from "@/ui";

export function NotFoundScreen() {
  const { t } = useTranslation();
  useDocumentTitle(t("notFound.title"));
  const navigate = useNavigate();
  return (
    <main id="main" className="f-page f-roster">
      <section className="f-roster-empty f-notfound">
        <div className="f-tile">
          <Icon name="g-compass" size={48} />
          <span className="f-lbl">{t("notFound.eyebrow")}</span>
          <h1>{t("notFound.title")}</h1>
          <span>{t("notFound.blurb")}</span>
          <Button kind="primary" onClick={() => void navigate("/characters")}>
            {t("notFound.back")}
          </Button>
        </div>
      </section>
    </main>
  );
}
