// SPDX-License-Identifier: Apache-2.0
import type { CheckReport, CheckResult, Finding } from "../checks/report";
import type { Lang } from "../i18n";
import { type Translate, translator } from "./text";

/**
 * The report of `specty ci`, the fourth layer of compliance (ARCHITECTURE §10): from what git
 * says of each commit of a range, the checks `traced`, `task-approval` and `no-spike`, in the
 * report `specty check` prints and serializes. Pure: the CLI gathers the facts.
 */

/** What git says of one commit of the range, merges left out. */
export interface CiCommit {
  readonly sha: string;
  readonly subject: string;
  /** The governed paths it touches, outside `.specty/`. */
  readonly governed: readonly string[];
  /** Its `Specty-Change`. */
  readonly change?: string;
  /** Its `Specty-Task`. */
  readonly task?: string;
  /** `Specty-Init: true`: Specty's installation, which belongs to no change. */
  readonly init: boolean;
  /** `Specty-Kind: spike`. */
  readonly spike: boolean;
  /** The change it names is in the repository, open or archived. */
  readonly known: boolean;
  /** A task commit's spec in that commit: approved for its hash and its `Specty-Spec`, or not. */
  readonly approval?: "valid" | "missing" | "mismatch";
}

export interface CiFacts {
  readonly commits: readonly CiCommit[];
  /** The commits go into the repository's target branch, or where they go is unknown. */
  readonly intoTarget: boolean;
  /** The pull request's branch. */
  readonly headRef?: string;
}

export type CiLevel = "error" | "warn" | "off";

/** The three checks of `specty ci`, at their levels; one set to `off` is left out. */
export function ciReport(facts: CiFacts, level: (id: string) => CiLevel, lang: Lang): CheckReport {
  const t = translator(lang);
  const checks: readonly (readonly [string, readonly Finding[]])[] = [
    ["traced", untraced(facts.commits, t)],
    ["task-approval", unapproved(facts.commits, t)],
    ["no-spike", facts.intoTarget ? spikes(facts, t) : []],
  ];
  return {
    mode: "changed",
    results: checks.flatMap(([id, findings]): CheckResult[] => {
      const at = level(id);
      return at === "off" ? [] : [{ id, level: at, findings }];
    }),
  };
}

/** Commits of governed code without `Specty-Change`, other than Specty's installation. */
function untraced(commits: readonly CiCommit[], t: Translate): Finding[] {
  return commits
    .filter((commit) => commit.governed.length > 0 && commit.change === undefined && !commit.init)
    .map((commit) => ({
      message: t(
        `${commit.sha} «${commit.subject}» no lleva Specty-Change (documéntalo con specty retro): ${listed(commit.governed, "y", "más")}`,
        `${commit.sha} "${commit.subject}" has no Specty-Change (document it with specty retro): ${listed(commit.governed, "and", "more")}`,
      ),
    }));
}

/** Commits of governed code that name a change not in the repository, or a task not approved. */
function unapproved(commits: readonly CiCommit[], t: Translate): Finding[] {
  return commits.flatMap((commit): Finding[] => {
    const { sha, subject, change, task, approval } = commit;
    if (commit.governed.length === 0 || change === undefined) return [];
    if (!commit.known) {
      return [
        {
          message: t(
            `${sha} «${subject}» nombra el cambio ${change}, que no existe`,
            `${sha} "${subject}" names the change ${change}, which does not exist`,
          ),
        },
      ];
    }
    if (task === undefined || approval === undefined || approval === "valid") return [];
    return [
      {
        message:
          approval === "missing"
            ? t(
                `${sha} (${task} de ${change}) no tenía la spec aprobada en su commit`,
                `${sha} (${task} of ${change}) had no approved spec in its commit`,
              )
            : t(
                `${sha} (${task} de ${change}) no coincide con la spec aprobada (Specty-Spec)`,
                `${sha} (${task} of ${change}) does not match the approved spec (Specty-Spec)`,
              ),
      },
    ];
  });
}

/** A spike's commits and branch, which never go into the target branch. */
function spikes(facts: CiFacts, t: Translate): Finding[] {
  const commits = facts.commits
    .filter((commit) => commit.spike)
    .map((commit) => ({
      message: t(
        `${commit.sha} «${commit.subject}» es de un spike (Specty-Kind: spike), que no va a la rama destino`,
        `${commit.sha} "${commit.subject}" is a spike's (Specty-Kind: spike), which does not go into the target branch`,
      ),
    }));
  const branch = facts.headRef;
  return branch?.startsWith("spike/") === true
    ? [
        ...commits,
        {
          message: t(
            `la rama ${branch} es de un spike, que no va a la rama destino`,
            `the branch ${branch} is a spike's, which does not go into the target branch`,
          ),
        },
      ]
    : commits;
}

/** The first three paths, and how many more. */
function listed(paths: readonly string[], and: string, more: string): string {
  const shown = paths.slice(0, 3).join(", ");
  return paths.length > 3 ? `${shown} ${and} ${paths.length - 3} ${more}` : shown;
}
