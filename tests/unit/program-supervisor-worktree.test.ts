import { describe, expect, it } from "vitest";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  assertSafeTaskRootCandidate,
  assertPhysicalTaskRoot,
  resolveTaskRoot,
  resolveWorktreePath,
} from "../../scripts/program-supervisor/worktree";

const repositoryRoot = process.cwd();
const supervisorRoot = join(repositoryRoot, "scripts", "program-supervisor");
const gitLocalEnvironmentVariables = [
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_COMMON_DIR",
  "GIT_CONFIG",
  "GIT_CONFIG_COUNT",
  "GIT_CONFIG_PARAMETERS",
  "GIT_DIR",
  "GIT_GRAFT_FILE",
  "GIT_IMPLICIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_INTERNAL_SUPER_PREFIX",
  "GIT_NO_REPLACE_OBJECTS",
  "GIT_OBJECT_DIRECTORY",
  "GIT_PREFIX",
  "GIT_REPLACE_REF_BASE",
  "GIT_SHALLOW_FILE",
  "GIT_WORK_TREE",
] as const;
const gitLocalEnvironmentVariableSet = new Set<string>(gitLocalEnvironmentVariables);

function withoutCallerGitContext(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(env).filter(
      ([variable]) => !gitLocalEnvironmentVariableSet.has(variable)
    )
  );
}

function writeExecutable(path: string, contents: string): void {
  writeFileSync(path, contents, { mode: 0o755 });
}

function run(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env
) {
  return spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: withoutCallerGitContext(env),
  });
}

function runChecked(command: string, args: string[], cwd: string): void {
  const result = run(command, args, cwd);
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")}: ${result.stderr}`);
  }
}

function readUnitJob(workflow: "ci.yml" | "verify.yml"): string {
  const source = readFileSync(
    join(repositoryRoot, ".github", "workflows", workflow),
    "utf8"
  );
  const unitJob = /^ {2}unit:\n[\s\S]*?(?=^ {2}[a-z][a-z0-9-]*:\n)/m.exec(source)?.[0];
  if (unitJob === undefined) throw new Error(`Missing unit job in ${workflow}`);
  return unitJob;
}

function createBootstrapFixture() {
  const root = mkdtempSync(join(tmpdir(), "d20-bootstrap-"));
  const script = join(supervisorRoot, "bootstrap-worktree.sh");
  mkdirSync(join(root, ".githooks"));
  writeFileSync(join(root, ".tool-versions"), "nodejs 24.16.0\n");
  writeFileSync(join(root, "package.json"), '{"packageManager":"pnpm@11.2.2"}\n');
  runChecked("git", ["init", "-q"], root);

  return {
    root,
    runBootstrap(args: string[], env: NodeJS.ProcessEnv) {
      return run(script, args, root, env);
    },
  };
}

function createFakeToolchain(root: string, nodeVersion = "v24.16.0") {
  const toolRoot = join(root, "fake-node");
  const toolBin = join(toolRoot, "bin");
  const fakeBin = join(root, "fake-bin");
  const log = join(root, "installer.log");
  const corepack = join(
    toolRoot,
    "lib",
    "node_modules",
    "corepack",
    "dist",
    "corepack.js"
  );
  const npm = join(toolRoot, "lib", "node_modules", "npm", "bin", "npm-cli.js");
  const pnpm = join(root, "fake-pnpm");
  mkdirSync(join(toolRoot, "lib", "node_modules", "corepack", "dist"), {
    recursive: true,
  });
  mkdirSync(join(toolRoot, "lib", "node_modules", "npm", "bin"), { recursive: true });
  mkdirSync(toolBin, { recursive: true });
  mkdirSync(fakeBin, { recursive: true });
  writeFileSync(corepack, "");
  writeFileSync(npm, "");
  writeExecutable(
    pnpm,
    `#!/usr/bin/env bash
set -euo pipefail
if [ "\${1:-}" = "--version" ]; then
  printf '%s\\n' "$FAKE_PNPM_VERSION"
  exit 0
fi
printf 'pnpm %s\\n' "$*" >> "$FAKE_LOG"
`
  );
  writeExecutable(
    join(toolBin, "node"),
    `#!/usr/bin/env bash
set -euo pipefail
if [ "\${1:-}" = "--version" ]; then
  printf '%s\\n' "$FAKE_NODE_VERSION"
  exit 0
fi
if [ "\${1:-}" = "-p" ]; then
  printf '%s\\n' 'pnpm@11.2.2'
  exit 0
fi
if [[ "\${1:-}" = *scripts/program-supervisor/worktree.ts ]]; then
  exec "$FAKE_REAL_NODE" "$@"
fi
if [ "\${1:-}" = "$FAKE_COREPACK" ]; then
  ln -s "$FAKE_PNPM" "$4/pnpm"
  exit 0
fi
if [ "\${1:-}" = "$FAKE_NPM" ]; then
  printf 'npm %s\\n' "$*" >> "$FAKE_LOG"
  exit 0
fi
printf 'node %s\\n' "$*" >> "$FAKE_LOG"
`
  );
  writeExecutable(
    join(fakeBin, "asdf"),
    `#!/usr/bin/env bash
set -euo pipefail
[ "$1" = where ] && [ "$2" = nodejs ] && [ "$3" = 24.16.0 ]
printf '%s\\n' "$FAKE_NODE_ROOT"
`
  );

  return {
    log,
    env: {
      ...process.env,
      PATH: `${fakeBin}:${process.env.PATH}`,
      FAKE_COREPACK: corepack,
      FAKE_LOG: log,
      FAKE_NODE_ROOT: toolRoot,
      FAKE_NODE_VERSION: nodeVersion,
      FAKE_NPM: npm,
      FAKE_PNPM: pnpm,
      FAKE_PNPM_VERSION: "11.2.2",
      FAKE_REAL_NODE: process.execPath,
    },
  };
}

function createAuthorizedAdapterFixture() {
  const root = mkdtempSync(join(tmpdir(), "d20-adapter-"));
  const main = join(root, "d20-folio");
  const origin = join(root, "origin.git");
  const allowed = join(root, "d20-folio-approved");
  mkdirSync(main);
  runChecked("git", ["init", "-q", "-b", "main"], main);
  runChecked("git", ["config", "user.email", "test@example.com"], main);
  runChecked("git", ["config", "user.name", "Test User"], main);
  mkdirSync(join(main, "scripts", "program-supervisor"), { recursive: true });
  copyFileSync(join(repositoryRoot, "justfile"), join(main, "justfile"));
  copyFileSync(
    join(supervisorRoot, "bootstrap-worktree.sh"),
    join(main, "scripts", "program-supervisor", "bootstrap-worktree.sh")
  );
  copyFileSync(
    join(supervisorRoot, "worktree.ts"),
    join(main, "scripts", "program-supervisor", "worktree.ts")
  );
  copyFileSync(
    join(supervisorRoot, "adapter-preflight.sh"),
    join(main, "scripts", "program-supervisor", "adapter-preflight.sh")
  );
  mkdirSync(join(main, ".githooks"));
  writeFileSync(join(main, ".tool-versions"), "nodejs 24.16.0\n");
  writeFileSync(join(main, "package.json"), '{"packageManager":"pnpm@11.2.2"}\n');
  runChecked("git", ["add", "."], main);
  runChecked("git", ["commit", "-qm", "fixture"], main);
  runChecked("git", ["init", "-q", "--bare", origin], root);
  runChecked("git", ["remote", "add", "origin", origin], main);
  runChecked("git", ["push", "-qu", "origin", "main"], main);
  runChecked("git", ["worktree", "add", "--detach", allowed, "origin/main"], main);

  return { allowed, main, origin, root };
}

function createAdapterFixture() {
  const fixture = createAuthorizedAdapterFixture();
  const { main, root } = fixture;
  const control = join(root, "d20-folio-program-control");
  const unrelatedControl = join(root, "unrelated", "d20-folio-program-control");
  const wrongCommonMain = join(root, "wrong-common-main");
  const wrongCommonWorktree = join(root, "wrong-common-worktree");
  runChecked("git", ["worktree", "add", "--detach", control, "origin/main"], main);

  mkdirSync(unrelatedControl, { recursive: true });
  runChecked("git", ["init", "-q", "-b", "main"], unrelatedControl);
  runChecked("git", ["config", "user.email", "test@example.com"], unrelatedControl);
  runChecked("git", ["config", "user.name", "Test User"], unrelatedControl);
  writeFileSync(join(unrelatedControl, "README.md"), "unrelated\n");
  runChecked("git", ["add", "."], unrelatedControl);
  runChecked("git", ["commit", "-qm", "unrelated"], unrelatedControl);

  mkdirSync(wrongCommonMain);
  runChecked("git", ["init", "-q", "-b", "main"], wrongCommonMain);
  runChecked("git", ["config", "user.email", "test@example.com"], wrongCommonMain);
  runChecked("git", ["config", "user.name", "Test User"], wrongCommonMain);
  writeFileSync(join(wrongCommonMain, "README.md"), "wrong common\n");
  runChecked("git", ["add", "."], wrongCommonMain);
  runChecked("git", ["commit", "-qm", "wrong common"], wrongCommonMain);
  runChecked(
    "git",
    ["worktree", "add", "--detach", wrongCommonWorktree, "HEAD"],
    wrongCommonMain
  );

  return {
    ...fixture,
    control,
    unrelatedControl,
    wrongCommonWorktree,
  };
}

describe("program supervisor worktree coordinates", () => {
  it("places every task below the stable Codex workspace", () => {
    expect(resolveTaskRoot("/Users/owner")).toBe("/Users/owner/Workspace/Codex");
    expect(resolveWorktreePath("/Users/owner", "d20-folio", "automation-k2")).toBe(
      "/Users/owner/Workspace/Codex/d20-folio-automation-k2"
    );
  });

  it.each(["../escape", "UI Wave", "", "a/b", ".hidden"])(
    "rejects unsafe slug %j",
    (slug) => {
      expect(() => resolveWorktreePath("/Users/owner", "d20-folio", slug)).toThrow(
        "safe lowercase slug"
      );
    }
  );

  it("rejects a logical task root symlinked into Documents", () => {
    const home = mkdtempSync(join(tmpdir(), "d20-home-"));
    try {
      mkdirSync(join(home, "Documents", "Codex"), { recursive: true });
      mkdirSync(join(home, "Workspace"), { recursive: true });
      symlinkSync(join(home, "Documents", "Codex"), join(home, "Workspace", "Codex"));
      expect(() => assertPhysicalTaskRoot(resolveTaskRoot(home))).toThrow(
        "synchronized directory"
      );
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("rejects an absent task root below a symlinked ancestor before mkdir", () => {
    const home = mkdtempSync(join(tmpdir(), "d20-home-"));
    try {
      mkdirSync(join(home, "Documents", "Workspace"), { recursive: true });
      symlinkSync(join(home, "Documents", "Workspace"), join(home, "Workspace"));
      expect(() => assertSafeTaskRootCandidate(resolveTaskRoot(home))).toThrow(
        "synchronized directory"
      );
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});

describe("program supervisor bootstrap", () => {
  it("propagates the pinned Node executable to commands and child processes", () => {
    const script = join(supervisorRoot, "bootstrap-worktree.sh");
    const probe = `
      const { spawnSync } = require("node:child_process");
      const child = spawnSync("node", ["-p", "JSON.stringify({ version: process.version, execPath: process.execPath })"], { encoding: "utf8" });
      if (child.status !== 0) process.exit(child.status ?? 1);
      process.stdout.write(JSON.stringify({ version: process.version, execPath: process.execPath }) + "\\n" + child.stdout);
    `;
    const result = run(script, ["--run", "node", "-e", probe], repositoryRoot);
    expect(result.status).toBe(0);
    const records = result.stdout.trim().split("\n");
    expect(records).toHaveLength(2);
    const [commandRecord, childRecord] = records;
    if (commandRecord === undefined || childRecord === undefined) {
      throw new Error(`Expected command and child records, got ${result.stdout}`);
    }
    const command = JSON.parse(commandRecord) as { version: string; execPath: string };
    const child = JSON.parse(childRecord) as { version: string; execPath: string };

    expect(command.version).toBe("v24.16.0");
    expect(child.version).toBe("v24.16.0");
    expect(basename(command.execPath)).toBe("node");
    expect(child.execPath).toBe(command.execPath);
  });

  it("runs the pinned pnpm and npm installers twice and configures hooks", () => {
    const fixture = createBootstrapFixture();
    try {
      const toolchain = createFakeToolchain(fixture.root);
      expect(fixture.runBootstrap([], toolchain.env).status).toBe(0);
      expect(fixture.runBootstrap([], toolchain.env).status).toBe(0);
      expect(
        fixture.runBootstrap(["--run", "pnpm", "--version"], toolchain.env)
      ).toMatchObject({
        status: 0,
        stdout: "11.2.2\n",
      });
      expect(
        fixture.runBootstrap(["--run", "sh", "-c", "exit 7"], toolchain.env).status
      ).toBe(7);

      const installerLog = readFileSync(toolchain.log, "utf8");
      expect(installerLog.match(/^pnpm install --silent$/gm)).toHaveLength(2);
      expect(
        installerLog.match(
          /^npm .*npm-cli\.js --prefix functions ci --prefer-offline --no-audit$/gm
        )
      ).toHaveLength(2);
      expect(
        run("git", ["config", "--get", "core.hooksPath"], fixture.root)
      ).toMatchObject({
        status: 0,
        stdout: ".githooks\n",
      });
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("fails before executing commands when the resolved Node version is wrong", () => {
    const fixture = createBootstrapFixture();
    try {
      const toolchain = createFakeToolchain(fixture.root, "v99.0.0");
      const result = fixture.runBootstrap(["--run", "pnpm", "--version"], toolchain.env);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Expected Node v24.16.0, got v99.0.0");
      expect(existsSync(toolchain.log)).toBe(false);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects --run without a command", () => {
    const fixture = createBootstrapFixture();
    try {
      const toolchain = createFakeToolchain(fixture.root);
      const result = fixture.runBootstrap(["--run"], toolchain.env);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        "Use: bootstrap-worktree.sh --run COMMAND [ARG...]"
      );
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });
});

describe("program supervisor adapter authority", () => {
  it("isolates fixture repositories from hook-local Git environment", () => {
    const root = mkdtempSync(join(tmpdir(), "d20-git-env-"));
    const repository = join(root, "repository");
    mkdirSync(repository);
    try {
      runChecked("git", ["init", "-q"], repository);
      const outerGitDir = run(
        "git",
        ["rev-parse", "--absolute-git-dir"],
        repositoryRoot
      ).stdout.trim();
      const result = run("git", ["rev-parse", "--show-toplevel"], repository, {
        ...process.env,
        GIT_DIR: outerGitDir,
        GIT_WORK_TREE: repositoryRoot,
      });

      expect(result.status).toBe(0);
      expect(realpathSync(result.stdout.trim())).toBe(realpathSync(repository));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("accepts only a registered clean worktree at fresh origin/main", () => {
    const fixture = createAdapterFixture();
    const preflight = join(supervisorRoot, "adapter-preflight.sh");
    try {
      const shared = run(preflight, [fixture.main], fixture.main);
      expect(shared.status).toBe(1);
      expect(shared.stderr).toContain("shared checkout");

      expect(run(preflight, [fixture.main], fixture.allowed).status).toBe(0);
      expect(run(preflight, [fixture.main], fixture.control).status).toBe(0);

      const unrelated = run(preflight, [fixture.main], fixture.unrelatedControl);
      expect(unrelated.status).toBe(1);
      expect(unrelated.stderr).toContain("exact Git common directory");

      const wrongCommon = run(preflight, [fixture.main], fixture.wrongCommonWorktree);
      expect(wrongCommon.status).toBe(1);
      expect(wrongCommon.stderr).toContain("exact Git common directory");

      writeFileSync(join(fixture.allowed, "dirty.txt"), "dirty\n");
      const dirty = run(preflight, [fixture.main], fixture.allowed);
      expect(dirty.status).toBe(1);
      expect(dirty.stderr).toContain("clean invoking worktree");
      rmSync(join(fixture.allowed, "dirty.txt"));

      runChecked("git", ["commit", "--allow-empty", "-qm", "newer main"], fixture.main);
      runChecked("git", ["push", "-q"], fixture.main);
      const stale = run(preflight, [fixture.main], fixture.allowed);
      expect(stale.status).toBe(1);
      expect(stale.stderr).toContain("fresh origin/main");

      const staleControl = run(preflight, [fixture.main], fixture.control);
      expect(staleControl.status).toBe(1);
      expect(staleControl.stderr).toContain("fresh origin/main");
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects dirty program control and an unregistered same-name directory", () => {
    const fixture = createAdapterFixture();
    const preflight = join(supervisorRoot, "adapter-preflight.sh");
    try {
      writeFileSync(join(fixture.control, "dirty.txt"), "dirty\n");
      const dirtyControl = run(preflight, [fixture.main], fixture.control);
      expect(dirtyControl.status).toBe(1);
      expect(dirtyControl.stderr).toContain("clean invoking worktree");

      const unrelated = run(preflight, [fixture.main], fixture.unrelatedControl);
      expect(unrelated.status).toBe(1);
      expect(unrelated.stderr).toContain("exact Git common directory");
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("keeps exported Just arguments out of the shell before slug validation", () => {
    const fixture = createAdapterFixture();
    const home = join(fixture.root, "home");
    const sentinel = join(fixture.root, "injection-sentinel");
    const toolchain = createFakeToolchain(fixture.root);
    mkdirSync(home);
    try {
      const result = run(
        "just",
        ["wt-new", `unsafe; touch ${sentinel}`],
        fixture.allowed,
        { ...toolchain.env, HOME: home }
      );
      expect(result.status).toBe(1);
      expect(`${result.stdout}${result.stderr}`).toContain("safe lowercase slug");
      expect(existsSync(sentinel)).toBe(false);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("creates from the origin/main proven by the single adapter fetch", () => {
    const fixture = createAuthorizedAdapterFixture();
    const home = join(fixture.root, "home");
    const advancer = join(fixture.root, "remote-advancer");
    const gitBin = join(fixture.root, "git-bin");
    const fetchCount = join(fixture.root, "fetch-count");
    const destination = join(home, "Workspace", "Codex", "d20-folio-proof-race");
    const realGit = run("which", ["git"], fixture.allowed).stdout.trim();
    const toolchain = createFakeToolchain(fixture.root);
    mkdirSync(home);
    mkdirSync(gitBin);
    runChecked(
      "git",
      ["clone", "-q", "--branch", "main", fixture.origin, advancer],
      fixture.root
    );
    runChecked("git", ["config", "user.email", "test@example.com"], advancer);
    runChecked("git", ["config", "user.name", "Test User"], advancer);
    writeFileSync(join(advancer, "advanced.txt"), "new remote main\n");
    runChecked("git", ["add", "advanced.txt"], advancer);
    runChecked("git", ["commit", "-qm", "advance remote during proof"], advancer);
    writeExecutable(
      join(gitBin, "git"),
      `#!/usr/bin/env bash
set -euo pipefail
is_fetch=0
for arg in "$@"; do
  if [ "$arg" = fetch ]; then is_fetch=1; fi
done
if [ "$is_fetch" -eq 1 ]; then
  count=0
  if [ -f "$FETCH_COUNT" ]; then read -r count < "$FETCH_COUNT"; fi
  count=$((count + 1))
  printf '%s\\n' "$count" > "$FETCH_COUNT"
  "$REAL_GIT" "$@"
  if [ "$count" -eq 1 ]; then
    "$REAL_GIT" -C "$ADVANCER" push -q origin HEAD:main
  fi
  exit 0
fi
exec "$REAL_GIT" "$@"
`
    );

    try {
      const provenMain = run("git", ["rev-parse", "HEAD"], fixture.allowed).stdout.trim();
      const result = run("just", ["wt-new", "proof-race", "feat"], fixture.allowed, {
        ...toolchain.env,
        ADVANCER: advancer,
        FETCH_COUNT: fetchCount,
        HOME: home,
        PATH: `${gitBin}:${toolchain.env.PATH}`,
        REAL_GIT: realGit,
      });

      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
      expect(readFileSync(fetchCount, "utf8")).toBe("1\n");
      expect(
        run("git", ["rev-parse", "origin/main"], fixture.allowed).stdout.trim()
      ).toBe(provenMain);
      expect(run("git", ["rev-parse", "HEAD"], destination).stdout.trim()).toBe(
        provenMain
      );
      expect(run("git", ["rev-parse", "HEAD"], advancer).stdout.trim()).not.toBe(
        provenMain
      );
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });
});

describe("program supervisor durable runbook guards", () => {
  it.each(["ci.yml", "verify.yml"] as const)(
    "%s provisions every executable dependency used by the unit suite",
    (workflow) => {
      const unitJob = readUnitJob(workflow);
      expect(unitJob).toMatch(
        /^ {6}- uses: extractions\/setup-just@53165ef7e734c5c07cb06b3c8e7b647c5aa16db3 # v4\n {8}with:\n {10}just-version: "1\.50\.0"$/m
      );
      expect(unitJob).toContain(
        [
          "- name: Install Functions dependencies",
          "        run: npm ci",
          "        working-directory: functions",
        ].join("\n")
      );
      expect(unitJob.indexOf("Install Functions dependencies")).toBeLessThan(
        unitJob.indexOf("Unit tests")
      );
      expect(unitJob.indexOf("extractions/setup-just@")).toBeLessThan(
        unitJob.indexOf("Unit tests")
      );
    }
  );

  it("routes setup through the pinned idempotent bootstrap", () => {
    const briefing = readFileSync(join(repositoryRoot, "CLAUDE.md"), "utf8");
    expect(briefing).toContain("scripts/program-supervisor/bootstrap-worktree.sh");
    expect(briefing).toMatch(/root and standalone `functions\/`\s+dependenc/i);
    expect(briefing).not.toContain(
      "Setup: `asdf install && pnpm install && git config core.hooksPath .githooks`"
    );
  });

  it("requires dedicated paired worktrees and a complete two-repository charter for private edits", () => {
    const runbook = readFileSync(join(repositoryRoot, "docs", "WORKTREES.md"), "utf8");
    for (const evidence of [
      /shared private `main`.*read-only/is,
      /dedicated private worktree/i,
      /paired public verifier/i,
      /two-repository charter/i,
      /public base/i,
      /private base/i,
      /compatibility/i,
      /push order/i,
      /rollback/i,
      /just ci/,
      /just ci-srd-only/,
      /no private material.*public\s+recovery/is,
    ]) {
      expect(runbook).toMatch(evidence);
    }
    expect(runbook).not.toMatch(/one private pack working tree.*concurrent edits/is);
  });

  it("permits removal only after equivalence or a verified recovery capsule", () => {
    const runbook = readFileSync(join(repositoryRoot, "docs", "WORKTREES.md"), "utf8");
    expect(runbook).not.toMatch(/git worktree remove --force|remove -f -f/);
    for (const evidence of [
      /recovery capsule/i,
      /manifest/i,
      /complete bundle/i,
      /binary-safe.*tracked.*staged/is,
      /untracked archive/i,
      /checksums/i,
      /source-match verification/i,
      /integrated.*empty equivalence/is,
      /app-managed.*handoff.*detach/is,
    ]) {
      expect(runbook).toMatch(evidence);
    }
  });

  it("opens with independent specification and correctness review and treats Ponytail as optional", () => {
    const runbook = readFileSync(join(repositoryRoot, "docs", "WORKTREES.md"), "utf8");
    const recipes = readFileSync(join(repositoryRoot, "justfile"), "utf8");
    const opening = runbook.slice(0, 1_200);
    expect(opening).toMatch(
      /independent.*specification(?:-compliance)? and correctness review/is
    );
    expect(opening).toMatch(/Ponytail.*optional.*meaningful complexity risk/is);
    expect(opening).not.toMatch(/adversarial `ponytail-review`.*is the review/is);
    expect(opening).toMatch(
      /curated.*screenshots.*owner approval.*before (?:every|any) visual integration/is
    );
    expect(opening).toMatch(/deployment.*separate.*explicit per-change owner gate/is);
    expect(opening).toMatch(/nonvisual.*reviewed.*green.*autonomous/is);
    expect(opening).not.toMatch(/owner's only gate is deploy/i);
    expect(recipes).toMatch(
      /mandatory independent\s+specification(?:-compliance)? and correctness review/i
    );
    expect(recipes).toMatch(/Ponytail.*optional.*meaningful complexity risk/i);
    expect(recipes).not.toMatch(/ponytail-review convergence/i);
  });

  it("does not describe already-integrated Wayfinders as pending", () => {
    const portfolio = readFileSync(
      join(repositoryRoot, "docs", "TEST_PORTFOLIO.md"),
      "utf8"
    );
    expect(portfolio).toMatch(/Both Wayfinders.*integrated.*`main`/is);
    expect(portfolio).not.toMatch(/must land before.*links resolve/is);
  });

  it("binds the final review receipt to supporting authority blobs without self-reference", () => {
    const statusPath = join(repositoryRoot, "docs", "PROGRAM_STATUS.md");
    const portfolioPath = join(repositoryRoot, "docs", "TEST_PORTFOLIO.md");
    const planPath = join(
      repositoryRoot,
      "docs",
      "superpowers",
      "plans",
      "2026-08-26-program-supervisor-foundation.md"
    );
    const status = readFileSync(statusPath, "utf8");
    const portfolio = readFileSync(portfolioPath, "utf8");
    const statusBlob = run(
      "git",
      ["hash-object", statusPath],
      repositoryRoot
    ).stdout.trim();
    const portfolioBlob = run(
      "git",
      ["hash-object", portfolioPath],
      repositoryRoot
    ).stdout.trim();
    const planBlob = run("git", ["hash-object", planPath], repositoryRoot).stdout.trim();

    expect(status).toContain(planBlob);
    expect(status).toContain(portfolioBlob);
    expect(status).not.toContain(statusBlob);
    expect(status).toContain("be84367069e47ce029eadf1c11fbdf9aac90df2d");
    expect(portfolio).toContain("be84367069e47ce029eadf1c11fbdf9aac90df2d");
  });
});
