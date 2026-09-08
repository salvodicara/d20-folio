import { useState } from "react";
import type { FolioCharacter } from "@/lib/identity/model";
import type { SessionController } from "@/lib/identity/session";
import type { LibraryRepository, LibraryVersion } from "@/lib/library/model";
import type { OriginBuildRepository } from "@/lib/homebrew/origin-build-repository";
import { OriginBuildEditor } from "./OriginBuild";
import { useOriginBuild } from "./useOriginBuild";
import { LibraryDialog } from "./LibraryDialog";
import { useHomebrewLabel } from "./homebrew-labels";
export function OriginReuse({
  version,
  characters,
  repository,
  library,
  session,
  onClose,
  onOpen,
}: {
  version: LibraryVersion;
  characters: readonly FolioCharacter[];
  repository: OriginBuildRepository;
  library: LibraryRepository;
  session: SessionController;
  onClose: () => void;
  onOpen: (character: FolioCharacter) => void;
}) {
  const label = useHomebrewLabel();
  const [id, setId] = useState(""),
    [added, setAdded] = useState(false);
  const character = characters.find((c) => c.id === id) ?? null;
  const loaded = useOriginBuild(character, repository, session);
  if (character && !loaded.loading && !loaded.error && !added)
    return (
      <OriginBuildEditor
        key={character.id}
        character={character}
        loaded={loaded}
        version={version}
        repository={repository}
        library={library}
        session={session}
        onClose={onClose}
        onDone={() => setAdded(true)}
      />
    );
  return (
    <LibraryDialog
      title={label("origin.reuseTitle")}
      description={label("origin.reuseHelp")}
      onClose={onClose}
    >
      <h3>
        {version.definition.name} · {label("version")} {version.version}
      </h3>
      <label>
        {label("character")}
        <select disabled={added} value={id} onChange={(e) => setId(e.target.value)}>
          <option value="">{label("chooseCharacter")}</option>
          {characters.map((c) => (
            <option value={c.id} key={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      {loaded.loading && character && <p role="status">{label("origin.loadingBuild")}</p>}
      {loaded.error && <p role="alert">{label("origin.unavailableBuild")}</p>}
      {added && character && (
        <>
          <p role="status">{label("origin.savedBuild")}</p>
          <button
            onClick={() => {
              onClose();
              onOpen(character);
            }}
          >
            {label("openCharacter")}
          </button>
        </>
      )}
    </LibraryDialog>
  );
}
