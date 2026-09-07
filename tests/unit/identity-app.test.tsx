import { StrictMode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "firebase/auth";
import type { IdentityWorkspaceProps } from "@/features/identity/IdentityWorkspace";
import type { SessionController } from "@/lib/identity";

const harness = vi.hoisted(() => ({
  i18n: { changeLanguage: vi.fn().mockResolvedValue(undefined) },
  authListeners: new Set<(user: User | null) => void>(),
  repositories: [] as {
    session: SessionController;
    resolveBootstrap: () => void;
    started: boolean;
    watches: Watch[];
  }[],
  assetDisposers: [] as ReturnType<typeof vi.fn>[],
}));
type Watch = {
  kind: string;
  emit: (value: unknown) => void;
  deny: () => void;
  stopped: boolean;
};
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_auth: unknown, callback: (user: User | null) => void) => {
    harness.authListeners.add(callback);
    return () => harness.authListeners.delete(callback);
  },
  GoogleAuthProvider: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("@/lib/firebase", () => ({ auth: {}, db: {}, storage: {} }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: harness.i18n,
  }),
}));
vi.mock("@/lib/identity", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/identity")>();
  return {
    ...actual,
    loadAuthenticatedAsset: vi.fn(
      (_storage: unknown, path: string, session: SessionController) => {
        const dispose = vi.fn();
        harness.assetDisposers.push(dispose);
        session.track(dispose);
        return Promise.resolve({ url: "blob:" + path, dispose });
      }
    ),
    createIdentityRepository: (_db: unknown, session: SessionController) => {
      let resolveBootstrap!: () => void;
      const bootstrap = new Promise<void>((resolve) => {
        resolveBootstrap = resolve;
      });
      const repository = {
        session,
        resolveBootstrap,
        watches: [] as Watch[],
        started: false,
      };
      harness.repositories.push(repository);
      const watch = (
        kind: string,
        empty: unknown,
        next: (value: unknown) => void,
        error: (cause: unknown) => void
      ) => {
        const value: Watch = {
          kind,
          stopped: false,
          emit: session.guard((payload: unknown) => {
            if (!value.stopped) next(payload);
          }),
          deny: session.guard(() => {
            if (value.stopped) return;
            session.transition({
              ...session.scope(),
              campaignId: null,
              activeCharacterId: null,
            });
            error({ code: "permission-denied" });
          }),
        };
        repository.watches.push(value);
        return session.track(() => {
          if (!value.stopped) {
            value.stopped = true;
            next(empty);
          }
        });
      };
      return {
        ensureIdentity: () => {
          repository.started = true;
          return bootstrap;
        },
        watchAccount: (next: (v: unknown) => void, error: (e: unknown) => void) =>
          watch("account", null, next, error),
        watchOwnedCharacters: (next: (v: unknown) => void, error: (e: unknown) => void) =>
          watch("characters", [], next, error),
        watchMemberships: (next: (v: unknown) => void, error: (e: unknown) => void) =>
          watch("memberships", [], next, error),
        watchAuthority: (next: (v: unknown) => void, error: (e: unknown) => void) =>
          watch("authority", null, next, error),
        watchRoster: (
          _id: string,
          next: (v: unknown) => void,
          error: (e: unknown) => void
        ) => watch("roster", [], next, error),
        watchDmNotes: (
          _id: string,
          next: (v: unknown) => void,
          error: (e: unknown) => void
        ) => watch("dmNotes", "", next, error),
        watchCharacter: (
          _ref: unknown,
          next: (v: unknown) => void,
          error: (e: unknown) => void
        ) => watch("inspection", null, next, error),
        watchPrivateNotes: (
          _ref: unknown,
          next: (v: unknown) => void,
          error: (e: unknown) => void
        ) => watch("privateNotes", "", next, error),
      };
    },
  };
});
vi.mock("@/features/identity/IdentityWorkspace", () => ({
  IdentityWorkspace: (props: IdentityWorkspaceProps) => (
    <>
      <output data-testid="workspace">
        {JSON.stringify({
          uid: props.uid,
          loading: props.loading,
          diceMode: props.diceMode,
          characters: props.characters,
          campaignId: props.campaignId,
          inspected: props.inspected,
          privateNotes: props.privateNotes,
          dmNotes: props.dmNotes,
          portraits: props.portraits,
          error: props.error,
        })}
      </output>
      <button onClick={() => props.onNavigateCampaign("campaign")}>Open campaign</button>
      <button onClick={() => props.onInspect({ ownerUid: props.uid, id: "pc" })}>
        Inspect own character
      </button>
    </>
  ),
}));
import { IdentityApp } from "@/features/identity/IdentityApp";

const character = (ownerUid: string) => ({
  schema: 1,
  ownerUid,
  id: "pc",
  name: ownerUid + " character",
  speciesId: "human",
  classId: "bard",
  level: 1,
  revision: 0,
  currentAssignment: null,
  portraitPath: ownerUid + "/portrait",
  sheet: { build: {}, state: {} },
});
function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Expected active repository subscription");
  return value;
}
const current = () =>
  required([...harness.repositories].reverse().find((repository) => repository.started));
const activeWatch = (kind: string) =>
  required(
    [...current().watches]
      .reverse()
      .find((watch) => watch.kind === kind && !watch.stopped)
  );
const state = () =>
  JSON.parse(screen.getByTestId("workspace").textContent) as IdentityWorkspaceProps;
async function deliver(action: () => void) {
  await act(async () => {
    action();
    await Promise.resolve();
  });
}
async function authenticate(uid: string) {
  await deliver(() => {
    for (const callback of harness.authListeners)
      callback({ uid, displayName: uid } as User);
  });
}
async function bootstrap() {
  await deliver(() => current().resolveBootstrap());
}
async function emit(kind: string, value: unknown) {
  await deliver(() => activeWatch(kind).emit(value));
}
beforeEach(() => {
  harness.authListeners.clear();
  harness.repositories.length = 0;
  harness.assetDisposers.length = 0;
});

describe("IdentityApp consumer session boundaries", () => {
  it("finishes asynchronous identity bootstrap under StrictMode and subscribes only once", async () => {
    render(
      <StrictMode>
        <IdentityApp />
      </StrictMode>
    );
    await authenticate("alice");
    expect(state().loading).toBe(true);
    await bootstrap();
    await emit("characters", [character("alice")]);
    expect(state().loading).toBe(true);
    await emit("account", {
      schema: 1,
      displayName: "Alice",
      locale: "en",
      diceMode: "physical",
    });
    expect(state().loading).toBe(false);
    expect(state().diceMode).toBe("physical");
    expect(state().characters[0]?.ownerUid).toBe("alice");
    expect(
      current().watches.filter((w) => w.kind === "characters" && !w.stopped)
    ).toHaveLength(1);
  });

  it("does not subscribe an abandoned account when its bootstrap resolves late", async () => {
    render(<IdentityApp />);
    await authenticate("alice");
    const abandoned = current();
    await authenticate("bob");
    await bootstrap();
    await emit("characters", [character("bob")]);
    await deliver(() => abandoned.resolveBootstrap());
    expect(abandoned.watches).toEqual([]);
    expect(state().characters[0]?.ownerUid).toBe("bob");
    expect(state().error).toBeNull();
  });

  it.each(["bob", "alice"])(
    "invalidates old callbacks and private assets after an auth event for %s",
    async (nextUid) => {
      render(<IdentityApp />);
      await authenticate("alice");
      await bootstrap();
      await emit("characters", [character("alice")]);
      fireEvent.click(screen.getByRole("button", { name: "Inspect own character" }));
      await emit("inspection", character("alice"));
      await emit("privateNotes", "Alice secret");
      const oldCharacters = activeWatch("characters");
      const oldNotes = activeWatch("privateNotes");
      const dispose = harness.assetDisposers[0];
      await authenticate(nextUid);
      expect(state().characters).toEqual([]);
      expect(state().inspected).toBeNull();
      expect(state().privateNotes).toBe("");
      expect(state().portraits).toEqual({});
      expect(dispose).toHaveBeenCalled();
      await deliver(() => {
        oldCharacters.emit([character("alice")]);
        oldNotes.emit("late secret");
      });
      expect(state().characters).toEqual([]);
      expect(state().privateNotes).toBe("");
      await bootstrap();
      await emit("characters", [character(nextUid)]);
      expect(state().characters[0]?.ownerUid).toBe(nextUid);
    }
  );

  it("clears campaign inspection, notes and assets on revocation and restores owned subscriptions without a loop", async () => {
    render(<IdentityApp />);
    await authenticate("alice");
    await bootstrap();
    await emit("characters", [character("alice")]);
    fireEvent.click(screen.getByRole("button", { name: "Open campaign" }));
    await deliver(() => {});
    await emit("memberships", [
      {
        schema: 1,
        id: "campaign",
        name: "Campaign",
        dmUid: "alice",
        members: ["alice"],
        revision: 0,
        archived: false,
        joinOpen: true,
      },
    ]);
    await emit("characters", [character("alice")]);
    fireEvent.click(screen.getByRole("button", { name: "Inspect own character" }));
    await emit("inspection", character("alice"));
    await emit("privateNotes", "secret");
    await emit("dmNotes", "DM secret");
    const revokedRoster = activeWatch("roster");
    await deliver(() => revokedRoster.deny());
    expect(state().campaignId).toBeNull();
    expect(state().inspected).toBeNull();
    expect(state().privateNotes).toBe("");
    expect(state().dmNotes).toBe("");
    expect(state().portraits).toEqual({});
    expect(state().error).toBe("accessRevoked");
    await emit("characters", [character("alice")]);
    expect(state().loading).toBe(false);
    const count = current().watches.length;
    await deliver(() => {
      revokedRoster.deny();
      revokedRoster.emit([{ ownerUid: "other", characterId: "private" }]);
    });
    expect(current().watches.length).toBe(count);
    expect(
      current().watches.filter((w) => w.kind === "characters" && !w.stopped)
    ).toHaveLength(1);
    expect(state().campaignId).toBeNull();
  });
});
