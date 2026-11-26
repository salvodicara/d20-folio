#!/usr/bin/env node
/**
 * READ-ONLY: does every campaign member's character carry the campaign pointer
 * (`attachedCampaignId`) on its own document? When the campaigns cannot be read, a
 * character whose document names no campaign plays solo (#1217); a member character
 * missing the pointer would then act solo by mistake. Counts only: never an id, a name
 * or a value.
 *
 * Run with (the operator provides GOOGLE_APPLICATION_CREDENTIALS):
 *   node --import ./scripts/alias-loader.mjs scripts/survey-attachment-pointer.ts
 */

/// <reference types="node" />

import { resolve } from "node:path";
import process, { argv as processArgv } from "node:process";
import { pathToFileURL } from "node:url";
import { readTargetConfiguration } from "./lib/migration-kit.ts";

export interface AttachmentPointerSurvey {
  campaigns: number;
  /** Members (any role) with a character in the campaign. */
  memberCharacters: number;
  pointerMatches: number;
  /** The character's document names no campaign: the case that would play solo. */
  pointerMissing: number;
  pointerElsewhere: number;
  documentMissing: number;
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

export function surveyAttachmentPointers(
  campaigns: ReadonlyArray<{ id: string; data: unknown }>,
  characterOf: (uid: string, characterId: string) => Record<string, unknown> | null
): AttachmentPointerSurvey {
  const survey: AttachmentPointerSurvey = {
    campaigns: campaigns.length,
    memberCharacters: 0,
    pointerMatches: 0,
    pointerMissing: 0,
    pointerElsewhere: 0,
    documentMissing: 0,
  };
  for (const campaign of campaigns) {
    for (const [uid, raw] of Object.entries(
      record(record(campaign.data).memberDetails)
    )) {
      const characterId = record(raw).characterId;
      if (typeof characterId !== "string" || characterId === "") continue;
      survey.memberCharacters += 1;
      const character = characterOf(uid, characterId);
      if (!character) {
        survey.documentMissing += 1;
        continue;
      }
      const pointer = character.attachedCampaignId;
      if (pointer === campaign.id) survey.pointerMatches += 1;
      else if (typeof pointer !== "string" || pointer === "") survey.pointerMissing += 1;
      else survey.pointerElsewhere += 1;
    }
  }
  return survey;
}

async function run(): Promise<void> {
  const target = await readTargetConfiguration();
  const [{ initializeApp, applicationDefault, deleteApp }, { getFirestore }] =
    await Promise.all([import("firebase-admin/app"), import("firebase-admin/firestore")]);
  const app = initializeApp({
    projectId: target.projectId,
    ...(target.emulator ? {} : { credential: applicationDefault() }),
  });
  console.log(
    `Target: ${target.projectId} (${target.emulator ? "explicit emulator" : "production read"})`
  );
  try {
    const db = getFirestore(app);
    const campaigns = (await db.collection("campaigns").get()).docs.map((doc) => ({
      id: doc.id,
      data: doc.data(),
    }));
    // Read every member character first (read-only), then count synchronously.
    const characters = new Map<string, Record<string, unknown> | null>();
    for (const campaign of campaigns) {
      for (const [uid, raw] of Object.entries(
        record(record(campaign.data).memberDetails)
      )) {
        const characterId = record(raw).characterId;
        if (typeof characterId !== "string" || characterId === "") continue;
        const snap = await db.doc(`users/${uid}/characters/${characterId}`).get();
        characters.set(`${uid}/${characterId}`, snap.exists ? (snap.data() ?? {}) : null);
      }
    }
    const survey = surveyAttachmentPointers(
      campaigns,
      (uid, characterId) => characters.get(`${uid}/${characterId}`) ?? null
    );
    console.log(JSON.stringify(survey, null, 2));
  } finally {
    await deleteApp(app);
  }
}

if (processArgv[1] && import.meta.url === pathToFileURL(resolve(processArgv[1])).href) {
  run().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
