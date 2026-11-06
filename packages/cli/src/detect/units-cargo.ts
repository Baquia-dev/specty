// SPDX-License-Identifier: Apache-2.0
import { join, posix } from "node:path";
import type { WorkspacePackage } from "@baquia-dev/specty-core";
import { parse } from "smol-toml";
import { exists, isRecord, readText } from "../io/files";
import { expand } from "./project";
import { rootPackagePaths } from "./root-package";
import type { WorkspaceFacts } from "./workspace-units";

type Table = Readonly<Record<string, unknown>>;

/** The root files every member's tests read, when they exist. */
const SHARED = [
  "Cargo.toml",
  "Cargo.lock",
  "rust-toolchain.toml",
  "rust-toolchain",
  ".cargo/config.toml",
];

/** The tables where a manifest declares its dependencies, at its top level or under `target`. */
const TABLES = ["dependencies", "dev-dependencies", "build-dependencies"];

/** A member, as its `Cargo.toml` says: its folder, its name and its dependency entries. */
interface Member {
  readonly dir: string;
  readonly name: string;
  readonly dependencies: readonly (readonly [string, unknown])[];
}

/**
 * A Cargo workspace: the members of the root `Cargo.toml`'s `[workspace]`, each tested with
 * `cargo test -p <name>`, and the root files they share. A root that is a package too is one more
 * member, in `.`, that reads the root outside the members' folders (`rootPackagePaths`).
 * Undefined without a `[workspace]`.
 */
export async function cargoWorkspace(root: string): Promise<WorkspaceFacts | undefined> {
  const manifest = toml(await readText(join(root, "Cargo.toml")));
  const workspace = manifest?.workspace;
  if (manifest === undefined || !isRecord(workspace)) return undefined;
  const read = await Promise.all(
    (await memberDirs(root, workspace)).map((dir) => memberOf(root, dir)),
  );
  const others = read.flatMap((member) => (member === undefined ? [] : [member]));
  const self = memberIn(manifest, ".");
  const members = self === undefined ? others : [self, ...others];
  // A folder the members' globs take in without a package is not a member: the root may read it.
  const own =
    self === undefined
      ? undefined
      : await rootPackagePaths(
          root,
          others.map((member) => member.dir),
        );
  const inherited = isRecord(workspace.dependencies) ? workspace.dependencies : {};
  const names = new Map(members.map((member) => [member.dir, member.name]));
  const packages: WorkspacePackage[] = members.map((member) => ({
    dir: member.dir,
    name: member.name,
    tests: true,
    command: `cargo test -p ${member.name}`,
    uses: usesOf(member, inherited, names),
    ...(member === self && own !== undefined ? { paths: own } : {}),
  }));
  const found = await Promise.all(SHARED.map((file) => exists(join(root, file))));
  return { packages, shared: SHARED.filter((_, at) => found[at] === true) };
}

/**
 * The folders of `members`, with their globs expanded, minus those under an `exclude` and the
 * root, which is a member only as a package of its own manifest, sorted.
 */
async function memberDirs(root: string, workspace: Table): Promise<readonly string[]> {
  const excluded = strings(workspace.exclude).map(clean);
  const expanded = await Promise.all(strings(workspace.members).map((at) => expand(root, at)));
  const outside = (dir: string) => !excluded.some((ex) => dir === ex || dir.startsWith(`${ex}/`));
  const members = [...new Set(expanded.flat().map(clean))];
  return members.filter((dir) => dir !== "." && outside(dir)).toSorted();
}

/** The member in `dir`: undefined without a `Cargo.toml` it can read with a package name. */
async function memberOf(root: string, dir: string): Promise<Member | undefined> {
  return memberIn(toml(await readText(join(root, dir, "Cargo.toml"))), dir);
}

/** The member in `dir` whose `Cargo.toml` is `manifest`: undefined without a package name. */
function memberIn(manifest: Table | undefined, dir: string): Member | undefined {
  const pkg = manifest?.package;
  if (manifest === undefined || !isRecord(pkg) || typeof pkg.name !== "string") return undefined;
  const targets = isRecord(manifest.target) ? Object.values(manifest.target).filter(isRecord) : [];
  const dependencies = [manifest, ...targets].flatMap((table) =>
    TABLES.flatMap((key) => {
      const listed = table[key];
      return isRecord(listed) ? Object.entries(listed) : [];
    }),
  );
  return { dir, name: pkg.name, dependencies };
}

/** The names of the members `member` depends on, by the folder each dependency points to. */
function usesOf(
  member: Member,
  inherited: Table,
  names: ReadonlyMap<string, string>,
): readonly string[] {
  const used = member.dependencies.flatMap(([key, spec]) => {
    const name = names.get(folderOf(member.dir, key, spec, inherited) ?? "");
    return name === undefined ? [] : [name];
  });
  return [...new Set(used)];
}

/** Where a dependency points: its own `path`, or the workspace's one for `workspace = true`. */
function folderOf(dir: string, key: string, spec: unknown, inherited: Table): string | undefined {
  if (!isRecord(spec)) return undefined;
  if (typeof spec.path === "string") return clean(posix.join(dir, spec.path));
  const shared = inherited[key];
  if (spec.workspace !== true || !isRecord(shared) || typeof shared.path !== "string") {
    return undefined;
  }
  return clean(shared.path);
}

/** A repository-relative folder without `./`, `..` steps or a trailing slash. */
function clean(path: string): string {
  return posix.normalize(path).replace(/\/+$/, "");
}

function strings(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/** A TOML file's tables; undefined when it is missing or cannot be read. */
function toml(text: string | undefined): Table | undefined {
  if (text === undefined) return undefined;
  try {
    return parse(text);
  } catch {
    return undefined;
  }
}
