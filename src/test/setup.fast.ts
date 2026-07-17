/**
 * Fast-lane (node-environment, jsdom-free) test setup — R5.
 *
 * The fast lane runs pure-logic `.test.ts` with NO DOM. It needs only the i18n
 * runtime (the resolver/SRD strings many engine assertions read); it must NOT
 * pull in `@testing-library/jest-dom` or any jsdom-only shim (those live in the
 * slow lane's `setup.ts`). Keeping this minimal is what makes the lane fast.
 *
 * SLICE 8: i18n bootstrap is async/lazy. Tests assert across BOTH locales (the
 * resolver, the locale sweep), so eagerly load EN + IT up front — the suite then
 * sees every locale synchronously, exactly as before the split.
 */
import { i18nReady, ensureLocale } from "@/i18n";
await i18nReady;
await ensureLocale("it");
