import { existsSync, realpathSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

const SAFE_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FORBIDDEN = [
  `${sep}Documents${sep}`,
  `${sep}Library${sep}Mobile Documents${sep}`,
  `${sep}Dropbox${sep}`,
  `${sep}OneDrive${sep}`,
  `${sep}iCloud Drive${sep}`,
];

function assertNotSynchronized(path: string): void {
  if (FORBIDDEN.some((segment) => `${path}${sep}`.includes(segment))) {
    throw new Error(`Task root resolves inside a synchronized directory: ${path}`);
  }
}

function safeName(value: string): string {
  if (!SAFE_NAME.test(value)) {
    throw new Error(`Expected a safe lowercase slug, received ${JSON.stringify(value)}`);
  }
  return value;
}

export function resolveTaskRoot(homeDir: string): string {
  const root = resolve(homeDir, "Workspace", "Codex");
  return root;
}

export function assertSafeTaskRootCandidate(root: string): string {
  const logical = resolve(root);
  let ancestor = logical;
  while (!existsSync(ancestor)) ancestor = dirname(ancestor);
  const physicalAncestor = realpathSync(ancestor);
  const projected = join(physicalAncestor, relative(ancestor, logical));
  assertNotSynchronized(projected);
  if (physicalAncestor !== ancestor) {
    throw new Error(`Task root has a symlinked ancestor: ${ancestor}`);
  }
  return logical;
}

export function assertPhysicalTaskRoot(root: string): string {
  const physical = realpathSync(root);
  assertNotSynchronized(physical);
  if (physical !== resolve(root)) {
    throw new Error(`Task root must be the stable physical path, not a symlink: ${root}`);
  }
  return physical;
}

export function resolveWorktreePath(
  homeDir: string,
  project: string,
  slug: string
): string {
  return join(resolveTaskRoot(homeDir), `${safeName(project)}-${safeName(slug)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [command, homeDir, project, slug] = process.argv.slice(2);
  if (!homeDir) {
    throw new Error(
      "Use: worktree.ts candidate HOME | root HOME | path HOME PROJECT SLUG"
    );
  }
  const candidate = assertSafeTaskRootCandidate(resolveTaskRoot(homeDir));
  const physicalRoot =
    command === "candidate" ? candidate : assertPhysicalTaskRoot(candidate);
  const value =
    command === "candidate" || command === "root"
      ? physicalRoot
      : command === "path" && project && slug
        ? join(physicalRoot, `${safeName(project)}-${safeName(slug)}`)
        : undefined;
  if (!value) {
    throw new Error(
      "Use: worktree.ts candidate HOME | root HOME | path HOME PROJECT SLUG"
    );
  }
  process.stdout.write(`${value}\n`);
}
