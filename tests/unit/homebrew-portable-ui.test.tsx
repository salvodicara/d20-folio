import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { createInstance } from "i18next";
import { HomebrewImport } from "@/features/library/HomebrewPortable";
import { importOriginalKey } from "@/features/library/homebrew-files";
import { SessionController } from "@/lib/identity/session";
import { initializeDefinition } from "@/lib/homebrew/model";
import { encodePortable } from "@/lib/homebrew/portable";
import { mergedUi } from "./__helpers__/ui-merged";
afterEach(() => {
  cleanup();
  sessionStorage.clear();
});
async function setup() {
  const i18n = createInstance();
  await i18n.init({
    lng: "en",
    resources: { en: { common: mergedUi("en") } },
    defaultNS: "common",
  });
  const session = new SessionController();
  session.transition({ uid: "owner", campaignId: null, activeCharacterId: null });
  return { i18n, session };
}
it("keeps an import dialog open across callback changes and closes only on actual session invalidation", async () => {
  const { i18n, session } = await setup(),
    closeA = vi.fn(),
    closeB = vi.fn(),
    onImport = vi.fn(async () => {});
  const view = render(
    <I18nextProvider i18n={i18n}>
      <HomebrewImport session={session} onClose={closeA} onImport={onImport} />
    </I18nextProvider>
  );
  view.rerender(
    <I18nextProvider i18n={i18n}>
      <HomebrewImport session={session} onClose={closeB} onImport={onImport} />
    </I18nextProvider>
  );
  expect(closeA).not.toHaveBeenCalled();
  expect(closeB).not.toHaveBeenCalled();
  session.revoke();
  expect(closeB).toHaveBeenCalledOnce();
});
it("retains exact originals independently and associates a successful import with its own draft identity", async () => {
  const { i18n, session } = await setup(),
    onImport = vi.fn(async () => {});
  const view = render(
    <I18nextProvider i18n={i18n}>
      <HomebrewImport session={session} onClose={() => {}} onImport={onImport} />
    </I18nextProvider>
  );
  const input = document.querySelector('input[type="file"]');
  if (!input) throw Error("file input");
  const incompatible = '  {"unknown": "Ω", "private": [1, 2]}\n';
  fireEvent.change(input, {
    target: { files: [{ name: "", text: () => Promise.resolve(incompatible) }] },
  });
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain("preserved")
  );
  const definition = initializeDefinition("spell");
  definition.name = "Silver tide";
  const compatible = encodePortable(definition);
  fireEvent.change(input, {
    target: { files: [{ name: "", text: () => Promise.resolve(compatible) }] },
  });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Create draft" })).toBeEnabled()
  );
  fireEvent.click(screen.getByRole("button", { name: "Create draft" }));
  await waitFor(() => expect(onImport).toHaveBeenCalledOnce());
  const call = onImport.mock.calls[0] as unknown as [typeof definition, string];
  expect(sessionStorage.getItem(importOriginalKey("owner", call[1]))).toBe(compatible);
  const originals = Object.keys(sessionStorage)
    .filter((k) => k.startsWith(importOriginalKey("owner", "")))
    .map((k) => sessionStorage.getItem(k));
  expect(originals).toContain(incompatible);
  expect(originals).toHaveLength(2);
  view.unmount();
  render(
    <I18nextProvider i18n={i18n}>
      <HomebrewImport session={session} onClose={() => {}} onImport={onImport} />
    </I18nextProvider>
  );
  fireEvent.click(screen.getByRole("button", { name: "Original file 1", hidden: true }));
  expect(screen.getByRole("alert").textContent).toContain("preserved");
});

it("keeps the latest file selection when an earlier read resolves later", async () => {
  const { i18n, session } = await setup();
  let finish: (text: string) => void = () => {};
  const first = new Promise<string>((resolve) => {
    finish = resolve;
  });
  render(
    <I18nextProvider i18n={i18n}>
      <HomebrewImport
        session={session}
        onClose={() => {}}
        onImport={() => Promise.resolve()}
      />
    </I18nextProvider>
  );
  const input = document.querySelector('input[type="file"]');
  if (!input) throw Error("input");
  const definition = initializeDefinition("spell");
  definition.name = "Second selection";
  fireEvent.change(input, {
    target: { files: [{ name: "first.json", text: () => first }] },
  });
  fireEvent.change(input, {
    target: {
      files: [
        { name: "second.json", text: () => Promise.resolve(encodePortable(definition)) },
      ],
    },
  });
  await waitFor(() =>
    expect(screen.getByRole("heading", { name: "Second selection" })).toBeTruthy()
  );
  definition.name = "First selection";
  await act(async () => {
    finish(encodePortable(definition));
    await first;
  });
  expect(screen.queryByRole("heading", { name: "First selection" })).toBeNull();
});
