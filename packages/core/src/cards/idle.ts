// SPDX-License-Identifier: Apache-2.0
import { headerOf, type Output, section } from "../output";
import { COMMIT_TYPES } from "../spec/model";
import { translator } from "./text";
import type { CardContext } from "./view";

/**
 * `specty next` with no change active: code changed without a spec goes to a retro, a new project
 * starts with its skeleton, and otherwise the agent creates the change the user asks for.
 */
export function noChangeCard(dirty: readonly string[], ctx: CardContext, fresh: boolean): Output {
  if (dirty.length > 0) return withoutSpecCard(dirty, ctx);
  // ARCHITECTURE §14: the skeleton is the first change, standard, so the scaffolding is traced.
  return fresh ? skeletonCard(ctx) : idleCard(ctx);
}

/** Governed code changed with no change active: it is documented with a retro. */
function withoutSpecCard(dirty: readonly string[], ctx: CardContext): Output {
  const t = translator(ctx.lang);
  return {
    status: "blocked",
    header: headerOf(),
    blocks: section(t("CAMBIOS SIN SPEC", "CHANGES WITHOUT A SPEC"), dirty),
    next: t(
      `documéntalos: prepáralos con \`git add\` y ejecuta \`${ctx.command} retro\`.`,
      `document them: stage them with \`git add\` and run \`${ctx.command} retro\`.`,
    ),
  };
}

function skeletonCard(ctx: CardContext): Output {
  const t = translator(ctx.lang);
  return {
    status: "ok",
    header: headerOf(),
    blocks: section(undefined, [
      t(
        "No hay un cambio activo, y es un proyecto nuevo: aún no hay código.",
        "There is no active change, and this is a new project: there is no code yet.",
      ),
      t(
        "El primer cambio es el esqueleto del proyecto, a partir de PRODUCT.md; si tiene preguntas sin responder, házselas antes al usuario.",
        "The first change is the project's skeleton, from PRODUCT.md; if it has unanswered questions, ask the user first.",
      ),
    ]),
    next: t(
      `ejecuta \`${ctx.command} new "Esqueleto del proyecto" --request "<petición literal del usuario>"\`.`,
      `run \`${ctx.command} new "Project skeleton" --request "<the user's literal request>"\`.`,
    ),
  };
}

function idleCard(ctx: CardContext): Output {
  const t = translator(ctx.lang);
  return {
    status: "ok",
    header: headerOf(),
    blocks: section(undefined, [
      t("No hay un cambio activo.", "There is no active change."),
      t(
        "Si el usuario pidió crear o modificar código, primero va la spec.",
        "If the user asked to create or modify code, the spec comes first.",
      ),
      t(
        "Para leer, explicar o investigar código no necesitas Specty.",
        "Reading, explaining or exploring code does not need Specty.",
      ),
    ]),
    next: ctx.branchTypes === true ? typedNewNext(ctx) : untypedNewNext(ctx),
  };
}

function untypedNewNext(ctx: CardContext): string {
  return translator(ctx.lang)(
    `ejecuta \`${ctx.command} new "<título>" --request "<petición literal del usuario>"\` ${quickHint(ctx)}.`,
    `run \`${ctx.command} new "<title>" --request "<the user's literal request>"\` ${quickHint(ctx)}.`,
  );
}

/** With a `git.flow` that names the branches by type, the agent says what the change is. */
function typedNewNext(ctx: CardContext): string {
  const t = translator(ctx.lang);
  const types = (last: string) =>
    `${COMMIT_TYPES.slice(0, -1).join(", ")} ${last} ${COMMIT_TYPES.at(-1) ?? ""}`;
  return t(
    `ejecuta \`${ctx.command} new "<título>" --type <tipo> --request "<petición literal del usuario>"\`, con el tipo de commit que es el cambio, que nombra su rama: ${types("o")} ${quickHint(ctx)}.`,
    `run \`${ctx.command} new "<title>" --type <type> --request "<the user's literal request>"\`, with the commit type the change is, which names its branch: ${types("or")} ${quickHint(ctx)}.`,
  );
}

function quickHint(ctx: CardContext): string {
  return translator(ctx.lang)(
    `(añade \`--kind quick\` si son hasta ${ctx.quickMaxFiles} archivos de código sin rutas sensibles)`,
    `(add \`--kind quick\` for up to ${ctx.quickMaxFiles} code files without sensitive paths)`,
  );
}
