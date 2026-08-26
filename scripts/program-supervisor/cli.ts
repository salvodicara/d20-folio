import { lstat, realpath } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  appendEvent,
  canonicalBootstrapFingerprint,
  initializeRuntime,
  loadRuntime,
  readSecureJsonFile,
  rebuildRuntime,
  type RuntimeProjection,
} from "./runtime.ts";
import { assertPhysicalTaskRoot, resolveTaskRoot } from "./worktree.ts";

type Command = "init" | "validate" | "append" | "rebuild";

interface Arguments {
  command: Command;
  root: string;
  bootstrapFile?: string;
  expectBootstrapFile?: string;
  eventFile?: string;
}

function usage(): never {
  throw new Error(
    "Use: init [--root ROOT] --bootstrap-file JSON_FILE | validate [--root ROOT] [--expect-bootstrap-file JSON_FILE] | append [--root ROOT] --event-file JSON_FILE | rebuild [--root ROOT]"
  );
}

function defaultRuntimeRoot(): string {
  return join(assertPhysicalTaskRoot(resolveTaskRoot(homedir())), "d20-folio-program");
}

function within(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

async function validatedCliRoot(rootValue: string | undefined): Promise<string> {
  if (rootValue === undefined) return defaultRuntimeRoot();
  if (!isAbsolute(rootValue) || resolve(rootValue) !== rootValue) {
    throw new Error(`--root must be an absolute normalized path: ${rootValue}`);
  }
  const operationalCandidate = join(resolveTaskRoot(homedir()), "d20-folio-program");
  if (rootValue === operationalCandidate) return defaultRuntimeRoot();
  const parent = dirname(rootValue);
  const parentMetadata = await lstat(parent);
  if (parentMetadata.isSymbolicLink() || !parentMetadata.isDirectory()) {
    throw new Error(`--root parent must be a regular non-symlink directory: ${parent}`);
  }
  const physicalCandidate = join(
    await realpath(parent),
    rootValue.slice(parent.length + 1)
  );
  const physicalTemporaryRoot = await realpath(tmpdir());
  if (!within(physicalTemporaryRoot, physicalCandidate)) {
    throw new Error(
      `--root is allowed only below the isolated temporary root or at ${operationalCandidate}`
    );
  }
  return rootValue;
}

function parseFlags(values: readonly string[]): Map<string, string> {
  const flags = new Map<string, string>();
  for (let index = 0; index < values.length; index += 2) {
    const flag = values[index];
    const value = values[index + 1];
    if (!flag?.startsWith("--") || value === undefined || value.startsWith("--")) {
      usage();
    }
    if (flags.has(flag)) throw new Error(`Duplicate option ${flag}`);
    flags.set(flag, value);
  }
  return flags;
}

async function parseArguments(argv: readonly string[]): Promise<Arguments> {
  const [commandValue, ...rest] = argv;
  if (
    commandValue !== "init" &&
    commandValue !== "validate" &&
    commandValue !== "append" &&
    commandValue !== "rebuild"
  ) {
    usage();
  }
  const flags = parseFlags(rest);
  const allowed = new Set(
    commandValue === "init"
      ? ["--root", "--bootstrap-file"]
      : commandValue === "validate"
        ? ["--root", "--expect-bootstrap-file"]
        : commandValue === "append"
          ? ["--root", "--event-file"]
          : ["--root"]
  );
  for (const flag of flags.keys()) {
    if (!allowed.has(flag)) throw new Error(`Unsupported option ${flag}`);
  }
  const root = await validatedCliRoot(flags.get("--root"));
  if (commandValue === "init") {
    const bootstrapFile = flags.get("--bootstrap-file");
    if (!bootstrapFile) usage();
    return { command: commandValue, root, bootstrapFile };
  }
  if (commandValue === "append") {
    const eventFile = flags.get("--event-file");
    if (!eventFile) usage();
    return { command: commandValue, root, eventFile };
  }
  if (commandValue === "validate") {
    return {
      command: commandValue,
      root,
      expectBootstrapFile: flags.get("--expect-bootstrap-file"),
    };
  }
  return { command: commandValue, root };
}

function assertFoundationBootstrap(value: unknown): void {
  canonicalBootstrapFingerprint(value);
  const record = value as {
    tasks?: Array<{ charter?: { id?: unknown }; state?: unknown }>;
    activeLeases?: Array<{ taskId?: unknown; role?: unknown; readOnly?: unknown }>;
  };
  if (!Array.isArray(record.tasks) || record.tasks.length !== 3) {
    throw new Error("Bootstrap must contain exactly the three reviewed initial charters");
  }
  const foundation = record.tasks.find(({ charter }) => charter?.id === "foundation-f0");
  if (!foundation || foundation.state !== "verification") {
    throw new Error("foundation-f0 must start in verification, never integrated");
  }
  const foundationLease = record.activeLeases?.find(
    ({ taskId }) => taskId === "foundation-f0"
  );
  if (
    !foundationLease ||
    foundationLease.role !== "writer" ||
    foundationLease.readOnly !== false
  ) {
    throw new Error("foundation-f0 must start with its active writable F0 lease");
  }
}

function summary(runtime: RuntimeProjection): Record<string, unknown> {
  let writers = 0;
  let evaluators = 0;
  for (const task of runtime.snapshot.tasks) {
    const lease = task.activeLease;
    if (!lease) continue;
    if (lease.role === "writer") writers += 1;
    else evaluators += 1;
  }
  return {
    schemaVersion: 1,
    bootstrapFingerprint: runtime.snapshot.bootstrapFingerprint,
    mainSha: runtime.snapshot.authority.mainSha,
    tasks: runtime.snapshot.tasks.length,
    activeLeases: {
      writers,
      evaluators,
      total: writers + evaluators,
    },
    lastEventSeq: runtime.snapshot.lastEventSeq,
    recoveryState: runtime.recoveryState,
    valid: true,
  };
}

async function execute(args: Arguments): Promise<RuntimeProjection> {
  switch (args.command) {
    case "init": {
      const input = await readSecureJsonFile(args.bootstrapFile as string);
      assertFoundationBootstrap(input);
      return initializeRuntime(args.root, input);
    }
    case "append": {
      const input = await readSecureJsonFile(args.eventFile as string);
      return appendEvent(args.root, input);
    }
    case "rebuild":
      return rebuildRuntime(args.root);
    case "validate": {
      const loaded = await loadRuntime(args.root);
      if (args.expectBootstrapFile) {
        const expected = await readSecureJsonFile(args.expectBootstrapFile);
        assertFoundationBootstrap(expected);
        const fingerprint = canonicalBootstrapFingerprint(expected);
        if (fingerprint !== loaded.snapshot.bootstrapFingerprint) {
          throw new Error(
            `Bootstrap fingerprint mismatch: expected ${fingerprint}, adopted ${loaded.snapshot.bootstrapFingerprint}`
          );
        }
      }
      return loaded;
    }
  }
}

export async function main(
  argv: readonly string[] = process.argv.slice(2)
): Promise<void> {
  const runtime = await execute(await parseArguments(argv));
  process.stdout.write(`${JSON.stringify(summary(runtime))}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
