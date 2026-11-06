// SPDX-License-Identifier: Apache-2.0
import { headerOf, type Output, type OutputBlock, section } from "../output";
import { COMMIT_TYPES } from "../spec/model";
import { inItsFolder, launchedWith, numbered, toSubagents } from "./subagents";
import { translator } from "./text";
import type { CardContext } from "./view";

/**
 * `specty next` with no change active: code changed without a spec goes to a retro, a new project
 * starts with its skeleton, and otherwise the agent creates the change the user asks for, or,
 * when its tool hands work to subagents, launches one per change with its brief.
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
  const lines = section(undefined, [
    t("No hay un cambio activo.", "There is no active change."),
    t(
      "Si el usuario pidió crear o modificar código, primero va la spec.",
      "If the user asked to create or modify code, the spec comes first.",
    ),
    t(
      "Para leer, explicar o investigar código no necesitas Specty.",
      "Reading, explaining or exploring code does not need Specty.",
    ),
  ]);
  if (toSubagents(ctx)) {
    return {
      status: "ok",
      header: headerOf(),
      blocks: [...lines, ...changeBrief(ctx)],
      next: subagentsNext(ctx),
    };
  }
  return {
    status: "ok",
    header: headerOf(),
    blocks: lines,
    next: ctx.branchTypes === true ? typedNewNext(ctx) : untypedNewNext(ctx),
  };
}

/**
 * The brief a subagent gets as is to carry a change the user asked for, from its spec to its
 * closing, as a session of its own would; the session puts its title and request in the markers.
 */
function changeBrief(ctx: CardContext): OutputBlock[] {
  const t = translator(ctx.lang);
  const { command } = ctx;
  const type = ctx.branchTypes === true ? t(" --type <tipo>", " --type <type>") : "";
  return section(t("ENCARGO", "BRIEF"), [
    t(
      "Haz el cambio que pidió el usuario, de su spec a su cierre, sin lanzar otros subagentes:",
      "Do the change the user asked for, from its spec to its closing, without launching other subagents:",
    ),
    ...numbered([
      t(
        `\`${command} new "<título>"${type} --request "<petición literal del usuario>" --subagent\``,
        `\`${command} new "<title>"${type} --request "<the user's literal request>" --subagent\``,
      ),
      t(
        `\`${command} enter <id>\`, con el id que te dé \`new\`.`,
        `\`${command} enter <id>\`, with the id \`new\` gives you.`,
      ),
      ...inItsFolder(t("<carpeta del cambio>", "<change folder>"), ctx, [
        t(
          "Si para la spec te falta una respuesta del usuario, no la supongas: detente y responde con la pregunta.",
          "If the spec needs an answer from the user, do not assume it: stop and answer with the question.",
        ),
        // An epic's card asks to launch subagents, which this brief forbids: the session makes it.
        t(
          "Si `propose` dice que el cambio es demasiado grande y pide dividirlo en una épica, no lo conviertas tú: detente y responde con eso, que la épica la hace la sesión principal en tu cambio.",
          "If `propose` says the change is too large and asks to split it into an epic, do not turn it into one yourself: stop and answer with that, since the main session makes the epic in your change.",
        ),
      ]),
    ]),
  ]);
}

/**
 * One subagent per change the user asked for, in parallel, while the session stays where it is:
 * it creates an epic itself, also from the change of a subagent that came out too large once they
 * finish, and passes on to each subagent the user's answers.
 */
function subagentsNext(ctx: CardContext): string {
  const t = translator(ctx.lang);
  const how = launchedWith(ctx, "change");
  const typed =
    ctx.branchTypes === true
      ? t(
          `, y en \`<tipo>\` el tipo de commit que es el cambio, que nombra su rama: ${commitTypes("o")}`,
          `, and in \`<type>\` the commit type the change is, which names its branch: ${commitTypes("or")}`,
        )
      : "";
  return t(
    `lanza un subagente por cada cambio que pidió el usuario, con el encargo tal cual${how}, y pon en él su título y su petición literal en lugar de \`<título>\` y \`<petición literal del usuario>\`${typed} ${quickHint(ctx)}; si son varios, lánzalos en paralelo, en un solo mensaje. No entres en sus carpetas, y una épica créala tú aquí, sin subagente. Si uno vuelve con una pregunta, házsela al usuario y pásale la respuesta (en Claude Code, con \`SendMessage\`). Cuando terminen, si uno volvió porque su cambio es demasiado grande, entra tú en él (\`${ctx.command} enter <id>\`) y conviértelo allí en la épica; si no, vuelve a ejecutar \`${ctx.command} next\` aquí.`,
    `launch one subagent per change the user asked for, with the brief as is${how}, putting in it its title and literal request in place of \`<title>\` and \`<the user's literal request>\`${typed} ${quickHint(ctx)}; if there are several, launch them in parallel, in a single message. Do not enter their folders, and create an epic yourself here, without a subagent. If one comes back with a question, ask the user and pass it the answer (in Claude Code, with \`SendMessage\`). Once they finish, if one came back because its change is too large, enter it yourself (\`${ctx.command} enter <id>\`) and turn it into the epic there; otherwise, run \`${ctx.command} next\` again here.`,
  );
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
  return t(
    `ejecuta \`${ctx.command} new "<título>" --type <tipo> --request "<petición literal del usuario>"\`, con el tipo de commit que es el cambio, que nombra su rama: ${commitTypes("o")} ${quickHint(ctx)}.`,
    `run \`${ctx.command} new "<title>" --type <type> --request "<the user's literal request>"\`, with the commit type the change is, which names its branch: ${commitTypes("or")} ${quickHint(ctx)}.`,
  );
}

/** The commit types a change's branch can be named by, the last one after `last` («o», "or"). */
const commitTypes = (last: string) =>
  `${COMMIT_TYPES.slice(0, -1).join(", ")} ${last} ${COMMIT_TYPES.at(-1) ?? ""}`;

function quickHint(ctx: CardContext): string {
  return translator(ctx.lang)(
    `(añade \`--kind quick\` si son hasta ${ctx.quickMaxFiles} archivos de código sin rutas sensibles)`,
    `(add \`--kind quick\` for up to ${ctx.quickMaxFiles} code files without sensitive paths)`,
  );
}
