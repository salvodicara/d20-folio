import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type EsbuildModule = {
  build(options: {
    absWorkingDir: string;
    alias: Readonly<Record<string, string>>;
    bundle: boolean;
    entryPoints: readonly string[];
    format: "cjs";
    outfile: string;
    platform: "node";
    sourcemap: boolean;
    target: "node24";
  }): Promise<unknown>;
};

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const requireFromFunctions = createRequire(
  resolve(REPOSITORY_ROOT, "functions/package.json")
);

export async function buildFunctions(): Promise<void> {
  const esbuild = requireFromFunctions("esbuild") as EsbuildModule;
  await esbuild.build({
    absWorkingDir: REPOSITORY_ROOT,
    alias: { "@": resolve(REPOSITORY_ROOT, "src") },
    bundle: true,
    entryPoints: [resolve(REPOSITORY_ROOT, "src/lib/command/index.ts")],
    format: "cjs",
    outfile: resolve(REPOSITORY_ROOT, "functions/lib/command-kernel.cjs"),
    platform: "node",
    sourcemap: true,
    target: "node24",
  });
}

const directInvocation = process.argv[1];
if (
  directInvocation !== undefined &&
  import.meta.url === pathToFileURL(resolve(directInvocation)).href
) {
  await buildFunctions();
}
