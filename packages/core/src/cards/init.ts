// SPDX-License-Identifier: Apache-2.0
import { AGENT_NAMES, type AgentTool } from "../agents";
import { GIT_FLOWS } from "../branches";
import type { Lang } from "../i18n";
import { headerOf, type Output, section } from "../output";
import { type ExclusionView, exclusionsBlock } from "./exclusions";
import { blockedCard } from "./flow";
import { translator } from "./text";
import type { CardContext } from "./view";

// The texts of `specty init`: what it refuses, what it did with each file, and its dry run.

/** Why `specty init` installs nothing. */
export type InitRefusal =
  | { readonly reason: "no-git" }
  /** `.specty/config.yaml` exists and is not valid: `issues` says why. */
  | { readonly reason: "invalid-config"; readonly issues: string }
  /** `--git-flow` names no flow of `GIT_FLOWS`. */
  | { readonly reason: "unknown-flow"; readonly flow: string }
  /** `--tools` names `tools`, as typed, that this version does not offer: only the `offered`. */
  | {
      readonly reason: "unavailable-tools";
      readonly tools: readonly string[];
      readonly offered: readonly AgentTool[];
    };

export function initRefusalCard(refusal: InitRefusal, lang: Lang): Output {
  const t = translator(lang);
  switch (refusal.reason) {
    case "no-git":
      return blockedCard(
        headerOf("init"),
        t("Esto no es un repositorio git.", "This is not a git repository."),
        t("ejecuta `git init` y vuelve a intentarlo.", "run `git init` and try again."),
      );
    case "invalid-config":
      return blockedCard(
        headerOf("init"),
        t(
          `.specty/config.yaml no es válido: ${refusal.issues}`,
          `.specty/config.yaml is invalid: ${refusal.issues}`,
        ),
        t("corrígelo y vuelve a ejecutar `specty init`.", "fix it and run `specty init` again."),
      );
    case "unknown-flow":
      return {
        ...blockedCard(
          headerOf("init"),
          t(`Flujo de git desconocido: ${refusal.flow}.`, `Unknown git flow: ${refusal.flow}.`),
          t(
            `usa \`--git-flow ${GIT_FLOWS.join("|")}\`.`,
            `use \`--git-flow ${GIT_FLOWS.join("|")}\`.`,
          ),
        ),
        status: "invalid",
      };
    case "unavailable-tools":
      return { ...unavailableTools(refusal, lang), status: "invalid" };
  }
}

/**
 * `--tools` named agents this version does not offer: which ones, the agents it does offer, that
 * the others come later, and the values `--tools` takes.
 */
function unavailableTools(
  refusal: { readonly tools: readonly string[]; readonly offered: readonly AgentTool[] },
  lang: Lang,
): Output {
  const t = translator(lang);
  const named = refusal.tools.map((tool) => `\`${tool}\``).join(", ");
  const names = refusal.offered.map((tool) => AGENT_NAMES[tool]);
  const last = names.at(-1) ?? "";
  const listed = (and: string) =>
    names.length > 1 ? `${names.slice(0, -1).join(", ")} ${and} ${last}` : last;
  const values = refusal.offered.join(", ");
  return blockedCard(
    headerOf("init"),
    t(
      `Esta versión de Specty no ofrece ${named}: solo ${listed("y")}. Los demás agentes llegarán más adelante.`,
      `This version of Specty does not offer ${named}: only ${listed("and")}. The other agents will come later.`,
    ),
    t(
      `usa \`--tools\` con alguna de estas herramientas, separadas por comas: ${values}.`,
      `use \`--tools\` with any of these tools, separated by commas: ${values}.`,
    ),
  );
}

/** Git Flow's `develop` did not exist: `init` made it from `from`. */
export function developLine(from: string, lang: Lang): string {
  return translator(lang)(
    `Rama develop creada desde ${from}: ahí empiezan y terminan los cambios.`,
    `Branch develop created from ${from}: changes start from it and go to it.`,
  );
}

/** What `init` did with `.specty/config.yaml`: created it, added the keys it lacked, or left it. */
export function configLine(created: boolean, added: readonly string[], lang: Lang): string {
  const t = translator(lang);
  if (created) return t(".specty/config.yaml creado.", ".specty/config.yaml created.");
  return added.length > 0
    ? t(
        `.specty/config.yaml: añadido ${added.join(" y ")}; lo demás no se tocó.`,
        `.specty/config.yaml: added ${added.join(" and ")}; the rest was left untouched.`,
      )
    : t(
        ".specty/config.yaml ya existía; no se tocó.",
        ".specty/config.yaml already existed; left untouched.",
      );
}

/** `init --language` changed the language of an existing configuration. */
export function languageLine(lang: Lang): string {
  return translator(lang)(
    ".specty/config.yaml: Specty trabaja ahora en español.",
    ".specty/config.yaml: Specty now works in English.",
  );
}

export function agentsMdLine(created: boolean, lang: Lang): string {
  const t = translator(lang);
  return created
    ? t("AGENTS.md creado con los bloques de Specty.", "AGENTS.md created with Specty's blocks.")
    : t("AGENTS.md: bloques de Specty actualizados.", "AGENTS.md: Specty's blocks updated.");
}

/** The glossary of the domain, created with the hints of its format (formats.md §6). */
export function glossaryLine(path: string, lang: Lang): string {
  return translator(lang)(
    `Glosario del dominio creado con pistas: ${path}.`,
    `Domain glossary created with hints: ${path}.`,
  );
}

/** `.gitignore` ignores the changes' worktrees, inside the project (ADR 0018). */
export function worktreesIgnoreLine(lang: Lang): string {
  return translator(lang)(
    "`.gitignore` ignora `.worktrees/`, donde viven las carpetas de los cambios (ADR 0018).",
    "`.gitignore` ignores `.worktrees/`, where the changes' folders live (ADR 0018).",
  );
}

/** A new project's PRODUCT.md: from the person's answers, or with the questions to answer. */
export function productLine(interviewed: boolean, lang: Lang): string {
  const t = translator(lang);
  return interviewed
    ? t(
        "Proyecto nuevo: PRODUCT.md creado con tus respuestas.",
        "New project: PRODUCT.md created with your answers.",
      )
    : t(
        "Proyecto nuevo: PRODUCT.md creado con las preguntas por responder.",
        "New project: PRODUCT.md created with the questions to answer.",
      );
}

export function noTestCommandWarning(lang: Lang): string {
  return translator(lang)(
    "No se detectó un comando de tests: define verify.default en .specty/config.yaml.",
    "No test command detected: set verify.default in .specty/config.yaml.",
  );
}

/** Where `init` copied the files it changed, before changing them. */
export function backupLine(folder: string, lang: Lang): string {
  return translator(lang)(
    `Copia de lo que había antes: ${folder}.`,
    `Copy of what was there before: ${folder}.`,
  );
}

/** What `init` did and detected, for its card. */
export interface InitView {
  readonly done: readonly string[];
  /** The stacks and the commands it detected. */
  readonly detected: readonly string[];
  readonly warnings: readonly string[];
  /** The sections of AGENTS.md people complete by hand that are still empty, as written. */
  readonly unfilled: readonly string[];
  /** In a new project, how PRODUCT.md was written. */
  readonly product?: "interviewed" | "skeleton";
  /** A new project ended with no git flow: its next step chooses one. */
  readonly chooseFlow?: boolean;
  /** The tools at the root that will see what Specty writes, its changes' folder included. */
  readonly exclusions?: readonly ExclusionView[];
  /** Its commit failed and what it wrote was undone: the warnings say why. */
  readonly failed?: boolean;
  /** The units of `verify.units` it proposes, as YAML lines under `verify:`; the person adds them. */
  readonly units?: readonly string[];
}

/**
 * `specty init` done. Next comes AGENTS.md, or in a new project, its first change; if its commit
 * failed, running it again.
 */
export function initCard(view: InitView, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  return {
    status: view.failed === true ? "invalid" : "ok",
    header: headerOf("init"),
    blocks: [
      ...section(t("CONFIGURADO", "CONFIGURED"), view.done),
      ...section(t("DETECTADO", "DETECTED"), view.detected),
      ...section(t("AVISOS", "WARNINGS"), view.warnings),
      ...unitsBlock(view.units, ctx),
      ...exclusionsBlock(view.exclusions ?? [], ctx, "init"),
    ],
    next:
      view.failed === true
        ? t(
            `corrige lo que impidió el commit (en AVISOS) y vuelve a ejecutar \`${ctx.command} init\`.`,
            `fix what stopped the commit (under WARNINGS) and run \`${ctx.command} init\` again.`,
          )
        : view.product === undefined
          ? existingProjectNext(view.unfilled, ctx)
          : newProjectNext(view.product === "interviewed", ctx, view.chooseFlow === true),
  };
}

/** The proposed units, ready to paste, and who adds them: they replace `verify.full`. */
function unitsBlock(units: readonly string[] | undefined, ctx: CardContext) {
  if (units === undefined) return [];
  const t = translator(ctx.lang);
  return section(t("UNIDADES DE VERIFICACIÓN PROPUESTAS", "PROPOSED VERIFICATION UNITS"), [
    ...units,
    t(
      "Añádelas tú a `verify:` en .specty/config.yaml tras comprobar que entre todas ejecutan lo mismo que `verify.full`, al que reemplazan; Specty no las escribe.",
      "Add them yourself under `verify:` in .specty/config.yaml after checking that together they run what `verify.full` runs, which they replace; Specty does not write them.",
    ),
  ]);
}

/** What comes after `init` in a project that exists: the empty sections of AGENTS.md, if any. */
function existingProjectNext(unfilled: readonly string[], ctx: CardContext): string {
  const t = translator(ctx.lang);
  const review = t(
    `revisa .specty/config.yaml y ejecuta \`${ctx.command} doctor\`.`,
    `review .specty/config.yaml and run \`${ctx.command} doctor\`.`,
  );
  if (unfilled.length === 0) return review;
  const listed = (open: string, close: string, and: string) =>
    unfilled.map((title) => `${open}${title}${close}`).join(` ${and} `);
  const sections =
    unfilled.length === 1
      ? t(`la sección ${listed("«", "»", "y")}`, `the ${listed('"', '"', "and")} section`)
      : t(`las secciones ${listed("«", "»", "y")}`, `the ${listed('"', '"', "and")} sections`);
  return t(
    `completa ${sections} de AGENTS.md con lo que no se deduce del código, ${review}`,
    `complete ${sections} of AGENTS.md with what cannot be inferred from the code, ${review}`,
  );
}

/**
 * What comes after `init` in a new project, for whoever ran it; first, when it has no git flow
 * (`chooseFlow`), choosing one.
 */
export function newProjectNext(interviewed: boolean, ctx: CardContext, chooseFlow = false): string {
  const t = translator(ctx.lang);
  if (interviewed) {
    const first = t(
      "pídele a tu agente el primer cambio: el esqueleto del proyecto, a partir de PRODUCT.md.",
      "ask your agent for the first change: the project's skeleton, from PRODUCT.md.",
    );
    const flows = GIT_FLOWS.join("|");
    return chooseFlow
      ? t(
          `elige el flujo de git con \`${ctx.command} init --git-flow <${flows}>\` y ${first}`,
          `choose the git flow with \`${ctx.command} init --git-flow <${flows}>\` and ${first}`,
        )
      : first;
  }
  const flows = (or: string) => `${GIT_FLOWS.slice(0, -1).join(", ")} ${or} ${GIT_FLOWS.at(-1)}`;
  const ask = chooseFlow
    ? t(
        `pregúntale al usuario qué flujo de git seguirá (${flows("o")}) y ejecuta \`${ctx.command} init --git-flow <flujo>\`; luego hazle`,
        `ask the user which git flow it will follow (${flows("or")}) and run \`${ctx.command} init --git-flow <flow>\`; then ask them`,
      )
    : t("hazle al usuario", "ask the user");
  return t(
    `es un proyecto nuevo: ${ask} las preguntas de PRODUCT.md, complétalo con sus respuestas y crea el primer cambio, el esqueleto del proyecto, con \`${ctx.command} new "Esqueleto del proyecto" --request "<petición literal del usuario>"\`.`,
    `this is a new project: ${ask} the questions in PRODUCT.md, fill it in with their answers and create the first change, the project's skeleton, with \`${ctx.command} new "Project skeleton" --request "<the user's literal request>"\`.`,
  );
}

/** What `init --dry-run` would create or change, with paths as the person reads them. */
export function dryRunCard(
  changes: readonly { readonly path: string; readonly created: boolean }[],
  warnings: readonly string[],
  ctx: CardContext,
): Output {
  const t = translator(ctx.lang);
  const lines = changes.map((change) =>
    change.created
      ? t(`crear ${change.path}`, `create ${change.path}`)
      : t(`cambiar ${change.path}`, `change ${change.path}`),
  );
  return {
    status: "ok",
    header: headerOf("init"),
    blocks: [
      ...section(
        t("SIMULACIÓN, NO SE HA ESCRITO NADA", "DRY RUN, NOTHING WAS WRITTEN"),
        lines.length > 0 ? lines : [t("Nada que cambiar.", "Nothing to change.")],
      ),
      ...section(t("AVISOS", "WARNINGS"), warnings),
    ],
    next: t(
      `ejecuta \`${ctx.command} init\` sin \`--dry-run\` para aplicarlo.`,
      `run \`${ctx.command} init\` without \`--dry-run\` to apply it.`,
    ),
  };
}
