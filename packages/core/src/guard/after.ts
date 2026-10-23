// SPDX-License-Identifier: Apache-2.0
import { lookup } from "../lookup";
import { decideGuard, type GuardContext, type GuardDecision, type GuardRule } from "./decide";

/**
 * The files that differ from `HEAD` around a shell command, each with a fingerprint of what is on
 * disk (size and modification time, for example), or `DELETED` when the file was removed.
 */
export type ShellSnapshot = Readonly<Record<string, string>>;

/** Fingerprint of a file removed from the working tree. */
export const DELETED = "deleted";

/** What a shell command wrote and removed. */
export interface ShellChanges {
  readonly writes: readonly string[];
  readonly deletes: readonly string[];
}

/**
 * Files whose fingerprint changed during the command: new, modified or removed. A file that was
 * already changed and that the command left alone keeps its fingerprint, so it does not count.
 */
export function shellChanges(before: ShellSnapshot, after: ShellSnapshot): ShellChanges {
  const changed = Object.entries(after).filter(([path, print]) => lookup(before, path) !== print);
  return {
    writes: changed.filter(([, print]) => print !== DELETED).map(([path]) => path),
    deletes: changed.filter(([, print]) => print === DELETED).map(([path]) => path),
  };
}

interface Denial {
  readonly path: string;
  readonly rule: GuardRule;
  readonly reason: string;
}

/**
 * Judges what a shell command changed with the guard's own rules, as if the agent had written
 * those files, and gathers the denials in one warning: the command has already run.
 */
export function decideAfterShell(changes: ShellChanges, ctx: GuardContext): GuardDecision {
  const judged = [
    ...changes.writes.map((path) => ({
      path,
      decision: decideGuard({ kind: "write", paths: [path] }, ctx),
    })),
    ...changes.deletes.map((path) => ({
      path,
      decision: decideGuard({ kind: "delete", paths: [path] }, ctx),
    })),
  ];
  const denials = judged.flatMap(({ path, decision }): Denial[] =>
    decision.allow ? [] : [{ path, rule: decision.rule, reason: decision.reason }],
  );
  const [first] = denials;
  if (first === undefined) return { allow: true };
  const t = (es: string, en: string) => (ctx.lang === "es" ? es : en);
  const scoped = denials.filter((denial) => denial.rule === "scope").map((denial) => denial.path);
  const request = `${ctx.command} scope add ${scoped.join(" ")} --task ${ctx.change?.task?.id ?? "<T>"}`;
  return {
    allow: false,
    rule: first.rule,
    reason: [
      t(
        "El comando cambió lo que el flujo no permite ahora:",
        "The command changed what the flow does not allow right now:",
      ),
      ...denials.map((denial) => `  ${denial.reason}`),
    ].join("\n"),
    next:
      scoped.length > 0
        ? t(
            `revísalos antes de tocarlos: si son tuyos y no los necesitas, deshazlos; si los necesitas, pide ampliar el alcance con \`${request} --reason "<motivo>"\`.`,
            `check them before touching them: if they are yours and you do not need them, undo them; if you need them, request the scope with \`${request} --reason "<reason>"\`.`,
          )
        : t(
            `revísalos antes de tocarlos: si son tuyos, deshazlos y ejecuta \`${ctx.command} next\`.`,
            `check them before touching them: if they are yours, undo them and run \`${ctx.command} next\`.`,
          ),
  };
}
