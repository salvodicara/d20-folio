import { useEffect, useRef, useState } from "react";
import { type FolioCharacter } from "@/lib/identity/model";
import type { SessionController } from "@/lib/identity/session";
import { composeOriginBuild } from "@/lib/homebrew/origin-build";
import type {
  OriginBuildRepository,
  OriginBuildOperation,
} from "@/lib/homebrew/origin-build-repository";
import type { LibraryRepository, LibraryVersion } from "@/lib/library/model";
import { equal } from "@/lib/shared/model";
import { HomebrewReader } from "./HomebrewReader";
import { OriginBuildComparison } from "./OriginBuildComparison";
import { HomebrewExport } from "./HomebrewPortable";
import { LibraryComparison } from "./LibraryComparison";
import { LibraryDialog } from "./LibraryDialog";
import { OriginChoices } from "./OriginChoices";
import { originCandidate, replaceOriginSnapshot } from "./origin-candidate";
import {
  loadOriginDraft,
  activateParkedOriginDraft,
  parkOriginDraft,
  persistOriginDraft,
  retireOriginDraft,
  type OriginDraft,
} from "./origin-draft";
import { downloadText } from "./homebrew-files";
import { useHomebrewLabel } from "./homebrew-labels";
import { useLibraryOperation } from "./useLibraryOperation";
import { useTranslation } from "react-i18next";
import { libraryKey } from "./labels";
import type { LoadedOriginBuild } from "./useOriginBuild";
const ticketValid = (check: () => void) => {
  try {
    check();
    return true;
  } catch {
    return false;
  }
};
type Props = {
  character: FolioCharacter;
  loaded: LoadedOriginBuild;
  repository: OriginBuildRepository;
  library: LibraryRepository;
  session: SessionController;
};
export function OriginBuildPanel(props: Props) {
  const { character, loaded, session } = props;
  const label = useHomebrewLabel();
  const [editing, setEditing] = useState<string | null>(null);
  const owner = character.ownerUid === session.scope().uid;
  const selections = Object.values(loaded.base?.selections ?? {}).sort(
    (a, b) => a.ordinal - b.ordinal
  );
  return (
    <section className="homebrew-sheet origin-build-panel">
      <h3>{label("origin.buildTitle")}</h3>
      <p>{label("origin.buildHelp")}</p>
      {loaded.loading && <p role="status">{label("origin.loadingBuild")}</p>}
      {loaded.error && <p role="alert">{label("origin.unavailableBuild")}</p>}
      {loaded.issues.map((issue) => (
        <div key={issue.path}>
          <p role="alert">{label("recoveryUnavailable")}</p>
          <button
            onClick={() => downloadText(issue.original, "origin-build-original.json")}
          >
            {label("recoverOriginal")}
          </button>
        </div>
      ))}
      {!loaded.loading && !loaded.error && !selections.length && (
        <p>{label("origin.noSelections")}</p>
      )}
      {selections.map((selection) => (
        <article className="origin-selected" key={selection.id}>
          <h4>
            {selection.snapshot.definition.name} · {label("version")}{" "}
            {selection.snapshot.version}
          </h4>
          <p>
            {label("origin.acquiredOrder")}: {selection.ordinal + 1}
          </p>
          <details>
            <summary>{label("origin.currentChoices")}</summary>
            <HomebrewReader definition={selection.snapshot.definition} />
            <dl className="homebrew-facts">
              {composeOriginBuild(character, loaded.base)
                .activeChoices.filter((c) => c.selectionId === selection.id)
                .map((c) => (
                  <div key={c.path}>
                    <dt>{c.choice.name}</dt>
                    <dd>
                      {c.selected
                        .map(
                          (id) =>
                            c.choice.options.find((o) => o.id === id)?.name ??
                            label("origin.obsoleteOption")
                        )
                        .join(", ") || "—"}
                      {!c.active ? " · " + label("origin.choiceInactive") : ""}
                    </dd>
                  </div>
                ))}
            </dl>
          </details>
          <HomebrewExport
            definition={selection.snapshot.definition}
            version={selection.snapshot}
          />
          {owner && (
            <button onClick={() => setEditing(selection.id)}>
              {label("origin.editSelection")}
            </button>
          )}
        </article>
      ))}
      {editing && !loaded.loading && !loaded.error && (
        <OriginBuildEditor
          {...props}
          targetId={editing}
          onClose={() => setEditing(null)}
          onDone={() => setEditing(null)}
        />
      )}
    </section>
  );
}
export function OriginBuildEditor({
  character,
  loaded,
  repository,
  library,
  session,
  version,
  targetId,
  onClose,
  onDone,
}: Props & {
  version?: LibraryVersion;
  targetId?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const label = useHomebrewLabel(),
    { t } = useTranslation("common");
  const key = "origin-build:" + character.ownerUid + ":" + character.id;
  const storageKey = "folio-origin-draft:" + (session.scope().uid ?? "") + ":" + key;
  const [restored] = useState(() =>
    loadOriginDraft(sessionStorage, storageKey, character)
  );
  const [requested] = useState<OriginDraft>(() => {
    const roots = Object.values(loaded.base?.selections ?? {});
    const existing = targetId
      ? loaded.base?.selections[targetId]
      : version
        ? roots.find((s) =>
            version.definition.family === "feat"
              ? version.definition.payload.data.repeatable !== true &&
                s.snapshot.entryId === version.entryId &&
                s.snapshot.ownerUid === version.ownerUid
              : s.snapshot.definition.family === version.definition.family
          )
        : undefined;
    const id = existing?.id ?? crypto.randomUUID();
    const selection = version
      ? existing
        ? replaceOriginSnapshot(existing, version)
        : {
            id,
            ordinal: Math.max(-1, ...roots.map((s) => s.ordinal)) + 1,
            snapshot: version,
            answers: {},
            exceptions: [],
          }
      : (existing ?? null);
    return {
      schema: 1,
      character,
      base: loaded.base,
      targetId: id,
      selection,
      invalidated: false,
    };
  });
  const [draft, setDraft] = useState<OriginDraft>(restored.draft ?? requested);
  const [parked, setParked] = useState(() => {
    const saved: { key: string; draft: OriginDraft }[] = [];
    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key?.startsWith(storageKey + ":parked:")) {
          const value = loadOriginDraft(sessionStorage, key, character).draft;
          if (value) saved.push({ key, draft: value });
        }
      }
    } catch {
      /* Existing draft storage failure remains visible. */
    }
    return saved;
  });
  const [resumeRequested, setResumeRequested] = useState(false);
  const differentRequest =
    !resumeRequested &&
    !!restored.draft &&
    (targetId
      ? draft.targetId !== targetId
      : !equal(draft.selection?.snapshot, requested.selection?.snapshot));
  const draftRef = useRef(draft),
    live = useRef(true),
    ticket = useRef(session.ticket());
  const [invalidated, setInvalidated] = useState(false);
  const [error, setError] = useState(restored.storageError),
    [versions, setVersions] = useState<LibraryVersion[]>([]),
    [versionError, setVersionError] = useState(false);
  const versionGeneration = useRef(0);
  const active = () => live.current && ticketValid(ticket.current);
  const change = (next: OriginDraft) => {
    if (!active()) return;
    if (!equal(draftRef.current.selection?.snapshot, next.selection?.snapshot)) {
      versionGeneration.current++;
      setVersions([]);
      setVersionError(false);
    }
    draftRef.current = next;
    setDraft(next);
    try {
      persistOriginDraft(sessionStorage, storageKey, next);
      setError(false);
    } catch {
      setError(true);
    }
  };
  useEffect(() => {
    live.current = true;
    const untrack = session.track(() => {
      if (!live.current) return;
      const invalidated = { ...draftRef.current, invalidated: true };
      try {
        persistOriginDraft(sessionStorage, storageKey, invalidated);
      } catch {
        /* The operation hook separately preserves the invalidated envelope. */
      }
      live.current = false;
      setInvalidated(true);
      onClose();
    });
    return () => {
      live.current = false;
      untrack();
    };
  }, [session, storageKey, onClose]);
  const sent = useRef<OriginDraft | null>(null);
  const op = useLibraryOperation(
    repository,
    session,
    key,
    async (operation: OriginBuildOperation) => {
      const check = session.ticket();
      await repository.read(operation.character);
      check();
      if (!active()) return;
      const matching = sent.current ?? draftRef.current;
      if (
        equal(matching.base, operation.base) &&
        equal(matching.selection, operation.selections[operation.targetId] ?? null) &&
        matching.targetId === operation.targetId &&
        !matching.invalidated
      )
        retireOriginDraft(sessionStorage, storageKey, matching);
      onDone();
    }
  );
  const conflict =
    draft.invalidated ||
    !equal(draft.base, loaded.base) ||
    draft.character.revision !== character.revision ||
    !equal(draft.character.currentAssignment, character.currentAssignment) ||
    ["conflict", "invalidated", "rejected"].includes(op.state?.status ?? "");
  const candidate = originCandidate(
    draft.character,
    draft.base,
    draft.selection,
    draft.targetId
  );
  const composition = composeOriginBuild(draft.character, candidate);
  const locked = op.busy || invalidated || differentRequest;
  const before = draft.base?.selections[draft.targetId];
  const latestSelection = loaded.base?.selections[draft.targetId];
  async function loadVersions() {
    const snapshot = draftRef.current.selection?.snapshot;
    if (!snapshot) return;
    const check = session.ticket();
    const generation = ++versionGeneration.current;
    setVersionError(false);
    try {
      const values = await library.listVersions(snapshot.entryId);
      check();
      if (
        active() &&
        generation === versionGeneration.current &&
        equal(snapshot, draftRef.current.selection?.snapshot)
      )
        setVersions(
          values.filter(
            (v) => v.ownerUid === snapshot.ownerUid && v.entryId === snapshot.entryId
          )
        );
    } catch {
      if (active() && generation === versionGeneration.current) setVersionError(true);
    }
  }
  return (
    <LibraryDialog
      title={label("origin.editBuildTitle")}
      description={label("origin.editBuildHelp")}
      onClose={() => {
        if (!op.busy) {
          change(draftRef.current);
          onClose();
        }
      }}
    >
      <p className="library-eyebrow">
        {character.name} · {label("origin.buildTitle")}
      </p>
      {restored.draft && <p role="status">{label("origin.restoredDraft")}</p>}
      {differentRequest && (
        <section className="library-conflict">
          <h4>{label("origin.differentDraft")}</h4>
          <p>
            {draft.selection?.snapshot.definition.name} →{" "}
            {requested.selection?.snapshot.definition.name}
          </p>
          <p>{label("origin.switchHelp")}</p>
          <button disabled={op.busy} onClick={() => setResumeRequested(true)}>
            {label("origin.resumeDraft")}
          </button>
          <button
            disabled={op.busy}
            onClick={() => {
              try {
                const key = parkOriginDraft(sessionStorage, storageKey, draftRef.current);
                setParked((old) => [...old, { key, draft: draftRef.current }]);
                change(requested);
                setResumeRequested(true);
              } catch {
                setError(true);
              }
            }}
          >
            {label("origin.startRequested")}
          </button>
        </section>
      )}
      {parked.length > 0 && (
        <details>
          <summary>{label("origin.keptDrafts")}</summary>
          {parked.map((saved) => (
            <button
              key={saved.key}
              disabled={op.busy}
              onClick={() => {
                try {
                  const key = parkOriginDraft(
                    sessionStorage,
                    storageKey,
                    draftRef.current
                  );
                  const resumed = activateParkedOriginDraft(
                    sessionStorage,
                    storageKey,
                    saved.key,
                    character
                  );
                  setParked((old) => [
                    ...old.filter((p) => p.key !== saved.key),
                    { key, draft: draftRef.current },
                  ]);
                  draftRef.current = resumed;
                  versionGeneration.current++;
                  setVersions([]);
                  setVersionError(false);
                  setDraft(resumed);
                  setError(false);
                  setResumeRequested(true);
                } catch {
                  setError(true);
                }
              }}
            >
              {label("origin.resumeDraft")}:{" "}
              {saved.draft.selection?.snapshot.definition.name ??
                label("origin.removeSelection")}
            </button>
          ))}
        </details>
      )}
      {restored.original && (
        <div role="alert">
          <p>{label("recoveryUnavailable")}</p>
          <button
            onClick={() =>
              restored.original &&
              downloadText(restored.original, "origin-draft-original.json")
            }
          >
            {label("recoverOriginal")}
          </button>
        </div>
      )}
      {draft.selection ? (
        <>
          <h3>
            {draft.selection.snapshot.definition.name} · {label("version")}{" "}
            {draft.selection.snapshot.version}
          </h3>
          {before && (
            <LibraryComparison
              before={before.snapshot.definition}
              after={draft.selection.snapshot.definition}
            />
          )}
          <OriginChoices
            character={draft.character}
            build={candidate}
            selection={draft.selection}
            disabled={locked}
            onChange={(selection) => change({ ...draftRef.current, selection })}
          />
          <details>
            <summary>{label("origin.changeVersion")}</summary>
            <p>{label("origin.versionHelp")}</p>
            <button disabled={locked} onClick={() => void loadVersions()}>
              {label("origin.loadVersions")}
            </button>
            {versions.length > 0 && (
              <label>
                {label("origin.libraryVersion")}
                <select
                  value={draft.selection.snapshot.version}
                  disabled={locked}
                  onChange={(e) => {
                    const snapshot = versions.find(
                      (v) =>
                        v.version === Number(e.target.value) &&
                        v.ownerUid === draftRef.current.selection?.snapshot.ownerUid &&
                        v.entryId === draftRef.current.selection.snapshot.entryId
                    );
                    if (snapshot && draftRef.current.selection)
                      change({
                        ...draftRef.current,
                        selection: replaceOriginSnapshot(
                          draftRef.current.selection,
                          snapshot
                        ),
                      });
                  }}
                >
                  {versions.map((v) => (
                    <option value={v.version} key={v.version}>
                      {label("version")} {v.version}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {versionError && <p role="alert">{label("origin.versionUnavailable")}</p>}
          </details>
          {before && (
            <button
              disabled={locked}
              onClick={() => change({ ...draftRef.current, selection: null })}
            >
              {label("origin.removeSelection")}
            </button>
          )}
        </>
      ) : (
        <>
          <p>{label("origin.removalHelp")}</p>
          {before && <HomebrewReader definition={before.snapshot.definition} />}
        </>
      )}
      <OriginBuildComparison
        character={character}
        before={conflict ? loaded.base : draft.base}
        after={candidate}
      />
      <p className="homebrew-hint">{label("origin.confirmHelp")}</p>
      {conflict && (
        <section className="library-conflict">
          <h4>{label("origin.conflictTitle")}</h4>
          <p>{label("origin.conflictHelp")}</p>
          {latestSelection && draft.selection && (
            <LibraryComparison
              before={latestSelection.snapshot.definition}
              after={draft.selection.snapshot.definition}
            />
          )}
          <button
            disabled={locked || loaded.loading || loaded.error}
            onClick={() =>
              void (async () => {
                if (!(await op.reviewSettled()) || !active()) return;
                const current = loaded.base?.selections[draft.targetId];
                const ordinal =
                  current?.ordinal ??
                  Math.max(
                    -1,
                    ...Object.values(loaded.base?.selections ?? {}).map((s) => s.ordinal)
                  ) + 1;
                change({
                  ...draftRef.current,
                  character,
                  base: loaded.base,
                  invalidated: false,
                  selection: draftRef.current.selection
                    ? { ...draftRef.current.selection, ordinal }
                    : null,
                });
              })()
            }
          >
            {label("origin.reviewLatest")}
          </button>
        </section>
      )}
      {composition.diagnostics
        .filter((d) => d.selectionId !== draft.targetId)
        .map((d, i) => (
          <p role="alert" key={i}>
            {label("origin.otherSelectionIssue")} ·{" "}
            {label("origin.diagnostics." + d.code)}
          </p>
        ))}
      {op.state && <p role="status">{t(libraryKey(op.state.status))}</p>}
      {(error || op.error) && <p role="alert">{label("origin.saveError")}</p>}
      {op.state?.status === "unknown" && (
        <button onClick={() => void op.retry()}>{t(libraryKey("retry"))}</button>
      )}
      {!conflict && draft.base && equal(candidate.selections, draft.base.selections) && (
        <p>{label("origin.alreadySaved")}</p>
      )}
      <button
        className="identity-primary"
        disabled={
          locked ||
          conflict ||
          !composition.valid ||
          loaded.loading ||
          loaded.error ||
          !navigator.onLine
        }
        onClick={() =>
          void op.run(async () => {
            const current = draftRef.current;
            persistOriginDraft(sessionStorage, storageKey, current);
            sent.current = current;
            if (current.base && equal(candidate.selections, current.base.selections)) {
              const check = session.ticket();
              const saved = await repository.read(current.character);
              check();
              if (!active() || !equal(saved, current.base)) throw Error("stale-base");
              retireOriginDraft(sessionStorage, storageKey, current);
              onDone();
              return null;
            }
            return repository.saveIntent(
              current.character,
              current.base,
              current.targetId,
              current.selection
            );
          })
        }
      >
        {label("origin.confirmBuild")}
      </button>
    </LibraryDialog>
  );
}
