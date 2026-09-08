import { useAcquisitionLabels } from "./acquisition-presenters";
import { verifyCatalogueSnapshot } from "@/lib/character-creation/catalogue";
import { originRecord } from "@/lib/homebrew/origins";
import { isLibrarySnapshot, type CatalogueSnapshot } from "@/lib/homebrew/sources";
import {
  isBundledSnapshot,
  isInitialInstanceId,
  instanceVersionLabel,
} from "@/lib/homebrew/instances";
import { Checkbox } from "@/components/ui/selection";
import { useEffect, useRef, useState } from "react";
import { characterPath, parseCharacter, type FolioCharacter } from "@/lib/identity/model";
import type { SessionController } from "@/lib/identity/session";
import type { LibraryRepository, LibraryVersion } from "@/lib/library/model";
import {
  parseInstance,
  parseInstanceState,
  type HomebrewInstance,
  type InstanceIssue,
  type InstanceOperation,
  type InstanceRepository,
  type InstanceState,
  type InitialLoadout,
} from "@/lib/homebrew/instances";
import { equal } from "@/lib/shared/model";
import { conformDefinition } from "@/lib/homebrew/conformance";
import { HomebrewReader } from "./HomebrewReader";
import { HomebrewExport } from "./HomebrewPortable";
import { downloadText } from "./homebrew-files";
import { LibraryComparison } from "./LibraryComparison";
import { useHomebrewLabel } from "./homebrew-labels";
import { useLibraryOperation } from "./useLibraryOperation";
import { useTranslation } from "react-i18next";
import { libraryKey } from "./labels";
type Props = {
  character: FolioCharacter;
  repository: InstanceRepository;
  library: LibraryRepository;
  session: SessionController;
};
type StateDraft = {
  schema: 1;
  character: FolioCharacter;
  base: HomebrewInstance;
  state: InstanceState;
};
const stateFields = [
  "quantity",
  "remainingCharges",
  "prepared",
  "equipped",
  "attuned",
] as const;
function validTicket(check: () => void) {
  try {
    check();
    return true;
  } catch {
    return false;
  }
}
export function HomebrewSheet(props: Props) {
  const { character, repository, session } = props;
  const label = useHomebrewLabel();
  const { ownerUid, id: characterId } = character;
  const path = characterPath({ ownerUid, id: characterId });
  const scopeKey = (session.scope().uid ?? "") + ":" + path;
  const [loaded, setLoaded] = useState<{
    key: string;
    items: HomebrewInstance[];
    issues: InstanceIssue[];
    error: boolean;
  }>({ key: scopeKey, items: [], issues: [], error: false });
  useEffect(() => {
    const check = session.ticket();
    let live = true;
    const update = (patch: Partial<typeof loaded>) => {
      if (live && validTicket(check))
        setLoaded((previous) => ({
          ...(previous.key === scopeKey
            ? previous
            : { items: [], issues: [], error: false }),
          ...patch,
          key: scopeKey,
        }));
    };
    const stop = repository.watch(
      { ownerUid, id: characterId },
      (items) => update({ items, error: false }),
      () => update({ items: [], issues: [], error: true })
    );
    const stopIssues = repository.watchIssues((issues) =>
      update({
        issues: issues.filter(
          (issue) =>
            issue.path.startsWith(path + "/homebrew/") ||
            issue.path === path + "/loadout/initial"
        ),
      })
    );
    const untrack = session.track(() => {
      if (live) setLoaded({ key: scopeKey, items: [], issues: [], error: true });
    });
    return () => {
      live = false;
      stop();
      stopIssues();
      untrack();
    };
  }, [repository, ownerUid, characterId, session, scopeKey, path]);
  const current =
    loaded.key === scopeKey ? loaded : { items: [], issues: [], error: false };
  return (
    <section className="homebrew-sheet">
      <h3>{label("instances")}</h3>
      {current.error && <p role="alert">{label("unavailable")}</p>}
      {!current.items.length && !current.error && !current.issues.length && (
        <p>{label("noInstances")}</p>
      )}
      {current.issues.map((issue) => (
        <section key={issue.path} aria-label={label("recoveryUnavailable")}>
          <p role="alert">{label("recoveryUnavailable")}</p>
          <button
            onClick={() =>
              downloadText(issue.original, "homebrew-unreadable-instance.json")
            }
          >
            {label("recoverOriginal")}
          </button>
        </section>
      ))}
      {current.items.map((item) => (
        <HomebrewCopy key={scopeKey + ":" + item.id} {...props} item={item} />
      ))}
    </section>
  );
}
function restoreDraft(
  key: string,
  item: HomebrewInstance,
  initial: InitialLoadout | null
): { draft: StateDraft | null; original: string | null; unreadable?: boolean } {
  let original: string | null = null;
  try {
    original = sessionStorage.getItem(key);
    if (original === null) return { draft: null, original: null };
    const value = JSON.parse(original) as Partial<StateDraft> | null;
    if (value?.schema !== 1) throw Error("incompatible-instance");
    const base = parseInstance(value.base, initial?.sources, verifyCatalogueSnapshot),
      character = parseCharacter(value.character),
      state = parseInstanceState(value.state);
    if (
      base.id !== item.id ||
      !equal(base.character, item.character) ||
      character.ownerUid !== item.character.ownerUid ||
      character.id !== item.character.id
    )
      throw Error("incompatible-instance");
    return { draft: { schema: 1, base, character, state }, original: null };
  } catch {
    return { draft: null, original, unreadable: original === null };
  }
}
type ArchivedOriginal = { key: string; original: string };
function readOriginals(storageKey: string): ArchivedOriginal[] {
  const prefix = storageKey + ":original:";
  const originals: ArchivedOriginal[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key?.startsWith(prefix)) {
      const original = sessionStorage.getItem(key);
      if (original !== null) originals.push({ key, original });
    }
  }
  return originals;
}
function archiveOriginal(storageKey: string, original: string) {
  if (readOriginals(storageKey).some((saved) => saved.original === original)) return;
  // A new address is append-only. Verify durability before replacing the working draft.
  let key: string;
  do {
    key = storageKey + ":original:" + crypto.randomUUID();
  } while (sessionStorage.getItem(key) !== null);
  sessionStorage.setItem(key, original);
  if (sessionStorage.getItem(key) !== original) throw new Error("original-not-preserved");
}
function restoredOperation(storageKey: string): InstanceOperation | null {
  try {
    return (
      (
        JSON.parse(sessionStorage.getItem(storageKey) ?? "null") as {
          envelope: InstanceOperation;
        } | null
      )?.envelope ?? null
    );
  } catch {
    return null;
  }
}
function HomebrewCopy({
  item,
  character,
  repository,
  library,
  session,
}: Props & { item: HomebrewInstance }) {
  const acquisition = useAcquisitionLabels();
  const label = useHomebrewLabel(),
    { t } = useTranslation("common");
  const key =
    "instance:" + item.character.ownerUid + ":" + item.character.id + ":" + item.id;
  const storageKey = "folio-homebrew-state:" + (session.scope().uid ?? "") + ":" + key;
  const initial = isInitialInstanceId(item.id)
    ? (repository.loadedInitial?.(item.character) ?? null)
    : null;
  const includedSource = isBundledSnapshot(item.snapshot)
    ? originRecord(
        initial?.sources[item.snapshot.sourceKey]?.definition.payload.data.dependencies
      )?.[item.snapshot.dependencyPath]
    : item.snapshot;
  const catalogue =
    includedSource &&
    typeof includedSource === "object" &&
    "kind" in includedSource &&
    includedSource.kind === "catalogue"
      ? (includedSource as CatalogueSnapshot)
      : undefined;
  const [restored] = useState(() => restoreDraft(storageKey, item, initial));
  const [archive] = useState(() => {
    try {
      return { originals: readOriginals(storageKey), error: false };
    } catch {
      return { originals: [] as ArchivedOriginal[], error: true };
    }
  });
  const originals =
    restored.original !== null &&
    !archive.originals.some((saved) => saved.original === restored.original)
      ? [...archive.originals, { key: storageKey, original: restored.original }]
      : archive.originals;
  const [draft, setDraft] = useState<StateDraft | null>(restored.draft),
    [update, setUpdate] = useState<{
      base: HomebrewInstance;
      character: FolioCharacter;
      version: LibraryVersion;
    } | null>(null),
    [error, setError] = useState(false);
  const draftRef = useRef(draft),
    live = useRef(true),
    ticket = useRef(session.ticket());
  const submitted = useRef<InstanceOperation | null>(
    restoredOperation(
      "folio-library-operation:" + (session.scope().uid ?? "") + ":" + key
    )
  );
  useEffect(() => {
    live.current = true;
    const untrack = session.track(() => {
      if (live.current) {
        live.current = false;
        setUpdate(null);
      }
    });
    return () => {
      live.current = false;
      untrack();
    };
  }, [session]);
  const active = () => live.current && validTicket(ticket.current);
  const persist = (next: StateDraft | null) => {
    if (!active()) return;
    try {
      if (restored.unreadable) throw new Error("original-unreadable");
      if (restored.original !== null) archiveOriginal(storageKey, restored.original);
      if (next) sessionStorage.setItem(storageKey, JSON.stringify(next));
      else sessionStorage.removeItem(storageKey);
    } catch {
      setError(true);
      return;
    }
    draftRef.current = next;
    setDraft(next);
  };
  const op = useLibraryOperation(repository, session, key, () => {
    if (!active()) return;
    const sent = submitted.current,
      local = draftRef.current;
    if (
      sent?.kind === "homebrew-state" &&
      local &&
      equal(local.base, sent.base) &&
      equal(local.state, sent.state)
    )
      persist(null);
    if (sent?.kind === "homebrew-update") setUpdate(null);
  });
  const owner = character.ownerUid === session.scope().uid;
  const state = draft?.state ?? item.state;
  const changedAuthority =
    draft &&
    (!equal(draft.character.currentAssignment, character.currentAssignment) ||
      draft.character.revision !== character.revision);
  const [reviewedOperation, setReviewedOperation] = useState<string | null>(null);
  const requiresReview =
    !!draft &&
    (!equal(draft.base, item) ||
      !!changedAuthority ||
      (op.state?.status === "conflict" && reviewedOperation !== op.state.envelope.opId));
  const data = item.snapshot.definition.payload.data,
    capacity = data.maxCharges ?? data.maxUses;
  const edit = (next: InstanceState) => {
    if (!owner || op.busy || !active()) return;
    persist(
      draftRef.current
        ? { ...draftRef.current, state: next }
        : { schema: 1, base: item, character, state: next }
    );
  };
  const save = () => {
    if (!draft || requiresReview || !owner || !active()) return;
    void op.run(() => {
      parseInstanceState(draft.state);
      const intent = repository.stateIntent(draft.character, draft.base, draft.state);
      submitted.current = intent;
      return intent;
    });
  };
  const stateValue = (value: InstanceState[(typeof stateFields)[number]]) =>
    typeof value === "boolean"
      ? label(value ? "yes" : "no")
      : value === null
        ? "—"
        : String(value);
  return (
    <details className="homebrew-preview" open>
      <summary>
        {acquisition.snapshot(catalogue ?? item.snapshot)} · {label("version")}{" "}
        {instanceVersionLabel(catalogue ?? item.snapshot)}
      </summary>
      <HomebrewReader
        definition={item.snapshot.definition}
        catalogue={catalogue}
        included={isBundledSnapshot(item.snapshot)}
      />
      {!isBundledSnapshot(item.snapshot) &&
        isLibrarySnapshot(item.snapshot) &&
        item.snapshot.provenance && (
          <p>
            {label("source")} · {item.snapshot.provenance.source.ownerUid} ·{" "}
            {label("version")} {item.snapshot.provenance.sourceVersion}
          </p>
        )}
      {originals.map((saved) => (
        <section key={saved.key} aria-label={label("recoveryUnavailable")}>
          <p role="alert">{label("recoveryUnavailable")}</p>
          <button
            onClick={() => downloadText(saved.original, "homebrew-state-recovery.json")}
          >
            {label("recoverOriginal")}
          </button>
        </section>
      ))}
      {restored.draft && draft && <p role="status">{label("draftRecovered")}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <fieldset disabled={!owner || op.busy}>
          <div className="homebrew-grid">
            {(["quantity", "remainingCharges"] as const).map((k) => (
              <label key={k}>
                {label(k)}
                <input
                  name={"instance-" + k}
                  type="number"
                  min={0}
                  step={1}
                  required={k === "quantity"}
                  value={state[k] ?? ""}
                  onChange={(e) =>
                    edit({
                      ...state,
                      [k]:
                        e.target.value === ""
                          ? k === "quantity"
                            ? 0
                            : null
                          : Number(e.target.value),
                    })
                  }
                />
              </label>
            ))}
            {(["prepared", "equipped", "attuned"] as const).map((k) => (
              <label key={k} className="homebrew-check">
                <Checkbox
                  name={"instance-" + k}
                  data-homebrew-field={"instance-" + k}
                  aria-label={label(k)}
                  checked={state[k]}
                  onCheckedChange={(checked) => edit({ ...state, [k]: checked === true })}
                />
                {label(k)}
              </label>
            ))}
          </div>
          {owner && (
            <button disabled={!draft || requiresReview || !navigator.onLine}>
              {label("saveState")}
            </button>
          )}
        </fieldset>
      </form>
      {requiresReview && (
        <section>
          <p role="alert">{label("stateConflict")}</p>
          <table>
            <thead>
              <tr>
                <th>{label("stateField")}</th>
                <th>{label("stateBase")}</th>
                <th>{label("stateCurrent")}</th>
                <th>{label("stateLocal")}</th>
              </tr>
            </thead>
            <tbody>
              {stateFields.map((field) => (
                <tr key={field}>
                  <th>{label(field)}</th>
                  <td>{stateValue(draft.base.state[field])}</td>
                  <td>{stateValue(item.state[field])}</td>
                  <td>{stateValue(draft.state[field])}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!equal(draft.base.snapshot, item.snapshot) && (
            <LibraryComparison
              before={draft.base.snapshot.definition}
              after={item.snapshot.definition}
            />
          )}
          <button
            disabled={op.busy || !owner}
            onClick={() => {
              if (!active()) return;
              persist({ ...draft, base: item, character });
              setReviewedOperation(op.state?.envelope.opId ?? null);
            }}
          >
            {label("reviewLatestState")}
          </button>
        </section>
      )}
      {draft && owner && (
        <button disabled={op.busy} onClick={() => persist(null)}>
          {label("discardStateDraft")}
        </button>
      )}
      {typeof capacity === "number" &&
        capacity >= 0 &&
        state.remainingCharges !== null &&
        state.remainingCharges > capacity && (
          <p role="status">{label("capacityMismatch")}</p>
        )}
      {op.state && <p role="status">{t(libraryKey(op.state.status))}</p>}
      {op.state?.status === "unknown" && (
        <button onClick={() => void op.retry()}>{t(libraryKey("retry"))}</button>
      )}
      {(error || restored.unreadable || archive.error || op.error) && (
        <p role="alert">{label("unavailable")}</p>
      )}
      {owner && !isBundledSnapshot(item.snapshot) && isLibrarySnapshot(item.snapshot) && (
        <button
          disabled={op.busy || !!draft || !navigator.onLine}
          onClick={() => {
            if (
              !active() ||
              isBundledSnapshot(item.snapshot) ||
              !isLibrarySnapshot(item.snapshot)
            )
              return;
            const snapshot = item.snapshot;
            const check = session.ticket();
            const base = item;
            const authority = character;
            setError(false);
            void library
              .load(snapshot.entryId)
              .then(async (entry) => {
                if (!active() || !validTicket(check)) return;
                if (!entry?.stableVersion) throw Error("missing");
                const v = await library.readVersion(
                  { ownerUid: snapshot.ownerUid, id: entry.id },
                  entry.stableVersion
                );
                if (active() && validTicket(check))
                  setUpdate({ base, character: authority, version: v });
              })
              .catch(() => {
                if (active() && validTicket(check)) setError(true);
              });
          }}
        >
          {label("checkUpdate")}
        </button>
      )}
      {update && (
        <section>
          <p>{label("statePreserved")}</p>
          <LibraryComparison
            before={update.base.snapshot.definition}
            after={update.version.definition}
          />
          <button
            disabled={
              op.busy ||
              !!draft ||
              !equal(update.base, item) ||
              update.character.revision !== character.revision ||
              !equal(update.character.currentAssignment, character.currentAssignment) ||
              String(update.version.version) === instanceVersionLabel(item.snapshot) ||
              conformDefinition(update.version.definition).some(
                (d) => d.severity === "invalid"
              )
            }
            onClick={() => {
              if (!active() || draftRef.current) return;
              void op.run(() => {
                const intent = repository.updateIntent(
                  update.character,
                  update.base,
                  update.version
                );
                submitted.current = intent;
                return intent;
              });
            }}
          >
            {label("confirmUpdate")}
          </button>
        </section>
      )}
      <div className="identity-actions">
        <HomebrewExport
          definition={item.snapshot.definition}
          catalogue={catalogue}
          included={isBundledSnapshot(item.snapshot)}
          version={
            !isBundledSnapshot(item.snapshot) && isLibrarySnapshot(item.snapshot)
              ? item.snapshot
              : undefined
          }
        />
        <button
          onClick={() =>
            downloadText(
              JSON.stringify(
                initial ? { instance: item, sources: initial.sources } : item,
                null,
                2
              ),
              "homebrew-instance.json"
            )
          }
        >
          {label("recoverOriginal")}
        </button>
      </div>
    </details>
  );
}
