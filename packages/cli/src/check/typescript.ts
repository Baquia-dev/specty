// SPDX-License-Identifier: Apache-2.0
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import {
  type Finding,
  type StrictTypeRule,
  type StrictTypeViolation,
  strictTypeViolations,
  translator,
} from "@baquia-dev/specty-core";
import type { Stack } from "../detect/stack";
import { execute, tail } from "../io/exec";
import { exists, isRecord, parseJson, readText } from "../io/files";
import type { Session } from "../session";
import type { CheckContext, CheckDefinition, Provider } from "./provider";

/**
 * The TypeScript provider (ADR 0012). `strict-types` forbids an explicit `any`, the comments
 * that switch the compiler off and the non-null assertion: through the project's ESLint with
 * typescript-eslint when it has them, and through Specty's own detection when it does not.
 */

/** The typescript-eslint rule behind each of Specty's rules. */
const ESLINT_RULES: Readonly<Record<string, StrictTypeRule>> = {
  "@typescript-eslint/no-explicit-any": "explicit-any",
  "@typescript-eslint/ban-ts-comment": "ts-comment",
  "@typescript-eslint/no-non-null-assertion": "non-null-assertion",
};

const TYPESCRIPT = /\.(?:ts|tsx|mts|cts)$/;
// Declarations describe code from elsewhere, often with no better type than `any`.
const DECLARATION = /\.d\.(?:ts|mts|cts)$/;

const strictTypes: CheckDefinition = {
  id: "strict-types",
  async run(context) {
    const files = context.files.filter((path) => TYPESCRIPT.test(path) && !DECLARATION.test(path));
    if (files.length === 0 && context.mode !== "all") return { findings: [] };
    const violations = (await hasTypescriptEslint(context.session))
      ? await eslintViolations(context, files)
      : await ownViolations(context, files);
    const t = translator(context.session.lang);
    const findings = violations
      .filter(({ path, line }) => context.added(path)?.has(line) ?? true)
      .map(({ path, line, rule }): Finding => ({ path, line, message: messageOf(rule, t) }));
    return { findings };
  },
};

export const typescriptProvider: Provider = {
  id: "typescript",
  applies: (stacks: readonly Stack[]) => stacks.some((stack) => stack.language === "typescript"),
  checks: [strictTypes],
};

type Located = StrictTypeViolation & { readonly path: string };

async function ownViolations(context: CheckContext, files: readonly string[]): Promise<Located[]> {
  const found = await Promise.all(
    files.map(async (path) => {
      const text = await context.read(path);
      if (text === undefined) return [];
      return strictTypeViolations(text, path.endsWith(".tsx")).map((violation) => ({
        ...violation,
        path,
      }));
    }),
  );
  return found.flat();
}

/** ESLint with typescript-eslint is installed and declared at the root. */
async function hasTypescriptEslint(session: Session): Promise<boolean> {
  const manifest = parseJson(await readText(join(session.root, "package.json")));
  if (!isRecord(manifest)) return false;
  const declared = [manifest.dependencies, manifest.devDependencies].some(
    (deps) =>
      isRecord(deps) && ("typescript-eslint" in deps || "@typescript-eslint/eslint-plugin" in deps),
  );
  return declared && (await exists(eslintBin(session)));
}

function eslintBin(session: Session): string {
  return join(session.root, "node_modules", ".bin", "eslint");
}

/**
 * The project's ESLint, with its own configuration plus the three rules at `error`, on the run's
 * files (the whole project with `--all`). Its report goes to a file, never cut like an output.
 */
async function eslintViolations(
  context: CheckContext,
  files: readonly string[],
): Promise<Located[]> {
  const { session } = context;
  const folder = await mkdtemp(join(tmpdir(), "specty-eslint-"));
  try {
    const report = join(folder, "eslint.json");
    const result = await execute(
      eslintBin(session),
      [
        "--format",
        "json",
        "--no-warn-ignored",
        ...Object.keys(ESLINT_RULES).flatMap((rule) => ["--rule", `${rule}: error`]),
        "--output-file",
        report,
        ...(context.mode === "all" ? ["."] : files),
      ],
      {
        cwd: session.root,
        env: session.environment.env,
        timeoutMs: session.config.verify.timeoutSec * 1000,
      },
    );
    // 1 means it found something; 2, that it could not run.
    if (result.code !== 0 && result.code !== 1) {
      throw new Error(`eslint: ${tail(result, 1)[0] ?? `exit ${result.code ?? "?"}`}`);
    }
    return violationsIn(parseJson(await readText(report)), session.root);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

function violationsIn(report: unknown, root: string): Located[] {
  if (!Array.isArray(report)) throw new Error("eslint: unreadable report");
  return report.flatMap((result: unknown): Located[] => {
    if (!isRecord(result) || typeof result.filePath !== "string") return [];
    const path = relative(root, result.filePath).split(sep).join("/");
    const messages: unknown[] = Array.isArray(result.messages) ? result.messages : [];
    return messages.flatMap((message): Located[] => {
      if (!isRecord(message) || typeof message.ruleId !== "string") return [];
      const rule = Object.hasOwn(ESLINT_RULES, message.ruleId)
        ? ESLINT_RULES[message.ruleId]
        : undefined;
      if (rule === undefined || typeof message.line !== "number") return [];
      return [{ path, line: message.line, rule }];
    });
  });
}

function messageOf(rule: StrictTypeRule, t: ReturnType<typeof translator>): string {
  switch (rule) {
    case "explicit-any":
      return t(
        "`any` explícito: usa un tipo concreto o `unknown`",
        "explicit `any`: use a concrete type or `unknown`",
      );
    case "ts-comment":
      return t(
        "`@ts-ignore` o `@ts-nocheck` apaga el compilador",
        "`@ts-ignore` or `@ts-nocheck` switches the compiler off",
      );
    case "non-null-assertion":
      return t(
        "aserción no nula (`!`): comprueba el valor",
        "non-null assertion (`!`): check the value",
      );
  }
}
