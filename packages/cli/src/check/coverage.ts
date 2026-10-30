// SPDX-License-Identifier: Apache-2.0
import { readdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  type Coverage,
  changedCoverage,
  type Finding,
  parseCoverage,
  translator,
} from "@baquia-dev/specty-core";
import { exists, readText } from "../io/files";
import type { CheckContext, CheckDefinition } from "./provider";

/**
 * The coverage of the lines the run adds (`diff-coverage`), from the report the project's tests
 * left during this run: it runs after the other checks and reads only the reports written since
 * the run started, so without the tests (or with a report from before) it does not show.
 */
export const diffCoverage: CheckDefinition = {
  id: "diff-coverage",
  after: true,
  async run(context) {
    const { session } = context;
    const { coverage } = session.config.checks;
    const paths = await freshReports(session.root, coverage.reports, context.started);
    const reports = await Promise.all(paths.map((path) => readReport(context, path)));
    const changed = context.files.map((path) => {
      const lines = context.added(path);
      return lines === undefined ? { path } : { path, lines };
    });
    const result = changedCoverage(reports, changed);
    if (result.measured === 0) return { inapplicable: true };
    const percent = Math.floor((result.covered / result.measured) * 100);
    const failing = coverage.error !== undefined && percent < coverage.error;
    if (!failing && percent >= coverage.warn) return { findings: [] };
    const severity = failing ? "error" : "warning";
    const limit = failing ? (coverage.error ?? coverage.warn) : coverage.warn;
    const t = translator(session.lang);
    const head: Finding = {
      message: t(
        `Los tests ejecutan el ${percent} % de las ${result.measured} líneas que añade el cambio (mínimo ${limit} %)`,
        `The tests run ${percent}% of the ${result.measured} lines the change adds (minimum ${limit}%)`,
      ),
      severity,
    };
    const gaps = result.gaps.map(
      ({ path, from, to }): Finding => ({
        path,
        line: from,
        message:
          from === to
            ? t("ningún test la ejecuta", "no test runs it")
            : t(`hasta la ${to}: ningún test las ejecuta`, `to ${to}: no test runs them`),
        severity,
      }),
    );
    return { findings: [head, ...gaps] };
  },
};

/** The report at `path`, its relative files anchored to the folders around it. */
async function readReport(context: CheckContext, path: string): Promise<Coverage> {
  const { root } = context.session;
  const parsed = parseCoverage((await readText(join(root, path))) ?? "", root);
  return anchored(parsed, root, folderChain(dirname(path)), context.files);
}

/**
 * A tool writes paths relative to where it ran (a package of a monorepo, say): a relative path
 * that could be one of the run's files becomes the deepest file that exists, from the report's
 * folder up to the root. The rest stays as it is, to match by the end of its path.
 */
async function anchored(
  coverage: Coverage,
  root: string,
  folders: readonly string[],
  files: readonly string[],
): Promise<Coverage> {
  const keyed = new Map<string, ReadonlyMap<number, boolean>>();
  for (const [key, lines] of coverage) {
    const candidate = files.some((file) => file === key || file.endsWith(`/${key}`));
    const anchor =
      candidate && !key.startsWith("/") ? await deepest(root, folders, key) : undefined;
    keyed.set(anchor ?? key, lines);
  }
  return keyed;
}

/** `folder` and each folder above it, deepest first, as repository-relative paths. */
function folderChain(folder: string): readonly string[] {
  const chain: string[] = [];
  for (let current = folder; current !== "." && current !== ""; current = dirname(current))
    chain.push(current);
  return chain;
}

/** The first of `folders` that holds `key`, joined to it. */
async function deepest(
  root: string,
  folders: readonly string[],
  key: string,
): Promise<string | undefined> {
  for (const folder of folders) {
    const path = `${folder}/${key}`;
    if (await exists(join(root, path))) return path;
  }
  return undefined;
}

/** The reports `patterns` name (with `*` inside a segment) written since `started`. */
async function freshReports(
  root: string,
  patterns: readonly string[],
  started: number,
): Promise<string[]> {
  const found = new Set<string>();
  for (const pattern of patterns) {
    for (const path of await expand(root, "", pattern.split("/"))) found.add(path);
  }
  const fresh = await Promise.all(
    [...found].map(async (path) => {
      const info = await stat(join(root, path)).catch(() => undefined);
      return info?.isFile() === true && info.mtimeMs >= started ? [path] : [];
    }),
  );
  return fresh.flat().sort();
}

/** The paths under `base` that `segments` name; `*` never enters dependencies or hidden folders. */
async function expand(root: string, base: string, segments: readonly string[]): Promise<string[]> {
  const [segment, ...rest] = segments;
  if (segment === undefined) return [base];
  const under = (name: string) => (base === "" ? name : `${base}/${name}`);
  if (!segment.includes("*")) return expand(root, under(segment), rest);
  const pattern = new RegExp(`^${segment.split("*").map(literal).join("[^/]*")}$`);
  const names = await readdir(join(root, base)).catch((): string[] => []);
  const matches = names.filter(
    (name) => pattern.test(name) && name !== "node_modules" && !name.startsWith("."),
  );
  return (await Promise.all(matches.map((name) => expand(root, under(name), rest)))).flat();
}

function literal(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
