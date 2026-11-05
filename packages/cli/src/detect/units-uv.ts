// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import type { WorkspacePackage } from "@baquia-dev/specty-core";
import { parse } from "smol-toml";
import { exists, isDirectory, isRecord, readText } from "../io/files";
import { expand } from "./project";
import type { WorkspaceFacts } from "./workspace-units";

type Table = Readonly<Record<string, unknown>>;

/** The root files every member's tests read, when they exist. */
const SHARED = ["pyproject.toml", "uv.lock", ".python-version", "pytest.ini", "conftest.py"];

/**
 * A uv workspace: the members of the root `pyproject.toml`'s `[tool.uv.workspace]` with a named
 * `pyproject.toml`, each tested with `uv run --package <name> pytest <folder>` when it has a
 * `tests` folder, and the root files they share. Undefined without that table, with fewer than two
 * members, and when the root is a project too, whose folder would be the whole repository.
 */
export async function uvWorkspace(root: string): Promise<WorkspaceFacts | undefined> {
  const manifest = toml(await readText(join(root, "pyproject.toml")));
  const workspace = table(table(manifest?.tool)?.uv)?.workspace;
  if (manifest === undefined || !isRecord(workspace) || "project" in manifest) return undefined;
  const read = await Promise.all(
    (await memberDirs(root, workspace)).map((dir) => memberOf(root, dir)),
  );
  const members = read.flatMap((member) => (member === undefined ? [] : [member]));
  if (members.length < 2) return undefined;
  const names = new Set(members.map((member) => member.name));
  const packages = members.map((member) => ({
    ...member,
    uses: member.uses.filter((name) => names.has(name)),
  }));
  const found = await Promise.all(SHARED.map((file) => exists(join(root, file))));
  return { packages, shared: SHARED.filter((_, at) => found[at] === true) };
}

/** The folders of `members`, with their globs expanded, minus those of `exclude`, sorted. */
async function memberDirs(root: string, workspace: Table): Promise<readonly string[]> {
  const globs = (key: string) =>
    Promise.all(strings(workspace[key]).map((pattern) => expand(root, pattern)));
  const [members, excluded] = await Promise.all([globs("members"), globs("exclude")]);
  const outside = new Set(excluded.flat());
  return [...new Set(members.flat())].filter((dir) => !outside.has(dir)).toSorted();
}

/**
 * The member in `dir`, as its `pyproject.toml` says: its normalized name, whether it has a `tests`
 * folder and the normalized names of its requirements; undefined without a `project.name`.
 */
async function memberOf(root: string, dir: string): Promise<WorkspacePackage | undefined> {
  const manifest = toml(await readText(join(root, dir, "pyproject.toml")));
  const project = table(manifest?.project);
  if (project === undefined || typeof project.name !== "string") return undefined;
  const lists = [
    project.dependencies,
    ...Object.values(table(project["optional-dependencies"]) ?? {}),
    ...Object.values(table(manifest?.["dependency-groups"]) ?? {}),
    table(table(manifest?.tool)?.uv)?.["dev-dependencies"],
  ];
  const uses = lists.flatMap(strings).flatMap((requirement) => {
    const name = /^\s*([A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?)/.exec(requirement)?.[1];
    return name === undefined ? [] : [normalized(name)];
  });
  return {
    dir,
    name: normalized(project.name),
    tests: await isDirectory(join(root, dir, "tests")),
    command: `uv run --package ${project.name} pytest ${dir}`,
    uses: [...new Set(uses)],
  };
}

/** A Python package name as PEP 503 compares it: lowercase, each run of `-`, `_` and `.` as `-`. */
function normalized(name: string): string {
  return name.replace(/[-_.]+/g, "-").toLowerCase();
}

function table(value: unknown): Table | undefined {
  return isRecord(value) ? value : undefined;
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
