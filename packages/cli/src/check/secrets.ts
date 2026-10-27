// SPDX-License-Identifier: Apache-2.0
import { copyFile, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import { type Finding, translator } from "@baquia-dev/specty-core";
import { type ExecResult, execute, tail } from "../io/exec";
import { exists, isRecord, parseJson, readText } from "../io/files";
import type { Session } from "../session";
import type { CheckContext, CheckDefinition } from "./provider";

/**
 * Secrets, by Betterleaks or, without it, gitleaks (ADR 0012). The scanner looks at a copy of the
 * run's files as the mode sees them, so that `--staged` judges what will be committed, next to
 * the repository's own configuration and ignore files; it never sees what the run leaves out.
 */

interface Leak {
  /** Repository-relative, with `/`. */
  readonly path: string;
  readonly line: number;
  readonly rule: string;
}

/** What the scanners read from the folder they scan: gitleaks' configuration and both ignores. */
const SCANNER_FILES: readonly string[] = [
  ".gitleaks.toml",
  ".gitleaksignore",
  ".betterleaksignore",
];

/** `execute` gives this code when the program cannot be started: it is not installed. */
const NOT_INSTALLED = 127;

export const secrets: CheckDefinition = {
  id: "secrets",
  async run(context) {
    if (context.files.length === 0) return { findings: [] };
    const folder = await realpath(await mkdtemp(join(tmpdir(), "specty-secrets-")));
    try {
      const target = join(folder, "files");
      await copyFiles(context, target);
      const leaks = await scan(context.session, target, join(folder, "report.json"));
      return "skipped" in leaks ? leaks : { findings: findingsOf(context, leaks.leaks) };
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  },
};

function findingsOf(context: CheckContext, leaks: readonly Leak[]): Finding[] {
  const t = translator(context.session.lang);
  const files = new Set(context.files);
  return leaks
    .filter((leak) => files.has(leak.path))
    .filter((leak) => context.added(leak.path)?.has(leak.line) ?? true)
    .map((leak) => ({
      path: leak.path,
      line: leak.line,
      message: t(`posible secreto: ${leak.rule}`, `possible secret: ${leak.rule}`),
    }));
}

/** The scanner's files from the repository's root first, then the run's files over them. */
async function copyFiles(context: CheckContext, target: string): Promise<void> {
  await mkdir(target, { recursive: true });
  const { root } = context.session;
  for (const name of SCANNER_FILES) {
    if (await exists(join(root, name))) await copyFile(join(root, name), join(target, name));
  }
  await Promise.all(
    context.files.map(async (path) => {
      const text = await context.read(path);
      if (text === undefined) return;
      await mkdir(dirname(join(target, path)), { recursive: true });
      await writeFile(join(target, path), text);
    }),
  );
}

/**
 * Betterleaks 2 first; a Betterleaks that rejects its form is version 1, which still speaks
 * gitleaks', and gitleaks last. The scanner always redacts and writes its report outside `target`.
 */
async function scan(
  session: Session,
  target: string,
  report: string,
): Promise<{ readonly leaks: readonly Leak[] } | { readonly skipped: string }> {
  const run = (program: string, args: readonly string[]) =>
    execute(program, args, {
      cwd: target,
      env: session.environment.env,
      timeoutMs: session.config.verify.timeoutSec * 1000,
    });
  const gitleaksForm = gitleaksArgs(report);
  const betterleaks = await run(
    "betterleaks",
    betterleaksArgs(report, await betterleaksConfig(session)),
  );
  if (betterleaks.code === 0) return { leaks: await leaksIn(report, target) };
  if (betterleaks.code !== NOT_INSTALLED) {
    if ((await run("betterleaks", gitleaksForm)).code === 0) {
      return { leaks: await leaksIn(report, target) };
    }
    throw new Error(`betterleaks: ${lastLine(betterleaks)}`);
  }
  const gitleaks = await run("gitleaks", gitleaksForm);
  if (gitleaks.code === 0) return { leaks: await leaksIn(report, target) };
  if (gitleaks.code !== NOT_INSTALLED) throw new Error(`gitleaks: ${lastLine(gitleaks)}`);
  const t = translator(session.lang);
  return {
    skipped: t(
      "Betterleaks y gitleaks no están en el PATH: instala Betterleaks (o gitleaks) para buscar secretos",
      "Neither Betterleaks nor gitleaks is on PATH: install Betterleaks (or gitleaks) to look for secrets",
    ),
  };
}

/** Betterleaks 2's form: a redacted JSON report, whatever it finds. */
function betterleaksArgs(report: string, config: readonly string[]): string[] {
  return ["--no-banner", "fs", ".", "--redact", "--output", report, "--exit-code", "0", ...config];
}

/** Gitleaks' form, which Betterleaks 1 also speaks: a redacted JSON report, whatever it finds. */
function gitleaksArgs(report: string): string[] {
  return [
    "dir",
    ".",
    "--report-format",
    "json",
    "--report-path",
    report,
    "--redact",
    "--no-banner",
    "--exit-code",
    "0",
  ];
}

/** Betterleaks loads no configuration by itself: the repository's, unless the environment has one. */
async function betterleaksConfig(session: Session): Promise<string[]> {
  const { env } = session.environment;
  const configured = [env.BETTERLEAKS_CONFIG, env.BETTERLEAKS_CONFIG_TOML].some(
    (value) => (value ?? "") !== "",
  );
  const config = join(session.root, ".betterleaks.toml");
  return !configured && (await exists(config)) ? ["--config", config] : [];
}

/**
 * The leaks of a report: Betterleaks 2 writes `{ findings: [{ rule_id, location }] }`, and
 * gitleaks and Betterleaks 1 a list of `{ File, StartLine, RuleID }`. No report means no leaks.
 */
async function leaksIn(report: string, target: string): Promise<Leak[]> {
  const text = await readText(report);
  if (text === undefined) return [];
  const value = parseJson(text);
  const entries = Array.isArray(value) ? value : isRecord(value) ? value.findings : undefined;
  if (!Array.isArray(entries)) throw new Error(`unreadable report: ${text.slice(0, 80)}`);
  return entries.flatMap((entry: unknown): Leak[] => {
    if (!isRecord(entry)) return [];
    const location: Record<string, unknown> = isRecord(entry.location) ? entry.location : {};
    const path = location.path ?? entry.File;
    const line = location.start_line ?? entry.StartLine;
    const rule = entry.rule_id ?? entry.RuleID;
    if (typeof path !== "string" || typeof line !== "number" || typeof rule !== "string") return [];
    const absolute = isAbsolute(path) ? path : join(target, path);
    return [{ path: relative(target, absolute).split(sep).join("/"), line, rule }];
  });
}

function lastLine(result: ExecResult): string {
  return tail(result, 1)[0] ?? `exit ${result.code ?? "?"}`;
}
