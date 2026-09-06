import { getBytes, ref, type FirebaseStorage } from "firebase/storage";
import type { SessionController } from "./session";
export interface IdentityAsset {
  url: string;
  dispose: () => void;
}
export async function scopedAsset(
  read: () => Promise<ArrayBuffer>,
  session: SessionController,
  urls = {
    create: (bytes: ArrayBuffer) => URL.createObjectURL(new Blob([bytes])),
    revoke: (url: string) => URL.revokeObjectURL(url),
  }
): Promise<IdentityAsset> {
  const check = session.ticket();
  if (!session.scope().uid) throw new Error("unauthenticated");
  const bytes = await read();
  check();
  const url = urls.create(bytes);
  let live = true;
  const dispose = session.track(() => {
    if (live) {
      live = false;
      urls.revoke(url);
    }
  });
  return { url, dispose };
}
/** Path-only SDK reads, never getDownloadURL or bearer fetches. Already delivered bytes cannot be revoked. */
export function loadAuthenticatedAsset(
  storage: FirebaseStorage,
  path: string,
  session: SessionController
): Promise<IdentityAsset> {
  if (
    !/^folioAccounts\/[A-Za-z0-9_-]+\/(characters\/[A-Za-z0-9_-]+\/(private|portraits)|offers\/[A-Za-z0-9_-]+)\/[A-Za-z0-9_.-]+$/.test(
      path
    ) &&
    !/^folioCampaigns\/[A-Za-z0-9_-]+\/dmNotes\/[A-Za-z0-9_.-]+$/.test(path)
  )
    throw new Error("invalid-asset-path");
  return scopedAsset(() => getBytes(ref(storage, path), 5 * 1024 * 1024), session);
}
