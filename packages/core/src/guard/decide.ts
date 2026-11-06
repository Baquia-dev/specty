// SPDX-License-Identifier: Apache-2.0
import { openFolderDenial } from "../cards/change-folder";
import { ghostFolderDenial } from "../cards/ghost-folder";
import { foregroundWaitDenial, sleepDenial } from "../cards/wait";
import { isGoverned } from "../scope/governed";
import { classifyPath, scopeRulesFrom } from "../scope/scope";
import type {
  GuardAction,
  GuardChange,
  GuardContext,
  GuardDecision,
  GuardRule,
  ShellFacts,
} from "./action";
import { EVERY_BRANCH } from "./git-refs";
import { humanDenial } from "./human";
import { commitNext, integrationDenial } from "./integration";
import { sessionDenial } from "./session";
import { protectedDenial, specDenial } from "./spec";
import { lockedDenial, testingDenial } from "./testing";
import {
  elsewhereDenial,
  type ForeignPath,
  foreignDenial,
  type GhostPath,
  type OpenFolder,
} from "./worktrees";

export { HUMAN_COMMANDS } from "./human";

const ALLOW: GuardDecision = { allow: true };

/** Decides whether an agent action respects the flow. Paths are repository-relative. */
export function decideGuard(action: GuardAction, ctx: GuardContext): GuardDecision {
  if (action.kind === "other") return ALLOW;
  if (action.kind === "read") return decideRead(action, ctx);
  if (action.kind === "shell") return decideShell(action.facts, ctx);
  if (action.kind === "files") return decideFiles(action, ctx);
  if (action.kind === "remove-worktree") return denyOpenFolder(action.folders, ctx) ?? ALLOW;
  if (action.kind === "enter") return decideEnter(action, ctx);
  return decideEdit(action, ctx);
}

/** Reading is free; only a conversation that entered a change's folder reads that folder's files. */
function decideRead(
  action: Extract<GuardAction, { readonly kind: "read" }>,
  ctx: GuardContext,
): GuardDecision {
  const elsewhere = (action.foreign ?? []).filter((path) => path.instead !== undefined);
  return denyForeign(elsewhere, ctx) ?? ALLOW;
}

/** A session moves into a worktree unless it is bound to another one whose change is open. */
function decideEnter(
  action: Extract<GuardAction, { readonly kind: "enter" }>,
  ctx: GuardContext,
): GuardDecision {
  const denial = sessionDenial(action.bound, action.target, ctx.lang, ctx.command, action.epic);
  return denial === undefined ? ALLOW : deny("session", denial.reason, denial.next);
}

/** A file tool's write or deletion: each path, after those inside a ghost folder or another worktree. */
function decideEdit(
  action: Extract<GuardAction, { readonly kind: "write" | "delete" }>,
  ctx: GuardContext,
): GuardDecision {
  return (
    denyGhost(action.ghosts, ctx) ??
    denyForeign(action.foreign, ctx) ??
    firstDenial(action.paths.map((path) => decidePath(path, action.kind, ctx)))
  );
}

/** A folder git no longer knows as a worktree: writing there would bring it back without git. */
function denyGhost(
  ghosts: readonly GhostPath[] | undefined,
  ctx: GuardContext,
): GuardDecision | undefined {
  const [first] = ghosts ?? [];
  if (first === undefined) return undefined;
  const denial = ghostFolderDenial(first, ctx.lang, ctx.command);
  return deny("ghost", denial.reason, denial.next);
}

/** An open change's folder stays, whatever the phase and in delegated mode too. */
function denyOpenFolder(
  folders: readonly OpenFolder[] | undefined,
  ctx: GuardContext,
): GuardDecision | undefined {
  const [first] = folders ?? [];
  if (first === undefined) return undefined;
  const denial = openFolderDenial(first, ctx.lang, ctx.command);
  return deny("change-folder", denial.reason, denial.next);
}

/** Another worktree's files belong to another change, whatever this folder's phase. */
function denyForeign(
  foreign: readonly ForeignPath[] | undefined,
  ctx: GuardContext,
): GuardDecision | undefined {
  const denial = foreignDenial(foreign ?? [], ctx.lang);
  return denial === undefined ? undefined : deny("worktree", denial.reason, denial.next);
}

function decideShell(facts: ShellFacts, ctx: GuardContext): GuardDecision {
  const t = (es: string, en: string) => (ctx.lang === "es" ? es : en);
  const human = humanDenial(facts.specty, ctx);
  if (human !== undefined) return deny("human", human.reason, human.next);
  // Before where it runs: run anywhere else, it would be denied all the same.
  const removal = denyOpenFolder(facts.removedFolders, ctx);
  if (removal !== undefined) return removal;
  // Where it runs comes first: there, the rest is judged by that folder's change.
  if (facts.elsewhere !== undefined) {
    const denial = elsewhereDenial(facts.elsewhere, ctx.lang);
    return deny("worktree", denial.reason, denial.next);
  }
  const tooling = toolingDenial(facts, ctx);
  if (tooling !== undefined) return tooling;
  const waiting = waitDenial(facts, ctx);
  if (waiting !== undefined) return waiting;
  const memory = memoryDenial(facts.refs ?? [], ctx);
  if (memory !== undefined) return memory;
  if (facts.committedGoverned.length > 0) {
    return deny(
      "commit",
      t(
        "Los commits de código los hace Specty al completar cada tarea.",
        "Code commits are made by Specty when each task is completed.",
      ),
      commitNext(ctx.change ?? {}, ctx.lang, ctx.command),
    );
  }
  return decideFiles(facts, ctx);
}

/** A command that runs the unrelated `specty` package of npm, or that skips the hooks. */
function toolingDenial(facts: ShellFacts, ctx: GuardContext): GuardDecision | undefined {
  const t = (es: string, en: string) => (ctx.lang === "es" ? es : en);
  if (facts.unscopedNpx) {
    return deny(
      "package",
      t(
        "`npx specty` instala otro paquete de npm, no Specty.",
        "`npx specty` installs an unrelated npm package, not Specty.",
      ),
      t("usa `npx -y @baquia-dev/specty <comando>`.", "use `npx -y @baquia-dev/specty <command>`."),
    );
  }
  if (!facts.bypass) return undefined;
  return deny(
    "bypass",
    t(
      "No se permite saltarse los hooks (`--no-verify`, `core.hooksPath`, `HUSKY=0`…).",
      "Skipping hooks is not allowed (`--no-verify`, `core.hooksPath`, `HUSKY=0`…).",
    ),
    t(`sigue el flujo: \`${ctx.command} next\`.`, `follow the flow: \`${ctx.command} next\`.`),
  );
}

/**
 * The ways of waiting for the person that do not hold: `specty wait` in the foreground of a tool
 * that can run it in the background, and `sleep` while the change waits for the person.
 */
function waitDenial(facts: ShellFacts, ctx: GuardContext): GuardDecision | undefined {
  if (facts.background === false && facts.specty.includes("wait")) {
    const denial = foregroundWaitDenial(ctx);
    return deny("wait", denial.reason, denial.next);
  }
  const { change } = ctx;
  if (facts.sleeps !== true || change?.waiting !== true) return undefined;
  const denial = sleepDenial(change.id, ctx);
  return deny("wait", denial.reason, denial.next);
}

/**
 * A git command that writes, deletes, pushes or checks out the branch of Specty's memory: only
 * the `specty memory` commands write it, and pushing it is the person's call (ADR 0016).
 */
function memoryDenial(refs: readonly string[], ctx: GuardContext): GuardDecision | undefined {
  const { branch } = ctx.config.memory;
  if (!refs.some((ref) => ref === branch || ref === EVERY_BRANCH)) return undefined;
  const t = (es: string, en: string) => (ctx.lang === "es" ? es : en);
  const memory = `\`${ctx.command} memory\``;
  return deny(
    "memory",
    t(
      `La rama \`${branch}\` es la memoria de Specty: solo la escriben los comandos de ${memory}.`,
      `The \`${branch}\` branch is Specty's memory: only the ${memory} commands write it.`,
    ),
    t(
      `anota con \`${ctx.command} memory add\`, marca hecho con \`${ctx.command} memory done\` o propón descartar con \`${ctx.command} memory drop\`; subir la rama es cosa de la persona.`,
      `add with \`${ctx.command} memory add\`, mark done with \`${ctx.command} memory done\` or propose dropping with \`${ctx.command} memory drop\`; pushing the branch is the person's call.`,
    ),
  );
}

/**
 * Each path a command or an edit writes or deletes, after those inside a ghost folder and those
 * inside other worktrees.
 */
function decideFiles(
  files: Pick<ShellFacts, "writes" | "deletes" | "foreign" | "ghosts">,
  ctx: GuardContext,
): GuardDecision {
  return (
    denyGhost(files.ghosts, ctx) ??
    denyForeign(files.foreign, ctx) ??
    firstDenial([
      ...files.writes.map((path) => decidePath(path, "write", ctx)),
      ...files.deletes.map((path) => decidePath(path, "delete", ctx)),
    ])
  );
}

function decidePath(path: string, mode: "write" | "delete", ctx: GuardContext): GuardDecision {
  const { change } = ctx;
  if (change !== undefined && path === change.specPath) {
    const denial = specDenial(change, mode, ctx.lang, ctx.command);
    return denial === undefined ? ALLOW : deny("spec", denial.reason, denial.next);
  }
  const managed = protectedDenial(path, ctx.lang, ctx.command);
  if (managed !== undefined) return deny("protected", managed.reason, managed.next);
  return isGoverned(path, ctx.config) ? decideGoverned(path, ctx) : ALLOW;
}

/** Governed code: only with a change implementing, or bringing in its target. */
function decideGoverned(path: string, ctx: GuardContext): GuardDecision {
  const t = (es: string, en: string) => (ctx.lang === "es" ? es : en);
  const { change } = ctx;
  if (change === undefined) {
    return deny(
      "no-change",
      t(
        `No hay un cambio activo y \`${path}\` es código gobernado: primero va la spec.`,
        `There is no active change and \`${path}\` is governed code: the spec comes first.`,
      ),
      t(`ejecuta \`${ctx.command} next\`.`, `run \`${ctx.command} next\`.`),
    );
  }
  if (change.integration !== undefined) {
    const denial = integrationDenial(path, change.integration, ctx.config, ctx.lang, ctx.command);
    return denial === undefined ? ALLOW : deny("integration", denial.reason, denial.next);
  }
  if (change.locked?.includes(path) === true) {
    const denial = lockedDenial(path, change.task?.id, ctx.lang, ctx.command);
    return deny("locked", denial.reason, denial.next);
  }
  if (change.phase === "testing") {
    const denial = testingDenial(path, change.files ?? [], ctx.config, ctx.lang, ctx.command);
    return denial === undefined ? ALLOW : deny("phase", denial.reason, denial.next);
  }
  if (change.phase !== "implementing") {
    return deny(
      "phase",
      t(
        `El cambio ${change.id} está en fase ${change.phase}: solo se toca código con la spec aprobada y una tarea activa.`,
        `Change ${change.id} is in the ${change.phase} phase: code is touched only with an approved spec and an active task.`,
      ),
      t(`ejecuta \`${ctx.command} next\`.`, `run \`${ctx.command} next\`.`),
    );
  }
  return decideTaskScope(path, change, ctx);
}

/** While implementing: within the active task's scope, or a request to widen it. */
function decideTaskScope(path: string, change: GuardChange, ctx: GuardContext): GuardDecision {
  const t = (es: string, en: string) => (ctx.lang === "es" ? es : en);
  const task = change.task;
  if (task === undefined) {
    return deny(
      "no-task",
      t("No hay una tarea activa.", "There is no active task."),
      t(
        `ejecuta \`${ctx.command} next\` para activar la siguiente.`,
        `run \`${ctx.command} next\` to activate the next one.`,
      ),
    );
  }
  const verdict = classifyPath(path, {
    taskFiles: task.files,
    extras: task.extras,
    rules: scopeRulesFrom(ctx.config),
  });
  if (verdict !== "out-of-scope") return ALLOW;
  return deny(
    "scope",
    t(
      `\`${path}\` está fuera del alcance de ${task.id}.`,
      `\`${path}\` is outside the scope of ${task.id}.`,
    ),
    t(
      `trabaja dentro del alcance o pídelo con \`${ctx.command} scope add ${path} --task ${task.id} --reason "<motivo>"\`.`,
      `stay within the scope or request it with \`${ctx.command} scope add ${path} --task ${task.id} --reason "<reason>"\`.`,
    ),
  );
}

function firstDenial(decisions: readonly GuardDecision[]): GuardDecision {
  return decisions.find((decision) => !decision.allow) ?? ALLOW;
}

function deny(rule: GuardRule, reason: string, next: string): GuardDecision {
  return { allow: false, rule, reason, next };
}
