import { OperationController, type OperationState } from "@/lib/shared/controller";
import { equal } from "@/lib/shared/model";
import type { SessionController } from "@/lib/identity/session";
import { parseEntry, parseDefinition } from "@/lib/library/model";
import type {
  LibraryDefinition,
  LibraryEntry,
  LibraryFamily,
  LibraryOperation,
  LibraryReceipt,
} from "@/lib/library/model";
import type { LibraryRepository } from "@/lib/library/model";

type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;
/** An index of local-only identities; definitions remain in their one draft record. */
export function localLibraryDrafts(
  storage: Storage,
  uid: string
): Pick<LibraryEntry, "id" | "draft" | "stableVersion" | "revision" | "provenance">[] {
  try {
    const ids = JSON.parse(
      storage.getItem("folio-library-drafts:" + uid) ?? "[]"
    ) as string[];
    return ids.flatMap((id) => {
      try {
        const value = JSON.parse(
          storage.getItem("folio-library:" + uid + ":" + id) ?? "null"
        ) as {
          draft?: unknown;
          base?: { stableVersion: number; revision: number };
        } | null;
        return value?.draft
          ? [
              {
                id,
                draft: parseDefinition(value.draft),
                stableVersion: value.base?.stableVersion ?? 0,
                revision: value.base?.revision ?? 0,
                provenance: null,
              },
            ]
          : [];
      } catch {
        return [];
      } // The editor keeps incompatible original bytes recoverable.
    });
  } catch {
    return [];
  }
}
export interface DraftState {
  loaded: boolean;
  base: LibraryEntry | null;
  latest: LibraryEntry | null;
  draft: LibraryDefinition | null;
  dirty: boolean;
  online: boolean;
  invalidated: boolean;
  validationFailed: boolean;
  recoveryOriginals: string[];
  storageFailed: boolean;
  loadError: boolean;
  operation: OperationState<LibraryOperation, LibraryReceipt> | null;
}
export class LibraryDraftController {
  state: DraftState = {
    loaded: false,
    base: null,
    latest: null,
    draft: null,
    dirty: false,
    online: true,
    invalidated: false,
    validationFailed: false,
    recoveryOriginals: [],
    storageFailed: false,
    loadError: false,
    operation: null,
  };
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private controller: OperationController<LibraryOperation, LibraryReceipt> | null = null;
  private detach = () => {};
  private untrack: () => void;
  private check: () => void;
  private key: string;
  private disposed = false;
  private protectOriginal = false;
  private loadGeneration = 0;
  private repository: LibraryRepository;
  private session: SessionController;
  readonly id: string;
  private family: LibraryFamily;
  private storage: Storage;
  constructor(
    repository: LibraryRepository,
    session: SessionController,
    id: string,
    family: LibraryFamily,
    storage: Storage
  ) {
    this.repository = repository;
    this.session = session;
    this.id = id;
    this.family = family;
    this.storage = storage;
    this.key = "folio-library:" + (session.scope().uid ?? "") + ":" + id;
    this.check = session.ticket();
    this.untrack = session.track(() => {
      if (this.disposed) return;
      clearTimeout(this.timer);
      this.controller?.invalidate();
      this.retain(true);
      this.publish({
        invalidated: true,
        loaded: false,
        draft: null,
        base: null,
        latest: null,
      });
    });
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  snapshot = () => this.state;
  private publish(delta: Partial<DraftState>) {
    this.state = { ...this.state, ...delta };
    for (const listener of this.listeners) listener();
  }
  private retain(invalidated = this.state.invalidated) {
    if (!this.state.loaded || !this.state.draft || this.protectOriginal) return false;
    try {
      const indexKey = "folio-library-drafts:" + (this.session.scope().uid ?? "");
      const ids = JSON.parse(this.storage.getItem(indexKey) ?? "[]") as string[];
      const indexed = ids.filter((id) => id !== this.id);
      if (!this.state.base) indexed.push(this.id);
      const indexBytes = JSON.stringify(indexed);
      const bytes = JSON.stringify({
        base: this.state.base,
        draft: this.state.draft,
        dirty: this.state.dirty,
        operation:
          this.state.operation?.status === "acknowledged"
            ? null
            : (this.state.operation?.envelope ?? null),
        invalidated,
      });
      this.storage.setItem(indexKey, indexBytes);
      this.storage.setItem(this.key, bytes);
      if (
        this.storage.getItem(indexKey) !== indexBytes ||
        this.storage.getItem(this.key) !== bytes
      )
        throw new Error("storage-readback");
      if (this.state.storageFailed) this.publish({ storageFailed: false });
      return true;
    } catch {
      this.publish({ storageFailed: true });
      return false;
    }
  }

  async load() {
    const generation = ++this.loadGeneration;
    type Recovery = {
      base: LibraryEntry | null;
      draft: LibraryDefinition;
      dirty: boolean;
      operation: LibraryOperation | null;
      invalidated: boolean;
    };
    let recovery: Recovery | null = null;
    if (!this.state.loaded) {
      let original: string | null = null;
      const quarantineKey = this.key + ":incompatible";
      try {
        const archive: unknown = JSON.parse(this.storage.getItem(quarantineKey) ?? "[]");
        if (!Array.isArray(archive) || archive.some((raw) => typeof raw !== "string"))
          throw new Error("incompatible-recovery-index");
        this.publish({ recoveryOriginals: archive });
      } catch {
        this.protectOriginal = true;
        this.publish({ storageFailed: true });
      }
      try {
        const value = JSON.parse(
          (original = this.storage.getItem(this.key)) ?? "null"
        ) as Recovery | null;
        if (value) {
          parseDefinition(value.draft);
          if (value.base) parseEntry(value.base);
        }
        if (
          value &&
          typeof value.draft.name === "string" &&
          typeof value.draft.description === "string" &&
          value.draft.family === this.family &&
          (!value.base ||
            (value.base.ownerUid === this.session.scope().uid &&
              value.base.id === this.id &&
              Number.isSafeInteger(value.base.revision)))
        )
          recovery = value;
        else if (value) throw new Error("incompatible-recovery-context");
      } catch {
        if (original) {
          const originals = [...new Set([...this.state.recoveryOriginals, original])];
          this.publish({ recoveryOriginals: originals });
          try {
            if (this.protectOriginal) throw new Error("unreadable-recovery-index");
            this.storage.setItem(quarantineKey, JSON.stringify(originals));
          } catch {
            this.protectOriginal = true;
            this.publish({ storageFailed: true });
          }
        }
      }
      if (recovery)
        this.publish({
          loaded: true,
          base: recovery.base,
          draft: recovery.draft,
          dirty: recovery.dirty,
          invalidated: recovery.invalidated,
          operation: recovery.operation
            ? {
                envelope: recovery.operation,
                status:
                  recovery.invalidated ||
                  !equal(recovery.operation.scope, this.session.scope())
                    ? "invalidated"
                    : "unknown",
              }
            : null,
        });
    }
    try {
      const latest = await this.repository.load(this.id);
      this.check();
      if (this.disposed || generation !== this.loadGeneration) return;
      if (latest && this.state.base && latest.revision < this.state.base.revision) return;
      if (this.state.loaded) this.publish({ latest, loadError: false });
      else
        this.publish({
          loaded: true,
          base: latest,
          latest,
          draft: latest?.draft ?? {
            schema: 1,
            family: this.family,
            name: "",
            description: "",
            tags: [],
            payload: { schema: 1, data: {} },
          },
          loadError: false,
        });
      if (
        !this.state.dirty &&
        (!this.state.operation || this.state.operation.status === "acknowledged")
      )
        this.publish({
          base: latest,
          draft: latest?.draft ?? this.state.draft,
          operation: null,
          invalidated: false,
        });
      this.retain();
    } catch (error) {
      if (this.disposed || generation !== this.loadGeneration) return;
      const reason =
        (error as { code?: string; message?: string }).code ?? (error as Error).message;
      if (reason === "stale-session" || reason === "permission-denied") {
        clearTimeout(this.timer);
        this.controller?.invalidate();
        this.publish({
          loaded: false,
          invalidated: true,
          draft: null,
          base: null,
          latest: null,
          loadError: true,
        });
      } else this.publish({ loadError: true });
    }
  }
  edit(
    delta: Partial<Pick<LibraryDefinition, "name" | "description" | "tags" | "payload">>
  ) {
    if (
      !this.state.loaded ||
      !this.state.draft ||
      this.state.invalidated ||
      (this.state.operation && this.state.operation.status !== "acknowledged")
    )
      return;
    this.detach();
    this.controller = null;
    this.publish({
      draft: { ...this.state.draft, ...delta },
      dirty: true,
      validationFailed: false,
      operation: null,
    });
    this.retain();
    clearTimeout(this.timer);
    if (this.state.online)
      this.timer = setTimeout(() => {
        void this.save();
      }, 600);
  }
  setOnline(online: boolean) {
    this.publish({ online });
    if (!online) clearTimeout(this.timer);
  }
  async save() {
    clearTimeout(this.timer);
    if (
      this.disposed ||
      !this.state.loaded ||
      !this.state.draft ||
      this.state.invalidated ||
      !this.state.online ||
      !this.state.dirty
    )
      return;
    try {
      this.check();
    } catch {
      return;
    }
    if (!this.retain()) return;
    if (this.controller) {
      await this.controller.retry();
      return;
    }
    if (this.state.operation && this.state.operation.status !== "unknown") return;
    const draft = structuredClone(this.state.draft),
      base = this.state.base;
    const previousOperation = this.state.operation;
    const retry = !!previousOperation;
    let envelope: LibraryOperation;
    try {
      envelope =
        this.state.operation?.envelope ??
        this.repository.saveIntent(base, draft, this.id);
    } catch {
      this.publish({ validationFailed: true });
      this.retain();
      return;
    }
    const c = new OperationController(envelope, this.repository);
    this.controller = c;
    this.detach = c.subscribe(() => {
      if (this.disposed) return;
      this.publish({ operation: c.state });
      if (c.state.status === "acknowledged" && c.state.receipt) {
        const entry: LibraryEntry = {
          schema: 1,
          ownerUid: envelope.uid,
          id: this.id,
          revision: c.state.receipt.revision,
          draft,
          stableVersion: base?.stableVersion ?? 0,
          provenance: base?.provenance ?? null,
          lastOperation: { uid: envelope.uid, opId: envelope.opId },
        };
        this.publish({ base: entry, latest: entry, dirty: false });
      }
      if (c.state.status === "conflict") void this.load();
      this.retain();
    });
    this.publish({ operation: c.state });
    if (!this.retain()) {
      // A recovered unknown may already have committed; never retire its receipt identity.
      this.detach();
      this.controller = null;
      this.publish({ operation: previousOperation });
      return;
    }
    await (retry ? c.retry() : c.submit());
  }
  review() {
    if (
      !this.state.online ||
      this.state.loadError ||
      !this.state.loaded ||
      !this.state.draft
    )
      return;
    this.detach();
    this.controller?.invalidate();
    this.controller = null;
    this.publish({
      base: this.state.latest,
      invalidated: false,
      operation: null,
      dirty: true,
    });
    this.retain();
  }
  acceptBase(entry: LibraryEntry) {
    if (this.disposed || this.state.invalidated) return;
    if (
      entry.revision <
      Math.max(this.state.base?.revision ?? 0, this.state.latest?.revision ?? 0)
    )
      return;
    if (this.state.dirty) {
      this.publish({ latest: entry });
      return;
    }
    this.detach();
    this.controller = null;
    this.publish({
      base: entry,
      latest: entry,
      draft: entry.draft,
      dirty: false,
      operation: null,
    });
    this.retain();
  }
  acceptRemoval(entry: LibraryEntry) {
    this.check();
    if (
      entry.id !== this.id ||
      (this.state.draft && !equal(this.state.draft, entry.draft))
    )
      throw new Error("stale-base");
    const indexKey = "folio-library-drafts:" + (this.session.scope().uid ?? "");
    const ids = JSON.parse(this.storage.getItem(indexKey) ?? "[]") as string[];
    this.storage.removeItem(this.key);
    this.storage.setItem(indexKey, JSON.stringify(ids.filter((id) => id !== this.id)));
    this.loadGeneration++;
    clearTimeout(this.timer);
    this.publish({ loaded: false, draft: null, base: null, latest: null, dirty: false });
  }
  dispose() {
    this.disposed = true;
    this.loadGeneration++;
    clearTimeout(this.timer);
    this.detach();
    this.retain();
    this.controller?.invalidate();
    this.untrack();
    this.listeners.clear();
  }
}
