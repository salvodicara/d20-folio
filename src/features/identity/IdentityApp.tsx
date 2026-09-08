import { HomebrewReader } from "@/features/library/HomebrewReader";
import { HomebrewExport } from "@/features/library/HomebrewPortable";
import { downloadText } from "@/features/library/homebrew-files";
import { CreationFlow } from "@/features/creation/CreationFlow";
import { ImportFlow } from "@/features/creation/ImportFlow";
import "@/features/creation/creation-flow.css";
import { createClassBuildReader } from "@/lib/homebrew/class-build-repository";
import { verifyCatalogueSnapshot } from "@/lib/character-creation/catalogue";
import { resolveCreationPool } from "@/lib/character-creation/catalogue-pools";
import { useClassBuild } from "./useClassBuild";
import { PreparationReuse } from "@/features/library/PreparationReuse";
import { CampaignHomebrew } from "@/features/library/CampaignHomebrew";
import { createPreparationRepository } from "@/lib/homebrew/preparation-repository";
import { HomebrewReuse } from "@/features/library/HomebrewReuse";
import { HomebrewSheet } from "@/features/library/HomebrewSheet";
import { createInstanceRepository } from "@/lib/homebrew/instance-repository";
import { createOriginBuildRepository } from "@/lib/homebrew/origin-build-repository";
import { projectAcquisitionCharacter } from "@/lib/homebrew/origin-build";
import { isOriginFamily } from "@/lib/homebrew/origins";
import { OriginBuildPanel } from "@/features/library/OriginBuild";
import { useOriginBuild } from "@/features/library/useOriginBuild";
import { OriginReuse } from "@/features/library/OriginReuse";
import type { LibraryVersion } from "@/lib/library/model";
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
import { IdentityWorkspace } from "./IdentityWorkspace";
import { IdentityNavigation, useIdentityNavigation } from "./IdentityNavigation";

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
    <IdentityNavigation
      key={user.uid + ":" + String(principal.generation)}
      uid={user.uid}
      resumeHistory={principal.generation === 1}
    >
      <AuthenticatedIdentity user={user} />
    </IdentityNavigation>
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
  const { navigation, route } = useIdentityNavigation();
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
  const instances = useMemo(
    () => createInstanceRepository(db, session, verifyCatalogueSnapshot),
    [session]
  );
  const origins = useMemo(
    () =>
      createOriginBuildRepository(db, session, {
        verifyCatalogue: verifyCatalogueSnapshot,
        resolvePool: resolveCreationPool,
      }),
    [session]
  );
  const preparations = useMemo(() => createPreparationRepository(db, session), [session]);
  const [preparationId, setPreparationId] = useState("encounter");
  const [reuse, setReuse] = useState<LibraryVersion | null>(null);
  const [viewGeneration, setViewGeneration] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [account, setAccount] = useState<FolioAccount | null>(null);
  const [characters, setCharacters] = useState<Readonly<FolioCharacter>[]>([]);
  const [campaigns, setCampaigns] = useState<FolioCampaign[]>([]);
  const [membershipsReady, setMembershipsReady] = useState(false);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [rosterNames, setRosterNames] = useState<Record<string, string>>({});
  const [inspectedSnapshot, setInspected] = useState<{
    lookup: string;
    key: string;
    character: Readonly<FolioCharacter> | null;
  } | null>(null);
  const inspectionLookup = `${route.owner}/${route.character}`;
  const previousInspection =
    inspectedSnapshot?.lookup === inspectionLookup ? inspectedSnapshot.character : null;
  const foreignInspection = !!route.owner && route.owner !== user.uid;
  const inspectionCampaignId = foreignInspection
    ? (previousInspection?.currentAssignment?.campaignId ?? route.campaign)
    : undefined;
  const inspectionCampaign = campaigns.find(
    (campaign) => campaign.id === inspectionCampaignId
  );
  // Existing membership revision releases foreign views immediately and fences late snapshots.
  const inspectionKey = `${inspectionLookup}:${inspectionCampaignId ? `${inspectionCampaignId}:${inspectionCampaign?.revision ?? "pending"}` : "personal"}`;
  const inspectionWithdrawn = !!(
    foreignInspection &&
    !isAdmin &&
    membershipsReady &&
    inspectionCampaignId &&
    (!inspectionCampaign ||
      inspectionCampaign.archived ||
      !inspectionCampaign.members.includes(route.owner ?? ""))
  );
  const inspected =
    !inspectionWithdrawn && inspectedSnapshot?.key === inspectionKey
      ? inspectedSnapshot.character
      : null;
  const originBuild = useOriginBuild(inspected, origins, session, epoch);
  const classReader = useMemo(
    () => createClassBuildReader(db, session, verifyCatalogueSnapshot),
    [session]
  );
  const classBuild = useClassBuild(inspected, classReader, session, epoch);
  const creationMarker = inspected?.sheet.build.creation;
  const guidedCreation =
    !!creationMarker &&
    typeof creationMarker === "object" &&
    !Array.isArray(creationMarker) &&
    creationMarker.schema === 1 &&
    creationMarker.kind === "guided";
  const classUnavailable =
    classBuild.error ||
    !!classBuild.original ||
    (guidedCreation && !classBuild.loading && !classBuild.base);
  const originUnavailable =
    originBuild.error ||
    originBuild.issues.length > 0 ||
    (guidedCreation && !originBuild.loading && !originBuild.base);
  const originProjection = useMemo(
    () =>
      inspected &&
      !originBuild.loading &&
      !originUnavailable &&
      !classBuild.loading &&
      !classUnavailable
        ? projectAcquisitionCharacter(inspected, originBuild.base, classBuild.base, {
            verifyCatalogue: verifyCatalogueSnapshot,
            resolvePool: resolveCreationPool,
          })
        : undefined,
    [
      inspected,
      originBuild.loading,
      originUnavailable,
      originBuild.base,
      classBuild.loading,
      classBuild.base,
      classUnavailable,
    ]
  );
  useEffect(() => {
    let live = true;
    const stop = session.track(() => {
      if (live) {
        navigation.invalidate();
        setReuse(null);
      }
    });
    return () => {
      live = false;
      stop();
    };
  }, [session, epoch, navigation]);
  const inspectionRef = useMemo<CharacterRef | null>(
    () =>
      route.owner && route.character
        ? { ownerUid: route.owner, id: route.character }
        : null,
    [route.owner, route.character]
  );
  const [privateNoteSnapshot, setPrivateNoteSnapshot] = useState<{
    key: string;
    value: string;
  } | null>(null);
  const privateNotes =
    privateNoteSnapshot?.key === `${route.owner}/${route.character}`
      ? privateNoteSnapshot.value
      : "";
  const [dmNotes, setDmNotes] = useState("");
  const [portraits, setPortraits] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedCampaignRef = useRef<string | null>(null);
  const scope = session.scope();
  const clearInspection = useCallback(() => {
    setInspected(null);
    setPrivateNoteSnapshot(null);
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
      setMembershipsReady(false);
      setEpoch((v) => v + 1);
      setViewGeneration((v) => v + 1);
    },
    [session, user.uid, clearInspection]
  );
  const availableCampaigns = useRef<readonly FolioCampaign[]>([]);
  const synchronizingRoute = useRef(false);
  const synchronizeCampaign = useCallback(() => {
    if (synchronizingRoute.current) return;
    const requested = navigation.snapshot().route;
    const id =
      requested.campaign &&
      availableCampaigns.current.some((c) => c.id === requested.campaign)
        ? requested.campaign
        : null;
    if (id === session.scope().campaignId) return;
    synchronizingRoute.current = true;
    try {
      transition(id, session.scope().activeCharacterId);
      navigation.go(requested, { replace: true });
    } finally {
      synchronizingRoute.current = false;
    }
  }, [navigation, session, transition]);
  useEffect(
    () => navigation.subscribe(synchronizeCampaign),
    [navigation, synchronizeCampaign]
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
        setMembershipsReady(true);
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
          repository.watchMemberships((value) => {
            availableCampaigns.current = value;
            setCampaigns(value);
            setMembershipsReady(true);
            synchronizeCampaign();
          }, failed),
          repository.watchAuthority((authority) => {
            setIsAdmin(authority?.status === "active" && authority.isAdmin);
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
    synchronizeCampaign,
  ]);
  useEffect(() => {
    return () => session.revoke();
  }, [session]);
  const isCurrentCampaignDm =
    campaigns.find((campaign) => campaign.id === scope.campaignId)?.dmUid === user.uid;
  useEffect(() => {
    const campaignId = session.scope().campaignId;
    if (!campaignId) return;
    const stops = [repository.watchRoster(campaignId, setRoster, failed)];
    if (isCurrentCampaignDm)
      stops.push(repository.watchDmNotes(campaignId, setDmNotes, failed));
    return () => stops.forEach((stop) => stop());
  }, [repository, session, epoch, isCurrentCampaignDm, failed]);
  useEffect(() => {
    if (!inspectionRef || inspectionWithdrawn) return;
    let live = true;
    const stops = [
      repository.watchCharacter(
        inspectionRef,
        (character) => {
          if (live)
            setInspected({ lookup: inspectionLookup, key: inspectionKey, character });
        },
        failed
      ),
    ];
    if (inspectionRef.ownerUid === user.uid)
      stops.push(
        repository.watchPrivateNotes(
          inspectionRef,
          (value) =>
            setPrivateNoteSnapshot({
              key: `${inspectionRef.ownerUid}/${inspectionRef.id}`,
              value,
            }),
          failed
        )
      );
    return () => {
      live = false;
      stops.forEach((stop) => stop());
    };
  }, [
    repository,
    inspectionRef,
    inspectionLookup,
    inspectionKey,
    inspectionWithdrawn,
    failed,
    user.uid,
    epoch,
  ]);
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
  const openInspection = (ref: CharacterRef) => {
    const current = navigation.snapshot().route;
    navigation.go({
      ...current,
      page: ["characters", "campaign", "library"].includes(current.page)
        ? current.page
        : "characters",
      owner: ref.ownerUid,
      character: ref.id,
    });
  };
  const navigateCampaign = (id: string | null) => {
    synchronizingRoute.current = true;
    try {
      transition(id, session.scope().activeCharacterId);
      navigation.go({ ...navigation.snapshot().route, campaign: id ?? undefined });
    } finally {
      synchronizingRoute.current = false;
    }
  };
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
  const selectedCampaign = campaigns.find((c) => c.id === scope.campaignId);
  return (
    <IdentityWorkspace
      key={user.uid + ":" + String(viewGeneration)}
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
      loading={loading || !membershipsReady || (!account && !error)}
      busy={busy}
      error={error}
      activeId={scope.activeCharacterId}
      campaignId={scope.campaignId}
      inspected={inspected}
      inspectionLoading={
        !!inspectionRef &&
        !inspectionWithdrawn &&
        !error &&
        inspectedSnapshot?.key !== inspectionKey
      }
      originProjection={originProjection}
      originLoading={originBuild.loading || classBuild.loading}
      originUnavailable={originUnavailable || classUnavailable}
      portraits={portraits}
      privateNotes={privateNotes}
      dmNotes={dmNotes}
      onNavigateCampaign={navigateCampaign}
      onSelect={(id) => transition(scope.campaignId, id)}
      onInspect={openInspection}
      onClearInspection={() => (route.character ? navigation.back() : clearInspection())}
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
        run(() => repository.createCampaign(name)).then((id) => navigateCampaign(id))
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
        loading || !membershipsReady || !account ? (
          <p role="status">{t("identity.loading")}</p>
        ) : (
          <>
            <LibraryWorkspace
              key={epoch}
              repository={library}
              onReuse={setReuse}
              session={session}
              campaigns={campaigns}
              campaignId={scope.campaignId}
              onCampaignChange={navigateCampaign}
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
            {reuse && ["monster", "campaign-rule"].includes(reuse.definition.family) ? (
              <PreparationReuse
                version={reuse}
                campaign={campaigns.find((c) => c.id === scope.campaignId)}
                repository={preparations}
                session={session}
                onClose={() => setReuse(null)}
                onOpen={session.guard((id) => {
                  if (id) setPreparationId(id);
                  setReuse(null);
                  navigation.go({
                    page: "campaign",
                    campaign: scope.campaignId ?? undefined,
                  });
                })}
              />
            ) : reuse && isOriginFamily(reuse.definition.family) ? (
              <OriginReuse
                key={epoch}
                version={reuse}
                characters={characters}
                repository={origins}
                library={library}
                session={session}
                onClose={() => setReuse(null)}
                onOpen={session.guard(openInspection)}
              />
            ) : (
              reuse && (
                <HomebrewReuse
                  version={reuse}
                  characters={characters}
                  repository={instances}
                  session={session}
                  onClose={() => setReuse(null)}
                  onOpen={session.guard(openInspection)}
                />
              )
            )}
          </>
        )
      }
      campaignHomebrew={
        selectedCampaign && (
          <CampaignHomebrew
            key={epoch}
            campaign={selectedCampaign}
            repository={preparations}
            library={library}
            session={session}
            canManage={
              !campaigns.find((c) => c.id === scope.campaignId)?.archived &&
              (isAdmin ||
                campaigns.find((c) => c.id === scope.campaignId)?.dmUid === user.uid)
            }
            preparationId={preparationId}
            onPreparationChange={setPreparationId}
          />
        )
      }
      homebrewSheet={
        inspected && (
          <>
            <OriginBuildPanel
              key={`origin:${epoch}:${inspected.ownerUid}:${inspected.id}`}
              character={inspected}
              loaded={originBuild}
              editable={!guidedCreation}
              composition={originProjection}
              repository={origins}
              library={library}
              session={session}
            />
            {classBuild.original && (
              <div role="alert">
                <p>{t("homebrewV2.recoveryUnavailable")}</p>
                <button
                  onClick={() =>
                    downloadText(classBuild.original ?? "", "class-build-original.json")
                  }
                >
                  {t("homebrewV2.recoverOriginal")}
                </button>
              </div>
            )}
            {classBuild.base &&
              Object.values(classBuild.base.acquisitions).map((acquisition) => (
                <section className="homebrew-sheet" key={acquisition.id}>
                  <h3>{t("identity.sheet.classes")}</h3>
                  <HomebrewReader
                    definition={acquisition.snapshot.definition}
                    catalogue={
                      "kind" in acquisition.snapshot ? acquisition.snapshot : undefined
                    }
                  />
                  <HomebrewExport
                    definition={acquisition.snapshot.definition}
                    catalogue={
                      "kind" in acquisition.snapshot ? acquisition.snapshot : undefined
                    }
                    version={
                      "kind" in acquisition.snapshot ? undefined : acquisition.snapshot
                    }
                  />
                </section>
              ))}
            <HomebrewSheet
              key={`${epoch}:${inspected.ownerUid}:${inspected.id}`}
              character={inspected}
              repository={instances}
              library={library}
              session={session}
            />
          </>
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
      onCreate={() =>
        navigation.go({ page: "characters", creation: "new", step: "identity" })
      }
      onBeginImport={() => navigation.go({ page: "characters", creation: "import" })}
      onReviewImport={(id) =>
        navigation.go({ page: "characters", creation: "import", review: id })
      }
      creation={
        <>
          <CreationFlow
            session={session}
            library={library}
            enabled={!loading && membershipsReady && !!account}
            generation={epoch}
          />
          <ImportFlow
            session={session}
            enabled={!loading && membershipsReady && !!account}
            characters={characters}
            recoverOriginal={(id) => repository.recoverImport(id)}
          />
        </>
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
