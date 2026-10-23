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
    const reason = t(
      `${plan.target} está en ${plan.holder}, que tiene cambios sin commit: avanzarla podría pisarlos.`,
      `${plan.target} is checked out in ${plan.holder}, which has uncommitted changes: moving it could overwrite them.`,
    );
    const next = t(
      `guarda o descarta esos cambios en ${plan.holder} y vuelve a ejecutar ${run}.`,
      `commit or discard those changes in ${plan.holder} and run ${run} again.`,
    );
    return refused(session, state, reason, next, {
      title: t("SIN COMMIT", "UNCOMMITTED"),
      lines: dirty,
    });
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
    if (conflicts.length === 0) {
      const reason = t(
        `No se pudo incorporar ${plan.target} a este cambio: ${reasonOf(merged)}`,
        `Could not bring ${plan.target} into this change: ${reasonOf(merged)}`,
      );
      return refused(session, state, reason, byHand);
    }
    const reason = t(
      `${plan.target} choca con este cambio.`,
      `${plan.target} conflicts with this change.`,
    );
    return refused(session, state, reason, byHand, {
      title: t("CONFLICTOS", "CONFLICTS"),
      lines: conflicts,
    });
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
      const reason = t(
        `Con ${plan.target} incorporado, \`${command}\` falla.`,
        `With ${plan.target} merged in, \`${command}\` fails.`,
      );
      const output = tail(result, 15);
      return refused(session, state, reason, byHand, {
        title: t("SALIDA DE LA VERIFICACIÓN", "VERIFICATION OUTPUT"),
        lines: output,
      });
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
  reason: string,
  next: string,
  details?: OutputBlock,
): Absorbed {
  const t = translator(session.lang);
  const lead =
    state.phase === "done"
      ? t("No se incorporó y nada cambió.", "Not merged, and nothing changed.")
      : state.phase === "acceptance"
        ? t("No se aceptó y nada cambió.", "Not accepted, and nothing changed.")
        : t("No se cerró y nada cambió.", "Not closed, and nothing changed.");
  const blocks = section(undefined, [lead, reason]);
  return {
    ok: false,
    output: {
      status: "blocked",
      header: headerOf(state.id, state.phase),
      blocks: details === undefined ? blocks : [...blocks, details],
      next,
    },
  };
}

/** True when the main branch already contains the change's branch. */
export function isIncorporated(session: Session, plan: Integration): Promise<boolean> {
  return contains(session.git, plan.target, plan.branch);
}

/** True when `commit` already contains `ancestor`. */
export async function contains(git: Git, commit: string, ancestor: string): Promise<boolean> {
  return (await git.run(["merge-base", "--is-ancestor", ancestor, commit])).code === 0;
}

function lines(text: string): string[] {
  return text.split("\n").filter((line) => line.trim().length > 0);
}

/** The last line git or the command printed, to say why it failed. */
export function reasonOf(result: ExecResult): string {
  return tail(result, 1)[0] ?? `exit ${result.code ?? "?"}`;
}
