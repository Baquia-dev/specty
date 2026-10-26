// SPDX-License-Identifier: Apache-2.0
import { type Phase, phasePermissions } from "../flow/phases";
import { matchesAny } from "../glob";
import type { Lang } from "../i18n";
import type { ResolvedConfig } from "../schema/config";
import { isGoverned } from "../scope/governed";
import { classifyPath, scopeRulesFrom } from "../scope/scope";
import type { ChangeKind } from "../spec/model";
import { humanDenial } from "./human";
import { commitNext, type GuardIntegration, integrationDenial } from "./integration";
import { type BoundSession, sessionDenial } from "./session";
import { type ForeignPath, foreignDenial } from "./worktrees";

export { HUMAN_COMMANDS } from "./human";

/** Files only Specty writes; editing them by hand would bypass the flow. */
const PROTECTED: readonly string[] = [
  ".specty/config.yaml",
  ".specty/archive/**",
  ".specty/changes/*/state.json",
  ".specty/changes/*/audit.jsonl",
  ".specty/changes/*/comments.json",
  ".specty/changes/*/revisions/**",
  ".specty/changes/*/reviews/**",
  ".git/**",
  ".claude/settings.json",
  ".claude/settings.local.json",
  ".cursor/hooks.json",
  ".codex/hooks.json",
  ".codex/rules/specty.rules",
  ".opencode/plugins/specty.js",
  ".husky/pre-commit",
  ".husky/prepare-commit-msg",
  "lefthook.yml",
  "lefthook.yaml",
  ".lefthook.yml",
  ".lefthook.yaml",
];

export interface GuardChange {
  readonly id: string;
  readonly kind: ChangeKind;
  readonly phase: Phase;
  readonly closingSubmitted: boolean;
  /** Repository-relative path of the change's `spec.md`. */
  readonly specPath: string;
  readonly task?: {
    readonly id: string;
    readonly files: readonly string[];
    readonly extras: readonly string[];
  };
  /** A pending incorporation of the main branch: it alone decides about code, in any phase. */
  readonly integration?: GuardIntegration;
}

export interface GuardContext {
  readonly config: ResolvedConfig;
  readonly lang: Lang;
  readonly change?: GuardChange;
  /** How messages tell the agent to call Specty, for example `specty`. */
  readonly command: string;
  /** The person delegated their decisions to the agent (ADR 0010): their commands are open. */
  readonly delegated?: boolean;
}

/** Facts about a shell command, with paths already relative to the repository root. */
export interface ShellFacts {
  readonly specty: readonly string[];
  readonly unscopedNpx: boolean;
  readonly bypass: boolean;
  /** Governed files that a `git commit` in the command would include. */
  readonly committedGoverned: readonly string[];
  readonly writes: readonly string[];
  readonly deletes: readonly string[];
  /** What the command would change inside another worktree of the repository. */
  readonly foreign?: readonly ForeignPath[];
}

export type GuardAction =
  | {
      readonly kind: "write" | "delete";
      readonly paths: readonly string[];
      /** Paths inside another worktree of the repository, kept apart from `paths`. */
      readonly foreign?: readonly ForeignPath[];
    }
  | { readonly kind: "shell"; readonly facts: ShellFacts }
  /** An edit that writes and deletes files at once, such as a patch (Codex, OpenCode). */
  | ({ readonly kind: "files" } & Pick<ShellFacts, "writes" | "deletes" | "foreign">)
  /**
   * The session moves into the worktree `target`, bound or not to another one. `epic` is the epic
   * of the open change in `target`, when that change is one of its slices.
   */
  | {
      readonly kind: "enter";
      readonly target: string;
      readonly bound?: BoundSession;
      readonly epic?: string;
    }
  | { readonly kind: "other" };

/** The rule behind a denial, so a caller can pick the next step (`scope add` only for `scope`). */
export type GuardRule =
  | "human"
  | "package"
  | "bypass"
  | "commit"
  | "protected"
  | "spec"
  | "no-change"
  | "phase"
  | "no-task"
  | "scope"
  | "worktree"
  | "integration"
  | "session";

export type GuardDecision =
  | { readonly allow: true }
  | {
      readonly allow: false;
      readonly rule: GuardRule;
      readonly reason: string;
      readonly next: string;
    };

const ALLOW: GuardDecision = { allow: true };

/** Decides whether an agent action respects the flow. Paths are repository-relative. */
export function decideGuard(action: GuardAction, ctx: GuardContext): GuardDecision {
  if (action.kind === "other") return ALLOW;
  if (action.kind === "shell") return decideShell(action.facts, ctx);
  if (action.kind === "files") return decideFiles(action, ctx);
  if (action.kind === "enter") {
    const denial = sessionDenial(action.bound, action.target, ctx.lang, ctx.command, action.epic);
    return denial === undefined ? ALLOW : deny("session", denial.reason, denial.next);
  }
  return (
    denyForeign(action.foreign, ctx) ??
    firstDenial(action.paths.map((path) => decidePath(path, action.kind, ctx)))
  );
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
  if (facts.bypass) {
    return deny(
      "bypass",
      t(
        "No se permite saltarse los hooks (`--no-verify`, `core.hooksPath`, `HUSKY=0`…).",
        "Skipping hooks is not allowed (`--no-verify`, `core.hooksPath`, `HUSKY=0`…).",
      ),
      t(`sigue el flujo: \`${ctx.command} next\`.`, `follow the flow: \`${ctx.command} next\`.`),
    );
  }
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

/** Each path a command or an edit writes or deletes, after those inside other worktrees. */
function decideFiles(
  files: Pick<ShellFacts, "writes" | "deletes" | "foreign">,
  ctx: GuardContext,
): GuardDecision {
  return (
    denyForeign(files.foreign, ctx) ??
    firstDenial([
      ...files.writes.map((path) => decidePath(path, "write", ctx)),
      ...files.deletes.map((path) => decidePath(path, "delete", ctx)),
    ])
  );
}

function decidePath(path: string, mode: "write" | "delete", ctx: GuardContext): GuardDecision {
  const t = (es: string, en: string) => (ctx.lang === "es" ? es : en);
  const { change } = ctx;
  if (change !== undefined && path === change.specPath) return decideSpec(change, mode, ctx);
  if (matchesAny(path, PROTECTED) || path.startsWith(".specty/")) {
    return deny(
      "protected",
      t(
        `\`${path}\` lo gestiona Specty; no se edita a mano.`,
        `\`${path}\` is managed by Specty; do not edit it by hand.`,
      ),
      t(
        `usa los comandos de Specty: \`${ctx.command} next\`.`,
        `use Specty's commands: \`${ctx.command} next\`.`,
      ),
    );
  }
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

function decideSpec(
  change: GuardChange,
  mode: "write" | "delete",
  ctx: GuardContext,
): GuardDecision {
  const t = (es: string, en: string) => (ctx.lang === "es" ? es : en);
  const access = phasePermissions(change.phase, change.closingSubmitted).spec;
  if (mode === "write" && access !== "locked") return ALLOW;
  const implementing = change.phase === "implementing";
  return deny(
    "spec",
    implementing
      ? t(
          "La spec está aprobada y bloqueada mientras se implementa.",
          "The spec is approved and locked while it is implemented.",
        )
      : t(
          `La spec está bloqueada en la fase ${change.phase}.`,
          `The spec is locked in the ${change.phase} phase.`,
        ),
    implementing
      ? t(
          `si necesitas otro archivo usa \`${ctx.command} scope add\`; si el plan debe cambiar, díselo al usuario.`,
          `if you need another file use \`${ctx.command} scope add\`; if the plan must change, tell the user.`,
        )
      : t(`ejecuta \`${ctx.command} next\`.`, `run \`${ctx.command} next\`.`),
  );
}

function firstDenial(decisions: readonly GuardDecision[]): GuardDecision {
  return decisions.find((decision) => !decision.allow) ?? ALLOW;
}

function deny(rule: GuardRule, reason: string, next: string): GuardDecision {
  return { allow: false, rule, reason, next };
}
