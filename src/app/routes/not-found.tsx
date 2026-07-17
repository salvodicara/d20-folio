/**
 * NotFoundPage — the catch-all for unknown protected routes (C1).
 *
 * A typo'd id, a stale bookmark, or a deleted-character link used to render an
 * empty AppShell outlet with no way back. This mounts on the `path="*"` route
 * inside the shell and offers a single clear recovery: back to the roster.
 *
 * Reuses the shared `RunicEmptyState` hero (one empty-state primitive) and owns
 * its own `<main id="main">` landmark like every other page (AppShell renders
 * no <main>). Fully localized (EN + IT `notFound.*`).
 */

import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Compass } from "lucide-react";
import { RunicEmptyState } from "@/components/ui/runic-empty-state";
import { Button } from "@/components/ui/button";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export function NotFoundPage() {
  const { t } = useTranslation();
  useDocumentTitle(t("notFound.title"));
  const navigate = useNavigate();

  return (
    <main id="main" className="page-shell on-art-scope py-8">
      <RunicEmptyState
        glyph={Compass}
        eyebrow={t("notFound.eyebrow")}
        title={t("notFound.title")}
        blurb={t("notFound.blurb")}
        actions={
          <Button size="lg" onClick={() => void navigate("/characters")}>
            {t("notFound.back")}
          </Button>
        }
      />
    </main>
  );
}
