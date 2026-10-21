// SPDX-License-Identifier: Apache-2.0
import type { Lang } from "../i18n";
import { translator } from "./text";

export interface BlockedCommitView {
  readonly paths: readonly string[];
  /** Active change whose scope the paths fall outside of, if any. */
  readonly change?: string;
  readonly minimalAllowed: boolean;
  readonly command: string;
}

/** Message printed by the pre-commit hook when a commit carries code without a spec. */
export function blockedCommitMessage(view: BlockedCommitView, lang: Lang): string {
  const t = translator(lang);
  const lead =
    view.change === undefined
      ? t(
          "specty: este commit incluye código gobernado sin una spec aprobada:",
          "specty: this commit includes governed code without an approved spec:",
        )
      : t(
          `specty: este commit incluye código fuera del alcance de ${view.change}:`,
          `specty: this commit includes code outside the scope of ${view.change}:`,
        );
  const minimal = view.minimalAllowed
    ? [
        t(
          `  • O documéntalo tú mismo: ${view.command} retro --minimal`,
          `  • Or document it yourself: ${view.command} retro --minimal`,
        ),
      ]
    : [];
  return [
    lead,
    ...view.paths.map((path) => `  - ${path}`),
    "",
    t("Para documentarlo:", "To document it:"),
    t(
      "  • Pídele a tu agente: «Documenta los cambios preparados con specty retro».",
      '  • Ask your agent: "Document the staged changes with specty retro".',
    ),
    ...minimal,
    t("Después repite git commit.", "Then run git commit again."),
  ].join("\n");
}
