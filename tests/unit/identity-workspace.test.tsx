import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { createInstance } from "i18next";
import { IdentityWorkspace } from "@/features/identity/IdentityWorkspace";
import { mergedUi } from "./__helpers__/ui-merged";
import * as localeTools from "@/i18n";
const en = mergedUi("en");

async function mount(
  readInvite: () => Promise<{
    id: string;
    name: string;
    joinOpen: boolean;
  } | null> = () => Promise.resolve(null)
) {
  const i18n = createInstance();
  await i18n.init({ lng: "en", resources: { en: { common: en } }, defaultNS: "common" });
  const actions: string[] = [];
  render(
    <I18nextProvider i18n={i18n}>
      <IdentityWorkspace
        library={<div>Library contents</div>}
        uid="marco"
        displayName="Marco"
        characters={[
          {
            schema: 1,
            ownerUid: "marco",
            id: "lyra",
            name: "Lyra Voss",
            speciesId: "human",
            classId: "bard",
            level: 9,
            revision: 0,
            currentAssignment: null,
            portraitPath: null,
            sheet: { build: {}, state: {} },
          },
          {
            schema: 1,
            ownerUid: "marco",
            id: "arin",
            name: "Arin",
            speciesId: "human",
            classId: "fighter",
            level: 3,
            revision: 0,
            currentAssignment: null,
            portraitPath: null,
            sheet: { build: {}, state: {} },
          },
        ]}
        campaigns={[]}
        roster={[]}
        loading={false}
        busy={false}
        error={null}
        activeId={null}
        campaignId={null}
        inspected={null}
        onNavigateCampaign={(id) => actions.push(`campaign:${id}`)}
        onSelect={(id) => actions.push(`active:${id}`)}
        onInspect={(ref) => actions.push(`inspect:${ref.id}`)}
        onAssign={async () => {}}
        onRelease={async () => {}}
        onReadInvite={readInvite}
        onJoin={async () => {}}
        onCreateCampaign={async () => {}}
        onRevoke={async () => {}}
        onSignOut={async () => {}}
        onSaveProfile={async () => {}}
        onRetry={() => {}}
        onClearInspection={() => {}}
      />
    </I18nextProvider>
  );
  return { actions, i18n };
}

beforeEach(() => window.history.replaceState(null, "", "/"));
describe("new identity workspace", () => {
  it("opens the actual library and restores its destination from browser history", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "Library" }));
    expect(window.location.hash).toBe("#library");
    expect(screen.getByText("Library contents")).toBeTruthy();
    act(() => {
      window.history.replaceState(null, "", "#account");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(screen.queryByText("Library contents")).toBeNull();
    act(() => {
      window.history.replaceState(null, "", "#library");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(screen.getByText("Library contents")).toBeTruthy();
  });
  it("does not apply a language whose catalogue finishes after the workspace expires", async () => {
    const { i18n } = await mount();
    let loaded!: () => void;
    const load = vi.spyOn(localeTools, "ensureLocale").mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          loaded = resolve;
        })
    );
    fireEvent.click(screen.getByRole("button", { name: "Switch to Italiano" }));
    cleanup();
    await act(async () => {
      loaded();
      await Promise.resolve();
    });
    expect(i18n.language).toBe("en");
    load.mockRestore();
  });
  it("keeps Account navigation and URL through preferences, privacy and browser history", async () => {
    await mount();
    const nav = screen.getByRole("navigation", { name: "Account settings" });
    fireEvent.click(within(nav).getByRole("button", { name: "Preferences" }));
    expect(window.location.hash).toBe("#preferences");
    expect(screen.getByRole("radio", { name: /Physical/ })).toBeTruthy();
    fireEvent.click(within(nav).getByRole("button", { name: "Privacy" }));
    expect(screen.getByRole("heading", { level: 1, name: "Privacy" })).toBeTruthy();
    act(() => {
      window.history.replaceState(null, "", "#preferences");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(screen.getByRole("heading", { level: 1, name: "Preferences" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Account settings" })).toBe(nav);
  });
  it("finds only available destinations and does not open help while typing or inside a dialog", async () => {
    await mount();
    const name = screen.getByLabelText("Display name");
    fireEvent.keyDown(name, { key: "?" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.keyDown(document.body, { key: "?" });
    expect(screen.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeTruthy();
    expect(screen.queryByRole("checkbox")).toBeNull();
    fireEvent.keyDown(document.body, { key: "k", ctrlKey: true });
    expect(screen.queryByRole("dialog", { name: "Search Folio" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Search Folio" }));
    expect(document.activeElement).toBe(screen.getByRole("searchbox"));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Lyra" } });
    fireEvent.click(screen.getByRole("button", { name: "Lyra Voss" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("does not restore an invitation after leaving its page", async () => {
    let resolve!: (value: { id: string; name: string; joinOpen: boolean }) => void;
    await mount(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    fireEvent.click(screen.getByRole("button", { name: "Enter an invitation" }));
    fireEvent.change(screen.getByLabelText("Campaign code"), {
      target: { value: "campaign-a" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Read invitation" }));
    fireEvent.click(screen.getByRole("button", { name: "Character" }));
    await act(async () => {
      resolve({ id: "campaign-a", name: "Stale campaign", joinOpen: true });
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole("button", { name: "More sections" }));
    fireEvent.click(screen.getByRole("button", { name: "Invitation" }));
    expect(screen.queryByText("Stale campaign")).toBeNull();
  });
  it("opening an owned character requests inspection without selecting a command actor", async () => {
    const { actions } = await mount();
    fireEvent.click(screen.getByRole("button", { name: "Character" }));
    const button = screen.getAllByRole("button", { name: "View character" })[0];
    if (!button) throw new Error("Missing character button");
    fireEvent.click(button);
    expect(actions).toEqual(["inspect:lyra"]);
  });
  it("selects only the explicitly chosen character", async () => {
    const { actions } = await mount();
    fireEvent.click(screen.getByRole("button", { name: "Character" }));
    const button = screen.getAllByRole("button", { name: "Select character" })[1];
    if (!button) throw new Error("Missing character button");
    fireEvent.click(button);
    expect(actions).toEqual(["active:arin"]);
  });
});
