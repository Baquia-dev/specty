// SPDX-License-Identifier: Apache-2.0
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import { type Finding, translator } from "@baquia-dev/specty-core";
import { type ExecResult, execute, tail } from "../io/exec";
import { isRecord, parseJson, readText } from "../io/files";
import type { Session } from "../session";
import type { CheckContext, CheckDefinition } from "./provider";

/**
 * Known vulnerabilities of the dependencies, by OSV-Scanner (ADR 0012). It scans a copy of the
 * run's lockfiles as the mode sees them and another of them as the run starts, each next to the
 * `osv-scanner.toml` of its folder: what the change brings is what the first has and the second
 * had not. With `--all` nothing comes before, so every vulnerability counts.
 */

interface Vulnerability {
  /** The lockfile, repository-relative, with `/`. */
  readonly path: string;
  readonly ecosystem: string;
  readonly name: string;
  readonly version: string;
  readonly id: string;
  /** OSV's `max_severity`, empty when it gives none. */
  readonly severity: string;
}

type Scan = { readonly vulnerabilities: readonly Vulnerability[] } | { readonly skipped: string };

/** What OSV-Scanner reads with exact versions; not the manifests it resolves over the network. */
const LOCKFILES: ReadonlySet<string> = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "pubspec.lock",
  "poetry.lock",
  "uv.lock",
  "pdm.lock",
  "Pipfile.lock",
  "pylock.toml",
  "requirements.txt",
  "go.mod",
  "Cargo.lock",
  "Gemfile.lock",
  "gems.locked",
  "composer.lock",
  "mix.lock",
  "packages.lock.json",
  "packages.config",
  "gradle.lockfile",
  "buildscript-gradle.lockfile",
  "conan.lock",
  "renv.lock",
  "cabal.project.freeze",
  "stack.yaml.lock",
]);

/** Gradle's dependency verification, which only counts in its own folder. */
const GRADLE_METADATA = /(?:^|\/)gradle\/verification-metadata\.xml$/;

/** OSV-Scanner's configuration, which it reads next to each lockfile. */
const CONFIG = "osv-scanner.toml";

/** `execute` gives it when a program cannot start, and OSV-Scanner on a general error. */
const NOT_STARTED = 127;

export const vulnerabilities: CheckDefinition = {
  id: "vulnerabilities",
  async run(context) {
    const lockfiles = context.files.filter(isLockfile);
    if (lockfiles.length === 0) return { inapplicable: true };
    const folder = await realpath(await mkdtemp(join(tmpdir(), "specty-vulnerabilities-")));
    try {
      const after = join(folder, "after");
      const before = join(folder, "before");
      const now = await copy(context, lockfiles, after, (path) => context.read(path));
      const then = await copy(context, lockfiles, before, (path) => context.before(path));
      const [found, known] = await Promise.all([
        scan(context.session, after, now, join(folder, "after.json")),
        scan(context.session, before, then, join(folder, "before.json")),
      ]);
      if ("skipped" in found) return found;
      if ("skipped" in known) return known;
      return { findings: findingsOf(context, found.vulnerabilities, known.vulnerabilities) };
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  },
};

function isLockfile(path: string): boolean {
  return LOCKFILES.has(path.slice(path.lastIndexOf("/") + 1)) || GRADLE_METADATA.test(path);
}

/** The vulnerabilities `found` has and `known` had not, each once, in the order of `found`. */
function findingsOf(
  context: CheckContext,
  found: readonly Vulnerability[],
  known: readonly Vulnerability[],
): Finding[] {
  const t = translator(context.session.lang);
  const old = new Set(known.map(keyOf));
  return found
    .filter((vulnerability) => !old.has(keyOf(vulnerability)))
    .filter(
      (vulnerability, index, all) =>
        all.findIndex((other) => keyOf(other) === keyOf(vulnerability)) === index,
    )
    .map(({ path, name, version, id, severity }) => ({
      path,
      message:
        `${name} ${version}: ${id}` +
        (severity === "" ? "" : t(` (gravedad ${severity})`, ` (severity ${severity})`)),
    }));
}

function keyOf({ path, ecosystem, name, version, id }: Vulnerability): string {
  return [path, ecosystem, name, version, id].join("|");
}

/**
 * The lockfiles `text` gives, written under `target` at their own paths, with the
 * `osv-scanner.toml` of each one's folder; the paths written.
 */
async function copy(
  context: CheckContext,
  lockfiles: readonly string[],
  target: string,
  text: (path: string) => Promise<string | undefined>,
): Promise<string[]> {
  const written = await Promise.all(
    lockfiles.map(async (path) => {
      const content = await text(path);
      if (content === undefined) return [];
      await mkdir(dirname(join(target, path)), { recursive: true });
      await writeFile(join(target, path), content);
      return [path];
    }),
  );
  const paths = written.flat();
  const folders = [...new Set(paths.map((path) => dirname(path)))];
  await Promise.all(
    folders.map(async (folder) => {
      const config = await readText(join(context.session.root, folder, CONFIG));
      if (config !== undefined) await writeFile(join(target, folder, CONFIG), config);
    }),
  );
  return paths;
}

/** OSV-Scanner 2 on `lockfiles` inside `target`, with a JSON report outside it; none, none found. */
async function scan(
  session: Session,
  target: string,
  lockfiles: readonly string[],
  report: string,
): Promise<Scan> {
  if (lockfiles.length === 0) return { vulnerabilities: [] };
  const run = (args: readonly string[]) =>
    execute("osv-scanner", args, {
      cwd: target,
      env: session.environment.env,
      timeoutMs: session.config.verify.timeoutSec * 1000,
    });
  const result = await run([
    "scan",
    "source",
    "--format",
    "json",
    "--output-file",
    report,
    "--allow-no-lockfiles",
    ...lockfiles.flatMap((path) => ["-L", path]),
  ]);
  if (result.code === 0 || result.code === 1) {
    return { vulnerabilities: await vulnerabilitiesIn(report, target) };
  }
  // 127 is also OSV-Scanner's general error: only a scanner that does not start is missing.
  if (result.code === NOT_STARTED && (await run(["--version"])).code === NOT_STARTED) {
    const t = translator(session.lang);
    return {
      skipped: t(
        "OSV-Scanner no está en el PATH: instálalo para buscar las vulnerabilidades de las dependencias",
        "OSV-Scanner is not on PATH: install it to look for vulnerabilities in the dependencies",
      ),
    };
  }
  throw new Error(`osv-scanner: ${lastLine(result)}`);
}

/** The vulnerabilities of a report: one per group of aliases of each package of each lockfile. */
async function vulnerabilitiesIn(report: string, target: string): Promise<Vulnerability[]> {
  const text = await readText(report);
  if (text === undefined) return [];
  const value = parseJson(text);
  const results = isRecord(value) ? (value.results ?? []) : undefined;
  if (!Array.isArray(results)) throw new Error(`unreadable report: ${text.slice(0, 80)}`);
  return results.flatMap((result: unknown): Vulnerability[] => {
    if (!isRecord(result) || !isRecord(result.source) || !Array.isArray(result.packages)) return [];
    const source = result.source.path;
    if (typeof source !== "string") return [];
    const absolute = isAbsolute(source) ? source : join(target, source);
    const path = relative(target, absolute).split(sep).join("/");
    return result.packages.flatMap((entry: unknown) => packageVulnerabilities(path, entry));
  });
}

function packageVulnerabilities(path: string, entry: unknown): Vulnerability[] {
  if (!isRecord(entry) || !isRecord(entry.package) || !Array.isArray(entry.groups)) return [];
  const { name, version, ecosystem } = entry.package;
  if (typeof name !== "string" || typeof version !== "string") return [];
  return entry.groups.flatMap((group: unknown): Vulnerability[] => {
    if (!isRecord(group) || !Array.isArray(group.ids)) return [];
    const id = group.ids.find((candidate: unknown) => typeof candidate === "string");
    if (typeof id !== "string") return [];
    return [
      {
        path,
        ecosystem: typeof ecosystem === "string" ? ecosystem : "",
        name,
        version,
        id,
        severity: typeof group.max_severity === "string" ? group.max_severity : "",
      },
    ];
  });
}

function lastLine(result: ExecResult): string {
  return tail(result, 1)[0] ?? `exit ${result.code ?? "?"}`;
}
