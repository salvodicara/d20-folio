/**
 * Node module hooks for the derived-sheet probe: Vite gives every module an
 * `import.meta.env`; under plain Node it is undefined and a module that reads it at load
 * (`src/i18n/index.ts`: `import.meta.env.PROD`) throws. Each app module gets a neutral
 * one (not production, not dev, no Firebase), only when it has none. Registered by
 * `derived-probe.ts` before it loads the engine; local reads only.
 */
const ENV = JSON.stringify({
  PROD: false,
  DEV: false,
  MODE: "survey",
  SSR: true,
  BASE_URL: "/",
});

export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (!url.includes("/src/") || result.source == null) return result;
  const source =
    typeof result.source === "string"
      ? result.source
      : new TextDecoder().decode(result.source);
  if (!source.includes("import.meta.env")) return result;
  return { ...result, source: `import.meta.env ??= ${ENV};\n${source}` };
}
