import { equal } from "../shared/model";
import { object } from "../identity/model";
type StoragePort = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export interface RetainedCreation<T> {
  schema: 1;
  revision: number;
  draft: T;
  submitted: { opId: string; revision: number } | null;
}
/** One draft record; the shared operation lifecycle separately owns its one immutable envelope. */
export class CreationDraftStorage<T> {
  private storage: StoragePort;
  readonly key: string;
  private parse: (raw: unknown) => T;
  constructor(storage: StoragePort, key: string, parse: (raw: unknown) => T) {
    this.storage = storage;
    this.key = key;
    this.parse = parse;
  }
  load(): { value: RetainedCreation<T> | null; original: string | null; error: boolean } {
    let original: string | null = null;
    try {
      original = this.storage.getItem(this.key);
      if (original === null) return { value: null, original: null, error: false };
      const raw = object(JSON.parse(original));
      if (
        Object.keys(raw).length !== 4 ||
        raw.schema !== 1 ||
        !Number.isSafeInteger(raw.revision) ||
        Number(raw.revision) < 1
      )
        throw Error("invalid");
      let submitted: RetainedCreation<T>["submitted"] = null;
      if (raw.submitted !== null) {
        const sub = object(raw.submitted);
        if (
          Object.keys(sub).length !== 2 ||
          typeof sub.opId !== "string" ||
          !sub.opId ||
          !Number.isSafeInteger(sub.revision) ||
          Number(sub.revision) < 1 ||
          Number(sub.revision) > Number(raw.revision)
        )
          throw Error("invalid");
        submitted = { opId: sub.opId, revision: Number(sub.revision) };
      }
      return {
        value: {
          schema: 1,
          revision: Number(raw.revision),
          draft: this.parse(raw.draft),
          submitted,
        },
        original: null,
        error: false,
      };
    } catch {
      return { value: null, original, error: original === null };
    }
  }
  private current() {
    const loaded = this.load();
    if (loaded.error || loaded.original !== null) throw Error("creation-draft-storage");
    return loaded.value;
  }
  private write(record: RetainedCreation<T>) {
    const text = JSON.stringify(record);
    this.storage.setItem(this.key, text);
    if (this.storage.getItem(this.key) !== text) throw Error("creation-draft-storage");
    const parsed = this.current();
    if (!equal(parsed, record)) throw Error("creation-draft-storage");
    return record;
  }
  save(draft: T) {
    const current = this.current();
    return this.write({
      schema: 1,
      revision: (current?.revision ?? 0) + 1,
      draft: this.parse(draft),
      submitted: current?.submitted ?? null,
    });
  }
  recover(draft: T) {
    const loaded = this.load();
    if (loaded.error) throw Error("creation-draft-storage");
    const original =
      loaded.original ?? (loaded.value ? this.storage.getItem(this.key) : null);
    if (original !== null) {
      const archive = this.key + ":original:" + crypto.randomUUID();
      this.storage.setItem(archive, original);
      if (this.storage.getItem(archive) !== original)
        throw Error("creation-original-storage");
    }
    return this.write({
      schema: 1,
      revision: (loaded.value?.revision ?? 0) + 1,
      draft: this.parse(draft),
      submitted: null,
    });
  }
  submit(opId: string, expectedRevision: number) {
    const current = this.current();
    if (!current) throw Error("creation-draft-missing");
    if (
      current.revision !== expectedRevision ||
      (current.submitted &&
        (current.submitted.opId !== opId ||
          current.submitted.revision !== current.revision))
    )
      throw Error("creation-draft-changed");
    this.write({ ...current, submitted: { opId, revision: current.revision } });
  }
  reviewSubmission(opId: string) {
    const current = this.current();
    if (current?.submitted?.opId === opId) this.write({ ...current, submitted: null });
  }
  verify(opId: string) {
    const current = this.current();
    if (
      !current ||
      current.submitted?.opId !== opId ||
      current.submitted.revision !== current.revision
    )
      throw Error("creation-draft-changed");
    return current.draft;
  }
  retire(opId: string) {
    const current = this.current();
    if (
      current?.submitted?.opId !== opId ||
      current.submitted.revision !== current.revision
    )
      return false;
    this.storage.removeItem(this.key);
    if (this.storage.getItem(this.key) !== null) throw Error("creation-draft-storage");
    return true;
  }
}
