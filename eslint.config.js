import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "dev-dist", "node_modules", "*.config.*", "coverage", ".claude"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.strictTypeChecked],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      // react-hooks v7 `recommended` lints the full Rules of React (incl. the
      // compiler diagnostics: purity · refs · immutability · set-state-in-render/
      // effect · …), so render purity stays enforced even though the build-time
      // React Compiler is intentionally off (see docs/CONTRIBUTING.md).
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      // Strict: no non-null assertions anywhere
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/restrict-template-expressions": "off",
      "@typescript-eslint/no-confusing-void-expression": "off",
      // ── i18n completeness LOCK 3 (no-i18n-default-value) ──────────────────────
      // A translation string belongs in the catalogue (en/it common.json), NEVER
      // inline as a `defaultValue` option or a positional default to `t()`. An
      // inline English default silently renders in the IT locale when the IT key
      // is missing — the owner's #1 pain. Forbidding it makes the missing-key LOCK
      // (`missingKeyHandler` throws + no dev/test `fallbackLng`) un-bypassable.
      // (`docs/ARCHITECTURE.md` → "The six i18n-completeness locks", lock 3.)
      //
      // NB: the JSX `defaultValue={…}` attribute (uncontrolled <input>/<textarea>)
      // is a `JSXAttribute`, not an object `Property` — these selectors never match
      // it, so those legitimate DOM defaults are untouched.
      "no-restricted-syntax": [
        "error",
        {
          // `t("key", { defaultValue: "…" })` / `defaultValue_one` / `_other` / …
          selector:
            "CallExpression[callee.name='t'] > ObjectExpression > Property[key.name=/^defaultValue(_(one|other|zero|two|few|many))?$/]",
          message:
            "i18n: no inline `defaultValue` on t() — put the string in en/it common.json (ARCHITECTURE.md → i18n-completeness lock 3).",
        },
        {
          // `i18n.t("key", { defaultValue: "…" })` (member-call form)
          selector:
            "CallExpression[callee.property.name='t'] > ObjectExpression > Property[key.name=/^defaultValue(_(one|other|zero|two|few|many))?$/]",
          message:
            "i18n: no inline `defaultValue` on t() — put the string in en/it common.json (ARCHITECTURE.md → i18n-completeness lock 3).",
        },
        {
          // positional default: `t("key", "English string")`
          selector:
            "CallExpression[callee.name='t'] > :matches(Literal, TemplateLiteral):nth-child(2)",
          message:
            "i18n: no positional default string on t() — put the string in en/it common.json (ARCHITECTURE.md → i18n-completeness lock 3).",
        },
        {
          // positional default (member-call form): `i18n.t("key", "English string")`
          selector:
            "CallExpression[callee.property.name='t'] > :matches(Literal, TemplateLiteral):nth-child(2)",
          message:
            "i18n: no positional default string on t() — put the string in en/it common.json (ARCHITECTURE.md → i18n-completeness lock 3).",
        },
      ],
    },
  }
);
