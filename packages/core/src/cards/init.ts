// SPDX-License-Identifier: Apache-2.0
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
        ? t(
            `completa las secciones «Mapa» y «Convenciones» de AGENTS.md con lo que no se deduce del código, revisa .specty/config.yaml y ejecuta \`${ctx.command} doctor\`.`,
            `complete the "Map" and "Conventions" sections of AGENTS.md with what cannot be inferred from the code, review .specty/config.yaml and run \`${ctx.command} doctor\`.`,
          )
        : newProjectNext(view.product === "interviewed", ctx),
  };
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
