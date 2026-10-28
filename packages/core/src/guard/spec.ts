// SPDX-License-Identifier: Apache-2.0
import { type Phase, phasePermissions } from "../flow/phases";
import { matchesAny } from "../glob";
import type { Lang } from "../i18n";

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

/** Why a denial: what is wrong and what to do. */
interface Denial {
  readonly reason: string;
  readonly next: string;
}

/** Why `path` may not be edited by hand: Specty manages it. Undefined when it may. */
export function protectedDenial(path: string, lang: Lang, command: string): Denial | undefined {
  if (!matchesAny(path, PROTECTED) && !path.startsWith(".specty/")) return undefined;
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
 * Why the change's `spec.md` may not be written or deleted in its phase (ARCHITECTURE §4).
 * Undefined when it may.
 */
export function specDenial(
  change: { readonly phase: Phase; readonly closingSubmitted: boolean },
  mode: "write" | "delete",
  lang: Lang,
  command: string,
): Denial | undefined {
  const access = phasePermissions(change.phase, change.closingSubmitted).spec;
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
