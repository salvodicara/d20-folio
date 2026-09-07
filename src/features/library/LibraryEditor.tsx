import { HomebrewFields } from "./HomebrewFields";
import { baseFamily, useHomebrewLabel } from "./homebrew-labels";
import { HomebrewReader } from "./HomebrewReader";
import { HomebrewExport } from "./HomebrewPortable";
import { downloadText, readImportOriginal } from "./homebrew-files";
import { conformDefinition } from "@/lib/homebrew/conformance";
import { libraryKey } from "./labels";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import type { LibraryFamily, LibraryVersion, LibraryEntry } from "@/lib/library/model";
import type { LibraryRepository } from "@/lib/library/model";
import type { SessionController } from "@/lib/identity/session";
import { LibraryDraftController } from "./draft";
import { LibraryDialog } from "./LibraryDialog";
import { LibraryComparison } from "./LibraryComparison";
import { useLibraryOperation } from "./useLibraryOperation";
interface EditorProps {
  id: string;
  family: LibraryFamily;
  repository: LibraryRepository;
  session: SessionController;
  revision: number;
  sourceName?: string;
  onShare: (version: LibraryVersion) => void;
  onReuse?: (version: LibraryVersion) => void;
}
export function LibraryEditor(props: EditorProps) {
  const [editor, setEditor] = useState<LibraryDraftController | null>(null);
  const { repository, session, id, family } = props;
  useEffect(() => {
    const value = new LibraryDraftController(
      repository,
      session,
      id,
      family,
      sessionStorage
    );
    let live = true;
    // Register the committed controller after effect replay; discarded mounts cannot publish it.
    void Promise.resolve().then(() => {
      if (live) setEditor(value);
    });
    void value.load();
    return () => {
      live = false;
      value.dispose();
    };
  }, [repository, session, id, family]);
  return editor ? <EditorBody {...props} key={id} editor={editor} /> : null;
}
function EditorBody({
  id,
  family,
  repository,
  session,
  revision,
  onShare,
  onReuse,
  sourceName,
  editor,
}: EditorProps & { editor: LibraryDraftController }) {
  const { t } = useTranslation("common");
  const label = (key: string) => t(libraryKey(key));
  const homebrewLabel = useHomebrewLabel();
  const state = useSyncExternalStore(editor.subscribe, editor.snapshot);
  const [dialog, setDialog] = useState<"record" | "versions" | null>(null),
    [versions, setVersions] = useState<LibraryVersion[]>([]),
    [chosen, setChosen] = useState(0),
    [error, setError] = useState<string | null>(null);
  const op = useLibraryOperation(repository, session, "publish:" + id, async () => {
    const check = session.ticket();
    const entry = await repository.load(id);
    check();
    if (entry) editor.acceptBase(entry);
    setDialog(null);
  });
  useEffect(() => {
    if (revision) void editor.load();
  }, [editor, revision]);
  useEffect(() => {
    const update = () => editor.setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, [editor]);
  async function showVersions(kind: "record" | "versions") {
    if (!state.base || (kind === "record" && state.dirty) || op.busy) return;
    const check = session.ticket();
    setError(null);
    try {
      const result = await repository.listVersions(id);
      check();
      setVersions(result);
      setChosen(result[0]?.version ?? 0);
      setDialog(kind);
    } catch {
      setError("requestFailed");
    }
  }
  async function share(reuse = false) {
    if (!state.base?.stableVersion) return;
    const check = session.ticket();
    try {
      const v = await repository.readVersion(
        { ownerUid: state.base.ownerUid, id },
        state.base.stableVersion
      );
      check();
      if (reuse) onReuse?.(v);
      else onShare(v);
    } catch {
      setError("requestFailed");
    }
  }
  const feedback = (
    <>
      {op.state && <p role="status">{label(op.state.status)}</p>}
      {op.state?.status === "unknown" && (
        <button onClick={() => void op.retry()}>{label("retry")}</button>
      )}
      {op.error && <p role="alert">{label("requestFailed")}</p>}
    </>
  );
  const draft = state.draft;
  if (!state.loaded || !draft)
    return (
      <section className="library-editor">
        <p role="status">{label(state.loadError ? "loadError" : "loadingEntry")}</p>
        <button onClick={() => void editor.load()}>{label("reload")}</button>
      </section>
    );
  const conflict =
    state.invalidated ||
    ["conflict", "invalidated", "rejected"].includes(state.operation?.status ?? "");
  const locked =
    op.busy ||
    state.invalidated ||
    !!(state.operation && state.operation.status !== "acknowledged");
  const version = versions.find((v) => v.version === chosen);
  return (
    <section className="library-editor" aria-label={draft.name || label("untitled")}>
      <div className="library-editor-heading">
        <div>
          <p className="library-eyebrow">
            {t(libraryKey(`families.${family}`))} ·{" "}
            {state.base?.stableVersion
              ? t("libraryV2.version", { version: state.base.stableVersion })
              : label("draft")}
          </p>
          <h2>{draft.name || label("untitled")}</h2>
        </div>
        <span role="status">
          {label(
            !state.online
              ? "waiting"
              : (state.operation?.status ?? (state.dirty ? "local" : "saved"))
          )}
        </span>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void editor.save();
        }}
      >
        <label>
          {label("name")}
          <input
            name="library-name"
            maxLength={200}
            value={draft.name}
            disabled={locked}
            onChange={(e) => editor.edit({ name: e.target.value })}
          />
        </label>
        <label>
          {label("description")}
          <textarea
            name="library-description"
            rows={5}
            maxLength={100000}
            value={draft.description}
            disabled={locked}
            onChange={(e) => editor.edit({ description: e.target.value })}
          />
        </label>
        <label>
          {label("tags")}
          <input
            name="library-tags"
            value={draft.tags.join(", ")}
            disabled={locked}
            onChange={(e) =>
              editor.edit({
                tags: e.target.value
                  .split(",")
                  .map((v) => v.trim())
                  .slice(0, 30),
              })
            }
          />
        </label>
        <HomebrewFields
          definition={draft}
          disabled={locked}
          onChange={(payload) => editor.edit({ payload })}
        />
        <div className="identity-actions">
          {state.dirty && !conflict && (
            <button
              type="submit"
              disabled={!state.online || state.operation?.status === "pending"}
            >
              {label(state.operation?.status === "unknown" ? "retry" : "save")}
            </button>
          )}
          {conflict && (
            <button
              type="button"
              disabled={!state.online || state.loadError}
              onClick={() => editor.review()}
            >
              {label("review")}
            </button>
          )}
        </div>
      </form>
      {state.validationFailed && <p role="alert">{label("invalidData")}</p>}
      {state.recoveryOriginals.map((original, index) => (
        <div role="alert" key={index}>
          <p>{label("incompatibleRecovery")}</p>
          <button
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob([original], { type: "application/json" })
              );
              const a = document.createElement("a");
              a.href = url;
              a.download = "library-draft-original.json";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            {label("recover")} {state.recoveryOriginals.length > 1 ? index + 1 : ""}
          </button>
        </div>
      ))}
      {state.storageFailed && <p role="alert">{label("storageError")}</p>}
      {conflict && state.latest && (
        <div className="library-conflict">
          <h3>{label("latest")}</h3>
          <p>{label("reviewHelp")}</p>
          <LibraryComparison before={state.latest.draft} after={draft} />
        </div>
      )}
      {error && <p role="alert">{label(error)}</p>}
      <div className="identity-actions library-editor-actions">
        <button
          className="identity-primary"
          disabled={
            !state.base ||
            state.dirty ||
            locked ||
            !state.online ||
            !draft.name.trim() ||
            (baseFamily(family) &&
              conformDefinition(draft).some((d) => d.severity === "invalid"))
          }
          onClick={() => void showVersions("record")}
        >
          {label("record")}
        </button>
        <button
          disabled={!state.base || op.busy}
          onClick={() => void showVersions("versions")}
        >
          {label("versions")}
        </button>
        <button
          disabled={!state.base?.stableVersion || op.busy || !state.online}
          onClick={() => void share()}
        >
          {label("share")}
        </button>
      </div>
      <div className="identity-actions">
        <HomebrewExport definition={draft} />
        <button
          type="button"
          onClick={() => {
            try {
              const original = readImportOriginal(session.scope().uid ?? "", id);
              if (original) downloadText(original, "homebrew-original.json");
            } catch {
              /* recovery storage unavailable */
            }
          }}
          hidden={!readImportOriginal(session.scope().uid ?? "", id)}
        >
          {homebrewLabel("recoverOriginal")}
        </button>
        {onReuse && baseFamily(family) && (
          <button
            disabled={!state.base?.stableVersion || op.busy || !state.online}
            onClick={() => void share(true)}
          >
            {homebrewLabel("reuse")}
          </button>
        )}
      </div>
      <details className="homebrew-preview">
        <summary>{homebrewLabel("preview")}</summary>
        <HomebrewReader definition={draft} />
      </details>
      {!state.base?.stableVersion && <p>{label("recordFirst")}</p>}
      {state.base?.provenance && (
        <p className="library-provenance">
          {label("copy")} · {t("libraryV2.from", { name: sourceName })} ·{" "}
          {t("libraryV2.sourceVersion", { version: state.base.provenance.sourceVersion })}
        </p>
      )}
      {!baseFamily(family) && Object.keys(draft.payload.data).length > 0 && (
        <details>
          <summary>{label("payload")}</summary>
          <pre>{JSON.stringify(draft.payload.data, null, 2)}</pre>
        </details>
      )}
      {!dialog && feedback}
      {dialog && (
        <LibraryDialog
          title={label(dialog === "record" ? "recordTitle" : "versions")}
          description={label("recordHelp")}
          onClose={() => {
            if (!op.busy) setDialog(null);
          }}
        >
          {feedback}
          {dialog === "versions" && versions.length > 0 && (
            <label>
              {label("compare")}
              <select value={chosen} onChange={(e) => setChosen(Number(e.target.value))}>
                {versions.map((v) => (
                  <option key={v.version} value={v.version}>
                    {t("libraryV2.version", { version: v.version })}
                  </option>
                ))}
              </select>
            </label>
          )}
          {version ? (
            <LibraryComparison before={version.definition} after={draft} />
          ) : (
            <>
              <h3>{draft.name}</h3>
              <p className="library-description">
                {draft.description || label("noVersions")}
              </p>
            </>
          )}
          {version && (
            <HomebrewExport definition={version.definition} version={version} />
          )}
          {dialog === "record" && (
            <button
              className="identity-primary"
              disabled={op.busy || state.dirty}
              onClick={() =>
                void op.run(async () => {
                  const intent = await repository.publishIntent(
                    state.base as LibraryEntry,
                    draft
                  );
                  if (!intent) {
                    setError("unchanged");
                    setDialog(null);
                  }
                  return intent;
                })
              }
            >
              {label("record")}
            </button>
          )}
        </LibraryDialog>
      )}
    </section>
  );
}
