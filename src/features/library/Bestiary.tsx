import { useEffect, useState } from "react";
import type {
  LibraryEntry,
  LibraryRepository,
  LibraryVersion,
} from "@/lib/library/model";
import type { SessionController } from "@/lib/identity/session";
import { HomebrewReader } from "./HomebrewReader";
import { HomebrewExport } from "./HomebrewPortable";
import { useHomebrewLabel } from "./homebrew-labels";

/** A view of immutable Library versions: no second creature catalogue. */
export function Bestiary({
  entries,
  repository,
  session,
  onReuse,
  query,
  onQueryChange,
  selected,
  onSelect,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  selected: string | null;
  onSelect: (id: string) => void;
  entries: LibraryEntry[] | null;
  repository: LibraryRepository;
  session: SessionController;
  onReuse?: (version: LibraryVersion) => void;
}) {
  const label = useHomebrewLabel();
  const [versions, setVersions] = useState<LibraryVersion[]>([]);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    const check = session.ticket();
    void Promise.all(
      (entries ?? [])
        .filter((e) => e.draft.family === "monster" && e.stableVersion > 0)
        .map((e) =>
          repository.readVersion({ ownerUid: e.ownerUid, id: e.id }, e.stableVersion)
        )
    )
      .then((values) => {
        check();
        if (live) {
          setVersions(values);
          setFailed(false);
        }
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    const stop = session.track(() => {
      if (live) {
        setVersions([]);
      }
    });
    return () => {
      live = false;
      stop();
    };
  }, [entries, repository, session]);
  const available = versions.filter((v) =>
    entries?.some((e) => e.id === v.entryId && e.stableVersion === v.version)
  );
  const current = available.find((v) => v.entryId === selected);
  const visible = available.filter((v) =>
    [v.definition.name, v.definition.description, ...v.definition.tags]
      .join(" ")
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase())
  );
  return (
    <section>
      <label>
        {label("bestiarySearch")}
        <input
          data-navigation-focus="bestiary-search"
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
      </label>
      {failed && <p role="alert">{label("preparationFailed")}</p>}
      <div className="library-workbench">
        <aside className="library-shelf">
          {visible.map((v) => (
            <button
              data-navigation-focus={`bestiary:${v.entryId}`}
              className="library-entry"
              key={v.entryId}
              aria-pressed={selected === v.entryId}
              onClick={() => onSelect(v.entryId)}
            >
              <span aria-hidden="true">♜</span>
              <span>
                <strong>{v.definition.name}</strong>
                <small>
                  {label("version")} {v.version}
                </small>
              </span>
            </button>
          ))}
          {!visible.length && <p>{label("bestiaryEmpty")}</p>}
        </aside>
        {current && (
          <article className="library-editor">
            <HomebrewReader definition={current.definition} />
            <p>
              {label("version")} {current.version}
            </p>
            <HomebrewExport definition={current.definition} version={current} />
            {onReuse && (
              <button className="identity-primary" onClick={() => onReuse(current)}>
                {label("prepareCopy")}
              </button>
            )}
          </article>
        )}
      </div>
    </section>
  );
}
