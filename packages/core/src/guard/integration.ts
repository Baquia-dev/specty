// SPDX-License-Identifier: Apache-2.0
import type { Lang } from "../i18n";
import type { ResolvedConfig } from "../schema/config";
import { classifyPath, scopeRulesFrom } from "../scope/scope";

/** What the guard knows of a pending incorporation of the main branch (ARCHITECTURE §9). */
export interface GuardIntegration {
  /** The branch the change goes to. */
  readonly target: string;
  /** What either side changed since their common base. */
  readonly paths: readonly string[];
}

/**
 * Why a governed path may not change during a pending incorporation: only the files the merge
 * brings together are open, with their implicit tests and generated files, as in a task.
 * Undefined when the path is open.
 */
export function integrationDenial(
  path: string,
  integration: GuardIntegration,
  config: ResolvedConfig,
  lang: Lang,
  command: string,
): { readonly reason: string; readonly next: string } | undefined {
  const verdict = classifyPath(path, {
    taskFiles: integration.paths,
    extras: [],
    rules: scopeRulesFrom(config),
  });
  if (verdict !== "out-of-scope") return undefined;
  const t = (es: string, en: string) => (lang === "es" ? es : en);
  const { target } = integration;
  return {
    reason: t(
      `\`${path}\` queda fuera de la incorporación de ${target}: solo se tocan los archivos que cambiaron este cambio o ${target}.`,
      `\`${path}\` is outside the incorporation of ${target}: only the files this change or ${target} changed may be touched.`,
    ),
    next: commitNext({ integration }, lang, command),
  };
}

/** What replaces `git commit`: `task done`, or `integrate` while an incorporation is pending. */
export function commitNext(
  change: { readonly integration?: GuardIntegration; readonly task?: { readonly id: string } },
  lang: Lang,
  command: string,
): string {
  const t = (es: string, en: string) => (lang === "es" ? es : en);
  if (change.integration !== undefined) {
    return t(
      `resuelve la incorporación de ${change.integration.target} en los archivos que junta y ejecuta \`${command} integrate\`.`,
      `resolve the incorporation of ${change.integration.target} in the files it brings together and run \`${command} integrate\`.`,
    );
  }
  const task = change.task?.id ?? "<T>";
  return t(
    `ejecuta \`${command} task done ${task} --summary "<qué hiciste>"\`.`,
    `run \`${command} task done ${task} --summary "<what you did>"\`.`,
  );
}
