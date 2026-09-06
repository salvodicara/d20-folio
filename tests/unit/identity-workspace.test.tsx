import { describe, expect, it } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { createInstance } from "i18next";
import { IdentityWorkspace } from "@/features/identity/IdentityWorkspace";
import { mergedUi } from "./__helpers__/ui-merged";
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
  return actions;
}

describe("new identity workspace", () => {
  it("does not restore an invitation after leaving its page", async () => {
    let resolve!: (value: { id: string; name: string; joinOpen: boolean }) => void;
    await mount(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    fireEvent.click(screen.getByRole("button", { name: "Invitation" }));
    fireEvent.change(screen.getByLabelText("Campaign code"), {
      target: { value: "campaign-a" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Read invitation" }));
    fireEvent.click(screen.getByRole("button", { name: "My characters" }));
    await act(async () => {
      resolve({ id: "campaign-a", name: "Stale campaign", joinOpen: true });
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole("button", { name: "Invitation" }));
    expect(screen.queryByText("Stale campaign")).toBeNull();
  });
  it("opening an owned character requests inspection without selecting a command actor", async () => {
    const actions = await mount();
    fireEvent.click(screen.getByRole("button", { name: "My characters" }));
    const button = screen.getAllByRole("button", { name: "View character" })[0];
    if (!button) throw new Error("Missing character button");
    fireEvent.click(button);
    expect(actions).toEqual(["inspect:lyra"]);
  });
  it("selects only the explicitly chosen character", async () => {
    const actions = await mount();
    fireEvent.click(screen.getByRole("button", { name: "My characters" }));
    const button = screen.getAllByRole("button", { name: "Select character" })[1];
    if (!button) throw new Error("Missing character button");
    fireEvent.click(button);
    expect(actions).toEqual(["active:arin"]);
  });
});
