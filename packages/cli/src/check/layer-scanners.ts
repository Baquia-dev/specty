// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import {
  dartImports,
  goImports,
  pythonImports,
  pythonProject,
  type ResolvedImport,
  rustImports,
} from "@baquia-dev/specty-core";
import { parse as parseYaml } from "yaml";
import { isRecord, readText } from "../io/files";
import type { CheckContext } from "./provider";

/**
 * The scanners of `layers` that need no tool, one per language: each reads what it needs of the
 * project once (the package of `pubspec.yaml`, the module of `go.mod`, the repository's Python
 * files) and then the imports of each file. TypeScript and JavaScript go through the project's
 * dependency-cruiser instead (`layers.ts`).
 */

type Reader = (path: string, text: string) => ResolvedImport[];

interface Scanner {
  readonly files: RegExp;
  prepare(context: CheckContext): Promise<Reader>;
}

const SCANNERS: readonly Scanner[] = [
  {
    files: /\.dart$/,
    async prepare({ session }) {
      const own = await pubspecName(session.root);
      return (path, text) => dartImports(path, text, own);
    },
  },
  {
    files: /\.pyi?$/,
    async prepare({ session }) {
      const files = (await session.git.files()).filter((path) => /\.pyi?$/.test(path));
      const project = pythonProject(files);
      return (path, text) => pythonImports(path, text, project);
    },
  },
  {
    files: /\.go$/,
    async prepare({ session }) {
      const module = await goModule(session.root);
      return (path, text) => goImports(path, text, module);
    },
  },
  { files: /\.rs$/, prepare: async () => rustImports },
];

/** The imports of each of `files` that a scanner reads, by the language of each. */
export async function scannedImports(
  context: CheckContext,
  files: readonly string[],
): Promise<ResolvedImport[]> {
  const found = await Promise.all(
    SCANNERS.map(async (scanner) => {
      const own = files.filter((path) => scanner.files.test(path));
      if (own.length === 0) return [];
      const read = await scanner.prepare(context);
      const imports = await Promise.all(
        own.map(async (path) => {
          const text = await context.read(path);
          return text === undefined ? [] : read(path, text);
        }),
      );
      return imports.flat();
    }),
  );
  return found.flat();
}

async function pubspecName(root: string): Promise<string | undefined> {
  const pubspec: unknown = parseYaml((await readText(join(root, "pubspec.yaml"))) ?? "");
  return isRecord(pubspec) && typeof pubspec.name === "string" ? pubspec.name : undefined;
}

/** The module `go.mod` declares at the root of the repository. */
async function goModule(root: string): Promise<{ path: string; dir: string } | undefined> {
  const text = (await readText(join(root, "go.mod"))) ?? "";
  const path = /^module\s+(\S+)/m.exec(text)?.[1];
  return path === undefined ? undefined : { path, dir: "" };
}
