import { CREATION_STEPS, type CreationStep } from "@/lib/character-creation/steps";
import { LIBRARY_FAMILIES, libraryId } from "@/lib/library/model";
export const accountSections = [
  "account",
  "preferences",
  "notifications",
  "privacy",
  "recovery",
  "offlineData",
  "support",
] as const;
export type AccountSection = (typeof accountSections)[number];
export const accountLabel = (section: AccountSection) =>
  section === "account" ? "profile" : section;

export type IdentityPage =
  | AccountSection
  | "characters"
  | "invite"
  | "campaign"
  | "library"
  | "table"
  | "unavailable";
export interface IdentityRoute {
  page: IdentityPage;
  creation?: "new" | "import";
  review?: string;
  step?: CreationStep;
  tab?: "creations" | "sharing" | "bestiary";
  family?: string;
  filter?: string;
  campaign?: string;
  owner?: string;
  character?: string;
  entry?: string;
  kind?: string;
}
const families: readonly string[] = LIBRARY_FAMILIES;
const pages: readonly string[] = [
  ...accountSections,
  "characters",
  "invite",
  "campaign",
  "library",
  "table",
  "unavailable",
];
const safeId = (value: string | null): value is string =>
  !!value && /^[\w-]{1,128}$/.test(value);
export function parseRoute(hash: string): IdentityRoute {
  const [path = "", search = ""] = hash.replace(/^#\/?/, "").split("?");
  const page = !path
    ? "account"
    : pages.includes(path)
      ? (path as IdentityPage)
      : "unavailable";
  const route: IdentityRoute = { page };
  const params = new URLSearchParams(search);
  const campaign = params.get("campaign");
  if (safeId(campaign)) route.campaign = campaign;
  if (page === "library") {
    const tab = params.get("tab"),
      family = params.get("family"),
      entry = params.get("entry"),
      kind = params.get("kind");
    if (tab === "creations" || tab === "sharing" || tab === "bestiary") route.tab = tab;
    if (family && families.includes(family)) route.family = family;
    if (entry && kind && families.includes(kind)) {
      try {
        route.entry = libraryId(entry);
        route.kind = kind;
      } catch {
        /* Invalid lookup requests stay on the Library root. */
      }
    }
  }
  if (page === "characters") {
    const creation = params.get("creation"),
      step = params.get("step");
    if (creation === "new" || creation === "import") {
      route.creation = creation;
      const review = params.get("review");
      if (creation === "import" && safeId(review)) route.review = review;
      if (creation === "new")
        route.step = CREATION_STEPS.includes(step as CreationStep)
          ? (step as CreationStep)
          : "identity";
    }
    const filter = params.get("filter");
    if (safeId(filter) && filter !== "all") route.filter = filter;
  }
  const owner = params.get("owner"),
    character = params.get("character");
  if (
    !route.creation &&
    safeId(owner) &&
    safeId(character) &&
    ["characters", "campaign", "library"].includes(page)
  ) {
    route.owner = owner;
    route.character = character;
  }
  return route;
}
export function routeHash(route: IdentityRoute): string {
  const params = new URLSearchParams();
  for (const key of [
    "tab",
    "family",
    "filter",
    "campaign",
    "owner",
    "character",
    "entry",
    "kind",
    "creation",
    "review",
    "step",
  ] as const) {
    if (route[key]) params.set(key, route[key]);
  }
  const raw = `#${route.page}${params.size ? "?" + params.toString() : ""}`;
  const valid = parseRoute(raw);
  const clean = new URLSearchParams();
  for (const key of [
    "tab",
    "family",
    "filter",
    "campaign",
    "owner",
    "character",
    "entry",
    "kind",
    "creation",
    "review",
    "step",
  ] as const)
    if (valid[key]) clean.set(key, valid[key]);
  return `#${valid.page}${clean.size ? "?" + clean.toString() : ""}`;
}
export function parentRoute(route: IdentityRoute): IdentityRoute {
  const parent = { ...route };
  delete parent.creation;
  delete parent.review;
  delete parent.step;
  delete parent.owner;
  delete parent.character;
  delete parent.entry;
  delete parent.kind;
  if (parent.page === "invite") parent.page = "campaign";
  if (parent.page === "unavailable") parent.page = "account";
  return parent;
}
export interface NavigationFrame {
  query?: string;
  scroll?: number;
  focus?: string;
}
interface HistoryRecord {
  uid: string;
  lifetime: string;
  index: number;
  frame: NavigationFrame;
  previous?: string;
}
interface Snapshot {
  route: IdentityRoute;
  frame: NavigationFrame;
  revision: number;
}
const historyObject = (): Record<string, unknown> => {
  const value: unknown = window.history.state;
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
};
function historyRecord(): HistoryRecord | null {
  const value = historyObject().folioNavigation;
  if (!value || typeof value !== "object") return null;
  const r = value as Partial<HistoryRecord>;
  if (
    typeof r.uid !== "string" ||
    typeof r.lifetime !== "string" ||
    typeof r.index !== "number" ||
    !Number.isSafeInteger(r.index) ||
    r.index < 0
  )
    return null;
  const f = r.frame;
  return {
    uid: r.uid,
    lifetime: r.lifetime,
    index: r.index,
    previous: typeof r.previous === "string" ? r.previous : undefined,
    frame: {
      ...(typeof f?.focus === "string" && f.focus.length <= 200
        ? { focus: f.focus }
        : {}),
      ...(typeof f?.query === "string" && f.query.length <= 1000
        ? { query: f.query }
        : {}),
      ...(typeof f?.scroll === "number" && Number.isFinite(f.scroll) && f.scroll >= 0
        ? { scroll: f.scroll }
        : {}),
    },
  };
}
/** Browsing state only. Drafts, authorization and operations never enter history. */
export class NavigationController {
  private lifetime: string;
  private value: Snapshot;
  private listeners = new Set<() => void>();
  private frames = new Map<string, NavigationFrame>();
  private lastRoutes = new Map<IdentityPage, IdentityRoute>();
  private uid: string;
  constructor(uid: string, resumeHistory = true) {
    this.uid = uid;
    const record = resumeHistory ? historyRecord() : null;
    this.lifetime = record?.uid === uid ? record.lifetime : crypto.randomUUID();
    this.value = {
      route: parseRoute(window.location.hash),
      frame: record?.uid === uid ? record.frame : {},
      revision: 0,
    };
    this.remember();
  }
  activate(): void {
    window.history.replaceState(
      { ...historyObject(), folioNavigation: this.record() },
      ""
    );
  }
  snapshot = (): Snapshot => this.value;
  ticket(): () => void {
    const revision = this.value.revision;
    return () => {
      if (revision !== this.value.revision) throw new Error("navigation-changed");
    };
  }
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private key(route: IdentityRoute): string {
    return routeHash({ ...parentRoute(route), page: route.page });
  }
  private remember(): void {
    this.frames.set(this.key(this.value.route), this.value.frame);
    this.lastRoutes.set(this.value.route.page, this.value.route);
  }
  private publish(route: IdentityRoute, frame: NavigationFrame): void {
    this.value = { route, frame, revision: this.value.revision + 1 };
    this.remember();
    this.listeners.forEach((fn) => fn());
  }
  private record(): HistoryRecord {
    const current = historyRecord();
    return {
      uid: this.uid,
      lifetime: this.lifetime,
      index:
        current?.uid === this.uid && current.lifetime === this.lifetime
          ? current.index
          : 0,
      frame: this.value.frame,
      ...(current?.uid === this.uid &&
      current.lifetime === this.lifetime &&
      current.previous
        ? { previous: current.previous }
        : {}),
    };
  }
  updateFrame(patch: NavigationFrame): void {
    const frame = { ...this.value.frame, ...patch };
    this.value = { ...this.value, frame };
    this.remember();
    window.history.replaceState(
      { ...historyObject(), folioNavigation: { ...this.record(), frame } },
      ""
    );
    this.listeners.forEach((fn) => fn());
  }
  go(route: IdentityRoute, options: { replace?: boolean; resume?: boolean } = {}): void {
    const requested = options.resume ? (this.lastRoutes.get(route.page) ?? route) : route;
    const next = {
      ...requested,
      ...(!("campaign" in requested) && this.value.route.campaign
        ? { campaign: this.value.route.campaign }
        : {}),
    };
    const hash = routeHash(next);
    if (hash === routeHash(this.value.route)) return;
    const focus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement.dataset.navigationFocus
        : undefined;
    if (focus) this.updateFrame({ focus });
    const current = this.record();
    window.history.replaceState({ ...historyObject(), folioNavigation: current }, "");
    const frame =
      options.replace && next.page === this.value.route.page
        ? this.value.frame
        : (this.frames.get(this.key(next)) ?? {});
    const record: HistoryRecord = {
      ...current,
      frame,
      ...(!options.replace
        ? { index: current.index + 1, previous: routeHash(this.value.route) }
        : {}),
    };
    if (options.replace)
      window.history.replaceState(
        { ...historyObject(), folioNavigation: record },
        "",
        hash
      );
    else window.history.pushState({ folioNavigation: record }, "", hash);
    this.publish(parseRoute(hash), frame);
  }
  restore = (): void => {
    const record = historyRecord();
    const route = parseRoute(window.location.hash);
    const frame =
      record?.uid === this.uid && record.lifetime === this.lifetime ? record.frame : {};
    this.publish(route, frame);
  };
  back = (): void => {
    const record = historyRecord();
    if (
      record?.uid === this.uid &&
      record.lifetime === this.lifetime &&
      record.index > 0 &&
      record.previous
    )
      window.history.back();
    else this.go(parentRoute(this.value.route), { replace: true });
  };
  invalidate(): void {
    this.lifetime = crypto.randomUUID();
    this.frames.clear();
    this.lastRoutes.clear();
    this.publish({ ...parentRoute(this.value.route), page: this.value.route.page }, {});
    window.history.replaceState(
      {
        ...historyObject(),
        folioNavigation: { uid: this.uid, lifetime: this.lifetime, index: 0, frame: {} },
      },
      "",
      routeHash(this.value.route)
    );
  }
}

export const primaryDestinations = [
  { page: "campaign", label: "campaignNavigation", key: "c" },
  { page: "table", label: "atTable", key: "t" },
  { page: "characters", label: "character", key: "p" },
  { page: "library", label: "library", key: "l" },
] as const;
export const featureDestinations: readonly {
  id: string;
  group: "campaign" | "characters" | "library" | "account" | "table";
  label: string;
  aliases: string;
  route: IdentityRoute;
  unavailable?: boolean;
}[] = [
  ...primaryDestinations.map((d) => ({
    id: d.page,
    group: d.page,
    label: d.label,
    aliases: d.page,
    route: { page: d.page },
    ...(d.page === "table" ? { unavailable: true } : {}),
  })),
  {
    id: "invite",
    group: "campaign",
    label: "enterInvite",
    aliases: "invite",
    route: { page: "invite" },
  },
  {
    id: "creations",
    group: "library",
    label: "customCreations",
    aliases: "custom",
    route: { page: "library", tab: "creations" },
  },
  {
    id: "sharing",
    group: "library",
    label: "sharingCopies",
    aliases: "sharing",
    route: { page: "library", tab: "sharing" },
  },
  {
    id: "bestiary",
    group: "library",
    label: "bestiary",
    aliases: "bestiary",
    route: { page: "library", tab: "bestiary" },
  },
  ...accountSections.map((section) => ({
    id: section,
    group: "account" as const,
    label: accountLabel(section),
    aliases: section,
    route: { page: section },
  })),
];
