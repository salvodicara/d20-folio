import { it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { createInstance } from "i18next";
import { LibraryWorkspace } from "@/features/library/LibraryWorkspace";
import { SessionController } from "@/lib/identity/session";
import { mergedUi } from "./__helpers__/ui-merged";
it("keeps loading distinct from an empty library and makes no writes on navigation", async () => {
  const i18n = createInstance();
  await i18n.init({
    lng: "en",
    resources: { en: { common: mergedUi("en") } },
    defaultNS: "common",
  });
  const session = new SessionController();
  session.transition({ uid: "owner", campaignId: null, activeCharacterId: null });
  let loaded!: (entries: []) => void;
  const commit = vi.fn();
  const repository = {
    watchIssues: () => () => {},
    watchEntries: (cb: typeof loaded) => {
      loaded = cb;
      return () => {};
    },
    watchOffers: () => () => {},
    watchSentOffers: () => () => {},
    listSentOffers: () => Promise.resolve([]),
    commit,
  };
  render(
    <I18nextProvider i18n={i18n}>
      <LibraryWorkspace
        repository={repository as never}
        session={session}
        recipients={[]}
        campaigns={[]}
        campaignId={null}
        onCampaignChange={() => {}}
      />
    </I18nextProvider>
  );
  expect(screen.getByText("Loading your library…")).toBeTruthy();
  await act(async () => {
    loaded([]);
    await Promise.resolve();
  });
  expect(screen.getByText("Your next idea starts here")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Create content" }));
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Campaign rules" })).toBeTruthy();
  expect(commit).not.toHaveBeenCalled();
});

it("keeps an entry editable after React StrictMode effect replay", async () => {
  const { StrictMode } = await import("react");
  const { LibraryEditor } = await import("@/features/library/LibraryEditor");
  const i18n = createInstance();
  await i18n.init({
    lng: "en",
    resources: { en: { common: mergedUi("en") } },
    defaultNS: "common",
  });
  const session = new SessionController();
  session.transition({ uid: "strict-owner", campaignId: null, activeCharacterId: null });
  const entry = {
    schema: 1,
    ownerUid: "strict-owner",
    id: "strict-entry",
    revision: 1,
    stableVersion: 0,
    draft: {
      schema: 1,
      family: "equipment",
      name: "Lantern",
      description: "Steady",
      tags: [],
      payload: { schema: 1, data: {} },
    },
    provenance: null,
    lastOperation: { uid: "strict-owner", opId: "initial" },
  };
  const repository = { load: () => Promise.resolve(entry) };
  await act(async () => {
    await Promise.resolve();
    render(
      <StrictMode>
        <I18nextProvider i18n={i18n}>
          <LibraryEditor
            id="strict-entry"
            family="equipment"
            repository={repository as never}
            session={session}
            revision={1}
            onShare={() => {}}
          />
        </I18nextProvider>
      </StrictMode>
    );
  });
  expect(screen.getByRole("textbox", { name: "Name" })).not.toBeDisabled();
});

it("preserves library selection through effect replay such as a locale suspense boundary", async () => {
  const { StrictMode } = await import("react");
  const i18n = createInstance();
  await i18n.init({
    lng: "en",
    resources: { en: { common: mergedUi("en") } },
    defaultNS: "common",
  });
  const session = new SessionController();
  session.transition({
    uid: "selection-owner",
    campaignId: null,
    activeCharacterId: null,
  });
  sessionStorage.setItem(
    "folio-library-view:selection-owner",
    JSON.stringify({ selected: { id: "lantern", family: "equipment" } })
  );
  const entry = {
    schema: 1,
    ownerUid: "selection-owner",
    id: "lantern",
    revision: 1,
    stableVersion: 0,
    draft: {
      schema: 1,
      family: "equipment",
      name: "Lantern",
      description: "Steady",
      tags: [],
      payload: { schema: 1, data: {} },
    },
    provenance: null,
    lastOperation: { uid: "selection-owner", opId: "seed" },
  };
  const repository = {
    watchEntries: (cb: (v: unknown[]) => void) => {
      cb([entry]);
      return () => {};
    },
    watchOffers: () => () => {},
    watchSentOffers: () => () => {},
    watchIssues: () => () => {},
    listSentOffers: () => Promise.resolve([]),
    load: () => Promise.resolve(entry),
  };
  await act(async () => {
    render(
      <StrictMode>
        <I18nextProvider i18n={i18n}>
          <LibraryWorkspace
            repository={repository as never}
            session={session}
            recipients={[]}
            campaigns={[]}
            campaignId={null}
            onCampaignChange={() => {}}
          />
        </I18nextProvider>
      </StrictMode>
    );
    await Promise.resolve();
  });
  expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Lantern");
});

it("distinguishes counterparties before revoking same-title offers and explains a first copy", async () => {
  const i18n = createInstance();
  await i18n.init({
    lng: "en",
    resources: { en: { common: mergedUi("en") } },
    defaultNS: "common",
  });
  const session = new SessionController();
  session.transition({ uid: "sender", campaignId: null, activeCharacterId: null });
  const definition = {
    schema: 1,
    family: "equipment",
    name: "Lantern",
    description: "Blue glass",
    tags: [],
    payload: { schema: 1, data: {} },
  };
  const sent = ["elena", "marco"].map((recipientUid) => ({
    schema: 2,
    senderUid: "sender",
    id: recipientUid,
    recipientUid,
    sourceId: "lantern",
    sourceVersion: 1,
    definition,
    revoked: false,
    revision: 1,
    lastOperation: { uid: "sender", opId: recipientUid },
  }));
  const incoming = {
    ...sent[0],
    senderUid: "elena",
    recipientUid: "sender",
    id: "incoming",
  };
  const repository = {
    watchEntries: (cb: (v: unknown[]) => void) => {
      cb([]);
      return () => {};
    },
    watchOffers: (cb: (v: unknown[]) => void) => {
      cb([incoming]);
      return () => {};
    },
    watchSentOffers: (cb: (v: unknown[]) => void) => {
      cb(sent);
      return () => {};
    },
    watchIssues: () => () => {},
    readGrant: () => Promise.resolve(null),
  };
  await act(async () => {
    render(
      <I18nextProvider i18n={i18n}>
        <LibraryWorkspace
          repository={repository as never}
          session={session}
          recipients={[
            { uid: "elena", name: "Elena" },
            { uid: "marco", name: "Marco" },
          ]}
          campaigns={[]}
          campaignId={null}
          onCampaignChange={() => {}}
        />
      </I18nextProvider>
    );
    await Promise.resolve();
  });
  fireEvent.click(screen.getByRole("button", { name: "Sharing & copies" }));
  expect(screen.getByText("To Elena")).toBeVisible();
  expect(screen.getByText("To Marco")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Read offered version" }));
  expect(screen.getByRole("dialog")).toHaveTextContent("From Elena");
  expect(screen.getByRole("dialog")).toHaveTextContent("Keep an independent copy");
  expect(screen.getByRole("dialog")).not.toHaveTextContent(
    "Update only the selected copy"
  );
});
