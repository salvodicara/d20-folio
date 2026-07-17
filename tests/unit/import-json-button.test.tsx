/**
 * ImportJsonButton — the roster header action that brings a character JSON
 * export back into the folio. These tests prove the ORCHESTRATION: the picked
 * file is routed through the shipped importer; a successful parse is committed
 * directly via `createCharacter` as a fresh active portrait-less character (the
 * v3 codec is strictly id-based — there is no name-match review step); failures
 * surface a toast and write nothing; and the dev-bypass guard no-ops the write.
 * The importer, `createCharacter`, and the stores are mocked so the component is
 * tested in isolation and never touches Firestore.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { CharacterDoc } from "@/types/character";
import type { ImportResult, ImportError } from "@/lib/character-io";

const {
  createMock,
  updateMock,
  uploadAttachMock,
  importMock,
  showToastMock,
  bypassState,
} = vi.hoisted(() => ({
  createMock: vi.fn<(uid: string, data: Partial<CharacterDoc>) => Promise<string>>(),
  updateMock:
    vi.fn<(uid: string, charId: string, data: Partial<CharacterDoc>) => Promise<void>>(),
  uploadAttachMock:
    vi.fn<
      (
        uid: string,
        charId: string,
        base64: string,
        attach: (url: string) => Promise<void>
      ) => Promise<string | null>
    >(),
  importMock: vi.fn<(file: File) => Promise<ImportResult | ImportError>>(),
  showToastMock: vi.fn(),
  bypassState: { on: false },
}));

// Reaches Firestore transitively → the pure-modules guard needs the firebase mock.
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/firestore", () => ({
  createCharacter: createMock,
  updateCharacter: updateMock,
}));
vi.mock("@/lib/storage", () => ({ uploadAndAttachPortrait: uploadAttachMock }));
vi.mock("@/lib/character-io", () => ({ importCharacterFromFile: importMock }));
vi.mock("@/lib/dev-bypass", () => ({
  get DEV_BYPASS_AUTH() {
    return bypassState.on;
  },
}));
vi.mock("@/stores/toastStore", () => ({
  useToastStore: { getState: () => ({ showToast: showToastMock }) },
}));
vi.mock("@/stores/authStore", () => ({
  useAuthStore: (selector: (s: { user: { uid: string } | null }) => unknown) =>
    selector({ user: { uid: "u1" } }),
}));

import { ImportJsonButton } from "@/features/roster/ImportJsonButton";

function ok(name: string): ImportResult {
  return {
    success: true,
    doc: {
      character: { name } as CharacterDoc["character"],
      session: {} as CharacterDoc["session"],
      status: "retired",
    } as ImportResult["doc"],
  };
}

function pickFile() {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(["{}"], "hero.json", { type: "application/json" });
  fireEvent.change(input, { target: { files: [file] } });
}

describe("ImportJsonButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bypassState.on = false;
    createMock.mockResolvedValue("c1");
    // Default: the attach helper invokes its attach callback with a fresh URL,
    // mirroring a successful Storage upload + Firestore write.
    uploadAttachMock.mockImplementation(async (_uid, _charId, _b64, attach) => {
      await attach("https://storage/c1.jpeg");
      return "https://storage/c1.jpeg";
    });
  });

  it("renders the Import action", () => {
    render(<ImportJsonButton />);
    expect(screen.getByRole("button", { name: /^import$/i })).toBeInTheDocument();
  });

  it("commits a clean import as a fresh active portrait-less character", async () => {
    importMock.mockResolvedValue(ok("Borin"));
    render(<ImportJsonButton />);
    pickFile();
    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    const [uid, data] = createMock.mock.calls[0] ?? [];
    expect(uid).toBe("u1");
    // The imported "retired" status is normalized to active so it always shows.
    expect(data).toMatchObject({ status: "active", portraitUrl: null });
    expect(showToastMock).toHaveBeenCalled();
  });

  it("re-uploads the embedded portrait to Storage and attaches its URL + crop (OWN-39 regression)", async () => {
    const base64 = "data:image/png;base64,AAAA";
    importMock.mockResolvedValue({
      ...ok("Tova"),
      portraitBase64: base64,
      portraitCrop: { x: 5, y: 5, width: 50, height: 50 },
    });
    render(<ImportJsonButton />);
    pickFile();
    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    // The character is created portrait-less first…
    expect(createMock.mock.calls[0]?.[1]).toMatchObject({ portraitUrl: null });
    // …then the embedded base64 is pushed to Storage for that new charId…
    await waitFor(() => expect(uploadAttachMock).toHaveBeenCalledTimes(1));
    const [uid, charId, b64] = uploadAttachMock.mock.calls[0] ?? [];
    expect(uid).toBe("u1");
    expect(charId).toBe("c1");
    expect(b64).toBe(base64);
    // …and the attach callback persists the resulting URL + crop on the character.
    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));
    expect(updateMock.mock.calls[0]).toEqual([
      "u1",
      "c1",
      {
        portraitUrl: "https://storage/c1.jpeg",
        portraitCrop: { x: 5, y: 5, width: 50, height: 50 },
      },
    ]);
  });

  it("imports portrait-less with no upload when the JSON has no portrait", async () => {
    importMock.mockResolvedValue(ok("Nall"));
    render(<ImportJsonButton />);
    pickFile();
    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect(uploadAttachMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("still imports the character even if the portrait re-upload fails", async () => {
    uploadAttachMock.mockRejectedValue(new Error("storage down"));
    importMock.mockResolvedValue({
      ...ok("Bruenor"),
      portraitBase64: "data:image/png;base64,BBBB",
    });
    render(<ImportJsonButton />);
    pickFile();
    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(uploadAttachMock).toHaveBeenCalledTimes(1));
    // The success toast still fires — a failed portrait never blocks the import.
    expect(showToastMock).toHaveBeenCalled();
  });

  it("surfaces a toast and writes nothing on a failed import", async () => {
    importMock.mockResolvedValue({
      success: false,
      error: "Unrecognized format: not a d20-folio export.",
    });
    render(<ImportJsonButton />);
    pickFile();
    await waitFor(() => expect(showToastMock).toHaveBeenCalled());
    expect(createMock).not.toHaveBeenCalled();
  });

  it("under the dev-bypass preview: parses for real, blocks only the COMMIT", async () => {
    // Only the Firestore write is bypass-blocked — the parse (and therefore the
    // whole rejection surface) behaves exactly as production, so invalid files
    // and pre-v3 exports stay verifiable offline (P8, rule 15).
    bypassState.on = true;
    importMock.mockResolvedValue(ok("Borin"));
    render(<ImportJsonButton />);
    pickFile();
    await waitFor(() => expect(showToastMock).toHaveBeenCalled());
    expect(importMock).toHaveBeenCalledTimes(1);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("under the dev-bypass preview: a failed parse shows its REAL rejection", async () => {
    bypassState.on = true;
    importMock.mockResolvedValue({ success: false, error: "schema-2-unsupported" });
    render(<ImportJsonButton />);
    pickFile();
    await waitFor(() => expect(showToastMock).toHaveBeenCalled());
    // The pre-v3 friendly message — never the generic preview-blocked toast.
    const payload = showToastMock.mock.calls[0]?.[0] as { message?: string } | undefined;
    expect(payload?.message).toMatch(/older version/i);
    expect(createMock).not.toHaveBeenCalled();
  });
});
