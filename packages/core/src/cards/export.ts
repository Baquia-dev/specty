// SPDX-License-Identifier: Apache-2.0
import { headerOf, type Output, section } from "../output";
import { blockedCard } from "./flow";
import { translator } from "./text";
import type { CardContext } from "./view";

// The texts of `specty export`: a change's spec in another tool's format (formats.md §10).

/** Why `specty export` writes nothing. */
export type ExportRefusal =
  | { readonly reason: "no-format" }
  | { readonly reason: "unknown-format"; readonly format: string }
  /** No change is named and none is active here; `format` is the one asked for. */
  | { readonly reason: "no-active"; readonly format: string }
  | { readonly reason: "no-change"; readonly id: string; readonly format: string };

export function exportRefusalCard(refusal: ExportRefusal, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  const { command } = ctx;
  const refuse = (reason: string, next: string): Output => ({
    ...blockedCard(headerOf("export"), reason, next),
    status: "invalid",
  });
  switch (refusal.reason) {
    case "no-format":
    case "unknown-format":
      return refuse(
        refusal.reason === "no-format"
          ? t("Falta el formato.", "The format is missing.")
          : t(
              `No conozco el formato ${refusal.format}.`,
              `I do not know the format ${refusal.format}.`,
            ),
        t(
          `elige uno: \`${command} export --to openspec\`, \`--to speckit\` o \`--to kiro\`.`,
          `choose one: \`${command} export --to openspec\`, \`--to speckit\` or \`--to kiro\`.`,
        ),
      );
    case "no-active":
    case "no-change":
      return refuse(
        refusal.reason === "no-active"
          ? t(
              "No hay un cambio activo en esta carpeta.",
              "There is no active change in this folder.",
            )
          : t(`No hay ningún cambio ${refusal.id}.`, `There is no change ${refusal.id}.`),
        t(
          `di cuál con \`${command} export <id> --to ${refusal.format}\`.`,
          `name it with \`${command} export <id> --to ${refusal.format}\`.`,
        ),
      );
  }
}

/** The files written, in `format` (its own name), inside `folder` as the person reads it. */
export function exportedCard(
  format: string,
  folder: string,
  files: readonly string[],
  ctx: CardContext,
): Output {
  const t = translator(ctx.lang);
  return {
    status: "ok",
    header: headerOf("export"),
    blocks: section(t(`EN ${format}, EN ${folder}`, `IN ${format}, IN ${folder}`), files),
    next: t(
      "revísalos y cópialos donde los espere la herramienta; con `--out .` se escriben en la raíz del repositorio.",
      "check them and copy them where the tool expects them; with `--out .` they go to the repository's root.",
    ),
  };
}
