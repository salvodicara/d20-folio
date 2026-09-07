import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { parseCampaign, type FolioCampaign } from "@/lib/identity/model";
import type { SessionController } from "@/lib/identity/session";
import type { LibraryRepository, LibraryVersion } from "@/lib/library/model";
import {
  parsePreparedCopy,
  parsePreparedState,
  type PreparedCopy,
  type PreparedState,
  type PreparationRepository,
} from "@/lib/homebrew/preparation";
import { equal } from "@/lib/shared/model";
import { CONDITIONS } from "@/lib/homebrew/model";
import { HomebrewReader } from "./HomebrewReader";
import { HomebrewExport } from "./HomebrewPortable";
import { LibraryComparison } from "./LibraryComparison";
import { useLibraryOperation } from "./useLibraryOperation";
import { useHomebrewLabel } from "./homebrew-labels";
import { libraryKey } from "./labels";
import { downloadText } from "./homebrew-files";
const textValue = (value: unknown) =>
  typeof value === "string" ? value : JSON.stringify(value);
interface Props {
  campaign: FolioCampaign;
  repository: PreparationRepository;
  library: LibraryRepository;
  session: SessionController;
  canManage: boolean;
  preparationId: string;
  onPreparationChange: (id: string) => void;
}
export function CampaignHomebrew(p: Props) {
  const label = useHomebrewLabel();
  return (
    <section className="campaign-homebrew">
      <header>
        <h2>{label("campaignHomebrew")}</h2>
        <p>{label("preparationHelp")}</p>
      </header>
      <CopyList {...p} preparationId={null} />
      {p.canManage && (
        <>
          <label>
            {label("preparationName")}
            <input
              name="campaign-preparation"
              value={p.preparationId}
              maxLength={80}
              onChange={(e) => p.onPreparationChange(e.target.value)}
            />
          </label>
          {/^[A-Za-z0-9_-]{1,80}$/.test(p.preparationId) && (
            <CopyList {...p} key={p.preparationId} preparationId={p.preparationId} />
          )}
        </>
      )}
    </section>
  );
}
function CopyList(p: Omit<Props, "preparationId"> & { preparationId: string | null }) {
  const label = useHomebrewLabel();
  const [items, setItems] = useState<PreparedCopy[] | null>(null),
    [error, setError] = useState(false),
    [issues, setIssues] = useState<{ path: string; original: string }[]>([]);
  useEffect(() => {
    let live = true;
    const check = p.session.ticket();
    const stop = p.repository.watch(
      p.campaign.id,
      p.preparationId,
      (values) => {
        try {
          check();
          if (live) {
            setItems(values);
            setError(false);
          }
        } catch {
          /* invalidated */
        }
      },
      () => {
        if (live) {
          setItems(null);
          setError(true);
        }
      }
    );
    const stopIssues = p.repository.watchIssues((values) => {
      if (live) setIssues(values);
    });
    return () => {
      live = false;
      stop();
      stopIssues();
    };
  }, [p.repository, p.session, p.campaign.id, p.preparationId]);
  const visibleIssues = issues.filter(
    (x) =>
      x.path.includes("/" + p.campaign.id + "/") &&
      (p.preparationId
        ? x.path.includes("/preparations/" + p.preparationId + "/")
        : x.path.includes("/rules/"))
  );
  return (
    <section>
      <h3>{label(p.preparationId ? "preparedCreatures" : "campaignRules")}</h3>
      {error && <p role="alert">{label("preparationFailed")}</p>}
      {items === null && !error && <p role="status">{label("loadingCopies")}</p>}
      {items?.length === 0 && <p>{label("noPreparedCopies")}</p>}
      {visibleIssues.map((x) => (
        <div key={x.path} role="alert">
          <p>{label("preservedPayload")}</p>
          <button onClick={() => downloadText(x.original, "prepared-original.json")}>
            {label("recoverOriginal")}
          </button>
        </div>
      ))}
      {p.preparationId === null && items && <RuleDependencies copies={items} />}
      {items?.map((item) => (
        <CopyEditor key={item.id} {...p} item={item} />
      ))}
    </section>
  );
}
type SavedDraft = { base: PreparedCopy; campaign: FolioCampaign; state: PreparedState };
function archiveKeys(key: string) {
  try {
    return Array.from({ length: sessionStorage.length }, (_, i) =>
      sessionStorage.key(i)
    ).filter((k): k is string => !!k && k.startsWith(key + ":original:"));
  } catch {
    return [];
  }
}
function restore(
  key: string,
  item: PreparedCopy
): { draft: SavedDraft | null; original: string | null } {
  const original = sessionStorage.getItem(key);
  if (!original) return { draft: null, original: null };
  try {
    const v = JSON.parse(original) as SavedDraft;
    parsePreparedCopy(v.base);
    parsePreparedState(v.state);
    parseCampaign(v.campaign);
    if (
      v.campaign.id !== item.campaignId ||
      v.base.campaignId !== item.campaignId ||
      v.base.preparationId !== item.preparationId ||
      v.base.id !== item.id ||
      v.state.kind !== item.state.kind
    )
      throw Error("invalid");
    return { draft: v, original: null };
  } catch {
    return { draft: null, original };
  }
}
function CopyEditor(
  p: Omit<Props, "preparationId"> & { preparationId: string | null; item: PreparedCopy }
) {
  const label = useHomebrewLabel(),
    { t } = useTranslation("common");
  const key =
    "folio-prepared-draft:" +
    (p.session.scope().uid ?? "") +
    ":" +
    p.campaign.id +
    ":" +
    (p.preparationId ?? "rules") +
    ":" +
    p.item.id;
  const [initial] = useState(() => {
    try {
      return restore(key, p.item);
    } catch {
      return { draft: null, original: null, unreadable: true };
    }
  });
  const [draft, setDraft] = useState<SavedDraft | null>(initial.draft),
    [storageError, setStorageError] = useState("unreadable" in initial),
    [original, setOriginal] = useState(initial.original),
    [version, setVersion] = useState<LibraryVersion | null>(null),
    [comparisonBase, setComparisonBase] = useState<PreparedCopy | null>(null),
    [error, setError] = useState(false),
    [reviewed, setReviewed] = useState(false),
    [remove, setRemove] = useState(false);
  const live = useRef(true),
    latestDraft = useRef(draft);
  useEffect(() => {
    latestDraft.current = draft;
  }, [draft]);
  const op = useLibraryOperation(
    p.repository,
    p.session,
    "prepared:" + p.campaign.id + ":" + (p.preparationId ?? "rules") + ":" + p.item.id,
    (operation) => {
      const current = latestDraft.current;
      if (
        current &&
        operation.kind === "preparation-state" &&
        equal(current.state, operation.state) &&
        equal(current.base, operation.base)
      ) {
        try {
          sessionStorage.removeItem(key);
          setDraft(null);
        } catch {
          setStorageError(true);
        }
      }
      setVersion(null);
      setComparisonBase(null);
      setRemove(false);
    }
  );
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const state = draft?.state ?? p.item.state;
  const stale =
    !!draft && (!equal(draft.base, p.item) || !equal(draft.campaign, p.campaign));
  const conflict =
    stale ||
    (!reviewed &&
      ["conflict", "rejected", "invalidated"].includes(op.state?.status ?? ""));
  function edit(state: PreparedState) {
    if (storageError || original) return;
    const next = {
      base: draft?.base ?? p.item,
      campaign: draft?.campaign ?? p.campaign,
      state,
    };
    try {
      sessionStorage.setItem(key, JSON.stringify(next));
      setDraft(next);
      setReviewed(false);
      setVersion(null);
    } catch {
      setStorageError(true);
    }
  }
  function review() {
    if (!draft) return;
    const next = { ...draft, base: p.item, campaign: p.campaign };
    try {
      sessionStorage.setItem(key, JSON.stringify(next));
      setDraft(next);
      setReviewed(true);
    } catch {
      setStorageError(true);
    }
  }
  const isLive = () => live.current;
  async function checkVersion() {
    const ticket = p.session.ticket();
    setError(false);
    try {
      const entry = await p.library.load(p.item.snapshot.entryId);
      ticket();
      if (!isLive()) return;
      if (!entry?.stableVersion || entry.stableVersion === p.item.snapshot.version) {
        setVersion(null);
        setError(true);
        return;
      }
      const next = await p.library.readVersion(
        { ownerUid: p.item.snapshot.ownerUid, id: p.item.snapshot.entryId },
        entry.stableVersion
      );
      ticket();
      if (isLive()) {
        setVersion(next);
        setComparisonBase(p.item);
      }
    } catch {
      try {
        ticket();
        if (live.current) setError(true);
      } catch {
        /* invalidated */
      }
    }
  }
  const canManage = p.canManage && p.item.snapshot.ownerUid === p.session.scope().uid;
  return (
    <article className="prepared-copy" data-prepared-id={p.item.id}>
      <header>
        <h4>{p.item.snapshot.definition.name}</h4>
        <p>
          {label("version")} {p.item.snapshot.version} ·{" "}
          {textValue(p.item.snapshot.definition.payload.data.source)} ·{" "}
          {textValue(p.item.snapshot.definition.payload.data.sourceVersion)}
        </p>
      </header>
      <details>
        <summary>{label("preview")}</summary>
        <HomebrewReader definition={p.item.snapshot.definition} />
      </details>
      <HomebrewExport definition={p.item.snapshot.definition} version={p.item.snapshot} />
      <fieldset
        disabled={!p.canManage || op.busy || storageError || !!original}
        className="homebrew-group"
      >
        <legend>{label("preparedState")}</legend>
        {state.kind === "campaign-rule" ? (
          <p role="status">{label(state.enabled ? "ruleEnabled" : "ruleDisabled")}</p>
        ) : (
          <div className="homebrew-grid">
            <label>
              {label("instanceLabel")}
              <input
                name="prepared-label"
                value={state.label}
                onChange={(e) => edit({ ...state, label: e.target.value })}
              />
            </label>
            <label>
              {label("currentHp")}
              <input
                name="prepared-hp"
                type="number"
                min={0}
                value={state.currentHp}
                onChange={(e) => edit({ ...state, currentHp: Number(e.target.value) })}
              />
            </label>
            <label>
              {label("tempHp")}
              <input
                name="prepared-temp-hp"
                type="number"
                min={0}
                value={state.tempHp}
                onChange={(e) => edit({ ...state, tempHp: Number(e.target.value) })}
              />
            </label>
            <label>
              {label("conditions")}
              <select
                multiple
                name="prepared-conditions"
                value={state.conditions}
                onChange={(e) =>
                  edit({
                    ...state,
                    conditions: [...e.target.selectedOptions].map((x) => x.value),
                  })
                }
              >
                {[...new Set([...CONDITIONS, ...state.conditions])].map((c) => (
                  <option key={c} value={c}>
                    {label("options." + c)}
                  </option>
                ))}
              </select>
            </label>
            {Object.entries(state.resources).map(([id, remaining]) => (
              <label key={id}>
                {label("resourceRemaining")} · {id}
                <input
                  type="number"
                  min={0}
                  value={remaining}
                  onChange={(e) =>
                    edit({
                      ...state,
                      resources: { ...state.resources, [id]: Number(e.target.value) },
                    })
                  }
                />
              </label>
            ))}
          </div>
        )}
      </fieldset>
      {state.kind === "monster" &&
        (state.currentHp > Number(p.item.snapshot.definition.payload.data.maxHp) ||
          Object.entries(state.resources).some(([id, remaining]) => {
            const resources = p.item.snapshot.definition.payload.data.resources;
            const row = Array.isArray(resources)
              ? resources.find(
                  (r) => r && typeof r === "object" && !Array.isArray(r) && r.id === id
                )
              : null;
            return (
              !row ||
              typeof row !== "object" ||
              Array.isArray(row) ||
              remaining > Number(row.capacity)
            );
          })) && <p role="status">{label("capacityMismatch")}</p>}
      {p.canManage && state.kind === "campaign-rule" && (
        <button
          disabled={op.busy || !navigator.onLine}
          onClick={() =>
            void op.run(() =>
              p.repository.stateIntent(p.campaign, p.item, {
                kind: "campaign-rule",
                enabled: !state.enabled,
              })
            )
          }
        >
          {label(state.enabled ? "disableRule" : "enableRule")}
        </button>
      )}
      {draft && (
        <div>
          <p role="status">{label(conflict ? "copyConflict" : "stateLocal")}</p>
          {conflict ? (
            <>
              <pre>
                {JSON.stringify(
                  { before: draft.base.state, current: p.item.state, local: draft.state },
                  null,
                  2
                )}
              </pre>
              <button disabled={op.busy} onClick={review}>
                {label("reviewCopy")}
              </button>
            </>
          ) : (
            <button
              disabled={op.busy || !navigator.onLine || storageError}
              onClick={() => {
                void op.run(() =>
                  p.repository.stateIntent(draft.campaign, draft.base, draft.state)
                );
              }}
            >
              {label("saveCopyState")}
            </button>
          )}
        </div>
      )}
      {original && (
        <div role="alert">
          <p>{label("preservedPayload")}</p>
          <button onClick={() => downloadText(original, "prepared-draft-original.json")}>
            {label("recoverOriginal")}
          </button>
          <button
            onClick={() => {
              try {
                const archive = key + ":original:" + crypto.randomUUID();
                sessionStorage.setItem(archive, original);
                if (sessionStorage.getItem(archive) !== original) throw Error("storage");
                sessionStorage.removeItem(key);
                setOriginal(null);
              } catch {
                setStorageError(true);
              }
            }}
          >
            {label("startFreshCopyDraft")}
          </button>
        </div>
      )}
      {archiveKeys(key).map((k) => (
        <button
          key={k}
          onClick={() =>
            downloadText(sessionStorage.getItem(k) ?? "", "prepared-draft-original.json")
          }
        >
          {label("recoverOriginal")}
        </button>
      ))}
      {(storageError || error || op.error) && (
        <p role="alert">{label("preparationFailed")}</p>
      )}
      {op.state && <p role="status">{t(libraryKey(op.state.status))}</p>}
      {op.state?.status === "unknown" && (
        <button onClick={() => void op.retry()}>{label("reconcileCopy")}</button>
      )}
      {p.canManage && (
        <div className="identity-actions">
          <button
            disabled={!canManage || !!draft || op.busy || !navigator.onLine}
            onClick={() => void checkVersion()}
          >
            {label("compareCopyVersion")}
          </button>
          <button disabled={op.busy || !!draft} onClick={() => setRemove(true)}>
            {label("removeCopy")}
          </button>
        </div>
      )}
      {version && (
        <section>
          <LibraryComparison
            before={p.item.snapshot.definition}
            after={version.definition}
          />
          <button
            disabled={op.busy || !!draft || !equal(comparisonBase, p.item)}
            onClick={() =>
              void op.run(() => p.repository.updateIntent(p.campaign, p.item, version))
            }
          >
            {label("updateCopyVersion")}
          </button>
        </section>
      )}
      {remove && (
        <section>
          <p>{label("removeCopyHelp")}</p>
          <button
            disabled={op.busy}
            onClick={() =>
              void op.run(() => p.repository.removeIntent(p.campaign, p.item))
            }
          >
            {label("confirmRemoveCopy")}
          </button>
          <button onClick={() => setRemove(false)}>{label("cancelCopy")}</button>
        </section>
      )}
    </article>
  );
}
function RuleDependencies({ copies }: { copies: PreparedCopy[] }) {
  const label = useHomebrewLabel();
  const active = copies.filter(
    (c) => c.state.kind === "campaign-rule" && c.state.enabled
  );
  const ids = new Set(active.map((c) => c.snapshot.definition.payload.data.mechanicId));
  const problems: string[] = [];
  for (const c of active) {
    const d = c.snapshot.definition.payload.data;
    for (const dependency of Array.isArray(d.dependencies) ? d.dependencies : []) {
      if (!dependency || typeof dependency !== "object" || Array.isArray(dependency))
        continue;
      const id = dependency.mechanicId;
      if (
        (dependency.relation === "required" && !ids.has(id)) ||
        (dependency.relation === "conflicting" && ids.has(id))
      )
        problems.push(c.snapshot.definition.name + " · " + textValue(id));
    }
    if (
      d.replacesMechanicId &&
      active.some(
        (other) =>
          other.id !== c.id &&
          other.snapshot.definition.payload.data.replacesMechanicId ===
            d.replacesMechanicId &&
          other.snapshot.definition.payload.data.priority === d.priority
      )
    )
      problems.push(c.snapshot.definition.name + " · " + textValue(d.replacesMechanicId));
  }
  return problems.length ? (
    <div role="status">
      <h4>{label("ruleDependencies")}</h4>
      <p>{label("ruleDependencyHelp")}</p>
      <ul>
        {[...new Set(problems)].map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </div>
  ) : null;
}
