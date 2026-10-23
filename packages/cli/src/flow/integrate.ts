// SPDX-License-Identifier: Apache-2.0
import {
  type ChangeState,
  headerOf,
  type Output,
  type OutputBlock,
  section,
  translator,
} from "@baquia-dev/specty-core";
import { type ExecResult, execute, tail } from "../io/exec";
import { type Git, resolved } from "../io/git";
import type { Session } from "../session";
import { changeTrailers, commitWithReceipt } from "./commits";
import { mainBranch } from "./worktree";

/** How a finished change reaches the main branch (ARCHITECTURE §9, "Incorporación"). */
export interface Integration {
  readonly id: string;
  /** The main branch, which receives the change. */
  readonly target: string;
  readonly branch: string;
  /** The folder where `target` is checked out, if any. */
  readonly holder: string | undefined;
  /** The main worktree's folder. */
  readonly main: string;
  /** The change lives in the main worktree instead of a worktree of its own. */
  readonly inMain: boolean;
}

/** Kinds that end in the main branch: a spike is never merged and a retro has no branch. */
const INTEGRATED: ReadonlySet<ChangeState["kind"]> = new Set(["standard", "quick"]);

/** Where the change goes when it is finished, or undefined when Specty does not incorporate it. */
export async function integrationOf(
  session: Session,
  state: ChangeState,
): Promise<Integration | undefined> {
  const { git, config } = session;
  if (state.branch === undefined || !INTEGRATED.has(state.kind) || config.mode !== "individual")
    return undefined;
  const target = await mainBranch(git);
  if (target === undefined || target === state.branch) return undefined;
  const worktrees = await git.worktrees();
  const main = worktrees[0]?.folder ?? git.root;
  return {
    id: state.id,
    target,
    branch: state.branch,
    holder: worktrees.find((worktree) => worktree.branch === target)?.folder,
    main,
    inMain: (await resolved(main)) === (await resolved(git.root)),
  };
}

export type Absorbed =
  | { readonly ok: true; readonly lines: readonly string[] }
  | { readonly ok: false; readonly output: Output };

/**
 * When the main branch moved, merges it into the change's branch, here, and commits the merge
 * only after the verification passes. On any failure the merge is aborted and nothing moves;
 * `again` is the command the person runs once they have brought it in by hand.
 */
export async function absorbTarget(
  session: Session,
  plan: Integration,
  state: ChangeState,
  again: "close" | "accept",
): Promise<Absorbed> {
  const t = translator(session.lang);
  const { git } = session;
  const run = `\`${session.cards.command} ${again}\``;
  // Checked before anything moves: the fast-forward could overwrite those changes.
  const dirty =
    plan.holder === undefined
      ? []
      : lines((await git.run(["-C", plan.holder, "diff", "--name-only", "HEAD"])).stdout);
  if (plan.holder !== undefined && dirty.length > 0) {
    return refused(
      session,
      state,
      [
        t(
          `${plan.target} está en ${plan.holder}, que tiene cambios sin commit: avanzarla podría pisarlos.`,
          `${plan.target} is checked out in ${plan.holder}, which has uncommitted changes: moving it could overwrite them.`,
        ),
      ],
      { title: t("SIN COMMIT", "UNCOMMITTED"), lines: dirty },
      t(
        `guarda o descarta esos cambios en ${plan.holder} y vuelve a ejecutar ${run}.`,
        `commit or discard those changes in ${plan.holder} and run ${run} again.`,
      ),
    );
  }
  if (await contains(git, "HEAD", plan.target)) return { ok: true, lines: [] };
  const byHand = t(
    `incorpora ${plan.target} a mano en esta carpeta (\`git merge ${plan.target}\`, resuelve y haz el commit) y vuelve a ejecutar ${run}.`,
    `merge ${plan.target} by hand in this folder (\`git merge ${plan.target}\`, resolve and commit) and run ${run} again.`,
  );
  const merged = await git.run(["merge", "--no-ff", "--no-commit", plan.target]);
  if (merged.code !== 0) {
    const conflicts = lines((await git.run(["diff", "--name-only", "--diff-filter=U"])).stdout);
    await git.run(["merge", "--abort"]);
    return conflicts.length > 0
      ? refused(
          session,
          state,
          [
            t(
              `${plan.target} choca con este cambio.`,
              `${plan.target} conflicts with this change.`,
            ),
          ],
          { title: t("CONFLICTOS", "CONFLICTS"), lines: conflicts },
          byHand,
        )
      : refused(
          session,
          state,
          [
            t(
              `No se pudo incorporar ${plan.target} a este cambio: ${reasonOf(merged)}`,
              `Could not bring ${plan.target} into this change: ${reasonOf(merged)}`,
            ),
          ],
          undefined,
          byHand,
        );
  }
  const command = session.config.verify.full ?? session.config.verify.default;
  if (command !== undefined) {
    session.environment.io.err(`specty: ${t("verificando", "verifying")} \`${command}\`…`);
    const result = await execute(command, [], {
      cwd: session.root,
      shell: true,
      env: session.environment.env,
      timeoutMs: session.config.verify.timeoutSec * 1000,
    });
    if (result.code !== 0) {
      await git.run(["merge", "--abort"]);
      return refused(
        session,
        state,
        [
          t(
            `Con ${plan.target} incorporado, \`${command}\` falla.`,
            `With ${plan.target} merged in, \`${command}\` fails.`,
          ),
        ],
        { title: t("SALIDA DE LA VERIFICACIÓN", "VERIFICATION OUTPUT"), lines: tail(result, 15) },
        byHand,
      );
    }
  }
  const commit = await commitWithReceipt(session, {
    subject: `Merge branch '${plan.target}' into ${plan.branch}`,
    trailers: changeTrailers(session, plan.id),
    stage: [],
    receipt: { change: plan.id, kind: "close" },
  });
  const verified =
    command === undefined ? "" : t(` y \`${command}\` pasó`, ` and \`${command}\` passed`);
  return {
    ok: true,
    lines: [
      t(
        `Antes, ${plan.target} se incorporó a la rama del cambio (merge ${commit})${verified}.`,
        `First, ${plan.target} was merged into the change's branch (merge ${commit})${verified}.`,
      ),
    ],
  };
}

/** Nothing moved: the change stays in its phase, its branch and its folder as they were. */
function refused(
  session: Session,
  state: ChangeState,
  reasons: readonly string[],
  details: OutputBlock | undefined,
  next: string,
): Absorbed {
  const t = translator(session.lang);
  const lead =
    state.phase === "done"
      ? t("No se incorporó y nada cambió.", "Not merged, and nothing changed.")
      : t("No se cerró y nada cambió.", "Not closed, and nothing changed.");
  return {
    ok: false,
    output: {
      status: "blocked",
      header: headerOf(state.id, state.phase),
      blocks: [
        ...section(undefined, [lead, ...reasons]),
        ...(details === undefined ? [] : [details]),
      ],
      next,
    },
  };
}

/** True when the main branch already contains the change's branch. */
export function isIncorporated(session: Session, plan: Integration): Promise<boolean> {
  return contains(session.git, plan.target, plan.branch);
}

export interface Landed {
  /** The main branch now contains the change. */
  readonly landed: boolean;
  readonly lines: readonly string[];
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
  return {
    ...card,
    blocks: [...card.blocks, ...section(undefined, [...before, ...landed.lines])],
    ...(landed.landed
      ? {}
      : {
          next: t(
            `cuando se pueda, vuelve a ejecutar \`${command} close\` para incorporarlo.`,
            `when possible, run \`${command} close\` again to merge it.`,
          ),
        }),
  };
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

/** True when `commit` already contains `ancestor`. */
async function contains(git: Git, commit: string, ancestor: string): Promise<boolean> {
  return (await git.run(["merge-base", "--is-ancestor", ancestor, commit])).code === 0;
}

function lines(text: string): string[] {
  return text.split("\n").filter((line) => line.trim().length > 0);
}

function failureOf(result: ExecResult): string | undefined {
  return result.code === 0 ? undefined : reasonOf(result);
}

function reasonOf(result: ExecResult): string {
  return tail(result, 1)[0] ?? `exit ${result.code ?? "?"}`;
}
