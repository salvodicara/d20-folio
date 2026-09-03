import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Timestamp } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import {
  decodeFirestoreValue,
  hashFirestoreDocument,
  pathHash,
  writeBackupDirectory,
  type BackupInputDocument,
} from "../../scripts/lib/migration-kit";

const documentPath = "users/user-a/characters/hero-a";

function backupInput(): BackupInputDocument {
  const before = { schema: 3, build: { name: "before" }, state: {} };
  const after = { schema: 3, build: { name: "after" }, state: {} };
  return {
    plan: {
      path: documentPath,
      before,
      after,
      beforeHash: hashFirestoreDocument(before),
      afterHash: hashFirestoreDocument(after),
      changed: true,
    },
    updateTime: new Timestamp(1_723_456_789, 1),
  };
}

describe("migration kit reporting and backup", () => {
  it("hashes a path to 16 hex characters and never echoes the path", () => {
    const hash = pathHash(documentPath);
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
    expect(hash).toBe(pathHash(documentPath));
    expect(hash).not.toContain("user-a");
    expect(pathHash("users/user-b/characters/hero-a")).not.toBe(hash);
  });

  it("writes a migration-tagged manifest and 0700/0600 artifacts", async () => {
    const parent = await mkdtemp(join(tmpdir(), "d20-migration-kit-backup-"));
    const directory = join(parent, "backup");
    try {
      const document = backupInput();
      const manifest = await writeBackupDirectory({
        directory,
        migration: "custom-identity",
        label: "unit-label",
        documents: [document],
      });
      expect(manifest.format).toBe("d20-folio-migration-backup-v1");
      expect(manifest.migration).toBe("custom-identity");
      expect(manifest.label).toBe("unit-label");
      expect(manifest.projectId).toBe("d20-folio");
      expect(manifest.documents).toHaveLength(1);
      expect((await stat(directory)).mode & 0o777).toBe(0o700);
      const files = await readdir(directory);
      expect(files).toContain("manifest.json");
      expect(files).toHaveLength(2);
      for (const file of files) {
        expect((await stat(join(directory, file))).mode & 0o777).toBe(0o600);
      }
      const backup = JSON.parse(
        await readFile(join(directory, manifest.documents[0]?.file ?? ""), "utf8")
      ) as { format: string; data: Parameters<typeof decodeFirestoreValue>[0] };
      expect(backup.format).toBe("d20-folio-firestore-document-v1");
      expect(decodeFirestoreValue(backup.data)).toEqual(document.plan.before);
      await expect(
        writeBackupDirectory({
          directory,
          migration: "custom-identity",
          label: "unit-label",
          documents: [],
        })
      ).rejects.toThrow("fresh");
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });
});
