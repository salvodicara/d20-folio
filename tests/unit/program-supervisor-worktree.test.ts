import { describe, expect, it } from "vitest";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  assertSafeTaskRootCandidate,
  assertPhysicalTaskRoot,
  resolveTaskRoot,
  resolveWorktreePath,
} from "../../scripts/program-supervisor/worktree";

const repositoryRoot = process.cwd();
const supervisorRoot = join(repositoryRoot, "scripts", "program-supervisor");

function writeExecutable(path: string, contents: string): void {
  writeFileSync(path, contents, { mode: 0o755 });
}

function run(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env
) {
  return spawnSync(command, args, { cwd, encoding: "utf8", env });
}

function runChecked(command: string, args: string[], cwd: string): void {
  const result = run(command, args, cwd);
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")}: ${result.stderr}`);
  }
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
    },
  };
}

function createAdapterFixture() {
  const root = mkdtempSync(join(tmpdir(), "d20-adapter-"));
  const main = join(root, "d20-folio");
  const origin = join(root, "origin.git");
  const allowed = join(root, "d20-folio-approved");
  const control = join(root, "d20-folio-program-control");
  const unrelatedControl = join(root, "unrelated", "d20-folio-program-control");
  const wrongCommonMain = join(root, "wrong-common-main");
  const wrongCommonWorktree = join(root, "wrong-common-worktree");
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
    allowed,
    control,
    main,
    root,
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
    const asdfBin = join(fixture.root, "asdf-bin");
    const sentinel = join(fixture.root, "injection-sentinel");
    const pinnedNode = run("asdf", ["where", "nodejs", "24.16.0"], repositoryRoot);
    mkdirSync(home);
    mkdirSync(asdfBin);
    expect(pinnedNode).toMatchObject({ status: 0 });
    writeExecutable(
      join(asdfBin, "asdf"),
      "#!/usr/bin/env bash\nprintf '%s\\n' '" + pinnedNode.stdout.trim() + "'\n"
    );
    try {
      const result = run(
        "just",
        ["wt-new", `unsafe; touch ${sentinel}`],
        fixture.allowed,
        { ...process.env, HOME: home, PATH: `${asdfBin}:${process.env.PATH}` }
      );
      expect(result.status).toBe(1);
      expect(`${result.stdout}${result.stderr}`).toContain("safe lowercase slug");
      expect(existsSync(sentinel)).toBe(false);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });
});
