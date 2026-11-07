// SPDX-License-Identifier: Apache-2.0
import { slugify } from "./ids";
import type { ChangeKind, CommitType } from "./spec/model";

/**
 * How a repository names its branches (`git.flow`): Specty's own (`specty/<id>`), GitHub Flow and
 * trunk (`<type>/<slug>`), and Git Flow (`feature/<slug>`, `bugfix/<slug>`).
 */
export const GIT_FLOWS = ["specty", "github", "trunk", "gitflow"] as const;
export type GitFlow = (typeof GIT_FLOWS)[number];

/** What a `git.branchPattern` may hold. */
const PLACEHOLDERS: readonly string[] = ["{type}", "{slug}", "{id}"];

interface Filling {
  readonly type: string;
  readonly slug: string;
  readonly id: string;
}

/**
 * The branch of a new change: from `pattern` (`git.branchPattern`) when there is one, else as
 * `flow` says. Its slug is the title's, as in the id but without the date, of `slugChars` at most
 * (`SLUG_CHARS` without it); a spike's type is `spike`, whatever `type` says.
 */
export function branchName(change: {
  readonly flow: GitFlow;
  readonly kind: ChangeKind;
  readonly type: CommitType;
  readonly id: string;
  readonly title: string;
  readonly pattern?: string;
  readonly slugChars?: number;
}): string {
  const spike = change.kind === "spike";
  const slug = slugify(change.title, change.slugChars);
  if (change.pattern !== undefined) {
    return fill(change.pattern, { type: spike ? "spike" : change.type, slug, id: change.id });
  }
  if (change.flow === "specty") return `${spike ? "spike" : "specty"}/${change.id}`;
  return `${spike ? "spike" : prefixOf(change.flow, change.type)}/${slug}`;
}

/** Git Flow prefixes: bugfix for a fix, hotfix for hotfix, release for release, support for support, feature for the rest. */
function prefixOf(flow: Exclude<GitFlow, "specty">, type: CommitType): string {
  if (flow !== "gitflow") return type;
  if (type === "fix") return "bugfix";
  if (type === "hotfix" || type === "release" || type === "support") return type;
  return "feature";
}

function fill(pattern: string, values: Filling): string {
  return pattern
    .replaceAll("{type}", values.type)
    .replaceAll("{slug}", values.slug)
    .replaceAll("{id}", values.id);
}

/** Whether the change's type changes its branch's name, so `new` asks for `--type`. */
export function branchUsesType(git: {
  readonly flow?: GitFlow;
  readonly branchPattern?: string;
}): boolean {
  if (git.branchPattern !== undefined) return git.branchPattern.includes("{type}");
  return (git.flow ?? "specty") !== "specty";
}

/**
 * Why `pattern` gives no valid branch of its own to each change, or undefined when it does: it
 * needs `{slug}` or `{id}`, no other placeholder, and to make a name git takes.
 */
export function branchPatternIssue(pattern: string): string | undefined {
  const unknown = [...pattern.matchAll(/\{[^{}]*\}/g)]
    .map(([placeholder]) => placeholder)
    .find((placeholder) => !PLACEHOLDERS.includes(placeholder));
  if (unknown !== undefined) return `Unknown placeholder ${unknown}: use {type}, {slug} or {id}.`;
  if (!pattern.includes("{slug}") && !pattern.includes("{id}")) {
    return "The pattern needs {slug} or {id}, so each change gets a branch of its own.";
  }
  const sample = fill(pattern, { type: "feat", slug: "x", id: "20260101-x" });
  return isBranchName(sample) ? undefined : `«${sample}» is not a valid branch name.`;
}

/** The rules of `git check-ref-format --branch` that a pattern can break. */
export function isBranchName(name: string): boolean {
  if (/^[-/]|[/.]$|\.\.|\/\/|@\{|[~^:?*[\\]/.test(name)) return false;
  if ([...name].some((char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127)) {
    return false;
  }
  return name.split("/").every((part) => !part.startsWith(".") && !part.endsWith(".lock"));
}
