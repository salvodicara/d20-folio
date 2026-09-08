import { useEffect, useRef, useState, type SubmitEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import * as Dialog from "@radix-ui/react-dialog";
import { Search, Shield, UserRound, UsersRound, X } from "lucide-react";
import type {
  DiceMode,
  CharacterRef,
  FolioCharacter,
  FolioCampaign,
  RosterEntry,
} from "@/lib/identity/model";
import "./identity.css";
import { IdentityAccount, AccountNavigation } from "./IdentityAccount";
import { accountSections, accountLabel, type AccountSection } from "./navigation";
import { IdentitySheet } from "./IdentitySheet";
import type { OriginProjection } from "@/lib/homebrew/origin-build";
import identityMark from "./assets/d20-mark.svg";
import contextUserIcon from "./assets/circle-user-round.svg";
import contextBackIcon from "./assets/arrow-left.svg";
import contextListIcon from "./assets/list.svg";
import { ensureLocale } from "@/i18n";
import { srdCatalogues } from "@/i18n/srd-en";
import { CheckboxField } from "@/components/ui/selection";

export type IdentityPage =
  | AccountSection
  | "characters"
  | "invite"
  | "campaign"
  | "library";
type Page = IdentityPage;
const pages: readonly string[] = [
  ...accountSections,
  "characters",
  "invite",
  "campaign",
  "library",
];
function urlPage(fallback: Page): Page {
  const id = window.location.hash.slice(1);
  return pages.includes(id) ? (id as Page) : fallback;
}
function historyIndex(): number {
  const state: unknown = window.history.state;
  if (state && typeof state === "object" && "folioIndex" in state) {
    const index = state.folioIndex;
    if (typeof index === "number" && Number.isSafeInteger(index) && index >= 0)
      return index;
  }
  return 0;
}
export interface IdentityWorkspaceProps {
  initialPage?: Page;
  onPageChange?: (page: Page) => void;
  uid: string;
  displayName: string;
  diceMode?: DiceMode;
  onSaveDiceMode?: (mode: DiceMode) => Promise<void>;
  onSaveLocale?: (locale: "en" | "it") => Promise<void>;
  characters: readonly FolioCharacter[];
  campaigns: readonly FolioCampaign[];
  roster: readonly RosterEntry[];
  loading: boolean;
  busy: boolean;
  error: string | null;
  activeId: string | null;
  campaignId: string | null;
  inspected: Readonly<FolioCharacter> | null;
  originProjection?: OriginProjection;
  originLoading?: boolean;
  originUnavailable?: boolean;
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
  assignmentEditor?: (id: string, onDone: () => void) => ReactNode;
  library?: ReactNode;
  campaignHomebrew?: ReactNode;
  privateNoteEditor?: ReactNode;
  dmNoteEditor?: ReactNode;
  homebrewSheet?: ReactNode;
  onImport?: (source: string) => Promise<void>;
  onRecover?: (id: string) => Promise<void>;
  onRetry: () => void;
}

export function IdentityWorkspace(p: IdentityWorkspaceProps) {
  const { t, i18n } = useTranslation("common");
  const label = (key: string, values?: Record<string, string | number>) =>
    t(`identity.${key}`, values);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const [page, setPage] = useState<Page>(() => urlPage(p.initialPage ?? "account"));
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
    if (next !== page) {
      const index = historyIndex();
      if (!index) window.history.replaceState({ folioIndex: index }, "");
      window.history.pushState({ folioIndex: index + 1 }, "", "#" + next);
    }
    setSearchOpen(false);
    setHelpOpen(false);
    setAccountOpen(false);
    setSectionsOpen(false);
    requestGeneration.current++;
    setInvite(null);
    p.onClearInspection();
    setPage(next);
    p.onPageChange?.(next);
  };
  const { onClearInspection, onPageChange } = p;
  useEffect(() => {
    const restore = () => {
      requestGeneration.current++;
      setInvite(null);
      setSectionsOpen(false);
      setAccountOpen(false);
      setSearchOpen(false);
      setHelpOpen(false);
      setAssignment(null);
      setNewCampaign(false);
      setRevokeUid(null);
      onClearInspection();
      const next = urlPage("account");
      setPage(next);
      onPageChange?.(next);
    };
    window.addEventListener("popstate", restore);
    window.addEventListener("hashchange", restore);
    return () => {
      window.removeEventListener("popstate", restore);
      window.removeEventListener("hashchange", restore);
    };
  }, [onClearInspection, onPageChange]);
  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        event.repeat ||
        event.isComposing ||
        (target instanceof HTMLElement &&
          (target.isContentEditable ||
            target.closest(
              'input,textarea,select,[role="textbox"],[role="combobox"]'
            ))) ||
        document.querySelector('[role="dialog"]')
      )
        return;
      if (
        event.key.toLowerCase() === "k" &&
        (event.ctrlKey || event.metaKey) &&
        !event.altKey
      ) {
        event.preventDefault();
        setSearchQuery("");
        setSearchOpen(true);
      } else if (event.key === "?" && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        setHelpOpen(true);
      }
    };
    document.addEventListener("keydown", keys);
    return () => document.removeEventListener("keydown", keys);
  }, []);
  const accountPage = accountSections.includes(page as AccountSection);
  const changeLocale = (locale: "en" | "it") => {
    const generation = requestGeneration.current;
    void (async () => {
      await ensureLocale(locale);
      if (generation !== requestGeneration.current) return;
      await p.onSaveLocale?.(locale);
      if (generation !== requestGeneration.current) return;
      await i18n.changeLanguage(locale);
    })().catch(() => {});
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
          onOpenAutoFocus={(event) => {
            dialogReturnFocus.current =
              document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
            const search = document.querySelector<HTMLInputElement>(
              ".identity-search-dialog input"
            );
            if (search) {
              event.preventDefault();
              search.focus();
            }
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
            {label("campaignNavigation")}
          </button>
          <button
            className="identity-table-navigation"
            disabled
            title={label("notAvailable")}
          >
            {label("atTable")}
          </button>
          <button
            onClick={() => navigate("characters")}
            aria-current={page === "characters" ? "page" : undefined}
          >
            {label("character")}
          </button>
          <button
            onClick={() => navigate("library")}
            disabled={!p.library}
            aria-current={page === "library" ? "page" : undefined}
          >
            {label("library")}
          </button>
        </nav>
        <div className="identity-global">
          <button
            className="identity-finder"
            aria-label={label("searchFolio")}
            aria-keyshortcuts="Control+k Meta+k"
            onClick={() => {
              setSearchQuery("");
              setSearchOpen(true);
            }}
          >
            <Search size={18} />
            <span>{label("searchFolioPlaceholder")}</span>
            <kbd>⌘ K</kbd>
          </button>
          <button
            className="identity-help"
            aria-label={label("keyboardHelp")}
            aria-keyshortcuts="?"
            onClick={() => setHelpOpen(true)}
          >
            ?
          </button>
          <button
            className="identity-locale"
            disabled={p.busy}
            aria-label={label(
              profileLocale === "it" ? "switchToEnglish" : "switchToItalian"
            )}
            onClick={() => changeLocale(profileLocale === "it" ? "en" : "it")}
          >
            {profileLocale === "it" ? "EN" : "IT"}
          </button>
          <button
            className="identity-account-button"
            onClick={() => setAccountOpen(true)}
            aria-label={label("account")}
            aria-haspopup="dialog"
          >
            <span className="identity-avatar">{p.displayName.slice(0, 1)}</span>
            <span className="identity-account-name">
              <strong>{p.displayName}</strong>
              <small>{label("account")}</small>
            </span>
          </button>
        </div>
      </header>
      {!accountPage && page !== "library" && (
        <>
          <div className="identity-context">
            <span>{label("yourSpace")}</span>
            <span aria-hidden="true">/</span>
            <strong>{title}</strong>
            <button
              className="identity-back"
              disabled={!historyIndex()}
              onClick={() => window.history.back()}
            >
              <img src={contextBackIcon} alt="" aria-hidden="true" />
              {label("back")}
            </button>
            {selected && (
              <span className="identity-active">
                {label("activeCharacter")}: {selected.name}
              </span>
            )}
          </div>
          <nav aria-label={label("accountNavigation")} className="identity-subnav">
            <button
              aria-current="page"
              onClick={() => navigate(page === "characters" ? "characters" : "account")}
            >
              <img src={contextUserIcon} alt="" aria-hidden="true" />
              {label(page === "characters" ? "sheetNavigation" : "yourSpace")}
            </button>
            <button
              className="identity-more-sections"
              onClick={() => setSectionsOpen(true)}
            >
              <img src={contextListIcon} alt="" aria-hidden="true" />
              {label("moreSections")}
            </button>
          </nav>
        </>
      )}
      <main className={"identity-main" + (accountPage ? " identity-account-main" : "")}>
        {!accountPage && page !== "library" && (
          <div className="identity-page-heading">
            <div>
              <p className="identity-kicker">
                {page === "characters" ? label("yourSpace") : "d20 Folio"}
              </p>
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
        )}
        {p.error && (
          <div role="alert" className="identity-error">
            <p>{label(i18n.exists("identity." + p.error) ? p.error : "requestFailed")}</p>
            <button onClick={p.onRetry}>{label("retry")}</button>
          </div>
        )}
        {p.loading && (
          <p role="status" className="identity-loading">
            {label("loading")}
          </p>
        )}
        {p.busy && (
          <p role="status" className="identity-progress">
            {label("saving")}
          </p>
        )}
        {accountPage && (
          <IdentityAccount
            p={p}
            section={page as AccountSection}
            navigate={navigate}
            name={name}
            setName={setName}
            locale={profileLocale}
            changeLocale={changeLocale}
          />
        )}
        {page === "library" && p.library}
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
                  {campaign.dmUid === p.uid && p.dmNoteEditor}
                  {p.campaignHomebrew}
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
        accountOpen,
        () => setAccountOpen(false),
        label("account"),
        <AccountNavigation section={page} navigate={navigate} menu />
      )}
      {modal(
        helpOpen,
        () => setHelpOpen(false),
        label("keyboardHelp"),
        <div className="identity-shortcuts">
          <p>{label("shortcutIntro")}</p>
          <dl>
            <div>
              <dt>{label("searchFolio")}</dt>
              <dd>
                <kbd>Ctrl / ⌘ K</kbd>
              </dd>
            </div>
            <div>
              <dt>{label("openHelp")}</dt>
              <dd>
                <kbd>?</kbd>
              </dd>
            </div>
            <div>
              <dt>{label("closeDialog")}</dt>
              <dd>
                <kbd>Esc</kbd>
              </dd>
            </div>
          </dl>
        </div>
      )}
      {modal(
        searchOpen,
        () => setSearchOpen(false),
        label("searchFolio"),
        <div className="identity-search-dialog">
          <input
            type="search"
            aria-label={label("searchFolio")}
            placeholder={label("searchFolioPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <p>{label("searchScope")}</p>
          <div className="identity-search-results">
            {(
              [
                ...accountSections,
                "characters",
                "invite",
                "campaign",
                "library",
              ] as Page[]
            )
              .filter((id) =>
                label(
                  accountSections.includes(id as AccountSection)
                    ? accountLabel(id as AccountSection)
                    : id
                )
                  .toLocaleLowerCase()
                  .includes(searchQuery.toLocaleLowerCase())
              )
              .map((id) => (
                <button key={id} onClick={() => navigate(id)}>
                  {label(
                    accountSections.includes(id as AccountSection)
                      ? accountLabel(id as AccountSection)
                      : id
                  )}
                </button>
              ))}
            {p.characters
              .filter((c) =>
                c.name.toLocaleLowerCase().includes(searchQuery.toLocaleLowerCase())
              )
              .map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setSearchOpen(false);
                    p.onInspect({ ownerUid: c.ownerUid, id: c.id });
                  }}
                >
                  {c.name}
                </button>
              ))}
            {p.campaigns
              .filter((c) =>
                c.name.toLocaleLowerCase().includes(searchQuery.toLocaleLowerCase())
              )
              .map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    p.onNavigateCampaign(c.id);
                    navigate("campaign");
                  }}
                >
                  {c.name}
                </button>
              ))}
          </div>
        </div>
      )}
      {modal(
        sectionsOpen,
        () => setSectionsOpen(false),
        label("moreSections"),
        <div className="identity-section-links">
          {(["account", "characters", "invite", "campaign"] as const).map(
            (destination) => (
              <button key={destination} onClick={() => navigate(destination)}>
                {label(destination)}
              </button>
            )
          )}
        </div>
      )}
      {modal(
        assignment !== null,
        () => setAssignment(null),
        label("manageCampaign"),
        assignment ? p.assignmentEditor?.(assignment, () => setAssignment(null)) : null
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
              {p.originLoading || p.originUnavailable
                ? "—"
                : p.originProjection?.species.selectionId
                  ? p.originProjection.species.name
                  : fieldName(p.inspected.speciesId, "species")}{" "}
              · {fieldName(p.inspected.classId, "classes")} ·{" "}
              {label("level", { level: p.inspected.level })}
            </p>
            {p.originLoading ? (
              <p role="status">{t("homebrewV2.origin.loadingBuild")}</p>
            ) : p.originUnavailable ? (
              <p role="alert">{t("homebrewV2.origin.unavailableBuild")}</p>
            ) : (
              <IdentitySheet
                character={p.originProjection?.projectedCharacter ?? p.inspected}
                originProjection={p.originProjection}
              />
            )}
            {p.homebrewSheet}
            {p.inspected.ownerUid === p.uid && p.privateNoteEditor}
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
