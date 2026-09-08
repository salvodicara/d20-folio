import { creationFlowKey } from "@/i18n/creation-keys";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { db } from "@/lib/firebase";
import type { SessionController } from "@/lib/identity/session";
import type { LibraryRepository, LibraryVersion } from "@/lib/library/model";
import { CreationDraftStorage } from "@/lib/character-creation/draft";
import {
  newCreationDraft,
  parseCreationDraft,
  type CreationDraft,
  type CreationStep,
} from "@/lib/character-creation/model";
import {
  previewCreation,
  creationCandidate,
  validateCreationCandidate,
} from "@/lib/character-creation/compose";
import { verifyCatalogueSnapshot } from "@/lib/character-creation/catalogue";
import {
  createCreationRepository,
  type CreationOperation,
} from "@/lib/character-creation/repository";
import { useIdentityNavigation } from "@/features/identity/IdentityNavigation";
import { useLibraryOperation } from "@/features/library/useLibraryOperation";
import { downloadText } from "@/features/library/homebrew-files";
import { CreationWizard } from "./CreationWizard";

export function CreationFlow({
  session,
  library,
  enabled,
  generation,
}: {
  session: SessionController;
  library: LibraryRepository;
  enabled: boolean;
  generation: number;
}) {
  const { route, navigation } = useIdentityNavigation();
  const { t } = useTranslation("common");
  const label = (key: string) => t(creationFlowKey(key));
  const uid = session.scope().uid ?? "";
  const [store] = useState(
    () =>
      new CreationDraftStorage(sessionStorage, "folio-creation-draft:" + uid, (value) =>
        parseCreationDraft(value, uid, verifyCatalogueSnapshot)
      )
  );
  const [loaded, setLoaded] = useState(() => store.load());
  const [storageError, setStorageError] = useState(false);
  const [librarySources, setLibrarySources] = useState<LibraryVersion[]>([]);
  const [libraryError, setLibraryError] = useState(false);
  const active = enabled && route.page === "characters" && route.creation === "new";
  const rawRepository = useMemo(
    () =>
      createCreationRepository(db, session, {
        verifyCatalogue: verifyCatalogueSnapshot,
        validateCandidate: validateCreationCandidate,
      }),
    [session]
  );
  const fences = useRef(new Map<string, () => void>());
  const revisions = useRef(new Map<string, number>());
  const repository = useMemo(
    () => ({
      reconcile: (op: CreationOperation) => rawRepository.reconcile(op),
      validateRecovered: (op: CreationOperation) => rawRepository.validateRecovered(op),
      commit: (operation: CreationOperation, check?: () => void) =>
        rawRepository.commit(operation, () => {
          check?.();
          const fence = fences.current.get(operation.opId),
            revision = revisions.current.get(operation.opId);
          try {
            if (!fence || revision === undefined) throw Error("stale-session");
            fence();
          } catch {
            throw Error("stale-session");
          }
          store.submit(operation.opId, revision);
          store.verify(operation.opId);
        }),
    }),
    [rawRepository, store]
  );
  const operation = useLibraryOperation(repository, session, "guided-creation", (op) => {
    const retired = store.retire(op.opId);
    setLoaded(store.load());
    if (retired) {
      const fence = fences.current.get(op.opId);
      if (fence) {
        try {
          fence();
          navigation.go({ page: "characters" }, { replace: true });
          navigation.go({
            page: "characters",
            owner: op.character.ownerUid,
            character: op.character.id,
          });
        } catch {
          /* A later route owns focus. */
        }
      }
    }
  });
  useEffect(() => {
    if (!active) return;
    let live = true,
      request = 0;
    const check = session.ticket();
    const stop = library.watchEntries(
      (entries) => {
        const versionRequest = ++request;
        void Promise.all(
          entries
            .filter(
              (e) =>
                e.stableVersion > 0 &&
                ["species", "background", "class"].includes(e.draft.family)
            )
            .map((e) =>
              library.readVersion({ ownerUid: e.ownerUid, id: e.id }, e.stableVersion)
            )
        )
          .then((versions) => {
            check();
            if (live && request === versionRequest) {
              setLibrarySources(versions);
              setLibraryError(false);
            }
          })
          .catch(() => {
            if (live && request === versionRequest) {
              setLibrarySources([]);
              setLibraryError(true);
            }
          });
      },
      () => {
        request++;
        if (live) {
          setLibrarySources([]);
          setLibraryError(true);
        }
      }
    );
    return () => {
      live = false;
      request++;
      stop();
    };
  }, [active, library, session, generation]);
  const draft = loaded.value?.draft ?? null;
  const preview = useMemo(() => (draft ? previewCreation(draft) : null), [draft]);
  const save = (next: CreationDraft) => {
    try {
      store.save(next);
      setLoaded(store.load());
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  };
  const begin = () => {
    try {
      const draft = newCreationDraft(uid, crypto.randomUUID());
      if (loaded.original !== null) store.recover(draft);
      else store.save(draft);
      setLoaded(store.load());
      setStorageError(false);
      navigation.go(
        { page: "characters", creation: "new", step: "identity" },
        { replace: true }
      );
    } catch {
      setStorageError(true);
    }
  };
  if (!active) return null;
  const error = storageError || loaded.error || operation.error;
  const disabled =
    operation.busy ||
    operation.preparing ||
    error ||
    (!!operation.state && operation.state.status !== "acknowledged");
  const goStep = (step: CreationStep) => {
    if (draft) save({ ...draft, step });
    navigation.go({ page: "characters", creation: "new", step });
  };
  return (
    <section className="creation-flow">
      {error && <p role="alert">{label("storageError")}</p>}
      {operation.recoveryOriginal !== null && (
        <div role="alert">
          <p>{label("unreadableRequest")}</p>
          <button
            onClick={() =>
              downloadText(
                operation.recoveryOriginal ?? "",
                "creation-request-original.json"
              )
            }
          >
            {label("recoverOriginal")}
          </button>
          <button
            onClick={() => {
              if (operation.preserveUnreadable()) {
                const opId = store.load().value?.submitted?.opId;
                try {
                  if (opId) store.reviewSubmission(opId);
                } catch {
                  setStorageError(true);
                }
                setLoaded(store.load());
              }
            }}
          >
            {label("preserveRequest")}
          </button>
        </div>
      )}
      {libraryError && <p role="alert">{label("libraryError")}</p>}
      {loaded.original !== null && (
        <div role="alert">
          <p>{label("unreadableDraft")}</p>
          <button
            onClick={() =>
              downloadText(loaded.original ?? "", "creation-draft-original.json")
            }
          >
            {label("recoverOriginal")}
          </button>
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
              disabled={operation.preparing}
              onClick={() => {
                void operation.retry();
              }}
            >
              {label("checkReceipt")}
            </button>
          )}
          {["conflict", "rejected", "invalidated"].includes(operation.state.status) && (
            <button
              disabled={operation.preparing}
              onClick={() => {
                const op = operation.state?.envelope;
                void operation
                  .reviewSettled()
                  .then((editable) => {
                    if (editable && op) {
                      store.reviewSubmission(op.opId);
                      setLoaded(store.load());
                      setStorageError(false);
                    }
                  })
                  .catch(() => setStorageError(true));
              }}
            >
              {label("reviewAgain")}
            </button>
          )}
        </div>
      )}
      {!draft || !preview ? (
        <div className="identity-panel">
          <h1>{label("startTitle")}</h1>
          <p>{label("startHelp")}</p>
          <button disabled={operation.busy} onClick={begin}>
            {label(loaded.original ? "preserveAndStart" : "start")}
          </button>
          <button onClick={() => navigation.go({ page: "characters" })}>
            {label("backCharacters")}
          </button>
        </div>
      ) : (
        <CreationWizard
          draft={draft}
          preview={preview}
          step={route.step ?? "identity"}
          librarySources={librarySources}
          disabled={disabled}
          retained={!error}
          onChange={save}
          onStep={goStep}
          onExit={() => navigation.go({ page: "characters" })}
          onLibrary={() => navigation.go({ page: "library", tab: "creations" })}
          onConfirm={() => {
            const fence = navigation.ticket();
            void operation.run(() => {
              fence();
              const current = store.load().value;
              if (!current) throw Error("creation-draft-missing");
              const op = rawRepository.intent(creationCandidate(current.draft));
              revisions.current.set(op.opId, current.revision);
              fences.current.set(op.opId, fence);
              return op;
            });
          }}
        />
      )}
      {error && (
        <button
          onClick={() => {
            setLoaded(store.load());
            setStorageError(false);
            void operation.retryStorage();
          }}
        >
          {label("retryStorage")}
        </button>
      )}
    </section>
  );
}
