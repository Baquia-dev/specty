// SPDX-License-Identifier: Apache-2.0
import { AGENT_NAMES, type AgentTool, isAgentTool } from "../agents";
import type { Lang } from "../i18n";
import { headerOf, type Output, section } from "../output";
import { blockedCard } from "./flow";
import { translator } from "./text";
import type { CardContext } from "./view";

// The texts of `specty init`: what it refuses, what it did with each file, and its dry run.

/** Why `specty init` installs nothing. */
export type InitRefusal =
  | { readonly reason: "no-git" }
  /** `.specty/config.yaml` exists and is not valid: `issues` says why. */
  | { readonly reason: "invalid-config"; readonly issues: string };

export function initRefusalCard(refusal: InitRefusal, lang: Lang): Output {
  const t = translator(lang);
  return refusal.reason === "no-git"
    ? blockedCard(
        headerOf("init"),
        t("Esto no es un repositorio git.", "This is not a git repository."),
        t("ejecuta `git init` y vuelve a intentarlo.", "run `git init` and try again."),
      )
    : blockedCard(
        headerOf("init"),
        t(
          `.specty/config.yaml no es válido: ${refusal.issues}`,
          `.specty/config.yaml is invalid: ${refusal.issues}`,
        ),
        t("corrígelo y vuelve a ejecutar `specty init`.", "fix it and run `specty init` again."),
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

/** Every agent tool, in the order of `AGENT_NAMES`: Claude Code first. */
const AGENT_TOOLS = Object.keys(AGENT_NAMES).filter(isAgentTool);

/** `init`'s question to a person when it detects no agent, after the language. */
export function agentQuestion(lang: Lang): string {
  return translator(lang)(
    "No se detectó ningún agente. ¿Con cuál trabajas en este repositorio?",
    "No agent detected. Which one do you work with in this repository?",
  );
}

/** The answers to `agentQuestion`: every agent tool, Claude Code first. */
export function agentChoices(): readonly { readonly value: AgentTool; readonly label: string }[] {
  return AGENT_TOOLS.map((tool) => ({ value: tool, label: AGENT_NAMES[tool] }));
}

/** No agent was detected and nobody could be asked: Claude Code's guard went in. */
export function noAgentWarning(command: string, lang: Lang): string {
  const tools = AGENT_TOOLS.join(", ");
  return translator(lang)(
    `No se detectó ningún agente: se instaló el guard de Claude Code. Si usas otro, ejecuta \`${command} init --tools <herramienta>\` con alguna de estas: ${tools}.`,
    `No agent detected: Claude Code's guard was installed. If you use another, run \`${command} init --tools <tool>\` with any of: ${tools}.`,
  );
}

/** `init`'s first question to a person: in both languages, as neither is known yet. */
export function languageQuestion(): string {
  return "¿En qué idioma trabaja Specty? · Which language should Specty work in?";
}

/** The answers to `languageQuestion`, the detected language first. */
export function languageChoices(
  detected: Lang,
): readonly { readonly value: Lang; readonly label: string }[] {
  const choices = [
    { value: "es", label: "Español" },
    { value: "en", label: "English" },
  ] as const;
  return choices.toSorted((a, b) => Number(b.value === detected) - Number(a.value === detected));
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
}

/** `specty init` done. Next comes AGENTS.md, or in a new project, its first change. */
export function initCard(view: InitView, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  return {
    status: "ok",
    header: headerOf("init"),
    blocks: [
      ...section(t("CONFIGURADO", "CONFIGURED"), view.done),
      ...section(t("DETECTADO", "DETECTED"), view.detected),
      ...section(t("AVISOS", "WARNINGS"), view.warnings),
    ],
    next:
      view.product === undefined
        ? existingProjectNext(view.unfilled, ctx)
        : newProjectNext(view.product === "interviewed", ctx),
  };
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

/** What comes after `init` in a new project, for whoever ran it. */
export function newProjectNext(interviewed: boolean, ctx: CardContext): string {
  const t = translator(ctx.lang);
  return interviewed
    ? t(
        "pídele a tu agente el primer cambio: el esqueleto del proyecto, a partir de PRODUCT.md.",
        "ask your agent for the first change: the project's skeleton, from PRODUCT.md.",
      )
    : t(
        `es un proyecto nuevo: hazle al usuario las preguntas de PRODUCT.md, complétalo con sus respuestas y crea el primer cambio, el esqueleto del proyecto, con \`${ctx.command} new "Esqueleto del proyecto" --request "<petición literal del usuario>"\`.`,
        `this is a new project: ask the user the questions in PRODUCT.md, fill it in with their answers and create the first change, the project's skeleton, with \`${ctx.command} new "Project skeleton" --request "<the user's literal request>"\`.`,
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
