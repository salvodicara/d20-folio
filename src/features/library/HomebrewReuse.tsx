import { instanceVersionLabel, isBundledSnapshot } from "@/lib/homebrew/instances";
import { useEffect, useState, useRef } from "react";
import type { FolioCharacter } from "@/lib/identity/model";
import type { SessionController } from "@/lib/identity/session";
import type { LibraryVersion } from "@/lib/library/model";
import type { InstanceRepository, HomebrewInstance } from "@/lib/homebrew/instances";
import { conformDefinition } from "@/lib/homebrew/conformance";
import { LibraryDialog } from "./LibraryDialog";
import { LibraryComparison } from "./LibraryComparison";
import { HomebrewReader } from "./HomebrewReader";
import { useHomebrewLabel } from "./homebrew-labels";
import { useLibraryOperation } from "./useLibraryOperation";
import { useTranslation } from "react-i18next";
import { libraryKey } from "./labels";
export function HomebrewReuse({
  version,
  characters,
  repository,
  session,
  onClose,
  onOpen,
}: {
  version: LibraryVersion;
  characters: readonly FolioCharacter[];
  repository: InstanceRepository;
  session: SessionController;
  onClose: () => void;
  onOpen: (character: FolioCharacter) => void;
}) {
  const label = useHomebrewLabel(),
    { t } = useTranslation("common");
  const [id, setId] = useState(""),
    [added, setAdded] = useState(false);
  const op = useLibraryOperation(
    repository,
    session,
    "instance-add:" + version.entryId,
    () => setAdded(true)
  );
  const selectedId = id || op.state?.envelope.character.id;
  const character = characters.find((c) => c.id === selectedId);
  const [copies, setCopies] = useState<HomebrewInstance[] | null>(null),
    [loadError, setLoadError] = useState(false);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  const invalid = conformDefinition(version.definition).some(
    (d) => d.severity === "invalid"
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
  useEffect(() => {
    let live = true;
    const check = session.ticket();
    if (!character) return;
    void repository
      .list(character)
      .then((items) => {
        check();
        if (live)
          setCopies(
            items.filter(
              (item) =>
                !isBundledSnapshot(item.snapshot) &&
                item.snapshot.entryId === version.entryId
            )
          );
      })
      .catch(
        session.guard(() => {
          if (live) setLoadError(true);
        })
      );
    return () => {
      live = false;
    };
  }, [repository, session, character, version.entryId]);
  return (
    <LibraryDialog
      title={label("reuseTitle")}
      description={label("reuseHelp")}
      onClose={() => {
        if (!op.busy) onClose();
      }}
    >
      <p>
        {label("version")} {version.version}
      </p>
      <HomebrewReader definition={version.definition} />
      <label>
        {label("character")}
        <select
          disabled={op.busy || added}
          value={selectedId ?? ""}
          onChange={(e) => {
            setId(e.target.value);
            setCopies(null);
            setLoadError(false);
          }}
        >
          <option value="">{label("chooseCharacter")}</option>
          {characters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      {character && (
        <section>
          <h3>{label("existingCopies")}</h3>
          {copies?.length === 0 && <p>{label("noMatchingCopies")}</p>}
          {copies?.map((copy) => (
            <details key={copy.id}>
              <summary>
                {copy.snapshot.definition.name} · {label("version")}{" "}
                {instanceVersionLabel(copy.snapshot)} · {label("quantity")}{" "}
                {copy.state.quantity}
              </summary>
              <LibraryComparison
                before={copy.snapshot.definition}
                after={version.definition}
              />
            </details>
          ))}
          {loadError && <p role="alert">{label("unavailable")}</p>}
        </section>
      )}
      {invalid && <p role="alert">{label("checkContent")}</p>}
      {op.state && <p role="status">{t(libraryKey(op.state.status))}</p>}
      {op.error && <p role="alert">{label("unavailable")}</p>}
      {op.state?.status === "unknown" && (
        <button onClick={() => void op.retry()}>{t(libraryKey("retry"))}</button>
      )}
      {added ? (
        <>
          <p role="status">{label("added")}</p>
          <button
            onClick={() => {
              if (character) {
                onClose();
                onOpen(character);
              }
            }}
          >
            {label("openCharacter")}
          </button>
        </>
      ) : (
        <button
          disabled={
            !character ||
            copies === null ||
            loadError ||
            invalid ||
            op.busy ||
            !navigator.onLine
          }
          onClick={() => {
            if (character) void op.run(() => repository.addIntent(character, version));
          }}
        >
          {label("confirmReuse")}
        </button>
      )}
    </LibraryDialog>
  );
}
