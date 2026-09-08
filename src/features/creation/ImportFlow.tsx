import { creationFlowKey } from "@/i18n/creation-keys";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { db } from "@/lib/firebase";
import type { SessionController } from "@/lib/identity/session";
import type { FolioCharacter } from "@/lib/identity/model";
import { dryRunMigration } from "@/lib/identity/migration";
import { CreationDraftStorage } from "@/lib/character-creation/draft";
import {
  parseImportDraft,
  type ImportDraft,
} from "@/lib/character-creation/import-draft";
import {
  analyzeImport,
  reviewImport,
  type RulesEdition,
} from "@/lib/character-creation/import-review";
import {
  createImportRepository,
  type ImportOperation,
} from "@/lib/character-creation/import-repository";
import { useIdentityNavigation } from "@/features/identity/IdentityNavigation";
import { useLibraryOperation } from "@/features/library/useLibraryOperation";
import { downloadText } from "@/features/library/homebrew-files";
import { CheckboxField } from "@/components/ui/selection";
export function ImportFlow({
  session,
  enabled,
  characters,
  recoverOriginal,
}: {
  session: SessionController;
  enabled: boolean;
  characters: readonly FolioCharacter[];
  recoverOriginal: (id: string) => Promise<string>;
}) {
  const { navigation, route } = useIdentityNavigation(),
    { t } = useTranslation("common");
  const label = (key: string) => t(creationFlowKey(key));
  const uid = session.scope().uid ?? "";
  const [store] = useState(
    () =>
      new CreationDraftStorage(sessionStorage, "folio-import-draft:" + uid, (value) =>
        parseImportDraft(value, uid)
      )
  );
  const [loaded, setLoaded] = useState(() => store.load()),
    [error, setError] = useState(false),
    [readFence, setReadFence] = useState<(() => void) | null>(null);
  let reading = false;
  try {
    if (readFence) {
      readFence();
      reading = true;
    }
  } catch {
    /* A departed read is no longer busy. */
  }
  const rawRepository = useMemo(() => createImportRepository(db, session), [session]);
  const fences = useRef(new Map<string, { check: () => void; revision: number }>()),
    fileGeneration = useRef(0);
  const repository = useMemo(
    () => ({
      validateRecovered: (op: ImportOperation) => rawRepository.validateRecovered(op),
      reconcile: (op: ImportOperation) => rawRepository.reconcile(op),
      commit: (op: ImportOperation, check?: () => void) =>
        rawRepository.commit(op, () => {
          check?.();
          const binding = fences.current.get(op.opId);
          try {
            if (!binding) throw Error("stale-session");
            binding.check();
          } catch {
            throw Error("stale-session");
          }
          store.submit(op.opId, binding.revision);
          store.verify(op.opId);
        }),
    }),
    [rawRepository, store]
  );
  const operation = useLibraryOperation(
    repository,
    session,
    "character-import-review",
    (op) => {
      const retired = store.retire(op.opId);
      setLoaded(store.load());
      if (retired) {
        const binding = fences.current.get(op.opId);
        if (binding)
          try {
            binding.check();
            navigation.go({ page: "characters" }, { replace: true });
            navigation.go({ page: "characters", owner: uid, character: op.character.id });
          } catch {
            /* Preserve the later navigation. */
          }
      }
    }
  );
  const draft = loaded.value?.draft;
  const analysis = useMemo(() => (draft ? analyzeImport(draft.original) : null), [draft]);
  const preview = useMemo(
    () =>
      draft
        ? dryRunMigration(draft.original, { ownerUid: uid, id: "preview" }).character
        : null,
    [draft, uid]
  );
  if (!enabled || route.page !== "characters" || route.creation !== "import") return null;
  const target = route.review ? characters.find((c) => c.id === route.review) : null;
  const matching = !route.review ? !draft?.target : draft?.target?.id === route.review;
  const storageError = loaded.error || operation.error;
  const blocked =
    reading ||
    operation.busy ||
    storageError ||
    (!!operation.state && operation.state.status !== "acknowledged");
  const replace = (next: ImportDraft) => {
    store.recover(next);
    setLoaded(store.load());
    setError(false);
  };
  const save = (next: ImportDraft) => {
    try {
      store.save(next);
      setLoaded(store.load());
      setError(false);
    } catch {
      setError(true);
    }
  };
  const loadTarget = async () => {
    if (!target) return;
    const check = session.ticket(),
      origin = navigation.ticket();
    setReadFence(() => origin);
    try {
      const original = await recoverOriginal(target.id);
      check();
      origin();
      const base = await rawRepository.read(target);
      check();
      origin();
      const analysis = analyzeImport(original);
      replace({
        schema: 1,
        ownerUid: uid,
        original,
        target,
        base,
        review:
          draft?.target?.id === target.id && draft.original === original
            ? draft.review
            : base
              ? reviewImport(analysis, base.declaredEdition, base.reviewed)
              : reviewImport(analysis, "unknown", []),
      });
    } catch {
      try {
        check();
        origin();
        setError(true);
      } catch {
        /* Detached */
      }
    } finally {
      try {
        check();
        origin();
        setReadFence(null);
      } catch {
        /* Detached */
      }
    }
  };
  return (
    <section className="creation-flow creation-import">
      <button onClick={() => navigation.go({ page: "characters" })}>
        {label("backCharacters")}
      </button>
      <h1>{label(route.review ? "reconcileTitle" : "importTitle")}</h1>
      <p>{label("importHelp")}</p>
      {(error || storageError) && (
        <p role="alert">{label(storageError ? "storageError" : "importError")}</p>
      )}
      {(loaded.original !== null || operation.recoveryOriginal !== null) && (
        <div role="alert">
          <p>{label("unreadableDraft")}</p>
          <button
            onClick={() =>
              downloadText(
                loaded.original ?? operation.recoveryOriginal ?? "",
                "import-recovery-original.json"
              )
            }
          >
            {label("recoverOriginal")}
          </button>
          {operation.recoveryOriginal !== null && (
            <button
              onClick={() => {
                if (operation.preserveUnreadable()) {
                  const opId = store.load().value?.submitted?.opId;
                  try {
                    if (opId) store.reviewSubmission(opId);
                  } catch {
                    setError(true);
                  }
                  setLoaded(store.load());
                }
              }}
            >
              {label("preserveRequest")}
            </button>
          )}
        </div>
      )}
      {operation.state && (operation.state.status !== "acknowledged" || !draft) && (
        <div role="status">
          <p>{t(`identity.operation${operation.state.status}`)}</p>
          {operation.state.status === "acknowledged" && !draft && (
            <button
              onClick={() => {
                const op = operation.state?.envelope;
                if (!op) return;
                navigation.go({ page: "characters" }, { replace: true });
                navigation.go({
                  page: "characters",
                  owner: op.character.ownerUid,
                  character: op.character.id,
                });
              }}
            >
              {t("identity.viewCharacter")}
            </button>
          )}
          {operation.state.status === "unknown" && (
            <button
              onClick={() => {
                void operation.retry();
              }}
            >
              {label("checkReceipt")}
            </button>
          )}
          {["conflict", "rejected", "invalidated"].includes(operation.state.status) && (
            <button
              onClick={() => {
                const op = operation.state?.envelope;
                void operation
                  .reviewSettled()
                  .then((editable) => {
                    if (editable && op) {
                      store.reviewSubmission(op.opId);
                      setLoaded(store.load());
                      setError(false);
                    }
                  })
                  .catch(() => setError(true));
              }}
            >
              {label("reviewAgain")}
            </button>
          )}
        </div>
      )}
      {route.review ? (
        <div className="identity-panel">
          <p>{target?.name ?? label("unavailableTarget")}</p>
          <button
            disabled={!target || blocked}
            onClick={() => {
              void loadTarget();
            }}
          >
            {label("loadComparison")}
          </button>
        </div>
      ) : (
        <label className="identity-button identity-import">
          {label("chooseFile")}
          <input
            type="file"
            accept=".json,application/json"
            disabled={blocked}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (!file) return;
              const selection = ++fileGeneration.current,
                check = session.ticket(),
                origin = navigation.ticket();
              setReadFence(() => origin);
              void file
                .text()
                .then((original) => {
                  check();
                  origin();
                  if (selection !== fileGeneration.current) return;
                  const analysis = analyzeImport(original);
                  replace({
                    schema: 1,
                    ownerUid: uid,
                    original,
                    target: null,
                    base: null,
                    review: reviewImport(
                      analysis,
                      analysis.edition.kind === "known"
                        ? analysis.edition.value
                        : "unknown",
                      []
                    ),
                  });
                })
                .catch(() => {
                  try {
                    check();
                    origin();
                    if (selection === fileGeneration.current) setError(true);
                  } catch {
                    /* No late import */
                  }
                })
                .finally(() => {
                  try {
                    check();
                    origin();
                    if (selection === fileGeneration.current) setReadFence(null);
                  } catch {
                    /* No late UI */
                  }
                });
            }}
          />
        </label>
      )}
      {reading && <p role="status">{label("reading")}</p>}
      {matching && draft && analysis && preview && (
        <div className="identity-panel">
          <h2>{preview.name}</h2>
          <dl className="identity-facts">
            <div>
              <dt>{label("fileFormat")}</dt>
              <dd>{label("schemaThree")}</dd>
            </div>
            <div>
              <dt>{label("sourceEdition")}</dt>
              <dd>
                {analysis.edition.kind === "known"
                  ? "D&D " + analysis.edition.value
                  : analysis.edition.kind === "unsupported" ||
                      analysis.edition.kind === "conflicting"
                    ? label("edition." + analysis.edition.kind) +
                      ": " +
                      analysis.edition.values
                        .map((value) => JSON.stringify(value))
                        .join(", ")
                    : analysis.edition.kind === "invalid"
                      ? label("edition.invalid") +
                        ": " +
                        analysis.edition.fields.join(", ")
                      : label("editionUnknown")}
              </dd>
            </div>
            <div>
              <dt>{label("destination")}</dt>
              <dd>{label("preservedCopy")}</dd>
            </div>
          </dl>
          <p>{label("notConversion")}</p>
          {draft.base && (
            <p>
              {label("savedEdition")}:{" "}
              {draft.base.declaredEdition === "unknown"
                ? label("editionUnknown")
                : "D&D " + draft.base.declaredEdition}
              . {label("reviewPreserved")}
            </p>
          )}
          <label>
            {label("declareEdition")}
            <select
              disabled={blocked}
              value={draft.review.declaredEdition}
              onChange={(event) =>
                save({
                  ...draft,
                  review: reviewImport(
                    analysis,
                    event.target.value as RulesEdition,
                    draft.review.reviewed
                  ),
                })
              }
            >
              <option value="unknown">{label("editionUnknown")}</option>
              <option value="2014">D&D 2014</option>
              <option value="2024">D&D 2024</option>
            </select>
          </label>
          {analysis.categories.map((category) => (
            <section className="creation-import-category" key={category.id}>
              <h3>{label("categories." + category.id)}</h3>
              <p>{label("preservedUnresolved")}</p>
              <CheckboxField
                label={label("reviewedCategory")}
                checked={draft.review.reviewed.includes(category.id)}
                disabled={blocked}
                onCheckedChange={(checked) =>
                  save({
                    ...draft,
                    review: reviewImport(
                      analysis,
                      draft.review.declaredEdition,
                      checked
                        ? [...draft.review.reviewed, category.id]
                        : draft.review.reviewed.filter((id) => id !== category.id)
                    ),
                  })
                }
              />
              <details>
                <summary>{label("preservedDetails")}</summary>
                {category.paths.map((path) => {
                  const read = (root: unknown) =>
                    path
                      .split(".")
                      .reduce<unknown>(
                        (value, key) =>
                          value !== null && typeof value === "object"
                            ? (value as Record<string, unknown>)[key]
                            : undefined,
                        root
                      );
                  const original = read(JSON.parse(draft.original));
                  const projected = read(preview.sheet);
                  return (
                    <section key={path} className="creation-import-comparison">
                      <h4>{path}</h4>
                      <p>
                        {label(
                          projected === undefined ? "archiveOnly" : "projectedComparison"
                        )}
                      </p>
                      <h5>{label("originalValue")}</h5>
                      <pre>{JSON.stringify(original, null, 2)}</pre>
                      <h5>{label("projectedValue")}</h5>
                      {projected === undefined ? (
                        <p>{label("notProjected")}</p>
                      ) : (
                        <pre>{JSON.stringify(projected, null, 2)}</pre>
                      )}
                    </section>
                  );
                })}
              </details>
            </section>
          ))}
          <button onClick={() => downloadText(draft.original, "character-original.json")}>
            {label("recoverOriginal")}
          </button>
          <button
            disabled={
              blocked || draft.review.reviewed.length !== analysis.categories.length
            }
            onClick={() => {
              const check = session.ticket(),
                origin = navigation.ticket();
              void operation.run(async () => {
                const current = store.load().value;
                if (!current) throw Error("creation-draft-missing");
                const value = current.draft;
                const op = value.target
                  ? await rawRepository.reviewIntent(
                      value.target,
                      value.original,
                      value.base,
                      value.review
                    )
                  : await rawRepository.intent(value.original, value.review);
                check();
                origin();
                fences.current.set(op.opId, {
                  check: origin,
                  revision: current.revision,
                });
                return op;
              });
            }}
          >
            {label(draft.target ? "saveReconciliation" : "confirmImport")}
          </button>
        </div>
      )}
      {storageError && (
        <button
          onClick={() => {
            setLoaded(store.load());
            setError(false);
            void operation.retryStorage();
          }}
        >
          {label("retryStorage")}
        </button>
      )}
    </section>
  );
}
