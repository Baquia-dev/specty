// SPDX-License-Identifier: Apache-2.0
import { closingInAcceptance, type Phase, phasePermissions } from "../flow/phases";
import { matchesAny } from "../glob";
import type { Lang } from "../i18n";
import type { ChangeKind } from "../spec/model";

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
  ".agents/hooks.json",
  ".gemini/settings.json",
  ".devin/hooks.v1.json",
  ".husky/pre-commit",
  ".husky/prepare-commit-msg",
  "lefthook.yml",
  "lefthook.yaml",
  ".lefthook.yml",
  ".lefthook.yaml",
];

/** Why a denial: what is wrong and what to do. */
interface Denial {
  readonly reason: string;
  readonly next: string;
}

/**
 * True when Specty manages `path`, so the guard does not let an agent edit it: only the person,
 * or Specty's commands, change it. The change's own spec is the exception, which the guard decides
 * by phase before this.
 */
export function managedBySpecty(path: string): boolean {
  return matchesAny(path, PROTECTED) || path.startsWith(".specty/");
}

/** Why `path` may not be edited by hand: Specty manages it. Undefined when it may. */
export function protectedDenial(path: string, lang: Lang, command: string): Denial | undefined {
  if (!managedBySpecty(path)) return undefined;
  const t = (es: string, en: string) => (lang === "es" ? es : en);
  return {
    reason: t(
      `\`${path}\` lo gestiona Specty; no se edita a mano.`,
      `\`${path}\` is managed by Specty; do not edit it by hand.`,
    ),
    next: t(
      `usa los comandos de Specty: \`${command} next\`.`,
      `use Specty's commands: \`${command} next\`.`,
    ),
  };
}

/**
 * Why the change's `spec.md` may not be written or deleted in its phase (ARCHITECTURE §4), with
 * delegated mode on or off (`delegated`). Undefined when it may.
 */
export function specDenial(
  change: { readonly phase: Phase; readonly kind: ChangeKind; readonly closingSubmitted: boolean },
  mode: "write" | "delete",
  {
    lang,
    command,
    delegated,
  }: { readonly lang: Lang; readonly command: string; readonly delegated: boolean },
): Denial | undefined {
  const ahead = closingInAcceptance(change.kind, delegated);
  const access = phasePermissions(change.phase, change.closingSubmitted, false, ahead).spec;
  if (mode === "write" && access !== "locked") return undefined;
  const t = (es: string, en: string) => (lang === "es" ? es : en);
  if (change.phase === "implementing") {
    return {
      reason: t(
        "La spec está aprobada y bloqueada mientras se implementa.",
        "The spec is approved and locked while it is implemented.",
      ),
      next: t(
        `si necesitas otro archivo usa \`${command} scope add\`; si el plan debe cambiar, díselo al usuario.`,
        `if you need another file use \`${command} scope add\`; if the plan must change, tell the user.`,
      ),
    };
  }
  return {
    reason: t(
      `La spec está bloqueada en la fase ${change.phase}.`,
      `The spec is locked in the ${change.phase} phase.`,
    ),
    next: t(`ejecuta \`${command} next\`.`, `run \`${command} next\`.`),
  };
}
