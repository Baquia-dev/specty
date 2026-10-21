// SPDX-License-Identifier: Apache-2.0
import { matchesAny } from "../glob";
import { normalizePath } from "../paths";
import type { ResolvedConfig } from "../schema/config";
import { isLockfileFor, isManifest } from "./lockfiles";
import { isImplicitTest, isTestFile } from "./tests";

export type ChangeStatus = "added" | "modified" | "deleted" | "renamed";

/** A file changed in the working tree since the task started. */
export interface ChangedFile {
  readonly path: string;
  readonly status: ChangeStatus;
  readonly from?: string;
}

export interface ScopeRules {
  readonly implicitTests: boolean;
  readonly generated: readonly string[];
  readonly sensitive: readonly string[];
  readonly autoApprove: "none" | "tests-and-generated";
}

export type ScopeVerdict = "declared" | "implicit-test" | "generated" | "lockfile" | "out-of-scope";

export interface ScopeInput {
  readonly changed: readonly ChangedFile[];
  /** The task's `files`. */
  readonly taskFiles: readonly string[];
  /** Scope extensions already approved for the task. */
  readonly extras: readonly string[];
  readonly rules: ScopeRules;
}

export interface ScopeEvaluation {
  readonly verdicts: ReadonlyMap<string, ScopeVerdict>;
  readonly outOfScope: readonly string[];
  readonly ok: boolean;
}

export function scopeRulesFrom(config: ResolvedConfig): ScopeRules {
  return {
    implicitTests: config.scope.implicitTests,
    generated: config.scope.generated,
    sensitive: config.sensitive,
    autoApprove: config.scope.autoApprove,
  };
}

/** Why a changed path is allowed for the task, or `out-of-scope`. */
export function classifyPath(path: string, input: Omit<ScopeInput, "changed">): ScopeVerdict {
  const declared = [...input.taskFiles, ...input.extras];
  if (matchesAny(path, declared)) return "declared";
  if (input.rules.implicitTests && isImplicitTest(path, declared)) return "implicit-test";
  if (matchesAny(path, input.rules.generated)) return "generated";
  if (isLockfileFor(path, declared.filter(isManifest))) return "lockfile";
  return "out-of-scope";
}

/** Checks every changed path (both sides of a rename) against the task's scope. */
export function evaluateTaskScope(input: ScopeInput): ScopeEvaluation {
  const paths = [
    ...new Set(
      input.changed.flatMap((file) =>
        file.from === undefined ? [file.path] : [file.from, file.path],
      ),
    ),
  ].map(normalizePath);
  const verdicts = new Map(paths.map((path) => [path, classifyPath(path, input)] as const));
  const outOfScope = paths.filter((path) => verdicts.get(path) === "out-of-scope");
  return { verdicts, outOfScope, ok: outOfScope.length === 0 };
}

/**
 * Whether a scope request can be approved by policy. Only tests and generated files outside
 * sensitive paths qualify; everything else needs a person.
 */
export function decideScopeRequest(paths: readonly string[], rules: ScopeRules): "auto" | "human" {
  if (rules.autoApprove === "none" || paths.length === 0) return "human";
  const safe = paths.every(
    (path) =>
      !matchesAny(path, rules.sensitive) && (isTestFile(path) || matchesAny(path, rules.generated)),
  );
  return safe ? "auto" : "human";
}

export function isSensitive(path: string, rules: Pick<ScopeRules, "sensitive">): boolean {
  return matchesAny(path, rules.sensitive);
}
