// SPDX-License-Identifier: Apache-2.0
import { join, posix } from "node:path";
import type { WorkspacePackage } from "@baquia-dev/specty-core";
import { parse } from "smol-toml";
import { exists, isRecord, readText } from "../io/files";
import { expand } from "./project";
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
 * `cargo test -p <name>`, and the root files they share. Undefined without a `[workspace]`, and
 * when the root is a package too, whose folder would be the whole repository.
 */
export async function cargoWorkspace(root: string): Promise<WorkspaceFacts | undefined> {
  const manifest = toml(await readText(join(root, "Cargo.toml")));
  const workspace = manifest?.workspace;
  if (manifest === undefined || !isRecord(workspace) || "package" in manifest) return undefined;
  const read = await Promise.all(
    (await memberDirs(root, workspace)).map((dir) => memberOf(root, dir)),
  );
  const members = read.flatMap((member) => (member === undefined ? [] : [member]));
  const inherited = isRecord(workspace.dependencies) ? workspace.dependencies : {};
  const names = new Map(members.map((member) => [member.dir, member.name]));
  const packages: WorkspacePackage[] = members.map((member) => ({
    dir: member.dir,
    name: member.name,
    tests: true,
    command: `cargo test -p ${member.name}`,
    uses: usesOf(member, inherited, names),
  }));
  const found = await Promise.all(SHARED.map((file) => exists(join(root, file))));
  return { packages, shared: SHARED.filter((_, at) => found[at] === true) };
}

/** The folders of `members`, with their globs expanded, minus those under an `exclude`, sorted. */
async function memberDirs(root: string, workspace: Table): Promise<readonly string[]> {
  const excluded = strings(workspace.exclude).map(clean);
  const expanded = await Promise.all(strings(workspace.members).map((at) => expand(root, at)));
  const outside = (dir: string) => !excluded.some((ex) => dir === ex || dir.startsWith(`${ex}/`));
  return [...new Set(expanded.flat())].filter(outside).toSorted();
}

/** The member in `dir`: undefined without a `Cargo.toml` it can read with a package name. */
async function memberOf(root: string, dir: string): Promise<Member | undefined> {
  const manifest = toml(await readText(join(root, dir, "Cargo.toml")));
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
