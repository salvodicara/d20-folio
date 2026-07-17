// Flat ESLint config for the Cloud Functions package (OWN-37 / OWN-38).
// Kept independent from the app's config — Functions is a separate Node package
// with its own tsconfig and dependency tree.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "lib",
      "node_modules",
      "eslint.config.mjs",
      "vitest.config.ts",
      // Tests are type-checked by vitest (esbuild) and excluded from the build
      // tsconfig, so the type-aware `projectService` can't see them — lint the
      // shipped source only.
      "src/**/*.test.ts",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["src/**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-non-null-assertion": "error",
    },
  }
);
