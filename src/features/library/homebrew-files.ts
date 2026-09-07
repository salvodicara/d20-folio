export function downloadText(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
export const importOriginalKey = (uid: string, id: string) =>
  "folio-homebrew-original:" + uid + ":" + id;
export function associateImportOriginal(uid: string, id: string, originalId: string) {
  sessionStorage.setItem("folio-homebrew-import-ref:" + uid + ":" + id, originalId);
}
export function readImportOriginal(uid: string, id: string): string | null {
  try {
    const originalId =
      sessionStorage.getItem("folio-homebrew-import-ref:" + uid + ":" + id) ?? id;
    return sessionStorage.getItem(importOriginalKey(uid, originalId));
  } catch {
    return null;
  }
}

const originalMetadataKey = (uid: string, id: string) =>
  "folio-homebrew-original-meta:" + uid + ":" + id;
export function storeOriginalMetadata(uid: string, id: string, name: string) {
  sessionStorage.setItem(
    originalMetadataKey(uid, id),
    JSON.stringify({ name, created: new Date().toISOString() })
  );
}
function originalMetadata(uid: string, id: string): { name: string; created: string } {
  try {
    const value = JSON.parse(
      sessionStorage.getItem(originalMetadataKey(uid, id)) ?? "null"
    ) as { name?: unknown; created?: unknown } | null;
    return {
      name: typeof value?.name === "string" ? value.name : "",
      created: typeof value?.created === "string" ? value.created : id,
    };
  } catch {
    return { name: "", created: id };
  }
}
export function originalFileName(uid: string, id: string) {
  return originalMetadata(uid, id).name;
}
export function originalFileIds(uid: string) {
  const prefix = importOriginalKey(uid, "");
  return Object.keys(sessionStorage)
    .filter((k) => k.startsWith(prefix))
    .map((k) => k.slice(prefix.length))
    .sort((a, b) =>
      originalMetadata(uid, a).created.localeCompare(originalMetadata(uid, b).created)
    );
}
