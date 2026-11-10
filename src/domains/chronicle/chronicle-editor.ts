/**
 * The Chronicle editor (headless): who last wrote it (the viewer reads «you», never a
 * name they typed long ago), the version rows to restore from, and the save. Shared by
 * the classic Chronicle and the new campaign screen.
 *
 * The save shows the new text at once and keeps the replaced text as a version, then
 * commits it in one transaction that snapshots the server's text first, so a party
 * member's edit made in the meantime stays in the history. It needs the server, so it
 * cannot queue offline: a refused save says so and the editor stays open.
 */
import type { TFunction } from "i18next";
import { commitChronicleEdit } from "@/features/campaigns/campaign-io";
import { useChronicleStore } from "@/features/campaigns/chronicleStore";
import { useToastStore } from "@/stores/toastStore";
import type { ChronicleDoc, ChronicleVersion } from "@/types/campaign";

export { splitChapters, type Chapter } from "@/features/campaigns/chronicle-chapters";
export { isLargeReduction } from "@/features/campaigns/chronicle-versions";
export { downloadChronicleMarkdown } from "@/features/campaigns/chronicle-export";

type Members = Readonly<Record<string, { displayName: string }>> | undefined;

/** A member's stored name: written as is into a version (never «you»). */
function memberName(id: string, members: Members, t: TFunction): string {
  return members?.[id]?.displayName || t("campaignHub.unnamedPlayer");
}

function authorLabel(
  id: string,
  uid: string | undefined,
  members: Members,
  t: TFunction
) {
  return id === uid ? t("campaignHub.chronicleAuthorSelf") : memberName(id, members, t);
}

function when(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

/** «Last edited by you · 10 Nov 2026, 20:00», or "" before anyone wrote. */
export function chronicleByline(
  chronicle: ChronicleDoc | null | undefined,
  uid: string | undefined,
  members: Members,
  locale: string,
  t: TFunction
): string {
  if (!chronicle?.lastEditedBy) return "";
  return t("campaignHub.chronicleLastEditedBy", {
    name: authorLabel(chronicle.lastEditedBy, uid, members, t),
    when: when(chronicle.lastEditedAt, locale),
  });
}

export interface ChronicleVersionRow {
  when: string;
  author: string;
  /** The text restoring this version loads into the draft. */
  text: string;
}

/** The viewer's own edit reads «you»; another keeps the name stored with it (a member
 *  who left keeps theirs), else today's name. */
export function chronicleVersionRows(
  versions: readonly ChronicleVersion[],
  uid: string | undefined,
  members: Members,
  locale: string,
  t: TFunction
): ChronicleVersionRow[] {
  return versions.map((v) => ({
    when: when(v.timestamp, locale),
    author:
      v.editedBy === uid
        ? t("campaignHub.chronicleAuthorSelf")
        : v.editedByName || memberName(v.editedBy, members, t),
    text: v.textSnapshot,
  }));
}

/** Save the draft. True once it is in; false when refused (a toast says so). */
export async function saveChronicle(
  args: { campaignId: string; uid: string; next: string; members: Members },
  t: TFunction
): Promise<boolean> {
  const store = useChronicleStore.getState();
  const prior = store.chronicle?.lastEditedBy ?? "";
  store.commitText(
    args.next,
    args.uid,
    prior ? memberName(prior, args.members, t) : "",
    new Date()
  );
  try {
    await commitChronicleEdit(args.campaignId, { text: args.next, editedBy: args.uid });
    return true;
  } catch (error) {
    console.error("Chronicle save failed", error);
    useToastStore
      .getState()
      .showToast({ message: t("campaignHub.chronicleSaveFailed"), duration: 6000 });
    return false;
  }
}
