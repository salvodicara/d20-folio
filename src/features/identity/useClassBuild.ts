import { useEffect, useState } from "react";
import { characterPath, type FolioCharacter } from "@/lib/identity/model";
import type { SessionController } from "@/lib/identity/session";
import type {
  ClassBuildReader,
  LoadedClassBuild,
} from "@/lib/homebrew/class-build-repository";
export function useClassBuild(
  character: FolioCharacter | null,
  reader: ClassBuildReader,
  session: SessionController,
  generation: number
) {
  const path = character ? characterPath(character) : "";
  const key = (session.scope().uid ?? "") + ":" + path + ":" + String(generation);
  const [loaded, setLoaded] = useState<
    LoadedClassBuild & { key: string; loading: boolean; error: boolean }
  >({ key: "", base: null, original: null, loading: true, error: false });
  const ownerUid = character?.ownerUid,
    id = character?.id;
  useEffect(() => {
    if (!ownerUid || !id) return;
    let live = true;
    const check = session.ticket();
    const update = (value: LoadedClassBuild, error: boolean) => {
      try {
        check();
        if (live) setLoaded({ ...value, key, loading: false, error });
      } catch {
        /* Invalidated reads never restore private bytes. */
      }
    };
    const stop = reader.watch(
      { ownerUid, id },
      (value) => update(value, false),
      () => update({ base: null, original: null }, true)
    );
    const untrack = session.track(() => {
      if (live)
        setLoaded({ key, base: null, original: null, loading: false, error: true });
    });
    return () => {
      live = false;
      stop();
      untrack();
    };
  }, [ownerUid, id, key, reader, session]);
  return character && loaded.key === key
    ? loaded
    : { base: null, original: null, loading: !!character, error: false };
}
