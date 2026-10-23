// SPDX-License-Identifier: Apache-2.0
import { isAbsolute, relative } from "node:path";
import { type Output, section, translator } from "@baquia-dev/specty-core";
import type { ExecResult } from "../io/exec";
import { resolved } from "../io/git";
import type { Session } from "../session";
import { contains, type Integration, reasonOf } from "./integrate";

export interface Landed {
  /** The main branch now contains the change. */
  readonly landed: boolean;
  readonly lines: readonly string[];
  /** The change's folder was kept because the agent that closed works inside it. */
  readonly kept?: { readonly folder: string; readonly main: string };
}

/**
 * Fast-forwards the main branch to the change, where it is checked out, and then leaves the
 * change's folder: a worktree of its own is removed (its branch stays), the main folder goes
 * back to the main branch. Reports failures instead of throwing: the change is already closed.
 */
export async function landChange(session: Session, plan: Integration): Promise<Landed> {
  const t = translator(session.lang);
  const { git } = session;
  const tip = await git.output(["rev-parse", "HEAD"]);
  const failure =
    plan.holder === undefined
      ? await advanceRef(session, plan.target, tip)
      : failureOf(await git.run(["-C", plan.holder, "merge", "--ff-only", "-q", plan.branch]));
  if (failure !== undefined) {
    return {
      landed: false,
      lines: [t(`${plan.target} no avanzó: ${failure}`, `${plan.target} did not move: ${failure}`)],
    };
  }
  const lines = [t(`Incorporado a ${plan.target}.`, `Merged into ${plan.target}.`)];
  if (plan.inMain) {
    if (plan.holder === undefined && (await git.run(["switch", "-q", plan.target])).code === 0)
      lines.push(
        t(`Esta carpeta vuelve a ${plan.target}.`, `This folder is back on ${plan.target}.`),
      );
    return { landed: true, lines };
  }
  // An agent closing for the person (delegated mode) from inside the folder would lose it.
  if (session.actor === "agent" && (await within(session.environment.cwd, git.root))) {
    lines.push(
      t(
        `La carpeta ${git.root} queda, porque tu sesión trabaja en ella; la rama ${plan.branch} también.`,
        `Folder ${git.root} stays, because your session works in it; so does branch ${plan.branch}.`,
      ),
    );
    return { landed: true, lines, kept: { folder: git.root, main: plan.main } };
  }
  const removed = await git.run(["-C", plan.main, "worktree", "remove", git.root]);
  lines.push(
    removed.code === 0
      ? t(
          `La carpeta ${git.root} se eliminó y la rama ${plan.branch} queda; sigue en ${plan.main}.`,
          `Folder ${git.root} was removed and branch ${plan.branch} stays; carry on in ${plan.main}.`,
        )
      : t(
          `La carpeta ${git.root} queda: ${reasonOf(removed)} Bórrala con \`git worktree remove\` cuando ya no la necesites.`,
          `Folder ${git.root} stays: ${reasonOf(removed)} Remove it with \`git worktree remove\` when you no longer need it.`,
        ),
  );
  return { landed: true, lines };
}

/** The closing card plus what the incorporation did; if the main branch did not move, how to retry. */
export function withIntegration(
  session: Session,
  card: Output,
  before: readonly string[],
  landed: Landed | undefined,
): Output {
  if (landed === undefined) return card;
  const t = translator(session.lang);
  const { command } = session.cards;
  const blocks = [...card.blocks, ...section(undefined, [...before, ...landed.lines])];
  if (!landed.landed) {
    const next = t(
      `cuando se pueda, vuelve a ejecutar \`${command} close\` para incorporarlo.`,
      `when possible, run \`${command} close\` again to merge it.`,
    );
    return { ...card, blocks, next };
  }
  if (landed.kept === undefined) return { ...card, blocks };
  const { folder, main } = landed.kept;
  const next = t(
    `sal de ${folder} (en Claude Code, \`ExitWorktree\`) y sigue en ${main}; para otro cambio, \`${command} new "<título>"\`.`,
    `leave ${folder} (in Claude Code, \`ExitWorktree\`) and carry on in ${main}; for another change, \`${command} new "<title>"\`.`,
  );
  return { ...card, blocks, next };
}

/** True when `path` is `folder` or lies inside it, with symbolic links resolved. */
export async function within(path: string, folder: string): Promise<boolean> {
  const inner = relative(await resolved(folder), await resolved(path));
  return !inner.startsWith("..") && !isAbsolute(inner);
}

/**
 * Moves `branch`, checked out nowhere, to `tip`: only as a fast-forward, and only if nobody moved
 * it meanwhile. Returns why it did not, or undefined.
 */
async function advanceRef(
  session: Session,
  branch: string,
  tip: string,
): Promise<string | undefined> {
  const t = translator(session.lang);
  const ref = `refs/heads/${branch}`;
  const old = await session.git.output(["rev-parse", ref]);
  if (!(await contains(session.git, tip, old)))
    return t(
      "ya tiene commits que el cambio no incluye.",
      "it already has commits the change does not include.",
    );
  return failureOf(await session.git.run(["update-ref", ref, tip, old]));
}

function failureOf(result: ExecResult): string | undefined {
  return result.code === 0 ? undefined : reasonOf(result);
}
