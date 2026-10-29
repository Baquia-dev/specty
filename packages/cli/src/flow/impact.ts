// SPDX-License-Identifier: Apache-2.0
// The files outside a spec that import what it changes (ARCHITECTURE §6, `propose`): named when it
// is proposed, so that the agent decides before the approval whether they belong to it. TypeScript
// and JavaScript through the core's scanner; the other languages through those of `layers`.
import { join, posix } from "node:path";
import {
  impactLine,
  impactTitle,
  type OutputBlock,
  type ResolvedImport,
  type ScriptPackage,
  type Spec,
  scriptImports,
  section,
} from "@baquia-dev/specty-core";
import { scannedImports } from "../check/layer-scanners";
import { isRecord, parseJson, readText } from "../io/files";
import type { Session } from "../session";

const SCRIPTS = /\.[cm]?[jt]sx?$/;
/** The condition of an export whose file a repository keeps, in the order they are tried. */
const CONDITIONS = ["source", "types", "import", "default", "require"];

/** A file the spec changes, and the files outside it that import it, sorted. */
export interface Impact {
  readonly path: string;
  readonly importers: readonly string[];
}

/** Each file the spec modifies, deletes or moves away, with the files outside it that import it. */
export async function impactedFiles(session: Session, spec: Spec): Promise<Impact[]> {
  const entries = spec.sections.files?.items ?? [];
  const changed = entries.flatMap((entry) => {
    if (entry.action === "modify" || entry.action === "delete") return [entry.path];
    return entry.action === "rename" && entry.from !== undefined ? [entry.from] : [];
  });
  if (changed.length === 0) return [];
  const listed = new Set(entries.flatMap((entry) => [entry.path, entry.from ?? entry.path]));
  const imports = await importsOf(session, await session.git.files());
  return changed.flatMap((path) => {
    const importers = imports.flatMap((edge) =>
      "target" in edge && edge.target === path && !listed.has(edge.from) ? [edge.from] : [],
    );
    const sorted = [...new Set(importers)].toSorted();
    return sorted.length === 0 ? [] : [{ path, importers: sorted }];
  });
}

/** The "used outside the spec" block of an output, or nothing when nothing is. */
export function impactBlock(session: Session, impacts: readonly Impact[]): OutputBlock[] {
  const lines = impacts.map((each) => impactLine(each.path, each.importers, session.lang));
  return section(impactTitle(session.lang), lines);
}

/** The imports of every file of the repository that a scanner reads. */
async function importsOf(session: Session, files: readonly string[]): Promise<ResolvedImport[]> {
  const read = (path: string) => readText(join(session.root, path));
  const project = { files: new Set(files), packages: await workspacePackages(session, files) };
  const scripts = await Promise.all(
    files
      .filter((path) => SCRIPTS.test(path))
      .map(async (path) => {
        const text = await read(path);
        return text === undefined ? [] : scriptImports(path, text, project);
      }),
  );
  return [...scripts.flat(), ...(await scannedImports({ session, read }, files))];
}

/** The packages the repository's `package.json` files declare, each with its entries. */
async function workspacePackages(
  session: Session,
  files: readonly string[],
): Promise<ScriptPackage[]> {
  const manifests = files.filter((path) => posix.basename(path) === "package.json");
  const found = await Promise.all(
    manifests.map(async (manifest) => {
      const json = parseJson(await readText(join(session.root, manifest)));
      if (!isRecord(json) || typeof json.name !== "string") return [];
      const dir = posix.dirname(manifest);
      return [{ name: json.name, entries: entriesOf(dir === "." ? "" : dir, json) }];
    }),
  );
  return found.flat();
}

/** A package's files by subpath: those of its `exports`, or its `main` as `.`. */
function entriesOf(dir: string, json: Readonly<Record<string, unknown>>): Record<string, string> {
  const { exports } = json;
  const paths: [string, unknown][] =
    isRecord(exports) && Object.keys(exports).some((key) => key.startsWith("."))
      ? Object.entries(exports)
      : [[".", exports ?? json.main]];
  return Object.fromEntries(
    paths.flatMap(([subpath, value]) => {
      const file = fileOf(value);
      return file === undefined ? [] : [[subpath, posix.join(dir, file)]];
    }),
  );
}

/** The file an export names: itself, or that of its first condition with one. */
function fileOf(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (!isRecord(value)) return undefined;
  return CONDITIONS.map((condition) => fileOf(value[condition])).find((file) => file !== undefined);
}
