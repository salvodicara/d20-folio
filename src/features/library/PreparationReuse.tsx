import { useEffect, useRef, useState } from "react";
import type { FolioCampaign } from "@/lib/identity/model";
import type { SessionController } from "@/lib/identity/session";
import type { LibraryVersion } from "@/lib/library/model";
import {
  defaultPreparedState,
  type PreparationRepository,
} from "@/lib/homebrew/preparation";
import { conformDefinition } from "@/lib/homebrew/conformance";
import { LibraryDialog } from "./LibraryDialog";
import { HomebrewReader } from "./HomebrewReader";
import { useHomebrewLabel } from "./homebrew-labels";
import { useLibraryOperation } from "./useLibraryOperation";
import { libraryKey } from "./labels";
import { useTranslation } from "react-i18next";
export function PreparationReuse({
  version,
  campaign,
  repository,
  session,
  onClose,
  onOpen,
}: {
  version: LibraryVersion;
  campaign: FolioCampaign | undefined;
  repository: PreparationRepository;
  session: SessionController;
  onClose: () => void;
  onOpen: (preparationId: string | null) => void;
}) {
  const label = useHomebrewLabel(),
    { t } = useTranslation("common");
  const monster = version.definition.family === "monster";
  const [preparationId, setPreparationId] = useState("encounter"),
    [added, setAdded] = useState(false);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  const op = useLibraryOperation(
    repository,
    session,
    "preparation-add:" + version.entryId,
    (operation) => {
      setPreparationId(operation.preparationId ?? "encounter");
      setAdded(true);
    }
  );
  useEffect(() => {
    let live = true;
    const stop = session.track(() => {
      if (live) close.current();
    });
    return () => {
      live = false;
      stop();
    };
  }, [session]);
  const invalid = conformDefinition(version.definition).some(
    (d) => d.severity === "invalid"
  );
  return (
    <LibraryDialog
      title={label(monster ? "prepareTitle" : "activateTitle")}
      description={label("preparationHelp")}
      onClose={() => {
        if (!op.busy) onClose();
      }}
    >
      <h3>{version.definition.name}</h3>
      <p>
        {label("version")} {version.version} ·{" "}
        {campaign?.name ?? label("chooseCampaignFirst")}
      </p>
      <details>
        <summary>{label("preview")}</summary>
        <HomebrewReader definition={version.definition} />
      </details>
      {monster && (
        <label>
          {label("preparationName")}
          <input
            name="preparation-id"
            value={preparationId}
            maxLength={80}
            disabled={op.busy || added}
            onChange={(e) => setPreparationId(e.target.value)}
          />
        </label>
      )}
      {op.state && <p role="status">{t(libraryKey(op.state.status))}</p>}
      {op.error && <p role="alert">{label("preparationFailed")}</p>}
      {op.state?.status === "unknown" && (
        <button onClick={() => void op.retry()}>{label("reconcileCopy")}</button>
      )}
      {added ? (
        <button
          className="identity-primary"
          onClick={() => onOpen(monster ? preparationId : null)}
        >
          {label("openDestination")}
        </button>
      ) : (
        <button
          className="identity-primary"
          disabled={
            !campaign ||
            campaign.archived ||
            invalid ||
            op.busy ||
            !navigator.onLine ||
            (monster && !/^[A-Za-z0-9_-]{1,80}$/.test(preparationId))
          }
          onClick={() =>
            void op.run(() =>
              campaign
                ? repository.addIntent(
                    campaign,
                    version,
                    monster ? preparationId : null,
                    monster
                      ? defaultPreparedState(version)
                      : { kind: "campaign-rule", enabled: true }
                  )
                : null
            )
          }
        >
          {label(monster ? "prepareCopy" : "activateCopy")}
        </button>
      )}
    </LibraryDialog>
  );
}
