import { useEffect, useState } from "react";
import { characterPath, type FolioCharacter } from "@/lib/identity/model";
import type { SessionController } from "@/lib/identity/session";
import type { OriginBuild } from "@/lib/homebrew/origin-build";
import type {
  OriginBuildRepository,
  OriginBuildIssue,
} from "@/lib/homebrew/origin-build-repository";
export interface LoadedOriginBuild {
  base: OriginBuild | null;
  loading: boolean;
  error: boolean;
  issues: OriginBuildIssue[];
}
const ticketValid = (check: () => void) => {
  try {
    check();
    return true;
  } catch {
    return false;
  }
};
export function useOriginBuild(
  character: FolioCharacter | null,
  repository: OriginBuildRepository,
  session: SessionController,
  generation = 0
): LoadedOriginBuild {
  const path = character ? characterPath(character) : "";
  const key = (session.scope().uid ?? "") + ":" + path + ":" + String(generation);
  const [loaded, setLoaded] = useState<LoadedOriginBuild & { key: string }>({
    key: "",
    base: null,
    loading: true,
    error: false,
    issues: [],
  });
  const ownerUid = character?.ownerUid,
    id = character?.id;
  useEffect(() => {
    if (!ownerUid || !id) return;
    let live = true;
    const check = session.ticket();
    const update = (patch: Partial<LoadedOriginBuild>) => {
      if (live && ticketValid(check))
        setLoaded((old) => ({
          ...(old.key === key
            ? old
            : { base: null, loading: true, error: false, issues: [] }),
          ...patch,
          key,
        }));
    };
    const stop = repository.watch(
      { ownerUid, id },
      (base) => update({ base, loading: false, error: false }),
      () => update({ base: null, loading: false, error: true })
    );
    const stopIssues = repository.watchIssues((issues) =>
      update({ issues: issues.filter((issue) => issue.path === path + "/origins/build") })
    );
    const untrack = session.track(() => {
      if (live) setLoaded({ key, base: null, loading: false, error: true, issues: [] });
    });
    return () => {
      live = false;
      stop();
      stopIssues();
      untrack();
    };
  }, [ownerUid, id, path, key, repository, session]);
  return loaded.key === key
    ? loaded
    : { base: null, loading: !!character, error: false, issues: [] };
}
