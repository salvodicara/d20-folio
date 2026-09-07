import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { LibraryDefinition, LibraryVersion } from "@/lib/library/model";
import type { SessionController } from "@/lib/identity/session";
import { decodePortable, encodePortable } from "@/lib/homebrew/portable";
import { LibraryDialog } from "./LibraryDialog";
import { HomebrewReader } from "./HomebrewReader";
import { useHomebrewLabel } from "./homebrew-labels";
import {
  downloadText,
  importOriginalKey,
  originalFileIds,
  originalFileName,
  storeOriginalMetadata,
} from "./homebrew-files";
export function HomebrewImport({
  session,
  onImport,
  onClose,
}: {
  session: SessionController;
  onImport: (definition: LibraryDefinition, id: string) => Promise<void>;
  onClose: () => void;
}) {
  const label = useHomebrewLabel(),
    prefix = importOriginalKey(session.scope().uid ?? "", "");
  const [files, setFiles] = useState<string[]>(() => {
    try {
      return originalFileIds(session.scope().uid ?? "");
    } catch {
      return [];
    }
  });
  const [id, setId] = useState(""),
    [original, setOriginal] = useState(""),
    [error, setError] = useState(false),
    [busy, setBusy] = useState(false),
    [stored, setStored] = useState(false);
  const decoded = original ? decodePortable(original) : null;
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  const live = useRef(true);
  const selection = useRef(0);
  useEffect(() => {
    live.current = true;
    const stop = session.track(() => {
      if (live.current) {
        setOriginal("");
        close.current();
      }
    });
    return () => {
      live.current = false;
      stop();
    };
  }, [session]);
  return (
    <LibraryDialog
      title={label("importTitle")}
      description={label("importHelp")}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <label>
        {label("import")}
        <input
          type="file"
          accept=".json,application/json"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const check = session.ticket();
            const selected = ++selection.current;
            const fail = session.guard(() => {
              if (live.current && selected === selection.current) setError(true);
            });
            setError(false);
            setStored(false);
            void file
              .text()
              .then((raw) => {
                check();
                if (!live.current || selected !== selection.current) return;
                const next = crypto.randomUUID();
                setId(next);
                setOriginal(raw);
                try {
                  sessionStorage.setItem(prefix + next, raw);
                  storeOriginalMetadata(session.scope().uid ?? "", next, file.name);
                  setFiles(originalFileIds(session.scope().uid ?? ""));
                  setStored(true);
                } catch {
                  setError(true);
                }
              })
              .catch(fail);
          }}
        />
      </label>
      {files.length > 0 && (
        <details>
          <summary>{label("importHistory")}</summary>
          {files.map((file, index) => (
            <button
              key={file}
              disabled={busy}
              onClick={() => {
                try {
                  selection.current++;
                  setOriginal(sessionStorage.getItem(prefix + file) ?? "");
                  setId(file);
                  setStored(true);
                  setError(false);
                } catch {
                  setError(true);
                }
              }}
            >
              {label("originalFile")} {index + 1}
              {originalFileName(session.scope().uid ?? "", file)
                ? " · " + originalFileName(session.scope().uid ?? "", file)
                : ""}
            </button>
          ))}
        </details>
      )}
      {error && <p role="alert">{label("storageError")}</p>}
      {decoded?.ok ? (
        <>
          <HomebrewReader definition={decoded.definition} />
          {decoded.version && (
            <p>
              {label("stableExport")} {decoded.version.version} · {label("source")}{" "}
              {decoded.version.ownerUid}
            </p>
          )}
          <button
            disabled={busy || !stored}
            onClick={() => {
              setBusy(true);
              const guard = session.guard((failed: boolean) => {
                if (!live.current) return;
                setBusy(false);
                if (failed) setError(true);
                else onClose();
              });
              void onImport(decoded.definition, id)
                .then(() => guard(false))
                .catch(() => guard(true));
            }}
          >
            {label("importConfirm")}
          </button>
        </>
      ) : (
        decoded && <p role="alert">{label("incompatible")}</p>
      )}
      {original && (
        <button onClick={() => downloadText(original, "homebrew-original.json")}>
          {label("recoverOriginal")}
        </button>
      )}
    </LibraryDialog>
  );
}
export function HomebrewExport({
  definition,
  version,
}: {
  definition: LibraryDefinition;
  version?: LibraryVersion;
}) {
  const label = useHomebrewLabel();
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    const done = () => setPrinting(false);
    window.addEventListener("afterprint", done);
    return () => window.removeEventListener("afterprint", done);
  }, []);
  useEffect(() => {
    if (printing) window.print();
  }, [printing]);
  return (
    <>
      <button
        type="button"
        onClick={() =>
          downloadText(
            encodePortable(definition, version),
            "homebrew-" + (version ? `v${version.version}` : "draft") + ".json"
          )
        }
      >
        {label("export")}
      </button>
      <button type="button" onClick={() => setPrinting(true)}>
        {label("print")}
      </button>
      {printing &&
        createPortal(
          <div className="homebrew-print">
            <p>
              d20 Folio · {label(version ? "stableExport" : "draftExport")}{" "}
              {version?.version ?? ""}
            </p>
            <HomebrewReader definition={definition} printable />
            {version && (
              <p>
                {label("source")} · {version.ownerUid} · {label("version")}{" "}
                {version.version}
              </p>
            )}
            {version?.provenance && (
              <p>
                {label("source")} · {version.provenance.source.ownerUid} ·{" "}
                {label("version")} {version.provenance.sourceVersion}
              </p>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
