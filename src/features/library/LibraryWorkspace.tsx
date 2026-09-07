import { HomebrewImport } from "./HomebrewPortable";
import { associateImportOriginal } from "./homebrew-files";
import { HomebrewReader } from "./HomebrewReader";
import { baseFamily, useHomebrewLabel } from "./homebrew-labels";
import { LibraryDraftController } from "./draft";
import { libraryKey } from "./labels";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  LIBRARY_FAMILIES,
  type LibraryEntry,
  type LibraryIssue,
  type LibraryFamily,
  type LibraryOffer,
  type LibraryVersion,
} from "@/lib/library/model";
import type { LibraryRepository } from "@/lib/library/model";
import type { SessionController } from "@/lib/identity/session";
import type { FolioCampaign } from "@/lib/identity/model";
import { localLibraryDrafts } from "./draft";
import { LibraryEditor } from "./LibraryEditor";
import { LibraryDialog } from "./LibraryDialog";
import { LibraryComparison } from "./LibraryComparison";
import { useLibraryOperation } from "./useLibraryOperation";
import "./library.css";
const marks: Record<LibraryFamily, string> = {
  weapon: "⚔",
  equipment: "◇",
  spell: "✧",
  feature: "✦",
  monster: "♜",
  "campaign-rule": "§",
  species: "❖",
  feat: "✷",
  background: "⌂",
  class: "♧",
  subclass: "⌘",
};
type Recipient = { uid: string; name: string };
export function LibraryWorkspace({
  repository,
  session,
  recipients,
  campaigns,
  campaignId,
  onCampaignChange,
  onReuse,
}: {
  repository: LibraryRepository;
  session: SessionController;
  recipients: Recipient[];
  campaigns: readonly FolioCampaign[];
  campaignId: string | null;
  onCampaignChange: (id: string | null) => void;
  onReuse?: (version: LibraryVersion) => void;
}) {
  const { t } = useTranslation("common");
  const label = (key: string) => t(libraryKey(key));
  const hb = useHomebrewLabel();
  const [importing, setImporting] = useState(false);
  const viewKey = "folio-library-view:" + (session.scope().uid ?? "");
  const [view] = useState(() => {
    try {
      return (JSON.parse(sessionStorage.getItem(viewKey) ?? "{}") ?? {}) as {
        tab?: unknown;
        query?: unknown;
        family?: unknown;
        selected?: { id: string; family: LibraryFamily };
      };
    } catch {
      return {};
    }
  });
  const [tab, setTab] = useState<"creations" | "sharing">(
      view.tab === "sharing" ? "sharing" : "creations"
    ),
    [query, setQuery] = useState<string>(
      typeof view.query === "string" ? view.query : ""
    ),
    [family, setFamily] = useState<string>(
      typeof view.family === "string" ? view.family : "all"
    );
  const [issues, setIssues] = useState<LibraryIssue[]>([]);
  const [entries, setEntries] = useState<LibraryEntry[] | null>(null),
    [offers, setOffers] = useState<LibraryOffer[]>([]),
    [sent, setSent] = useState<LibraryOffer[]>([]),
    [loadError, setLoadError] = useState(false),
    [create, setCreate] = useState(false);
  const [selected, setSelected] = useState<{ id: string; family: LibraryFamily } | null>(
    view.selected && LIBRARY_FAMILIES.includes(view.selected.family)
      ? view.selected
      : null
  );
  const [share, setShare] = useState<LibraryVersion | null>(null),
    [read, setRead] = useState<LibraryOffer | null>(null),
    [revoke, setRevoke] = useState<LibraryOffer | null>(null),
    [recipient, setRecipient] = useState("");
  const [destination, setDestination] = useState(""),
    [received, setReceived] = useState<string[]>([]);
  const refresh = async () => {
    const check = session.ticket();
    try {
      const value = await repository.listSentOffers();
      check();
      setSent(value);
    } catch {
      setLoadError(true);
    }
  };
  const op = useLibraryOperation(repository, session, "library-actions", async () => {
    setShare(null);
    setRead(null);
    setRevoke(null);
    await refresh();
  });
  useEffect(() => {
    let live = true;
    const failed = () => {
      if (live) {
        setEntries(null);
        setOffers([]);
        setRead(null);
        setLoadError(true);
      }
    };
    const stops = [
      repository.watchIssues(setIssues),
      repository.watchEntries((value) => {
        setEntries(value);
        setLoadError(false);
      }, failed),
      repository.watchSentOffers(setSent, failed),
      repository.watchOffers((value) => {
        setOffers(value);
        setRead((current) =>
          current &&
          value.some((o) => o.id === current.id && o.senderUid === current.senderUid)
            ? current
            : null
        );
      }, failed),
    ];
    const untrack = session.track(() => {
      if (!live) return;
      setEntries(null);
      setOffers([]);
      setSent([]);
      setRead(null);
      setShare(null);
      setSelected(null);
    });
    return () => {
      live = false;
      stops.forEach((stop) => stop());
      untrack();
    };
  }, [repository, session]);
  useEffect(() => {
    try {
      sessionStorage.setItem(viewKey, JSON.stringify({ tab, query, family, selected }));
    } catch {
      /* Browsing remains usable when storage is unavailable. */
    }
  }, [viewKey, tab, query, family, selected]);
  useEffect(() => {
    let live = true;
    const check = session.ticket();
    void Promise.all(
      [...offers, ...sent].map(async (offer) => {
        const grant = await repository.readGrant(offer);
        return grant ? offer.senderUid + "~" + offer.id : null;
      })
    )
      .then((ids) => {
        check();
        if (live) setReceived(ids.filter((id): id is string => id !== null));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [repository, session, offers, sent, op.state?.status]);
  const rows = entries
    ? [
        ...entries,
        ...localLibraryDrafts(sessionStorage, session.scope().uid ?? "").filter(
          (d) => !entries.some((e) => e.id === d.id)
        ),
      ]
    : null;
  const filtered =
    rows?.filter(
      (entry) =>
        (family === "all" || entry.draft.family === family) &&
        [entry.draft.name, entry.draft.description, ...entry.draft.tags]
          .join(" ")
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase())
    ) ?? [];
  const participantName = (uid: string) =>
    uid === session.scope().uid
      ? label("self")
      : (recipients.find((r) => r.uid === uid)?.name ??
        t("libraryV2.accountIdentity", { id: uid }));
  const selectedEntry = entries?.find((entry) => entry.id === selected?.id);
  const copies = entries?.filter((entry) => !!entry.provenance) ?? [];
  const eligible = read
    ? copies.filter(
        (entry) =>
          entry.provenance?.source.ownerUid === read.senderUid &&
          entry.provenance.source.id === read.sourceId
      )
    : [];
  const update = eligible.find((entry) => entry.id === destination);
  const changeTab = (next: "creations" | "sharing") => {
    setTab(next);
    setRead(null);
    setShare(null);
  };
  const feedback = (
    <>
      {op.state && (
        <div className="library-operation">
          <p role="status">{label(op.state.status)}</p>
          {op.state.status === "unknown" && (
            <button onClick={() => void op.retry()}>{label("retry")}</button>
          )}
        </div>
      )}
      {op.error && <p role="alert">{label("requestFailed")}</p>}
    </>
  );
  return (
    <div className="library-workspace">
      <div className="library-breadcrumb">
        <span>{label("library")}</span>
        <span aria-hidden="true">/</span>
        <strong>{label(tab)}</strong>
      </div>
      <nav className="library-tabs" aria-label={label("library")}>
        <button
          aria-current={tab === "creations" ? "page" : undefined}
          onClick={() => changeTab("creations")}
        >
          <span aria-hidden="true">✎</span>
          <span>{label("creations")}</span>
        </button>
        <button
          aria-current={tab === "sharing" ? "page" : undefined}
          onClick={() => changeTab("sharing")}
        >
          <span aria-hidden="true">♧</span>
          <span>{label("sharing")}</span>
        </button>
      </nav>
      {importing && (
        <HomebrewImport
          session={session}
          onClose={() => setImporting(false)}
          onImport={async (definition, originalId) => {
            const id = crypto.randomUUID();
            associateImportOriginal(session.scope().uid ?? "", id, originalId);
            const check = session.ticket();
            const editor = new LibraryDraftController(
              repository,
              session,
              id,
              definition.family,
              sessionStorage
            );
            try {
              await editor.load();
              if (!editor.state.loaded) throw new Error("unavailable");
              editor.edit(definition);
              check();
              if (editor.state.storageFailed) throw new Error("storage-failed");
              setSelected({ id, family: definition.family });
              setQuery("");
              setFamily("all");
            } finally {
              editor.dispose();
            }
          }}
        />
      )}
      <header className="library-heading">
        <p className="library-eyebrow">{label("library")}</p>
        <h1>{label(tab === "creations" ? "heading" : "sharingTitle")}</h1>
        <p>{label(tab === "creations" ? "intro" : "sharingIntro")}</p>
        {tab === "creations" && (
          <button onClick={() => setImporting(true)}>{hb("import")}</button>
        )}
        {tab === "creations" && (
          <button className="identity-primary" onClick={() => setCreate(true)}>
            {label("create")}
          </button>
        )}
      </header>
      <label className="library-campaign">
        {label("campaign")}
        <select
          value={campaignId ?? ""}
          onChange={(e) => onCampaignChange(e.target.value || null)}
        >
          <option value="">{label("chooseCampaign")}</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      {issues.map((issue) => (
        <div role="alert" key={issue.path} className="library-issue">
          <p>{label("incompatibleRecord")}</p>
          <button
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob([issue.original], { type: "application/json" })
              );
              const a = document.createElement("a");
              a.href = url;
              a.download = "library-original-snapshot.json";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            {label("recover")}
          </button>
        </div>
      ))}
      {loadError && <p role="alert">{label("loadError")}</p>}
      {!(share || read || revoke) && feedback}
      {tab === "creations" ? (
        <>
          <div className="library-filters">
            <label>
              {label("search")}
              <input
                type="search"
                placeholder={label("searchPlaceholder")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <label>
              {label("family")}
              <select value={family} onChange={(e) => setFamily(e.target.value)}>
                <option value="all">{label("all")}</option>
                {LIBRARY_FAMILIES.map((f) => (
                  <option key={f} value={f}>
                    {t(libraryKey(`families.${f}`))}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {!entries ? (
            <p role="status">{label("loading")}</p>
          ) : (
            <div className="library-workbench">
              <aside className="library-shelf">
                <p className="library-eyebrow">
                  {t("libraryV2.entries", { count: filtered.length })}
                </p>
                {filtered.map((entry) => (
                  <button
                    className="library-entry"
                    key={entry.id}
                    aria-pressed={selected?.id === entry.id}
                    onClick={() =>
                      setSelected({ id: entry.id, family: entry.draft.family })
                    }
                  >
                    <span aria-hidden="true">{marks[entry.draft.family]}</span>
                    <span>
                      <strong>{entry.draft.name || label("untitled")}</strong>
                      <small>
                        {t(libraryKey(`families.${entry.draft.family}`))} ·{" "}
                        {entry.stableVersion
                          ? t("libraryV2.version", { version: entry.stableVersion })
                          : label("draft")}
                        {entry.provenance ? " · " + label("copy") : ""}
                      </small>
                    </span>
                  </button>
                ))}
                {!filtered.length && (rows?.length ?? 0) > 0 && (
                  <p>{label("noResults")}</p>
                )}
              </aside>
              {selected ? (
                <LibraryEditor
                  key={selected.id}
                  id={selected.id}
                  family={selected.family}
                  repository={repository}
                  session={session}
                  revision={selectedEntry?.revision ?? 0}
                  sourceName={
                    selectedEntry?.provenance
                      ? participantName(selectedEntry.provenance.source.ownerUid)
                      : undefined
                  }
                  onReuse={onReuse}
                  onShare={(v) => {
                    setRecipient("");
                    setShare(v);
                  }}
                />
              ) : (
                <section className="library-empty">
                  <span aria-hidden="true">✧</span>
                  <h2>{label("empty")}</h2>
                  <p>{label("emptyHelp")}</p>
                </section>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="library-sharing">
          <section>
            <h2>{label("incoming")}</h2>
            {offers.length ? (
              offers.map((offer) => (
                <article className="library-offer" key={offer.senderUid + offer.id}>
                  <div>
                    <h3>{offer.definition.name}</h3>
                    <p>
                      {t("libraryV2.from", { name: participantName(offer.senderUid) })}
                    </p>
                    <p>
                      {t(libraryKey(`families.${offer.definition.family}`))} ·{" "}
                      {t("libraryV2.version", { version: offer.sourceVersion })}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setRead(offer);
                      setDestination("");
                    }}
                  >
                    {label("read")}
                  </button>
                  <span>
                    {received.includes(offer.senderUid + "~" + offer.id)
                      ? label("accepted")
                      : ""}
                  </span>
                </article>
              ))
            ) : (
              <p>{label("noOffers")}</p>
            )}
          </section>
          <section>
            <h2>{label("sent")}</h2>
            {sent.length ? (
              sent.map((offer) => (
                <article className="library-offer" key={offer.id}>
                  <div>
                    <h3>{offer.definition.name}</h3>
                    <p>
                      {t("libraryV2.to", { name: participantName(offer.recipientUid) })}
                    </p>
                    <p>
                      {t("libraryV2.version", { version: offer.sourceVersion })} ·{" "}
                      {label(
                        offer.revoked
                          ? "revoked"
                          : received.includes(offer.senderUid + "~" + offer.id)
                            ? "delivered"
                            : "active"
                      )}
                    </p>
                  </div>
                  {!offer.revoked && (
                    <button disabled={op.busy} onClick={() => setRevoke(offer)}>
                      {label("revoke")}
                    </button>
                  )}
                </article>
              ))
            ) : (
              <p>{label("noSent")}</p>
            )}
          </section>
          <section>
            <h2>{label("copy")}</h2>
            {copies.map((entry) => (
              <article className="library-offer" key={entry.id}>
                <div>
                  <h3>{entry.draft.name}</h3>
                  <p>
                    {t("libraryV2.from", {
                      name: participantName(entry.provenance?.source.ownerUid ?? ""),
                    })}
                  </p>
                  <p>
                    {t("libraryV2.sourceVersion", {
                      version: entry.provenance?.sourceVersion,
                    })}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setSelected({ id: entry.id, family: entry.draft.family });
                    changeTab("creations");
                  }}
                >
                  {label("library")}
                </button>
              </article>
            ))}
          </section>
          <button onClick={() => void refresh()}>{label("refresh")}</button>
        </div>
      )}
      {create && (
        <LibraryDialog
          title={label("chooseFamily")}
          description={label("familyHelp")}
          onClose={() => setCreate(false)}
        >
          <div className="library-family-picker">
            {LIBRARY_FAMILIES.map((f) => (
              <button
                key={f}
                onClick={() => {
                  setSelected({ id: crypto.randomUUID(), family: f });
                  setCreate(false);
                  setTab("creations");
                }}
              >
                <span aria-hidden="true">{marks[f]}</span>
                {t(libraryKey(`families.${f}`))}
              </button>
            ))}
          </div>
        </LibraryDialog>
      )}
      {share && (
        <LibraryDialog
          title={label("shareTitle")}
          description={label("shareHelp")}
          onClose={() => {
            if (!op.busy) setShare(null);
          }}
        >
          {feedback}
          <h3>
            {share.definition.name} · {t("libraryV2.version", { version: share.version })}
          </h3>
          <label>
            {label("recipient")}
            <select value={recipient} onChange={(e) => setRecipient(e.target.value)}>
              <option value="">{label("chooseRecipient")}</option>
              <option value={session.scope().uid ?? ""}>{label("self")}</option>
              {recipients
                .filter((r) => r.uid !== session.scope().uid)
                .map((r) => (
                  <option key={r.uid} value={r.uid}>
                    {r.name}
                  </option>
                ))}
            </select>
          </label>
          <button
            className="identity-primary"
            disabled={!recipient || op.busy}
            onClick={() => void op.run(() => repository.offerIntent(share, recipient))}
          >
            {label("offer")}
          </button>
        </LibraryDialog>
      )}
      {read && (
        <LibraryDialog
          title={label("acceptTitle")}
          description={label(update ? "updateHelp" : "acceptHelp")}
          onClose={() => {
            if (!op.busy) setRead(null);
          }}
        >
          {feedback}
          <h3>{read.definition.name}</h3>
          <p>{t("libraryV2.from", { name: participantName(read.senderUid) })}</p>
          {baseFamily(read.definition.family) ? (
            <HomebrewReader definition={read.definition} />
          ) : (
            <p className="library-description">{read.definition.description}</p>
          )}
          <p>{t("libraryV2.sourceVersion", { version: read.sourceVersion })}</p>
          {eligible.length > 0 && (
            <label>
              {label("destination")}
              <select
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
              >
                <option value="">{label("newCopy")}</option>
                {eligible.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.draft.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {update && <LibraryComparison before={update.draft} after={read.definition} />}
          <button
            className="identity-primary"
            disabled={op.busy || received.includes(read.senderUid + "~" + read.id)}
            onClick={() =>
              void op.run(() => repository.acceptIntent(read, update ?? null))
            }
          >
            {label(
              received.includes(read.senderUid + "~" + read.id)
                ? "accepted"
                : update
                  ? "updateCopy"
                  : "accept"
            )}
          </button>
        </LibraryDialog>
      )}
      {revoke && (
        <LibraryDialog
          title={label("revokeTitle")}
          description={label("revokeHelp")}
          onClose={() => {
            if (!op.busy) setRevoke(null);
          }}
        >
          {feedback}
          <h3>{revoke.definition.name}</h3>
          <p>{t("libraryV2.to", { name: participantName(revoke.recipientUid) })}</p>
          <button
            className="identity-primary"
            disabled={op.busy}
            onClick={() => void op.run(() => repository.revokeIntent(revoke))}
          >
            {label("revoke")}
          </button>
        </LibraryDialog>
      )}
    </div>
  );
}
