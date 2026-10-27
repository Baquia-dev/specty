// SPDX-License-Identifier: Apache-2.0
import { slugify } from "./ids";
import type { ChangeKind, CommitType } from "./spec/model";

/**
 * How a repository names its branches (`git.flow`): Specty's own (`specty/<id>`), GitHub Flow and
 * trunk (`<type>/<slug>`), and Git Flow (`feature/<slug>`, `bugfix/<slug>`).
 */
export const GIT_FLOWS = ["specty", "github", "trunk", "gitflow"] as const;
export type GitFlow = (typeof GIT_FLOWS)[number];

/**
 * The branch of a new change. Its slug is the title's, as in the id but without the date; a
 * spike's type is `spike`, whatever `type` says.
 */
export function branchName(change: {
  readonly flow: GitFlow;
  readonly kind: ChangeKind;
  readonly type: CommitType;
  readonly id: string;
  readonly title: string;
}): string {
  const spike = change.kind === "spike";
  if (change.flow === "specty") return `${spike ? "spike" : "specty"}/${change.id}`;
  return `${spike ? "spike" : prefixOf(change.flow, change.type)}/${slugify(change.title)}`;
}

/** Git Flow has two prefixes for daily work: `bugfix/` for a fix, `feature/` for the rest. */
function prefixOf(flow: Exclude<GitFlow, "specty">, type: CommitType): string {
  if (flow !== "gitflow") return type;
  return type === "fix" ? "bugfix" : "feature";
}
