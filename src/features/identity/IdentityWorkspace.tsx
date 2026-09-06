import { useEffect, useRef, useState, type SubmitEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import * as Dialog from "@radix-ui/react-dialog";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Dice5,
  LogOut,
  Plus,
  Search,
  Shield,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import type {
  CharacterRef,
  FolioCharacter,
  FolioCampaign,
  RosterEntry,
} from "@/lib/identity/model";
import "./identity.css";
import { IdentitySheet } from "./IdentitySheet";
import identityMark from "./assets/d20-mark.svg";
import { changeLanguage } from "@/i18n";
import { srdCatalogues } from "@/i18n/srd-en";
import { CheckboxField } from "@/components/ui/selection";

type Page = "account" | "characters" | "invite" | "campaign";
export interface IdentityWorkspaceProps {
  initialPage?: Page;
  onPageChange?: (page: Page) => void;
  uid: string;
  displayName: string;
  characters: readonly FolioCharacter[];
  campaigns: readonly FolioCampaign[];
  roster: readonly RosterEntry[];
  loading: boolean;
  busy: boolean;
  error: string | null;
  activeId: string | null;
  campaignId: string | null;
  inspected: Readonly<FolioCharacter> | null;
  portraits?: Readonly<Record<string, string>>;
  rosterNames?: Readonly<Record<string, string>>;
  privateNotes?: string;
  dmNotes?: string;
  onNavigateCampaign: (id: string | null) => void;
  onSelect: (id: string) => void;
  onInspect: (ref: CharacterRef) => void;
  onClearInspection: () => void;
  onAssign: (id: string, campaignId: string) => Promise<void>;
  onRelease: (id: string) => Promise<void>;
  onReadInvite: (
    id: string
  ) => Promise<{ id: string; name: string; joinOpen: boolean } | null>;
  onJoin: (id: string, characterIds: string[]) => Promise<void>;
  onCreateCampaign: (name: string) => Promise<void>;
  onSetJoinOpen?: (id: string, open: boolean) => Promise<void>;
  onRevoke: (campaignId: string, uid: string) => Promise<void>;
  onSignOut: () => Promise<void>;
  onSaveProfile: (name: string, locale: "en" | "it") => Promise<void>;
  onSaveNotes?: (text: string) => Promise<void>;
  onSaveDmNotes?: (text: string) => Promise<void>;
  onImport?: (source: string) => Promise<void>;
  onRecover?: (id: string) => Promise<void>;
  onRetry: () => void;
}

export function IdentityWorkspace(p: IdentityWorkspaceProps) {
  const { t, i18n } = useTranslation("common");
  const label = (key: string, values?: Record<string, string | number>) =>
    t(`identity.${key}`, values);
  const [page, setPage] = useState<Page>(p.initialPage ?? "account");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [nameDraft, setName] = useState<string | null>(null);
  const name = nameDraft ?? p.displayName;
  const profileLocale = i18n.language.startsWith("it") ? "it" : "en";
  const [inviteCode, setInviteCode] = useState("");
  const [invite, setInvite] = useState<{
    id: string;
    name: string;
    joinOpen: boolean;
  } | null>(null);
  const [joinIds, setJoinIds] = useState<string[]>([]);
  const [assignment, setAssignment] = useState<string | null>(null);
  const [destination, setDestination] = useState("");
  const [newCampaign, setNewCampaign] = useState(false);
  const [campaignName, setCampaignName] = useState("");
  const [revokeUid, setRevokeUid] = useState<string | null>(null);
  const requestGeneration = useRef(0);
  const dialogReturnFocus = useRef<HTMLElement | null>(null);
  useEffect(
    () => () => {
      requestGeneration.current++;
    },
    []
  );
  const campaign = p.campaigns.find((c) => c.id === p.campaignId);
  const navigate = (next: Page) => {
    requestGeneration.current++;
    setInvite(null);
    p.onClearInspection();
    setPage(next);
    p.onPageChange?.(next);
  };
  const submit = (event: SubmitEvent, action: () => Promise<void>) => {
    event.preventDefault();
    void action().catch(() => {});
  };
  const selected = p.characters.find((c) => c.id === p.activeId);
  const filtered = p.characters.filter(
    (c) =>
      (filter === "all" ||
        (filter === "independent"
          ? !c.currentAssignment
          : c.currentAssignment?.campaignId === filter)) &&
      c.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())
  );
  const title = label(page);
  const portrait = (c: Readonly<FolioCharacter>) =>
    p.portraits?.[`${c.ownerUid}/${c.id}`];
  const fieldName = (id: string, kind: "classes" | "species") => {
    const value = srdCatalogues(i18n.language.startsWith("it") ? "it" : "en")?.[
      kind === "classes" ? "class" : "race"
    ]?.[id]?.name;
    return typeof value === "string" ? value : id;
  };
  const modal = (
    open: boolean,
    close: () => void,
    heading: string,
    children: ReactNode
  ) => (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        if (!v) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="identity-overlay" />
        <Dialog.Content
          className="identity-dialog"
          onOpenAutoFocus={() => {
            dialogReturnFocus.current =
              document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
          }}
          onCloseAutoFocus={(event) => {
            if (dialogReturnFocus.current?.isConnected) {
              event.preventDefault();
              dialogReturnFocus.current.focus();
            }
          }}
        >
          <Dialog.Title>{heading}</Dialog.Title>
          <Dialog.Description className="identity-sr-only">
            {label("dialogDescription")}
          </Dialog.Description>
          <Dialog.Close className="identity-close" aria-label={label("close")}>
            <X size={20} />
          </Dialog.Close>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
  return (
    <div className="identity-app">
      <header className="identity-header">
        <button
          className="identity-brand"
          onClick={() => navigate("account")}
          aria-label={label("home")}
        >
          <img className="identity-mark" src={identityMark} alt="" />
          <span>D20 Folio</span>
        </button>
        <nav aria-label={label("mainNavigation")}>
          <button
            onClick={() => navigate("campaign")}
            aria-current={page === "campaign" ? "page" : undefined}
          >
            <UsersRound size={16} />
            {label("campaign")}
          </button>
          <button disabled title={label("notAvailable")}>
            <Dice5 size={16} />
            {label("atTable")}
          </button>
          <button
            onClick={() => navigate("characters")}
            aria-current={page === "characters" ? "page" : undefined}
          >
            <UserRound size={16} />
            {label("character")}
          </button>
          <button disabled title={label("notAvailable")}>
            <BookOpen size={16} />
            {label("library")}
          </button>
        </nav>
        <div className="identity-global">
          <button
            onClick={() => navigate("account")}
            aria-label={label("account")}
            aria-current={page === "account" ? "page" : undefined}
          >
            <span className="identity-avatar">{p.displayName.slice(0, 1)}</span>
            <span className="identity-account-name">
              <strong>{p.displayName}</strong>
              <small>{label("yourSpace")}</small>
            </span>
          </button>
          <button
            aria-label={label("changeLanguage")}
            onClick={() =>
              void changeLanguage(i18n.language.startsWith("it") ? "en" : "it")
            }
          >
            {i18n.language.startsWith("it") ? "IT" : "EN"}
            <ChevronDown size={12} />
          </button>
        </div>
      </header>
      <div className="identity-context">
        <span>{label("yourSpace")}</span>
        <ChevronRight size={14} />
        <strong>{title}</strong>
        {selected && (
          <span className="identity-active">
            {label("activeCharacter")}: {selected.name}
          </span>
        )}
      </div>
      <nav className="identity-subnav" aria-label={label("accountNavigation")}>
        {(["account", "characters", "invite"] as const).map((next) => (
          <button
            key={next}
            aria-current={page === next ? "page" : undefined}
            onClick={() => navigate(next)}
          >
            {label(next)}
          </button>
        ))}
      </nav>
      <main className="identity-main">
        <div className="identity-page-heading">
          <div>
            <p className="identity-kicker">{label("personalSpace")}</p>
            <h1>
              {page === "account"
                ? label("welcome", { name: p.displayName })
                : page === "invite"
                  ? label("inviteTitle")
                  : title}
            </h1>
            <p>{label(`${page}Intro`)}</p>
          </div>
          {page === "characters" && p.onImport && (
            <label className="identity-button identity-import">
              <Plus size={16} />
              {label("importCharacter")}
              <input
                type="file"
                accept=".json,application/json"
                disabled={p.busy}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  const generation = requestGeneration.current;
                  if (file)
                    void file
                      .text()
                      .then((text) => {
                        if (generation === requestGeneration.current)
                          return p.onImport?.(text);
                        return undefined;
                      })
                      .catch(() => {});
                  event.currentTarget.value = "";
                }}
              />
            </label>
          )}
        </div>
        {p.error && (
          <div role="alert" className="identity-error">
            <p>{label(i18n.exists("identity." + p.error) ? p.error : "requestFailed")}</p>
            <button onClick={p.onRetry}>{label("retry")}</button>
          </div>
        )}
        {p.loading && <p role="status">{label("loading")}</p>}
        {p.busy && (
          <p role="status" className="identity-progress">
            {label("saving")}
          </p>
        )}
        {page === "account" && (
          <div className="identity-account-grid">
            <section className="identity-panel">
              <p className="identity-kicker">{label("profile")}</p>
              <h2>{label("profile")}</h2>
              <form
                onSubmit={(event) =>
                  submit(event, () => p.onSaveProfile(name, profileLocale))
                }
              >
                <label>
                  {label("displayName")}
                  <input
                    value={name}
                    maxLength={80}
                    required
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <label>
                  {label("language")}
                  <select
                    value={profileLocale}
                    onChange={(e) => {
                      const locale = e.target.value as "en" | "it";

                      void changeLanguage(locale);
                    }}
                  >
                    <option value="it">Italiano</option>
                    <option value="en">English</option>
                  </select>
                </label>
                <div className="identity-actions">
                  <button className="identity-primary" disabled={p.busy}>
                    {label("saveProfile")}
                  </button>
                  <button type="button" onClick={() => void p.onSignOut()}>
                    <LogOut size={15} />
                    {label("signOut")}
                  </button>
                </div>
              </form>
              <div className="identity-rule" />
              <h3>{label("characters")}</h3>
              <p>{label("ownedCount", { count: p.characters.length })}</p>
              <button onClick={() => navigate("characters")}>
                {label("openCharacters")}
                <ChevronRight size={15} />
              </button>
            </section>
            <section className="identity-panel">
              <p className="identity-kicker">{label("memberships")}</p>
              <h2>{label("yourCampaigns")}</h2>
              <p>{label("membershipsIntro")}</p>
              <ul className="identity-list">
                {p.campaigns.map((c) => (
                  <li key={c.id}>
                    <div>
                      <strong>{c.name}</strong>
                      <small>{label(c.dmUid === p.uid ? "dm" : "player")}</small>
                    </div>
                    <button
                      onClick={() => {
                        p.onNavigateCampaign(c.id);
                        navigate("campaign");
                      }}
                      aria-label={label("openCampaign", { name: c.name })}
                    >
                      <ChevronRight size={18} />
                    </button>
                  </li>
                ))}
              </ul>
              {!p.campaigns.length && <p>{label("noCampaigns")}</p>}
              <div className="identity-actions">
                <button onClick={() => navigate("invite")}>{label("enterInvite")}</button>
                <button onClick={() => setNewCampaign(true)}>
                  <Plus size={15} />
                  {label("createCampaign")}
                </button>
              </div>
            </section>
          </div>
        )}
        {page === "characters" && (
          <>
            <div className="identity-toolbar">
              <div className="identity-filters">
                <button aria-pressed={filter === "all"} onClick={() => setFilter("all")}>
                  {label("allCharacters")}
                </button>
                <button
                  aria-pressed={filter === "independent"}
                  onClick={() => setFilter("independent")}
                >
                  {label("independent")}
                </button>
                <select
                  aria-label={label("filterCampaign")}
                  value={filter === "all" || filter === "independent" ? "" : filter}
                  onChange={(e) => setFilter(e.target.value || "all")}
                >
                  <option value="">{label("byCampaign")}</option>
                  {p.campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <label className="identity-search">
                <Search size={16} />
                <input
                  aria-label={label("searchCharacters")}
                  placeholder={label("searchCharacters")}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
            </div>
            <div className="identity-roster">
              {filtered.map((c) => (
                <article className="identity-character-card" key={c.id}>
                  <div className="identity-portrait">
                    {portrait(c) ? (
                      <img src={portrait(c)} alt="" />
                    ) : (
                      <UserRound size={64} aria-hidden="true" />
                    )}
                    {c.id === p.activeId && <span>{label("activeCharacter")}</span>}
                  </div>
                  <div className="identity-card-body">
                    <h2>{c.name}</h2>
                    <p>
                      {fieldName(c.speciesId, "species")} ·{" "}
                      {fieldName(c.classId, "classes")} ·{" "}
                      {label("level", { level: c.level })}
                    </p>
                    <div className="identity-assignment">
                      <span>
                        {c.currentAssignment
                          ? (p.campaigns.find(
                              (x) => x.id === c.currentAssignment?.campaignId
                            )?.name ?? label("unavailableCampaign"))
                          : label("independent")}
                      </span>
                      <button
                        onClick={() => {
                          setAssignment(c.id);
                          setDestination(c.currentAssignment?.campaignId ?? "");
                        }}
                      >
                        {label("manageCampaign")}
                      </button>
                    </div>
                    <div className="identity-card-actions">
                      <button
                        className="identity-primary"
                        onClick={() => p.onInspect({ ownerUid: c.ownerUid, id: c.id })}
                      >
                        {label("viewCharacter")}
                      </button>
                      <button
                        aria-pressed={c.id === p.activeId}
                        onClick={() => p.onSelect(c.id)}
                      >
                        {label("selectCharacter")}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            {!p.loading && !filtered.length && (
              <div className="identity-empty">
                <UserRound size={32} />
                <h2>{label("noCharacters")}</h2>
                <p>{label("noCharactersIntro")}</p>
              </div>
            )}
          </>
        )}
        {page === "invite" && (
          <section className="identity-panel identity-invite">
            <form
              onSubmit={(event) =>
                submit(event, async () => {
                  setInvite(null);
                  setJoinIds([]);
                  const generation = ++requestGeneration.current;
                  const result = await p.onReadInvite(inviteCode.trim());
                  if (generation === requestGeneration.current) setInvite(result);
                })
              }
            >
              <label>
                {label("campaignCode")}
                <input
                  value={inviteCode}
                  required
                  maxLength={128}
                  onChange={(e) => {
                    requestGeneration.current++;
                    setInviteCode(e.target.value);
                    setInvite(null);
                  }}
                  autoCapitalize="none"
                  autoComplete="off"
                />
              </label>
              <button className="identity-primary" disabled={p.busy}>
                {label("readInvite")}
                <ChevronRight size={15} />
              </button>
            </form>
            {invite && (
              <div className="identity-invite-result">
                <h3>{invite.name}</h3>
                <p>{label(invite.joinOpen ? "chooseJoinCharacters" : "inviteClosed")}</p>
                {invite.joinOpen && (
                  <>
                    <div className="identity-checklist">
                      {p.characters
                        .filter(
                          (c) =>
                            !c.currentAssignment ||
                            c.currentAssignment.campaignId === invite.id
                        )
                        .map((c) => (
                          <CheckboxField
                            key={c.id}
                            label={c.name}
                            checked={joinIds.includes(c.id)}
                            onCheckedChange={(checked) =>
                              setJoinIds((ids) =>
                                checked ? [...ids, c.id] : ids.filter((id) => id !== c.id)
                              )
                            }
                          />
                        ))}
                    </div>
                    <p>{label("joinWithoutCharacter")}</p>
                    <form
                      onSubmit={(event) =>
                        submit(event, async () => {
                          const generation = requestGeneration.current;
                          await p.onJoin(invite.id, joinIds);
                          if (generation !== requestGeneration.current) return;
                          p.onNavigateCampaign(invite.id);
                          navigate("campaign");
                        })
                      }
                    >
                      <div className="identity-actions">
                        <button className="identity-primary" disabled={p.busy}>
                          {label("confirmJoin")}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            requestGeneration.current++;
                            setInvite(null);
                          }}
                        >
                          {label("cancel")}
                        </button>
                      </div>
                    </form>
                  </>
                )}
              </div>
            )}
          </section>
        )}
        {page === "campaign" && (
          <>
            <div className="identity-toolbar">
              <select
                aria-label={label("chooseCampaign")}
                value={p.campaignId ?? ""}
                onChange={(e) => p.onNavigateCampaign(e.target.value || null)}
              >
                <option value="">{label("chooseCampaign")}</option>
                {p.campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button onClick={() => setNewCampaign(true)}>
                <Plus size={16} />
                {label("createCampaign")}
              </button>
            </div>
            {campaign ? (
              <div className="identity-account-grid">
                <section className="identity-panel">
                  <p className="identity-kicker">{label("campaignRoster")}</p>
                  <h2>{campaign.name}</h2>
                  {campaign.dmUid === p.uid && (
                    <div className="identity-invite-access">
                      <label>
                        {label("campaignCode")}
                        <input
                          readOnly
                          value={campaign.id}
                          onFocus={(event) => event.currentTarget.select()}
                        />
                      </label>
                      {p.onSetJoinOpen && (
                        <CheckboxField
                          className="identity-toggle"
                          label={label("acceptInvitations")}
                          checked={campaign.joinOpen}
                          disabled={p.busy}
                          onCheckedChange={(checked) =>
                            void p.onSetJoinOpen?.(campaign.id, checked).catch(() => {})
                          }
                        />
                      )}
                    </div>
                  )}
                  <p>{label("rosterIntro")}</p>
                  <ul className="identity-list">
                    {p.roster.map((row) => {
                      const own = p.characters.find(
                        (c) => c.ownerUid === row.ownerUid && c.id === row.characterId
                      );
                      return (
                        <li key={`${row.ownerUid}/${row.characterId}`}>
                          <div>
                            <strong>
                              {own?.name ??
                                p.rosterNames?.[row.ownerUid + "/" + row.characterId] ??
                                label("campaignCharacter")}
                            </strong>
                            <small>
                              {label(
                                row.ownerUid === p.uid ? "yours" : "memberCharacter"
                              )}
                            </small>
                          </div>
                          <button
                            onClick={() =>
                              p.onInspect({ ownerUid: row.ownerUid, id: row.characterId })
                            }
                          >
                            {label("viewCharacter")}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  {!p.roster.length && <p>{label("emptyRoster")}</p>}
                  <button onClick={() => navigate("characters")}>
                    {label("manageOwnCharacters")}
                  </button>
                </section>
                <section className="identity-panel">
                  <p className="identity-kicker">{label("memberships")}</p>
                  <h2>{label("participants")}</h2>
                  <ul className="identity-list">
                    {campaign.members.map((uid, index) => (
                      <li key={uid}>
                        <div>
                          <strong>
                            {uid === p.uid
                              ? p.displayName
                              : p.roster
                                  .filter((row) => row.ownerUid === uid)
                                  .map(
                                    (row) =>
                                      p.rosterNames?.[
                                        row.ownerUid + "/" + row.characterId
                                      ]
                                  )
                                  .filter(Boolean)
                                  .join(", ") || `${label("player")} ${index + 1}`}
                          </strong>
                          <small>{label(uid === campaign.dmUid ? "dm" : "player")}</small>
                        </div>
                        {uid !== campaign.dmUid &&
                          (campaign.dmUid === p.uid || uid === p.uid) && (
                            <button onClick={() => setRevokeUid(uid)}>
                              {label(uid === p.uid ? "leaveCampaign" : "removeMember")}
                            </button>
                          )}
                      </li>
                    ))}
                  </ul>
                  {campaign.dmUid === p.uid && p.onSaveDmNotes && (
                    <NotesEditor
                      key={`dm-${campaign.id}`}
                      value={p.dmNotes ?? ""}
                      title={label("dmNotes")}
                      onSave={p.onSaveDmNotes}
                      busy={p.busy}
                    />
                  )}
                </section>
              </div>
            ) : (
              <div className="identity-empty">
                <UsersRound size={32} />
                <h2>{label("chooseCampaign")}</h2>
                <p>{label("chooseCampaignIntro")}</p>
                <button onClick={() => navigate("invite")}>{label("enterInvite")}</button>
              </div>
            )}
          </>
        )}
      </main>
      {modal(
        assignment !== null,
        () => setAssignment(null),
        label("manageCampaign"),
        <form
          onSubmit={(event) =>
            submit(event, async () => {
              if (assignment) {
                if (destination) await p.onAssign(assignment, destination);
                else await p.onRelease(assignment);
                setAssignment(null);
              }
            })
          }
        >
          <p>{label("assignmentIntro")}</p>
          <label>
            {label("campaign")}
            <select value={destination} onChange={(e) => setDestination(e.target.value)}>
              <option value="">{label("independent")}</option>
              {p.campaigns
                .filter((c) => !c.archived)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </label>
          <div className="identity-actions">
            <button className="identity-primary" disabled={p.busy}>
              {label("saveAssignment")}
            </button>
            <button type="button" onClick={() => setAssignment(null)}>
              {label("cancel")}
            </button>
          </div>
        </form>
      )}
      {modal(
        newCampaign,
        () => setNewCampaign(false),
        label("createCampaign"),
        <form
          onSubmit={(event) =>
            submit(event, async () => {
              await p.onCreateCampaign(campaignName);
              setNewCampaign(false);
              setCampaignName("");
              navigate("campaign");
            })
          }
        >
          <label>
            {label("campaignName")}
            <input
              required
              maxLength={100}
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
            />
          </label>
          <div className="identity-actions">
            <button className="identity-primary" disabled={p.busy}>
              {label("createCampaign")}
            </button>
            <button type="button" onClick={() => setNewCampaign(false)}>
              {label("cancel")}
            </button>
          </div>
        </form>
      )}
      {modal(
        revokeUid !== null,
        () => setRevokeUid(null),
        label("confirmMembershipChange"),
        <form
          onSubmit={(event) =>
            submit(event, async () => {
              if (campaign && revokeUid) {
                await p.onRevoke(campaign.id, revokeUid);
                setRevokeUid(null);
              }
            })
          }
        >
          <p>{label("revokeIntro")}</p>
          <div className="identity-actions">
            <button className="identity-primary" disabled={p.busy}>
              {label("confirm")}
            </button>
            <button type="button" onClick={() => setRevokeUid(null)}>
              {label("cancel")}
            </button>
          </div>
        </form>
      )}
      {modal(
        p.inspected !== null,
        p.onClearInspection,
        p.inspected?.name ?? label("viewCharacter"),
        p.inspected && (
          <>
            <p className="identity-inspection-label">
              <Shield size={15} />
              {label("readOnlyInspection")}
            </p>
            <p>
              {fieldName(p.inspected.speciesId, "species")} ·{" "}
              {fieldName(p.inspected.classId, "classes")} ·{" "}
              {label("level", { level: p.inspected.level })}
            </p>
            <IdentitySheet character={p.inspected} />
            {p.inspected.ownerUid === p.uid && p.onSaveNotes && (
              <NotesEditor
                key={`private-${p.inspected.id}`}
                value={p.privateNotes ?? ""}
                title={label("privateNotes")}
                onSave={p.onSaveNotes}
                busy={p.busy}
              />
            )}
            <div className="identity-actions">
              <button onClick={p.onClearInspection}>{label("close")}</button>
              {p.inspected.ownerUid === p.uid && p.onRecover && (
                <button
                  onClick={() => {
                    if (p.inspected) void p.onRecover?.(p.inspected.id).catch(() => {});
                  }}
                >
                  {label("recoverOriginal")}
                </button>
              )}
            </div>
          </>
        )
      )}
    </div>
  );
}

function NotesEditor({
  value,
  title,
  onSave,
  busy,
}: {
  value: string;
  title: string;
  onSave: (text: string) => Promise<void>;
  busy: boolean;
}) {
  const { t } = useTranslation("common");
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <form
      className="identity-notes"
      onSubmit={(e) => {
        e.preventDefault();
        void onSave(draft ?? value)
          .then(() => setDraft(null))
          .catch(() => {});
      }}
    >
      <label>
        {title}
        <textarea
          disabled={busy}
          value={draft ?? value}
          maxLength={20000}
          onChange={(e) => setDraft(e.target.value)}
        />
      </label>
      <button disabled={busy || draft === null}>{t("identity.saveNotes")}</button>
    </form>
  );
}
