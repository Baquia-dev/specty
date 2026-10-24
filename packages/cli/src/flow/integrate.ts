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
import type { StoredChange } from "../store/changes";
import { commitState } from "./active";
import { commitWithReceipt, decisionTrailers } from "./commits";
import { targetBranch } from "./worktree";

/** How a finished change reaches the main branch (ARCHITECTURE §9, "Incorporación"). */
export interface Integration {
  readonly id: string;
  /** The branch that receives the change: `git.target`, or the main branch. */
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
const INTEGRATED: ReadonlySet<ChangeState["kind"]> = new Set(["standard", "quick", "epic"]);

/** Where the change goes when it is finished, or undefined when Specty does not incorporate it. */
export async function integrationOf(
  session: Session,
  state: ChangeState,
): Promise<Integration | undefined> {
  const { git, config } = session;
  if (state.branch === undefined || !INTEGRATED.has(state.kind) || config.mode !== "individual")
    return undefined;
  const target = await targetBranch(git, config.git.target);
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
 * only after the verification passes. With conflicts or a failing verification, the merge stays
 * in progress for the agent; a closed change's merge is aborted instead, as is any other failure,
 * and nothing moves. `again` is the command the person runs afterwards.
 */
export async function absorbTarget(
  session: Session,
  plan: Integration,
  change: StoredChange,
  again: "close" | "accept",
): Promise<Absorbed> {
  const t = translator(session.lang);
  const { git } = session;
  const { state } = change;
  const forAgent = state.phase !== "done";
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
    const reason = t(
      `${plan.target} choca con este cambio.`,
      `${plan.target} conflicts with this change.`,
    );
    const details = { title: t("CONFLICTOS", "CONFLICTS"), lines: conflicts };
    if (conflicts.length > 0 && forAgent)
      return leaveForAgent(session, plan, change, again, { reason, conflicts, details });
    await git.run(["merge", "--abort"]);
    if (conflicts.length > 0) return refused(session, state, reason, byHand, details);
    const failure = t(
      `No se pudo incorporar ${plan.target} a este cambio: ${reasonOf(merged)}`,
      `Could not bring ${plan.target} into this change: ${reasonOf(merged)}`,
    );
    return refused(session, state, failure, byHand);
  }
  // An epic has no code of its own: each of its slices was verified when it closed.
  const epic = state.kind === "epic";
  const command = epic ? undefined : (session.config.verify.full ?? session.config.verify.default);
  if (command !== undefined) {
    session.environment.io.err(`specty: ${t("verificando", "verifying")} \`${command}\`…`);
    const result = await execute(command, [], {
      cwd: session.root,
      shell: true,
      env: session.environment.env,
      timeoutMs: session.config.verify.timeoutSec * 1000,
    });
    if (result.code !== 0) {
      const reason = t(
        `Con ${plan.target} incorporado, \`${command}\` falla.`,
        `With ${plan.target} merged in, \`${command}\` fails.`,
      );
      const details = {
        title: t("SALIDA DE LA VERIFICACIÓN", "VERIFICATION OUTPUT"),
        lines: tail(result, 15),
      };
      if (forAgent)
        return leaveForAgent(session, plan, change, again, { reason, conflicts: [], details });
      await git.run(["merge", "--abort"]);
      return refused(session, state, reason, byHand, details);
    }
  }
  const commit = await commitWithReceipt(session, {
    subject: `Merge branch '${plan.target}' into ${plan.branch}`,
    trailers: decisionTrailers(session, plan.id),
    stage: [],
    receipt: { change: plan.id, kind: "close" },
  });
  // Each task ran its own `verify`; with neither of these, nothing checked the merge.
  const verified = epic
    ? t(
        " sin verificar: una épica no tiene código propio",
        " without a verification: an epic has no code of its own",
      )
    : command === undefined
      ? t(
          " sin verificar: .specty/config.yaml no tiene `verify.full` ni `verify.default`",
          " without a verification: .specty/config.yaml has neither `verify.full` nor `verify.default`",
        )
      : t(` y \`${command}\` pasó`, ` and \`${command}\` passed`);
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
  const lead = t(
    `${notYet(session, state)} y nada cambió.`,
    `${notYet(session, state)}, and nothing changed.`,
  );
  return { ok: false, output: blocked(state, [lead, reason], details, next) };
}

/**
 * The merge stays in progress in the change's folder, recorded as a pending incorporation that
 * opens to the agent what either side changed since their common base (ARCHITECTURE §9).
 */
async function leaveForAgent(
  session: Session,
  plan: Integration,
  change: StoredChange,
  again: "close" | "accept",
  failure: { readonly reason: string; readonly conflicts: string[]; readonly details: OutputBlock },
): Promise<Absorbed> {
  const t = translator(session.lang);
  const { git } = session;
  const base = await git.output(["merge-base", "HEAD", plan.target]);
  const changed = async (to: string) =>
    lines((await git.run(["diff", "--name-only", base, to])).stdout);
  const paths = [...new Set([...(await changed("HEAD")), ...(await changed(plan.target))])]
    .filter((path) => !path.startsWith(".specty/"))
    .toSorted();
  const commit = await git.output(["rev-parse", plan.target]);
  const reason = failure.conflicts.length > 0 ? "conflicts" : "verify";
  const { state } = change;
  const at = session.environment.now().toISOString();
  const integration = {
    target: plan.target,
    commit,
    reason,
    conflicts: failure.conflicts,
    paths,
    at,
  } as const;
  await commitState(
    session,
    change,
    { ...state, integration },
    "integration.started",
    { target: plan.target, commit, reason, conflicts: failure.conflicts },
    "specty",
  );
  const lead = t(
    `${notYet(session, state)}: el merge queda en esta carpeta para que lo resuelva el agente.`,
    `${notYet(session, state)}: the merge waits in this folder for the agent to resolve it.`,
  );
  const next = askAgent(session, again);
  return { ok: false, output: blocked(state, [lead, failure.reason], failure.details, next) };
}

/**
 * What comes next while an incorporation waits for the agent: the person tells the agent to go
 * on, or, in delegated mode, the agent resolves it itself and then runs `again`.
 */
export function askAgent(session: Session, again: "close" | "accept"): string {
  const t = translator(session.lang);
  const { command } = session.cards;
  if (session.cards.delegated === true)
    return t(
      `modo delegado: resuélvela tú (\`${command} next\` te dice qué falta), termínala con \`${command} integrate\` y vuelve a ejecutar \`${command} ${again}\`.`,
      `delegated mode: resolve it yourself (\`${command} next\` says what is missing), finish it with \`${command} integrate\` and run \`${command} ${again}\` again.`,
    );
  return t(
    `dile a tu agente «continúa» (ejecutará \`${command} next\`); cuando termine, vuelve a ejecutar \`${command} ${again}\`.`,
    `tell your agent "continue" (it will run \`${command} next\`); when it is done, run \`${command} ${again}\` again.`,
  );
}

/** "Not closed", "Not accepted" (quick) or "Not merged" (a closed change), by phase. */
function notYet(session: Session, state: ChangeState): string {
  const t = translator(session.lang);
  if (state.phase === "done") return t("No se incorporó", "Not merged");
  if (state.phase === "acceptance") return t("No se aceptó", "Not accepted");
  return t("No se cerró", "Not closed");
}

export function blocked(
  state: ChangeState,
  lines: readonly string[],
  details: OutputBlock | undefined,
  next: string,
): Output {
  const blocks = section(undefined, lines);
  const header = headerOf(state.id, state.phase);
  return {
    status: "blocked",
    header,
    blocks: details === undefined ? blocks : [...blocks, details],
    next,
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
