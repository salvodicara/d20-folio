import { LibraryWorkspace } from "@/features/library/LibraryWorkspace";
import { createLibraryRepository } from "@/lib/library/repository";
import { SharedAssignment } from "./SharedAssignment";
import { SharedNotes } from "./SharedNotes";
import { createSharedRepository } from "@/lib/shared/repository";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { useTranslation } from "react-i18next";
import { auth, db, storage } from "@/lib/firebase";
import {
  createIdentityRepository,
  loadAuthenticatedAsset,
  SessionController,
  type CharacterRef,
  type FolioAccount,
  type FolioCampaign,
  type FolioCharacter,
  type RosterEntry,
} from "@/lib/identity";
import { ensureLocale } from "@/i18n";
import { IdentityWorkspace, type IdentityPage } from "./IdentityWorkspace";

export function IdentityApp() {
  const [principal, setPrincipal] = useState<{
    user: User | null | undefined;
    generation: number;
  }>({ user: undefined, generation: 0 });
  useEffect(
    () =>
      onAuthStateChanged(auth, (user) =>
        setPrincipal((previous) => ({ user, generation: previous.generation + 1 }))
      ),
    []
  );
  const { user } = principal;
  const { t } = useTranslation("common");
  if (user === undefined)
    return (
      <div className="identity-app identity-login">
        <p role="status">{t("identity.loading")}</p>
      </div>
    );
  return user ? (
    <AuthenticatedIdentity
      key={user.uid + ":" + String(principal.generation)}
      user={user}
    />
  ) : (
    <IdentityLogin />
  );
}

function IdentityLogin() {
  const { t } = useTranslation("common");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const login = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(false);
    try {
      await action();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="identity-app identity-login">
      <section className="identity-panel">
        <p className="identity-kicker">d20 Folio</p>
        <h1>{t("identity.signIn")}</h1>
        <p>{t("identity.signInIntro")}</p>
        {error && <p role="alert">{t("identity.requestFailed")}</p>}
        {import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === "true" ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void login(() => signInWithEmailAndPassword(auth, email, password));
            }}
          >
            <label>
              {t("identity.email")}
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label>
              {t("identity.password")}
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button className="identity-primary" disabled={busy}>
              {t("identity.signIn")}
            </button>
          </form>
        ) : (
          <button
            className="identity-primary"
            disabled={busy}
            onClick={() =>
              void login(() => signInWithPopup(auth, new GoogleAuthProvider()))
            }
          >
            {t("identity.googleSignIn")}
          </button>
        )}
      </section>
    </div>
  );
}

function AuthenticatedIdentity({ user }: { user: User }) {
  const { t, i18n } = useTranslation("common");
  const appliedLocale = useRef(false);
  const [session] = useState(() => {
    const value = new SessionController();
    value.transition({ uid: user.uid, campaignId: null, activeCharacterId: null });
    return value;
  });
  const repository = useMemo(() => createIdentityRepository(db, session), [session]);
  const shared = useMemo(() => createSharedRepository(db, session), [session]);
  const [epoch, setEpoch] = useState(0);
  const library = useMemo(() => createLibraryRepository(db, session), [session]);
  const [viewGeneration, setViewGeneration] = useState(0);
  const [page, setPage] = useState<IdentityPage>("account");
  const [account, setAccount] = useState<FolioAccount | null>(null);
  const [characters, setCharacters] = useState<Readonly<FolioCharacter>[]>([]);
  const [campaigns, setCampaigns] = useState<FolioCampaign[]>([]);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [rosterNames, setRosterNames] = useState<Record<string, string>>({});
  const [inspected, setInspected] = useState<Readonly<FolioCharacter> | null>(null);
  const [inspectionRef, setInspectionRef] = useState<CharacterRef | null>(null);
  const [privateNotes, setPrivateNotes] = useState("");
  const [dmNotes, setDmNotes] = useState("");
  const [portraits, setPortraits] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedCampaignRef = useRef<string | null>(null);
  const scope = session.scope();
  const clearInspection = useCallback(() => {
    setInspectionRef(null);
    setInspected(null);
    setPrivateNotes("");
  }, []);
  const transition = useCallback(
    (campaignId: string | null, activeCharacterId: string | null) => {
      session.transition({ uid: user.uid, campaignId, activeCharacterId });
      selectedCampaignRef.current = campaignId;
      clearInspection();
      setRoster([]);
      setRosterNames({});
      setDmNotes("");
      setPortraits({});
      setBusy(false);
      setError(null);
      setLoading(true);
      setEpoch((v) => v + 1);
      setViewGeneration((v) => v + 1);
    },
    [session, user.uid, clearInspection]
  );
  const failed = useCallback(
    (cause: unknown) => {
      const code =
        cause && typeof cause === "object" && "code" in cause
          ? String(cause.code)
          : cause instanceof Error
            ? cause.message
            : "";
      if (code === "stale-session") return;
      if (code.includes("permission-denied")) {
        clearInspection();
        setRoster([]);
        setDmNotes("");
        setPortraits({});
        setBusy(false);
        setError("accessRevoked");
        setLoading(false);
        setViewGeneration((v) => v + 1);
        if (selectedCampaignRef.current) {
          selectedCampaignRef.current = null;
          setEpoch((v) => v + 1);
        }
      } else
        setError(
          code === "join-partial"
            ? "joinPartial"
            : code === "offline" || code.includes("unavailable")
              ? "offline"
              : "requestFailed"
        );
    },
    [clearInspection]
  );
  const run = useCallback(
    async <T,>(action: () => Promise<T>): Promise<T> => {
      const check = session.ticket();
      const done = session.guard(() => setBusy(false));
      const report = session.guard(failed);
      setError(null);
      setBusy(true);
      try {
        const result = await action();
        check();
        return result;
      } catch (cause) {
        report(cause);
        throw cause;
      } finally {
        done();
      }
    },
    [session, failed]
  );
  useEffect(() => {
    if (!session.scope().uid)
      session.transition({ uid: user.uid, campaignId: null, activeCharacterId: null });
    let live = true;
    const check = session.ticket();
    const stops: (() => void)[] = [];
    void repository
      .ensureIdentity(user.displayName ?? user.email?.split("@")[0] ?? "")
      .then(() => {
        check();
        if (!live) return;
        stops.push(
          repository.watchAccount((value) => {
            setAccount(value);
            if (value && !appliedLocale.current) {
              appliedLocale.current = true;
              void ensureLocale(value.locale).then(
                session.guard(() => {
                  void i18n.changeLanguage(value.locale);
                })
              );
            }
          }, failed),
          repository.watchOwnedCharacters((value) => {
            setCharacters(value);
            setLoading(false);
          }, failed),
          repository.watchMemberships(setCampaigns, failed),
          repository.watchAuthority((authority) => {
            if (authority && authority.status !== "active") {
              session.revoke();
              clearInspection();
              setCharacters([]);
              setCampaigns([]);
              setRoster([]);
              setPortraits({});
              setError("accessRevoked");
              setViewGeneration((v) => v + 1);
            }
          }, failed)
        );
      })
      .catch((cause: unknown) => {
        if (live) failed(cause);
      });
    return () => {
      live = false;
      stops.forEach((stop) => stop());
    };
  }, [
    repository,
    session,
    epoch,
    failed,
    transition,
    clearInspection,
    user.uid,
    user.displayName,
    user.email,
    i18n,
  ]);
  useEffect(() => {
    return () => session.revoke();
  }, [session]);
  useEffect(() => {
    const campaignId = session.scope().campaignId;
    if (!campaignId) return;
    const stops = [repository.watchRoster(campaignId, setRoster, failed)];
    if (campaigns.find((c) => c.id === campaignId)?.dmUid === user.uid)
      stops.push(repository.watchDmNotes(campaignId, setDmNotes, failed));
    return () => stops.forEach((stop) => stop());
  }, [repository, session, epoch, campaigns, failed, user.uid]);
  useEffect(() => {
    if (!inspectionRef) return;
    const stops = [repository.watchCharacter(inspectionRef, setInspected, failed)];
    if (inspectionRef.ownerUid === user.uid)
      stops.push(repository.watchPrivateNotes(inspectionRef, setPrivateNotes, failed));
    return () => stops.forEach((stop) => stop());
  }, [repository, inspectionRef, failed, user.uid]);
  useEffect(() => {
    let live = true;
    const stops = roster
      .filter((row) => row.ownerUid !== user.uid)
      .map((row) =>
        repository.watchCharacter(
          { ownerUid: row.ownerUid, id: row.characterId },
          (character) => {
            if (live)
              setRosterNames((names) => {
                const next = { ...names };
                const key = row.ownerUid + "/" + row.characterId;
                if (character) next[key] = character.name;
                else
                  return Object.fromEntries(
                    Object.entries(next).filter(([id]) => id !== key)
                  );
                return next;
              });
          },
          failed,
          "resource"
        )
      );
    return () => {
      live = false;
      stops.forEach((stop) => stop());
    };
  }, [repository, roster, failed, user.uid]);
  const portraitPaths = characters
    .flatMap((c) => (c.portraitPath ? [c.portraitPath] : []))
    .sort()
    .join("\n");
  useEffect(() => {
    let alive = true;
    const disposers: (() => void)[] = [];
    const deliver = session.guard((key: string, url: string) => {
      if (alive) setPortraits((old) => ({ ...old, [key]: url }));
    });
    for (const path of portraitPaths.split("\n"))
      if (path)
        void loadAuthenticatedAsset(storage, path, session)
          .then((asset) => {
            if (!alive) {
              asset.dispose();
              return;
            }
            disposers.push(asset.dispose);
            const segments = path.split("/");
            const ownerUid = segments[1],
              id = segments[3];
            if (ownerUid && id) deliver(ownerUid + "/" + id, asset.url);
          })
          .catch(() => {});
    return () => {
      alive = false;
      disposers.forEach((dispose) => dispose());
    };
  }, [portraitPaths, session, epoch]);
  useEffect(() => {
    const online = () => setError(null);
    const offline = () => setError("offline");
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, []);
  return (
    <IdentityWorkspace
      key={user.uid + ":" + String(viewGeneration)}
      initialPage={page}
      onPageChange={setPage}
      uid={user.uid}
      displayName={
        account?.displayName ?? user.displayName ?? user.email?.split("@")[0] ?? ""
      }
      diceMode={account?.diceMode ?? "digital"}
      onSaveDiceMode={(diceMode) => run(() => repository.saveAccount({ diceMode }))}
      onSaveLocale={(locale) => run(() => repository.saveAccount({ locale }))}
      characters={characters}
      campaigns={campaigns}
      roster={roster}
      rosterNames={rosterNames}
      loading={loading || (!account && !error)}
      busy={busy}
      error={error}
      activeId={scope.activeCharacterId}
      campaignId={scope.campaignId}
      inspected={inspected}
      portraits={portraits}
      privateNotes={privateNotes}
      dmNotes={dmNotes}
      onNavigateCampaign={(id) => transition(id, scope.activeCharacterId)}
      onSelect={(id) => transition(scope.campaignId, id)}
      onInspect={(ref) => {
        clearInspection();
        setInspectionRef(ref);
      }}
      onClearInspection={clearInspection}
      assignmentEditor={(id, onDone) => {
        const character = characters.find((c) => c.id === id);
        return character ? (
          <SharedAssignment
            key={id}
            character={character}
            campaigns={campaigns}
            repository={shared}
            session={session}
            onDone={onDone}
          />
        ) : null;
      }}
      onAssign={(id, campaignId) => run(() => repository.assign(id, campaignId))}
      onRelease={(id) => run(() => repository.release(id))}
      onReadInvite={(id) =>
        run(async () => {
          const invite = await repository.getInvite(id);
          if (!invite) setError("inviteNotFound");
          return invite;
        })
      }
      onJoin={(id, ids) =>
        run(async () => {
          await repository.joinCampaign(id);
          try {
            for (const characterId of ids) await repository.assign(characterId, id);
          } catch (cause) {
            if (cause instanceof Error && cause.message === "stale-session") throw cause;
            throw new Error("join-partial", { cause });
          }
        })
      }
      onCreateCampaign={(name) =>
        run(() => repository.createCampaign(name)).then((id) => transition(id, null))
      }
      onSetJoinOpen={(id, open) => run(() => repository.setJoinOpen(id, open))}
      onRevoke={(id, uid) =>
        run(() =>
          uid === user.uid
            ? repository.leaveCampaign(id)
            : repository.revokeMember(id, uid)
        )
      }
      onSignOut={async () => {
        session.revoke();
        clearInspection();
        setCharacters([]);
        setCampaigns([]);
        setPortraits({});
        try {
          await signOut(auth);
        } catch (cause) {
          transition(null, null);
          failed(cause);
        }
      }}
      onSaveProfile={(displayName) => run(() => repository.saveAccount({ displayName }))}
      library={
        loading || !account ? (
          <p role="status">{t("identity.loading")}</p>
        ) : (
          <LibraryWorkspace
            key={epoch}
            repository={library}
            session={session}
            campaigns={campaigns}
            campaignId={scope.campaignId}
            onCampaignChange={(id) => transition(id, scope.activeCharacterId)}
            recipients={Object.entries(
              roster.reduce<Record<string, string[]>>(
                (result, row) => {
                  const name =
                    row.ownerUid === user.uid
                      ? characters.find((c) => c.id === row.characterId)?.name
                      : rosterNames[row.ownerUid + "/" + row.characterId];
                  if (name) (result[row.ownerUid] ??= []).push(name);
                  return result;
                },
                Object.fromEntries(
                  campaigns
                    .filter((c) => c.id === scope.campaignId)
                    .map((c) => [c.dmUid, [t("identity.dm")]])
                )
              )
            ).map(([uid, names]) => ({ uid, name: names.join(" · ") }))}
          />
        )
      }
      privateNoteEditor={
        inspectionRef?.ownerUid === user.uid ? (
          <SharedNotes
            key={inspectionRef.id}
            repository={shared}
            session={session}
            target={{
              kind: "personal",
              ownerUid: user.uid,
              characterId: inspectionRef.id,
            }}
            title={t("identity.privateNotes")}
            value={privateNotes}
          />
        ) : null
      }
      dmNoteEditor={
        scope.campaignId ? (
          <SharedNotes
            key={scope.campaignId}
            repository={shared}
            session={session}
            target={{ kind: "dm", campaignId: scope.campaignId }}
            title={t("identity.dmNotes")}
            value={dmNotes}
          />
        ) : null
      }
      onImport={(source) =>
        run(async () => {
          await repository.importLegacy(source);
        })
      }
      onRecover={(id) =>
        run(async () => {
          const source = await repository.recoverImport(id);
          const url = URL.createObjectURL(
            new Blob([source], { type: "application/json" })
          );
          const a = document.createElement("a");
          a.href = url;
          a.download = id + "-original.json";
          a.click();
          URL.revokeObjectURL(url);
        })
      }
      onRetry={() => transition(scope.campaignId, scope.activeCharacterId)}
    />
  );
}
