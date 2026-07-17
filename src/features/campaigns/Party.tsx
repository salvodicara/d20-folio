/**
 * Party — the campaign hub's UNIFIED team surface.
 *
 * ONE surface, combat as an optional LAYER, NO overlay (golden rule 10 — the former
 * full-screen EncounterOverlay + PartyDashboard are deleted; their rendering moved into
 * this section + {@link "@/features/campaigns/party-encounter"}):
 *
 *   • AT REST (`campaign.encounter` absent) — the party dashboard. EVERY member
 *     (not just the DM — the live campaign-membership grant authorizes the peer read) sees each
 *     attached teammate's stat card ({@link PcCombatantCard}), with progressive disclosure
 *     + Open sheet. Only the combat TRIO (HP · conditions · initiative · death saves) is
 *     truly LIVE, streamed from the tiny `combat/state` subdoc ({@link usePartyCombatStates});
 *     AC / passives / senses / maxHp are a ONE-SHOT snapshot of the member's parent doc
 *     ({@link useMemberCharacterDocs}) that refreshes only when the (uid, characterId) key
 *     changes (a level-up / re-equip elsewhere doesn't update a still-mounted dashboard —
 *     B31). The DM also gets a primary Run-encounter action.
 *   • ENCOUNTER RUNNING (`campaign.encounter` present) — the SAME cards gain a combat
 *     LAYER: a round/turn header strip, the cards REORDERED by live initiative with a
 *     turn-highlight ring + a leading roll-to-total INIT vital tile, and monster
 *     combatant rows interleaved by initiative. PCs are NEVER a separate combat row —
 *     every PC renders through its live member card (single source of truth). The DM
 *     gets the editable structure controls (typed monster initiative/HP, conditions,
 *     hidden toggle, add monster, turn controls, End); a player gets the read-only view.
 *
 * SINGLE SOURCE OF TRUTH (golden rule 6): a PC's live combat state is read — never
 * copied. Each attached member's heavy parent doc loads ONE-SHOT
 * ({@link useMemberCharacterDocs}); their moment-to-moment combat trio streams from the
 * tiny `combat/state` subdoc ({@link usePartyCombatStates}); the two merge through
 * {@link derivePcLive} / {@link hydrateMemberDoc} at render. The encounter doc holds
 * only a PURE REFERENCE per PC; the live view is composed by {@link buildEncounterView}.
 */

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Crown, Lock, Plus, Swords, UserRound } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Portrait } from "@/components/shared/Portrait";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { PortraitLightbox } from "@/components/shared/PortraitLightbox";
import { CharacterIdentityLine } from "@/components/shared/CharacterIdentityLine";
import { Select } from "@/components/shared/Select";
import { useCharacters } from "@/hooks/useCharacters";
import { useLocale } from "@/hooks/useLocale";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useTurnAdvanceShortcut } from "@/hooks/useTurnAdvanceShortcut";
import { useAuthStore } from "@/stores/authStore";
import { useConfirmStore } from "@/stores/confirmStore";
import { useToastStore } from "@/stores/toastStore";
import {
  attachMemberCharacter,
  listSharedCampaigns,
  advanceEncounterTurn,
  persistBeginTurns,
  persistStartEncounter,
  persistEndEncounter,
} from "@/features/campaigns/campaign-io";
import { useGatheringScrollAnchor } from "@/features/campaigns/gathering-scroll-anchor";
import { campaignPartySize, useCampaignStore } from "@/features/campaigns/campaignStore";
import {
  useMemberCharacterDocs,
  type MemberCharacterRef,
  type MemberDocState,
} from "@/features/campaigns/useMemberCharacterDocs";
import { usePartyCombatStates } from "@/features/campaigns/usePartyCombatStates";
import {
  beginEncounterTurns,
  encounterRollFor,
  reorderCombatant,
  startEncounter,
  type EncounterPcSeed,
} from "@/features/campaigns/encounter";
import {
  addReinforcement,
  buildEncounterView,
  type PcLive,
} from "@/features/campaigns/encounter-view";
import { useLiftReorder } from "@/features/campaigns/use-lift-reorder";
import { derivePcLive } from "@/features/campaigns/party-stats";
import {
  AddMonsterForm,
  DmControlBanner,
  EncounterRoundBar,
  EncounterTurnControls,
  GatheringInitiativeChip,
  MonsterCard,
  PcCombatantCard,
  type ApplyFn,
  type ReorderRow,
} from "@/features/campaigns/party-encounter";
import type {
  CampaignDoc,
  EncounterMonster,
  EncounterState,
  MemberCharacterSnapshot,
} from "@/types/campaign";
import type { CombatState } from "@/types/combat-state";

/** A member's `memberDetails` entry — the per-uid record on the campaign doc. */
type CampaignDocMemberDetails = CampaignDoc["memberDetails"];
type CampaignMember = CampaignDocMemberDetails[string];
import type { RosterCharacterDoc } from "@/lib/character-cache";
import {
  buildMemberSnapshot,
  snapshotClasses,
  snapshotTotalLevel,
} from "@/features/campaigns/member-snapshot";

export function Party() {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const campaign = useCampaignStore((s) => s.campaign);
  const setCampaign = useCampaignStore((s) => s.setCampaign);
  const setEncounter = useCampaignStore((s) => s.setEncounter);
  const currentUid = useAuthStore((s) => s.user?.uid);
  const isAdmin = useIsAdmin();
  // My live Google photo — a fallback for my OWN avatar so it shows even if I joined
  // before `photoURL` was denormalized into the roster.
  const myPhotoURL = useAuthStore((s) => s.user?.photoURL ?? null);
  // Owner-11 — the avatar a member clicked to study full-size (null = closed).
  const [lightbox, setLightbox] = useState<{ src: string; name: string } | null>(null);
  // The player's OWN roster — the picker source for attaching a character (D29).
  // It reads only the current user's characters (rules-safe); never another's.
  const { characters: roster } = useCharacters();

  const isDm = !!campaign && (campaign.dmUid === currentUid || isAdmin);
  const encounter = campaign?.encounter ?? null;

  // Every attached member's (uid, characterId) — the live-read key set. The heavy
  // parent doc loads ONE-SHOT; the combat trio streams from the tiny subdoc. Open to
  // EVERY member now (C5 authorizes the peer read), so the dashboard is live for all.
  const liveRefs = useMemo<MemberCharacterRef[]>(() => {
    if (!campaign) return [];
    const out: MemberCharacterRef[] = [];
    for (const [uid, m] of Object.entries(campaign.memberDetails)) {
      if (m.characterId) out.push({ uid, characterId: m.characterId });
    }
    return out;
  }, [campaign]);
  const docs = useMemberCharacterDocs(liveRefs);
  const combatStates = usePartyCombatStates(liveRefs);

  // The merged LIVE facts per PC combatant (`pc-<uid>`), assembled from the parent doc
  // + the live `combat/state` + the campaign's `encounterInit` roll table (the
  // initiative SSOT) — the encounter view's PC source (NO copy off the doc).
  const encounterInit = campaign?.encounterInit;
  const pcLiveById = useMemo<Record<string, PcLive>>(() => {
    const out: Record<string, PcLive> = {};
    for (const ref of liveRefs) {
      const st = docs[ref.uid];
      if (st?.status === "ready") {
        out[`pc-${ref.uid}`] = derivePcLive(
          st.doc,
          combatStates[ref.uid] ?? null,
          encounterRollFor(encounterInit, ref.uid)
        );
      }
    }
    return out;
  }, [liveRefs, docs, combatStates, encounterInit]);

  // The render-ready combat view (PC refs + monsters → sorted rows + current id),
  // hidden combatants filtered for non-DM viewers. Only when an encounter runs.
  const view = useMemo(
    () => (encounter ? buildEncounterView(encounter, pcLiveById, isDm) : null),
    [encounter, pcLiveById, isDm]
  );

  // Apply a pure reducer to the LIVE encounter (read through getState so a rapid burst
  // of immediate-commit edits never races a stale closure). DM-only; absent for a
  // player (whose path performs no writes — firestore.rules enforce this too).
  const apply: ApplyFn | undefined = isDm
    ? (fn) => {
        const live = useCampaignStore.getState().campaign?.encounter;
        if (live) setEncounter(fn(live));
      }
    : undefined;

  // D29 — attach (or detach, "") the current member's character: write the
  // snapshot the party reads, optimistically into the store + (in prod) Firestore.
  async function attachMyCharacter(characterId: string): Promise<void> {
    if (!campaign || !currentUid) return;
    // ONE-CAMPAIGN-PER-CHARACTER invariant: a hero attaches to at most one campaign.
    // Reject attaching one already attached to ANOTHER campaign (a swap WITHIN this
    // campaign, or a detach "", is always allowed). The check reuses the same
    // membership-scoped `listSharedCampaigns` read the rest of the app uses — never an
    // enumeration — and the same `memberDetails[uid].characterId` predicate as the
    // attached-sheet fan-out. On rejection nothing is written and a friendly toast fires.
    if (characterId) {
      // The pre-check read can reject (offline pop, or the bounded read timing out on
      // a wedged SDK) and this function is invoked fire-and-forget (`void attach…`) —
      // surface the failure as the same attach-failed toast instead of letting the
      // rejection vanish into the void. Nothing was written yet, so no revert needed.
      let mine: Awaited<ReturnType<typeof listSharedCampaigns>>;
      try {
        mine = await listSharedCampaigns(currentUid);
      } catch {
        useToastStore.getState().showToast({
          message: t("campaignHub.attachFailed"),
          duration: 5000,
        });
        return;
      }
      const elsewhere = mine.find(
        (c) =>
          c.id !== campaign.id && c.memberDetails[currentUid]?.characterId === characterId
      );
      if (elsewhere) {
        // Owner-reported (2026-07-02): NAME the blocking campaign — a nameless "already
        // in another campaign" reads like corrupted data when the player can't tell
        // WHERE the hero is attached.
        useToastStore.getState().showToast({
          message: t("campaignHub.attachAlreadyElsewhere", { campaign: elsewhere.name }),
          duration: 6000,
        });
        return;
      }
    }
    const doc = roster.find((c) => c.id === characterId);
    // Build the snapshot through the ONE seam (rule 6): AC is DERIVED via the
    // same grant-aware `effectiveAC` the cockpit renders — never the stored
    // `character.ac`, which can be a stale 0 for a hero never opened in the cockpit.
    const snapshot: MemberCharacterSnapshot | null = doc
      ? buildMemberSnapshot(doc)
      : null;
    const mine = campaign.memberDetails[currentUid];
    // The previously-attached character (captured BEFORE the optimistic store
    // update) — on a swap the attach transaction releases its claim.
    const prevCharId = mine?.characterId ?? null;
    if (mine) {
      setCampaign({
        ...campaign,
        memberDetails: {
          ...campaign.memberDetails,
          [currentUid]: {
            ...mine,
            characterId: characterId || null,
            character: snapshot,
          },
        },
      });
    }
    // B07 — CLAIM the hero for this campaign ATOMICALLY: the transaction closes the
    // two-device D9 race the client pre-check above cannot. On "conflict" (a concurrent
    // attach won the race) or a hard write failure (offline), revert the optimistic
    // store change and tell the player. The claim (`attachedCampaignId`) IS the whole
    // cross-user access story: firestore.rules derive the DM's + peers' access LIVE
    // from it + the campaign roster — there is no reader-list ACL to recompute anymore.
    void attachMemberCharacter(
      campaign.id,
      currentUid,
      prevCharId,
      characterId || null,
      snapshot
    )
      .then((outcome) => {
        if (outcome === "conflict") {
          setCampaign(campaign);
          useToastStore.getState().showToast({
            message: t("campaignHub.attachRaceLost"),
            duration: 6000,
          });
        }
      })
      .catch(() => {
        setCampaign(campaign);
        useToastStore.getState().showToast({
          message: t("campaignHub.attachFailed"),
          duration: 5000,
        });
      });
  }

  // DM-only — promote the attached party members into a fresh encounter (pure
  // REFERENCES, no statline copy — every stat reads live). Initiative starts blank
  // (currentCombatantId = null, the "gathering initiative" phase) and the
  // `encounterInit` roll table RESETS to {} in the SAME atomic immediate write
  // (`persistStartEncounter`), so every player starts un-rolled and a roll landing
  // seconds later can never be clobbered (the debounced structural writer never
  // touches the sibling table). Each player then rolls in their own cockpit / the
  // global pip / the card; the DM may roll for anyone. "Begin turns" starts the order.
  function startCombat(): void {
    if (!campaign) return;
    const seeds: Record<string, EncounterPcSeed> = {};
    const uids: string[] = [];
    for (const [uid, m] of Object.entries(campaign.memberDetails)) {
      if (m.characterId && m.character) {
        seeds[uid] = { characterId: m.characterId };
        uids.push(uid);
      }
    }
    const fresh = startEncounter(seeds, uids, Date.now());
    // Optimistic: encounter + table reset land together locally too (dev-bypass's only
    // update). The immediate write is the durable one; the debounced writer the store
    // update arms re-lands the same encounter content (harmless).
    setCampaign({ ...campaign, encounter: fresh, encounterInit: {} });
    void persistStartEncounter(campaign.id, fresh).catch((e: unknown) => {
      console.error("Start-encounter write failed", e);
    });
  }

  async function confirmEnd(): Promise<void> {
    const ok = await useConfirmStore.getState().confirm({
      title: t("campaignHub.encounterEndTitle"),
      message: t("campaignHub.encounterEndMessage"),
      confirmLabel: t("campaignHub.encounterEnd"),
      tone: "danger",
    });
    if (!ok) return;
    if (!campaign) return;
    // Optimistic clear (encounter + roll table), then the immediate atomic write.
    setCampaign({ ...campaign, encounter: null, encounterInit: {} });
    void persistEndEncounter(campaign.id).catch((e: unknown) => {
      console.error("End-encounter write failed", e);
    });
  }

  if (!campaign) return null;

  // The members arrive ALREADY conformed (subscribe → toCampaignDoc →
  // conformCampaignMembers), so a present `m.character` is provably a non-empty-named
  // snapshot and a null one renders the quiet "no character attached" state.
  //
  // OWNER-1 — a DETERMINISTIC, STABLE resting order. `Object.entries` alone iterates
  // Firestore object-key order (non-deterministic, re-derived every render → the
  // "random + reorders" the owner saw). Sort a COPY by CHARACTER NAME A–Z (owner's
  // pick; a member with no hero sorts by their player name within the same list), with
  // a `uid` tiebreak for a TOTAL order so it never churns render-to-render. (In combat
  // the order is initiative high-to-low via `buildEncounterView`; this is the rest one.)
  const members = [...Object.entries(campaign.memberDetails)].sort(
    ([uidA, a], [uidB, b]) => {
      const keyA = a.character?.name ?? a.displayName;
      const keyB = b.character?.name ?? b.displayName;
      return (
        keyA.localeCompare(keyB, locale, { sensitivity: "base", numeric: true }) ||
        uidA.localeCompare(uidB)
      );
    }
  );
  const hasAttached = members.some(([, m]) => m.characterId && m.character);
  // Captured here (after the guard) so the render closures need no non-null assertion.
  const campaignId = campaign.id;

  // FIX 1 (DM control banner) — the DM is NOT a combatant, so they get a slim
  // full-width CONTROL BANNER at the top of the party surface, never a half-width
  // identity card in the grid. The DM is `campaign.dmUid` (always a member). A DM
  // WITHOUT a character is filtered OUT of the card grid (the banner represents
  // them); a DM WITH a character (a DMPC) still renders as a normal gold combatant
  // card AND keeps the banner above it.
  const dmUid = campaign.dmUid;
  const dmDetails = campaign.memberDetails[dmUid];
  const dmName = dmDetails?.displayName || t("campaignHub.unnamedPlayer");
  const dmIsMe = dmUid === currentUid;
  const dmHasNoChar = !dmDetails?.character;
  const gridMembers = members.filter(([, m]) => !(m.role === "dm" && !m.character));

  // Aggregated party info — the at-a-glance line under the heading.
  const heroes = members
    .map(([, m]) => m.character)
    .filter((c): c is NonNullable<typeof c> => !!c);
  const levels = heroes.map((c) => snapshotTotalLevel(c)).filter((n) => n > 0);
  const lo = levels.length ? Math.min(...levels) : 0;
  const hi = levels.length ? Math.max(...levels) : 0;
  // A uniform party reads singular ("level 8"), a spread reads the range ("levels 3–5").
  const levelBit = !levels.length
    ? null
    : lo === hi
      ? t("campaignHub.partyLevel", { level: lo })
      : t("campaignHub.partyLevels", { spread: `${lo}–${hi}` });

  const summaryBits = [
    // Party count EXCLUDES the DM (single-source `campaignPartySize`); the DM is
    // the control banner, not a party member on this line. `members` still drives
    // the DM-inclusive card grid below.
    t("campaignHub.partyCount", { count: campaignPartySize(campaign) }),
    levelBit,
  ].filter(Boolean);

  // The shared per-card render context (everything {@link MemberCard} needs that lives
  // on the Party closure). Rebuilt each render — cheap; the card's own `open` state
  // persists because MemberCard is a stable module-scope component.
  const cardCtx: MemberCardCtx = {
    currentUid,
    isDm,
    campaignId,
    docs,
    combatStates,
    encounterInit,
    // C3 — turns have BEGUN (the order is frozen): a PC's initiative chip locks. A NULLISH
    // current pointer = the gathering phase (still editable); no encounter = irrelevant. Use
    // a nullish check (`!= null`), not `!== null`: a legacy / hand-seeded encounter doc that
    // OMITS `currentCombatantId` (undefined) must read as gathering, not as begun — else its
    // init chips lock read-only and the table can never roll (the "can't set initiative" bug).
    initLocked: !!encounter && encounter.currentCombatantId != null,
    roster,
    myPhotoURL,
    onAttach: (id) => void attachMyCharacter(id),
    onLightbox: (lb) => setLightbox(lb),
  };

  return (
    <section aria-labelledby="party-head">
      <SectionHeader as="h2" tight id="party-head" title={t("campaignHub.party")} />

      {encounter && view ? (
        // ── Combat layer — the SAME live cards, reordered by initiative + monsters ──
        <CombatLayer
          encounter={encounter}
          view={view}
          isDm={isDm}
          apply={apply}
          ctx={cardCtx}
          pcLiveById={pcLiveById}
          dmName={dmName}
          memberDetails={campaign.memberDetails}
          onEnd={() => void confirmEnd()}
        />
      ) : (
        // ── Resting dashboard ── OWNER-2: an explicit flex-col gap stack so there is
        // real, consistent spacing between the banner and the first card.
        <div className="flex flex-col gap-4">
          <p className="on-art text-2xs text-text-muted">{summaryBits.join(" · ")}</p>

          {/* FIX 1 — the full-width DM control banner above the player cards: identity
              (every viewer) + the DM-only Run-encounter entry control (disabled until a
              hero is attached to seed), with the optional attach-a-DMPC affordance below.
              A DM WITHOUT a character is represented HERE, not as a grid card. */}
          {dmDetails && (
            <DmControlBanner
              dmName={dmName}
              isDmViewer={isDm}
              controls={
                isDm ? (
                  <Button variant="primary" onClick={startCombat} disabled={!hasAttached}>
                    <Icon as={Swords} size="sm" decorative />
                    {t("campaignHub.runEncounter")}
                  </Button>
                ) : undefined
              }
              extra={
                dmIsMe && dmHasNoChar ? (
                  <DmpcAttachControl
                    characterId={dmDetails.characterId ?? null}
                    roster={roster}
                    onAttach={(id) => void attachMyCharacter(id)}
                  />
                ) : undefined
              }
            />
          )}

          <ul className="grid items-start gap-2 sm:grid-cols-2">
            {gridMembers.map(([uid, m]) => (
              <MemberCard key={uid} uid={uid} m={m} ctx={cardCtx} />
            ))}
          </ul>
        </div>
      )}

      {/* Owner-11 — study a party member full-size (shared sheet lightbox). */}
      <PortraitLightbox
        open={lightbox !== null}
        src={lightbox?.src ?? ""}
        name={lightbox?.name ?? ""}
        onClose={() => setLightbox(null)}
      />
    </section>
  );
}

/**
 * The combat layer rendered over the live party cards: a round/turn header strip, the
 * initiative-sorted list (PC cards interleaved with monster rows), and — for the DM —
 * the add-monster form + turn controls. PCs render through their live member card
 * (single source); only monsters get a {@link MonsterCard}.
 */
function CombatLayer({
  encounter,
  view,
  isDm,
  apply,
  ctx,
  pcLiveById,
  dmName,
  memberDetails,
  onEnd,
}: {
  encounter: EncounterState;
  view: NonNullable<ReturnType<typeof buildEncounterView>>;
  isDm: boolean;
  apply: ApplyFn | undefined;
  ctx: MemberCardCtx;
  /** The merged live PC facts (per `pc-<uid>`) — the REINFORCEMENT auto-slot needs every
   *  PC's live initiative to slot a mid-combat monster into the frozen order (C3). */
  pcLiveById: Record<string, PcLive>;
  dmName: string;
  memberDetails: CampaignDocMemberDetails;
  onEnd: () => void;
}) {
  const { t } = useTranslation();
  // The add-monster disclosure lives HERE (not inside the form) so its trigger can ride
  // the banner's right control cluster next to Begin-turns while the form body expands
  // full-width below the banner. DM-only; reinforcements are addable all through the fight.
  const [addOpen, setAddOpen] = useState(false);
  // The FULL live turn order INCLUDING hidden (hidden is a display filter, not a turn
  // filter), so the DM and a player step the identical order and a staged ambush still
  // takes its turn.
  const orderedIds = view.turnOrderIds;
  const empty = encounter.combatants.length === 0;
  // The "gathering initiative" phase — players roll, then the DM begins the turn order. A
  // NULLISH pointer (null OR a legacy doc's missing field) is gathering (see `initLocked`).
  const gathering = encounter.currentCombatantId == null;
  // FIX 2 (owner 2026-06-29, REVERSES the prior tolerant hybrid) — begin-turns now
  // HARD-DISABLES until EVERY combatant has rolled. Count how many have an initiative
  // (PC roll-to-total OR monster entry); a partial set shows a disabled secondary
  // button with the `rolled/total` readout + a locked tooltip. The reducer still sorts
  // blank-initiative rows last (kept), but the button no longer lets the DM start early.
  const initByRowId = new Map(view.rows.map((r) => [r.id, r.initiative]));
  const total = orderedIds.length;
  const rolled = orderedIds.filter((id) => initByRowId.get(id) != null).length;
  const allRolled = rolled === total;
  // Resolve a monster's full editable state by id (the view row carries the aggregate;
  // editing needs the per-token array off the encounter doc).
  const monsterById = new Map<string, EncounterMonster>(
    encounter.combatants
      .filter((c): c is EncounterMonster => c.kind === "monster")
      .map((m) => [m.id, m])
  );

  // INIT-6 — the SHARED turn pointer is advanceable by the DM (always) OR the player
  // whose PC is the current combatant. BOTH route through the ONE `advanceEncounterTurn`
  // TRANSACTION (the debounced whole-encounter writer is reserved for STRUCTURE): it
  // re-reads the encounter fresh, re-validates the caller may advance, and writes ONLY
  // `{currentCombatantId, round}` — so two concurrent advances never double-step and a
  // player's write satisfies the `turnFieldsOnlyChanged` member rule.
  const isMyTurn = !!ctx.currentUid && view.currentId === `pc-${ctx.currentUid}`;
  const canAdvance = (isDm || isMyTurn) && !gathering;
  // Disarm the turn buttons while an advance is in flight (the UX half of the
  // double-click fix; the CAS in `advanceEncounterTurn` is the correctness half).
  const [advancing, setAdvancing] = useState(false);
  const step = (dir: "next" | "prev"): void => {
    if (advancing) return;
    setAdvancing(true);
    // The transaction reads the FROZEN `order` off the encounter doc — no `orderedIds`
    // param (every caller stepped a live-recomputed order before, which diverged).
    // `view.currentId` is the pointer the DM SAW — the CAS aborts a stale double-click.
    void advanceEncounterTurn(
      ctx.campaignId,
      dir,
      { uid: ctx.currentUid, isDm },
      view.currentId
    )
      .catch((e: unknown) => {
        // B15 — the advance is a live transaction (offline it rejects, and a genuine
        // write error otherwise), so surface it instead of a silent console-only log.
        // Mirrors the sheet's in-combat chip; the CAS/ownership no-ops stay silent
        // (they resolve, they don't reject).
        console.error("Turn-advance write failed", e);
        useToastStore.getState().showToast({
          message: t("campaignHub.turnAdvanceFailed"),
          duration: 5000,
        });
      })
      .finally(() => setAdvancing(false));
  };
  // INIT-4 — leave "gathering initiative": point the turn at the top of the live order.
  // DM-only structural action (the DM owns the encounter), routed through the optimistic
  // store path; tolerant of missing rolls (un-rolled PCs simply sort last).
  const beginTurns = (): void => {
    if (!apply) return;
    apply((e) => beginEncounterTurns(e, orderedIds));
    // B15 — persist the turn START immediately (NOT via the 2s debounced writer): a Next
    // pressed within that window would otherwise read the still-null server pointer and
    // silently no-op (offline it rejected). Read the begun encounter back off the store
    // (`apply` just set it) and mirror the three turn fields to Firestore now. The
    // debounced whole-encounter writer still lands later, consistently (its pointer is
    // reconciled from the live store — B04), so the two never fight.
    const enc = useCampaignStore.getState().campaign?.encounter;
    if (enc && enc.currentCombatantId !== null) {
      void persistBeginTurns(ctx.campaignId, {
        order: enc.order ?? [],
        currentCombatantId: enc.currentCombatantId,
        round: enc.round,
      }).catch((e: unknown) => {
        console.error("Begin-turns write failed", e);
        useToastStore.getState().showToast({
          message: t("campaignHub.turnAdvanceFailed"),
          duration: 5000,
        });
      });
    }
  };

  // C3 item 4 — a mid-combat monster auto-slots into the FROZEN order at its initiative
  // (addReinforcement re-freezes including every PC's LIVE init); before Begin-turns it's a
  // plain add. Routed through the SAME optimistic `apply` (a DM structural write).
  const addMonsterReinforcement = (
    input: Parameters<typeof addReinforcement>[1]
  ): void => {
    if (apply) apply((e) => addReinforcement(e, input, pcLiveById));
  };

  // C3 item 3 — DM LIFT-&-FOLLOW reorder of the FROZEN order. Available ONLY to the DM
  // (apply) and ONLY once turns have begun (the order to reorder exists). Each settled drop
  // persists through `apply` (reorderCombatant → a DM structural write); currentCombatantId
  // is pinned, so reordering never changes whose turn it is.
  const canReorder = !!apply && !gathering;
  const frozenOrder = encounter.order ?? [];
  const moveBefore = (movedId: string, beforeId: string | null): void => {
    if (apply) apply((e) => reorderCombatant(e, movedId, beforeId));
  };
  // The displayed combatant ids in turn order — the pointer-drag base + commit target.
  const rowIds = useMemo(() => view.rows.map((r) => r.id), [view.rows]);
  // The lift-&-follow engine: Pointer Events (mouse + touch + pen) lift a floating clone
  // that follows the pointer + FLIP-slides the others; on release the new order commits.
  const {
    listRef,
    order: liftOrder,
    row: liftRow,
  } = useLiftReorder({ ids: rowIds, enabled: canReorder, onCommit: moveBefore });
  const reorderFor = (rowId: string): ReorderRow | undefined => {
    if (!canReorder) return undefined;
    const idx = frozenOrder.indexOf(rowId);
    return {
      id: rowId,
      ...liftRow(rowId),
      // Keyboard: up = before the previous id; down = after the next (before the id two
      // slots on, or the end). No-ops at the ends (the guards), so a first/last row simply
      // can't step past the edge.
      onMoveUp: () => {
        if (idx > 0) moveBefore(rowId, frozenOrder[idx - 1] ?? null);
      },
      onMoveDown: () => {
        if (idx >= 0 && idx < frozenOrder.length - 1)
          moveBefore(rowId, frozenOrder[idx + 2] ?? null);
      },
    };
  };
  // While a drag is live the rows render in the PREVIEW order (the lifted id slotted where
  // it will land); idle, this is the natural turn order. Keyed by id, so a reorder MOVES
  // each card (never remounts) and the FLIP machinery animates the delta.
  const orderPos = new Map(liftOrder.map((id, i) => [id, i]));
  const displayRows = canReorder
    ? [...view.rows].sort((a, b) => (orderPos.get(a.id) ?? 0) - (orderPos.get(b.id) ?? 0))
    : view.rows;

  // B23 — while GATHERING, the list live-re-sorts by initiative (`displayRows === view.rows`)
  // with no frozen order, so committing an initiative moves the just-edited card under the
  // held window scroll and the viewport lands elsewhere. Keep that card under the user's eye
  // by compensating the scroll across the re-sort (window-scrolled page; the `<ul listRef>`
  // rows align 1:1 with `rowIds`). Inert once turns begin (order frozen → no live re-sort).
  useGatheringScrollAnchor({ enabled: gathering, rowIds, initByRowId, listRef });

  // OWNER-7 — the current advancer steps the turn order with ArrowRight / ArrowLeft
  // (route-scoped to the combat layer; the SAME path the Prev/Next buttons call; inert
  // while typing).
  useTurnAdvanceShortcut({
    enabled: canAdvance,
    empty,
    onNext: () => step("next"),
    onPrev: () => step("prev"),
  });

  return (
    <div className="flex flex-col gap-4">
      {/* FIX 1 — the DM control banner heads the combat layer too: identity (every
          viewer) + the DM-only assembly controls, ONE tight row: the Add-monster trigger
          and (during the gathering phase) Begin-turns sit as a right-aligned pair on the
          banner. The Add-monster FORM (when open) drops full-width below as the banner's
          extra; Begin-turns is hard-disabled until everyone has rolled (FIX 2 — locked
          glyph). Reinforcements are addable all through the fight. */}
      <DmControlBanner
        dmName={dmName}
        isDmViewer={isDm}
        controls={
          apply ? (
            <>
              <Button
                variant="secondary"
                onClick={() => setAddOpen((o) => !o)}
                aria-expanded={addOpen}
              >
                <Icon as={Plus} size="sm" decorative />
                {t("campaignHub.encounterAddMonster")}
              </Button>
              {gathering ? (
                <Button
                  variant={allRolled ? "primary" : "secondary"}
                  onClick={beginTurns}
                  disabled={!allRolled || empty}
                  title={
                    !allRolled
                      ? t("campaignHub.encounterBeginTurnsLockedHint")
                      : undefined
                  }
                >
                  {/* FIX 2 — a Lock glyph (not the crossed swords) while disabled so the
                      locked state reads at a glance; swords return once all have rolled. */}
                  <Icon as={allRolled ? Swords : Lock} size="sm" decorative />
                  {allRolled
                    ? t("campaignHub.encounterBeginTurns")
                    : t("campaignHub.encounterBeginTurnsPartial", { rolled, total })}
                </Button>
              ) : null}
            </>
          ) : undefined
        }
        extra={
          apply && addOpen ? (
            <AddMonsterForm
              onAdd={addMonsterReinforcement}
              onClose={() => setAddOpen(false)}
            />
          ) : undefined
        }
      />

      <EncounterRoundBar round={encounter.round} isDm={isDm} onEnd={onEnd} />

      <ul ref={listRef} className="flex flex-col gap-2">
        {displayRows.map((row) => {
          if (row.kind === "pc") {
            const uid = row.memberUid;
            const m = uid ? memberDetails[uid] : undefined;
            if (!uid || !m) return null;
            return (
              <MemberCard
                key={uid}
                uid={uid}
                m={m}
                ctx={ctx}
                isCurrent={row.id === view.currentId}
                reorder={reorderFor(row.id)}
              />
            );
          }
          const monster = monsterById.get(row.id);
          if (!monster) return null;
          return (
            <MonsterCard
              key={row.id}
              monster={monster}
              isCurrent={row.id === view.currentId}
              initLocked={!gathering}
              apply={apply}
              reorder={reorderFor(row.id)}
            />
          );
        })}
      </ul>

      {gathering ? (
        // The DM's Begin-turns moved onto the banner (FIX 1/2); a PLAYER still sees the
        // quiet "gathering initiative" wait cue here while everyone rolls.
        isDm ? null : (
          <div className="flex justify-center">
            <GatheringInitiativeChip />
          </div>
        )
      ) : (
        <EncounterTurnControls
          canAdvance={canAdvance}
          empty={empty}
          pending={advancing}
          onPrev={() => step("prev")}
          onNext={() => step("next")}
        />
      )}
    </div>
  );
}

/** Everything {@link MemberCard} needs off the Party closure (kept in one object so the
 *  card stays a stable module-scope component that owns its own `open` disclosure). */
interface MemberCardCtx {
  currentUid: string | undefined;
  isDm: boolean;
  campaignId: string;
  docs: Record<string, MemberDocState>;
  combatStates: Record<string, CombatState | null | undefined>;
  /** The campaign's `encounterInit` roll table (`uid → raw d20`; the initiative SSOT).
   *  Absent/empty = nobody has rolled this fight. */
  encounterInit: Record<string, number> | undefined;
  /** C3 — turns have begun (the frozen order locks): a PC's initiative chip is read-only. */
  initLocked: boolean;
  roster: RosterCharacterDoc[];
  myPhotoURL: string | null;
  onAttach: (characterId: string) => void;
  onLightbox: (lb: { src: string; name: string }) => void;
}

/**
 * ONE party member card (`<li class="party-card">`). OWNER-10/11: the CHARACTER is the
 * hero of the card — its NAME is the predominant title (where the player name used to
 * sit), its portrait/initial fills the seal; the player's small Google name + the
 * role chip ride top-right. The whole header IS the disclosure toggle (OWNER-4) — a big,
 * keyboard-accessible target with `aria-expanded`/`aria-controls` — revealing the live
 * detail. A DM with no attached character (OWNER-12) collapses to a COMPACT identity
 * tile (no "no character" empty-state); a DM WITH a character (a DMPC) renders the full
 * card. `isCurrent` (combat only) adds the BG3 turn-highlight frame + the leading INIT
 * roll-to-total tile.
 */
function MemberCard({
  uid,
  m,
  ctx,
  isCurrent,
  reorder,
}: {
  uid: string;
  m: CampaignMember;
  ctx: MemberCardCtx;
  isCurrent?: boolean;
  /** C3 — DM drag-to-reorder controls for this combat row (combat layer only). */
  reorder?: ReorderRow;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const account = m.displayName || t("campaignHub.unnamedPlayer");
  const char = m.character;
  const isMe = uid === ctx.currentUid;
  const inCombat = isCurrent !== undefined;
  const detailId = `member-detail-${uid}`;

  // The seal reads for the CHARACTER (portrait/initial) when one is attached, else the
  // player's Google photo / a deterministic initial. With a real image it opens
  // full-size (OWNER-11).
  const heroPortrait = char?.portraitUrl ?? null;
  const playerPhoto = char ? null : (m.photoURL ?? (isMe ? ctx.myPhotoURL : null));
  const avatarSrc = heroPortrait ?? playerPhoto ?? null;
  const avatarName = char ? char.name : account;
  const portrait = char ? (
    <Portrait
      src={heroPortrait}
      crop={char.portraitCrop ?? null}
      name={char.name}
      seed={char.name}
      loading="lazy"
    />
  ) : (
    <Portrait src={playerPhoto} remote name={account} seed={uid} loading="lazy" />
  );
  const seal = avatarSrc ? (
    <button
      type="button"
      className="seal party-avatar party-avatar-btn"
      onClick={() => ctx.onLightbox({ src: avatarSrc, name: avatarName })}
      aria-label={t("campaignHub.viewPortrait", { name: avatarName })}
    >
      {portrait}
    </button>
  ) : (
    <span className="seal party-avatar" aria-hidden>
      {portrait}
    </span>
  );
  const roleChip = (
    <span className="party-role" data-role={m.role}>
      <Icon as={m.role === "dm" ? Crown : UserRound} size="xs" decorative />
      {m.role === "dm" ? t("campaign.dm") : t("campaignHub.player")}
    </span>
  );

  const attachSelect = (
    <Select
      value={m.characterId ?? ""}
      onChange={(e) => ctx.onAttach(e.target.value)}
      aria-label={t("campaignHub.attachCharacter")}
      className="text-xs"
    >
      {/* With a hero attached the blank option IS the detach action — name it so. */}
      <option value="">
        {m.characterId ? t("campaignHub.detachCharacter") : t("campaignHub.attachNone")}
      </option>
      {/* An attached id missing from the roster (a since-deleted hero, a stale doc)
          still shows AS the selected value — never a lying "Detach character" face. */}
      {m.characterId && char && !ctx.roster.some((c) => c.id === m.characterId) ? (
        <option value={m.characterId}>{char.name}</option>
      ) : null}
      {ctx.roster.map((c) => (
        <option key={c.id} value={c.id}>
          {c.character.name}
        </option>
      ))}
    </Select>
  );

  // Owner-reported (2026-07-02): once attached, a hero could be neither SWAPPED nor
  // DETACHED — the picker lived only in the no-character branch. The attach seam always
  // allowed both (D9: swap-within + detach are unconditional); the UI now offers the
  // SAME picker on my OWN attached card's disclosure body. Combat gates it: mid-fight
  // the encounter holds a pure (uid, characterId) reference, so swapping there would
  // orphan the combatant row — the control returns when the encounter ends.
  const selfAttach =
    isMe && !inCombat ? (
      <div className="flex flex-col gap-1">
        <span className="text-[0.7rem] uppercase tracking-[0.12em] text-text-muted">
          {t("campaignHub.changeCharacter")}
        </span>
        {attachSelect}
      </div>
    ) : undefined;

  // An attached hero renders the FULL card through the shared CombatantCard shell (CARD-1
  // — identical to a monster card). Every member reads the LIVE stats (C5 peer read; an
  // unreadable doc falls back to the saved snapshot inside PcCombatantCard).
  if (char) {
    return (
      <PcCombatantCard
        state={ctx.docs[uid] ?? { status: "loading" }}
        snapshot={char}
        memberUid={uid}
        campaignId={ctx.campaignId}
        isMe={isMe}
        isDm={ctx.isDm}
        combat={ctx.combatStates[uid]}
        inCombat={inCombat}
        initLocked={ctx.initLocked}
        initRoll={encounterRollFor(ctx.encounterInit, uid)}
        reorder={reorder}
        selfAttach={selfAttach}
        head={{
          role: m.role,
          isCurrent,
          seal,
          // CARD-NAMES (owner 2026-06-29): the character NAME owns the header row; the
          // player attribution is SECONDARY, so it rides the subtitle below the identity
          // line (race · class · subclass), freeing the full row width for the name. The
          // role icon (gold crown = DM) carries the DM/player distinction with a label
          // for assistive tech.
          title: char.name,
          subline: (
            <>
              <CharacterIdentityLine
                race={char.race}
                classes={snapshotClasses(char)}
                className="!text-xs"
              />
              <span className="party-sub-player" data-role={m.role}>
                <Icon
                  as={m.role === "dm" ? Crown : UserRound}
                  size="xs"
                  label={m.role === "dm" ? t("campaign.dm") : t("campaignHub.player")}
                />
                <span className="truncate">{account}</span>
              </span>
            </>
          ),
          toggleLabel: char.name,
          open,
          onToggle: () => setOpen((v) => !v),
          detailId,
        }}
      />
    );
  }

  // No attached character — a COMPACT identity tile on the same `.party-card` shell.
  // Only a PLAYER reaches this branch: a DM with no character is represented by the
  // top-of-grid control banner (FIX 1), not a card, so they're filtered out upstream.
  // Me → the attach picker; a peer → a quiet blank. (No-char never occurs in combat:
  // you don't swap mid-fight.)
  return (
    <li className="party-card" data-role={m.role} data-side="ally">
      <div className="party-card-head">
        {seal}
        <div className="party-head-toggle party-head-static">
          <span className="party-id">
            <span className="party-id-name truncate">{account}</span>
          </span>
          <span className="party-head-meta">{roleChip}</span>
        </div>
      </div>

      {isMe ? (
        attachSelect
      ) : (
        <span className="text-2xs italic text-text-faint">
          {t("campaignHub.noCharacter")}
        </span>
      )}
    </li>
  );
}

/**
 * DmpcAttachControl — the optional "attach a character" affordance for the DM
 * THEMSELVES (a rare DMPC), surfaced on the control banner now that the DM has no
 * grid tile (FIX 1). A quiet ghost button that reveals the OWN-roster picker on click
 * — the same `party-dm-attach` + roster `Select` recipe the old DM tile carried
 * (golden rule 10, just relocated). Attaching renders the DM as a normal gold
 * combatant card in the grid; the banner stays the control surface above it.
 */
function DmpcAttachControl({
  characterId,
  roster,
  onAttach,
}: {
  characterId: string | null;
  roster: RosterCharacterDoc[];
  onAttach: (characterId: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className="party-dm-attach" onClick={() => setOpen(true)}>
        <Icon as={Plus} size="xs" decorative />
        {t("campaignHub.encounterAttachDmpc")}
      </button>
    );
  }
  return (
    <Select
      value={characterId ?? ""}
      onChange={(e) => onAttach(e.target.value)}
      aria-label={t("campaignHub.attachCharacter")}
      className="text-xs"
    >
      <option value="">{t("campaignHub.attachNone")}</option>
      {roster.map((c) => (
        <option key={c.id} value={c.id}>
          {c.character.name}
        </option>
      ))}
    </Select>
  );
}
