/**
 * A character share link's data: the public projection of a shared character (the dev
 * bypass builds it from the dev doc; «revoked» stands for a link no longer shared), and
 * the page's request not to be indexed. Shared by the old view and the new frame's.
 */
import { useEffect } from "react";
import { getPublicCharacter } from "@/lib/firestore";
import {
  buildPublicCharacterProjection,
  parsePublicCharacterProjection,
} from "@/lib/public-character-projection";
import { DEV_BYPASS_AUTH } from "@/lib/dev-bypass";
import { resolveDevDoc } from "@/features/campaigns/useMemberCharacterDocs";
import type { CharacterDoc } from "@/types/character";

/**
 * The dev-bypass id that stands for a REVOKED / deleted link, so the unavailable
 * page is a drivable surface (rule 15: if a state is hard to reach, build the seam).
 * Every other id resolves through the SAME `resolveDevDoc` fixture/scenario seam the
 * party + member views use, then crosses the exact projection builder/parser boundary.
 */
const DEV_REVOKED_ID = "revoked";

export function loadSharedCharacter(
  uid: string,
  charId: string
): Promise<CharacterDoc | null> {
  if (!DEV_BYPASS_AUTH) return getPublicCharacter(uid, charId);
  if (charId === DEV_REVOKED_ID) return Promise.resolve(null);
  return resolveDevDoc(charId).then(async (doc) => {
    const source = { ...doc, shared: true };
    const projection = await buildPublicCharacterProjection(source, source.updatedAt);
    return parsePublicCharacterProjection(uid, charId, projection);
  });
}

/**
 * Keep this page out of search indexes for as long as it is mounted. A share link
 * is unguessable and never linked from anywhere, so a crawler realistically cannot
 * reach it — this is the belt to that pair of braces, and it is the honest
 * SPA-shaped way to do it: a STATIC `robots` tag in `index.html` would deindex the
 * whole app (landing page included), and there is no server to vary the response
 * per route. Google renders JS and honours a robots tag injected this way; the tag
 * is removed on unmount so navigating on within the SPA restores the default.
 */
export function useNoIndex(): void {
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);
}
