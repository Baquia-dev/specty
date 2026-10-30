// SPDX-License-Identifier: Apache-2.0
import { copyFile, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { type Finding, translator } from "@baquia-dev/specty-core";
import { type ExecResult, execute, tail } from "../io/exec";
import { exists, isRecord, parseJson, readText } from "../io/files";
import type { Session } from "../session";
import type { CheckContext, CheckDefinition } from "./provider";

/**
 * The project's own code rules, by Opengrep or, without it, Semgrep (ADR 0012): only the rules at
 * the repository's root, never the registry's. The scanner runs at the root, so that rule ids read
 * as they do when the project runs it, on a copy of the run's files as the mode sees them.
 */

interface Match {
  /** Repository-relative, with `/`. */
  readonly path: string;
  readonly start: number;
  readonly end: number;
  readonly rule: string;
  readonly message: string;
  readonly severity: string;
}

/** Where a project keeps its rules, files or folders at the root, in the order they are given. */
const RULE_SOURCES: readonly string[] = [
  ".opengrep.yml",
  ".opengrep.yaml",
  ".opengrep",
  ".semgrep.yml",
  ".semgrep.yaml",
  ".semgrep",
];

/** What both scanners read from the folder they scan when it is not in a repository. */
const IGNORE_FILE = ".semgrepignore";

/** The severities whose matches fail the check; the others only warn. */
const FAILING = new Set(["ERROR", "CRITICAL", "HIGH"]);

/** Opengrep first; Semgrep only with its metrics off, which Opengrep does not have. */
const SCANNERS: readonly (readonly [string, readonly string[]])[] = [
  ["opengrep", []],
  ["semgrep", ["--metrics=off"]],
];

/** `execute` gives this code when the program cannot be started: it is not installed. */
const NOT_INSTALLED = 127;

export const codeRules: CheckDefinition = {
  id: "code-rules",
  async run(context) {
    const sources = await ruleSources(context.session.root);
    if (sources.length === 0) return { inapplicable: true };
    const files = context.files.filter(
      (path) => !sources.some((source) => path === source || path.startsWith(`${source}/`)),
    );
    if (files.length === 0) return { findings: [] };
    const folder = await realpath(await mkdtemp(join(tmpdir(), "specty-rules-")));
    try {
      const target = join(folder, "files");
      await copyFiles(context, files, target);
      const found = await scan(context.session, sources, target, join(folder, "report.json"));
      return "skipped" in found ? found : { findings: findingsOf(context, files, found.matches) };
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  },
};

async function ruleSources(root: string): Promise<string[]> {
  const found = await Promise.all(
    RULE_SOURCES.map(async (source) => ((await exists(join(root, source))) ? [source] : [])),
  );
  return found.flat();
}

/** The root's `.semgrepignore` first, then the run's files over it. */
async function copyFiles(
  context: CheckContext,
  files: readonly string[],
  target: string,
): Promise<void> {
  await mkdir(target, { recursive: true });
  const ignore = join(context.session.root, IGNORE_FILE);
  if (await exists(ignore)) await copyFile(ignore, join(target, IGNORE_FILE));
  await Promise.all(
    files.map(async (path) => {
      const text = await context.read(path);
      if (text === undefined) return;
      await mkdir(dirname(join(target, path)), { recursive: true });
      await writeFile(join(target, path), text);
    }),
  );
}

/** The matches that touch a line the run adds, or any line when it adds the whole file. */
function findingsOf(
  context: CheckContext,
  files: readonly string[],
  matches: readonly Match[],
): Finding[] {
  const run = new Set(files);
  return matches
    .filter((match) => run.has(match.path))
    .filter((match) => {
      const added = context.added(match.path);
      return (
        added === undefined || [...added].some((line) => line >= match.start && line <= match.end)
      );
    })
    .map((match): Finding => {
      const finding = {
        path: match.path,
        line: match.start,
        message: `${match.rule}: ${match.message}`,
      };
      return FAILING.has(match.severity.toUpperCase())
        ? finding
        : { ...finding, severity: "warning" };
    });
}

/**
 * Runs the first scanner there is at the root, with each rule source as a relative `--config`,
 * and its JSON report written outside `target`. Neither reports matches in its exit code.
 */
async function scan(
  session: Session,
  sources: readonly string[],
  target: string,
  report: string,
): Promise<{ readonly matches: readonly Match[] } | { readonly skipped: string }> {
  const configs = sources.flatMap((source) => ["--config", source]);
  for (const [program, extra] of SCANNERS) {
    const args = ["scan", ...configs, "--json", "--output", report, "--disable-version-check"];
    const result = await execute(program, [...args, ...extra, target], {
      cwd: session.root,
      env: session.environment.env,
      timeoutMs: session.config.verify.timeoutSec * 1000,
    });
    if (result.code === 0 || result.code === 1) {
      return { matches: await matchesIn(report, session.root, target) };
    }
    if (result.code !== NOT_INSTALLED) throw new Error(`${program}: ${lastLine(result)}`);
  }
  const t = translator(session.lang);
  return {
    skipped: t(
      "Opengrep y Semgrep no están en el PATH: instala Opengrep (o Semgrep) para aplicar las reglas del proyecto",
      "Neither Opengrep nor Semgrep is on PATH: install Opengrep (or Semgrep) to apply the project's rules",
    ),
  };
}

/**
 * The matches of a report: `{ results: [{ check_id, path, start, end, extra }] }`, with the paths
 * as the scanner was given them (absolute here) or relative to where it ran. No report, none.
 */
async function matchesIn(report: string, root: string, target: string): Promise<Match[]> {
  const text = await readText(report);
  if (text === undefined) return [];
  const value = parseJson(text);
  if (!isRecord(value) || !Array.isArray(value.results)) {
    throw new Error(`unreadable report: ${text.slice(0, 80)}`);
  }
  const at = (path: string) => relative(target, resolve(root, path)).split(sep).join("/");
  return value.results.flatMap((entry: unknown) => matchOf(entry, at));
}

/** One result of a report, with its path through `at`; none without a rule, a path or a line. */
function matchOf(entry: unknown, at: (path: string) => string): Match[] {
  if (!isRecord(entry)) return [];
  const { check_id: rule, path } = entry;
  const start = lineOf(entry.start);
  if (typeof rule !== "string" || typeof path !== "string" || start === undefined) return [];
  const extra = isRecord(entry.extra) ? entry.extra : {};
  return [
    {
      path: at(path),
      start,
      end: lineOf(entry.end) ?? start,
      rule,
      message: firstLine(textOr(extra.message, "")),
      severity: textOr(extra.severity, "ERROR"),
    },
  ];
}

/** The `line` of a report's `start` or `end`. */
function lineOf(position: unknown): number | undefined {
  return isRecord(position) && typeof position.line === "number" ? position.line : undefined;
}

function textOr(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function firstLine(text: string): string {
  return (
    text
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? ""
  );
}

function lastLine(result: ExecResult): string {
  return tail(result, 1)[0] ?? `exit ${result.code ?? "?"}`;
}
