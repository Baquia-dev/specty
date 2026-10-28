// SPDX-License-Identifier: Apache-2.0
import type { Lang } from "../i18n";
import { headerOf, type Output, section } from "../output";
import { blockedCard } from "./flow";
import { translator } from "./text";
import type { CardContext } from "./view";

/**
 * What `init` says while it migrates an installation of the legacy, `@barcidev/specty`
 * (ADR 0005, ARCHITECTURE §14): its steps, what each changes, and why it may not happen.
 */

/** Moving the legacy and writing the new configuration; its git hooks; its AGENTS.md blocks. */
type LegacyStep = "move" | "hooks" | "agents";

export function legacyStepTitle(step: LegacyStep, lang: Lang): string {
  const t = translator(lang);
  switch (step) {
    case "move":
      return t(
        "Migración del legacy: mover a .specty/legacy/ y traducir la configuración",
        "Legacy migration: move to .specty/legacy/ and translate the configuration",
      );
    case "hooks":
      return t("Migración del legacy: sus hooks de git", "Legacy migration: its git hooks");
    case "agents":
      return t(
        "Migración del legacy: sus bloques de AGENTS.md",
        "Legacy migration: its AGENTS.md blocks",
      );
  }
}

export function legacyStepQuestion(step: LegacyStep, lang: Lang): string {
  const t = translator(lang);
  switch (step) {
    case "move":
      return t(
        "¿Mover la instalación del legacy y escribir la configuración nueva?",
        "Move the legacy installation and write the new configuration?",
      );
    case "hooks":
      return t("¿Quitar los hooks de git del legacy?", "Remove the legacy's git hooks?");
    case "agents":
      return t(
        "¿Quitar los bloques del legacy de AGENTS.md?",
        "Remove the legacy's blocks from AGENTS.md?",
      );
  }
}

/** What the first step moves, and the configuration it writes. */
export function legacyMoveBody(moved: readonly string[], config: string, lang: Lang): string {
  const t = translator(lang);
  return [
    t("Se mueven a .specty/legacy/:", "Moved to .specty/legacy/:"),
    ...moved.map((path) => `  ${path}`),
    "",
    t("Nueva .specty/config.yaml:", "New .specty/config.yaml:"),
    config,
  ].join("\n");
}

/** The lines a step takes out of each file. */
export function legacyRemovalBody(
  files: readonly { readonly path: string; readonly lines: readonly string[] }[],
): string {
  return files
    .map(({ path, lines }) => [`${path}:`, ...lines.map((line) => `- ${line}`)].join("\n"))
    .join("\n\n");
}

/** What the migration did, for init's output, and the legacy changes `import` can bring in. */
export function legacyDoneLines(
  done: {
    readonly hooks: readonly string[];
    readonly agents: boolean;
    readonly changes: readonly string[];
  },
  lang: Lang,
): string[] {
  const t = translator(lang);
  return [
    t(
      "Instalación del legacy movida a .specty/legacy/; su configuración, traducida: idioma, rutas gobernadas y libres, y verificación.",
      "Legacy installation moved to .specty/legacy/; its configuration translated: language, governed and free paths, and verification.",
    ),
    ...(done.hooks.length === 0
      ? []
      : [
          t(
            `Hooks de git del legacy quitados: ${done.hooks.join(", ")}.`,
            `Legacy git hooks removed: ${done.hooks.join(", ")}.`,
          ),
        ]),
    ...(done.agents
      ? [t("Bloques del legacy quitados de AGENTS.md.", "Legacy blocks removed from AGENTS.md.")]
      : []),
    ...(done.changes.length === 0
      ? []
      : [
          t(
            `Cambios del legacy que se pueden traer con \`specty import <carpeta>\`: ${done.changes.join(", ")}.`,
            `Legacy changes to bring in with \`specty import <folder>\`: ${done.changes.join(", ")}.`,
          ),
        ]),
  ];
}

/** A migration that does not happen: nobody at the terminal, or the person said no. */
export function legacyRefusalCard(
  reason: "not-interactive" | "declined",
  ctx: CardContext,
): Output {
  const t = translator(ctx.lang);
  return reason === "not-interactive"
    ? blockedCard(
        headerOf(),
        t(
          "Este repositorio tiene una instalación del legacy (@barcidev/specty).",
          "This repository has a legacy installation (@barcidev/specty).",
        ),
        t(
          `migrarla lo decide la persona en su terminal: pídele que ejecute \`${ctx.command} init\`; para ver qué cambiaría, \`${ctx.command} init --dry-run\`.`,
          `migrating it is the person's decision, in their terminal: ask them to run \`${ctx.command} init\`; to see what it would change, \`${ctx.command} init --dry-run\`.`,
        ),
      )
    : blockedCard(
        headerOf(),
        t(
          "Migración del legacy cancelada: nada cambió.",
          "Legacy migration cancelled: nothing changed.",
        ),
        t(
          `cuando quieras migrarla, vuelve a ejecutar \`${ctx.command} init\`.`,
          `to migrate it, run \`${ctx.command} init\` again.`,
        ),
      );
}

/** `init --dry-run` with the legacy installed: what the migration would move and remove. */
export function legacyPlanCard(
  plan: {
    readonly moved: readonly string[];
    readonly hooks: readonly string[];
    readonly agents: boolean;
  },
  ctx: CardContext,
): Output {
  const t = translator(ctx.lang);
  const lines = [
    t(
      `mover a .specty/legacy/: ${plan.moved.join(", ")}`,
      `move to .specty/legacy/: ${plan.moved.join(", ")}`,
    ),
    ...(plan.hooks.length === 0
      ? []
      : [
          t(
            `quitar los hooks de git del legacy: ${plan.hooks.join(", ")}`,
            `remove the legacy's git hooks: ${plan.hooks.join(", ")}`,
          ),
        ]),
    ...(plan.agents
      ? [
          t(
            "quitar los bloques del legacy de AGENTS.md",
            "remove the legacy's blocks from AGENTS.md",
          ),
        ]
      : []),
  ];
  return {
    status: "ok",
    header: headerOf(),
    blocks: section(
      t("MIGRACIÓN DEL LEGACY (sin aplicar)", "LEGACY MIGRATION (not applied)"),
      lines,
    ),
    next: t(
      `ejecuta \`${ctx.command} init\` en tu terminal para migrarla.`,
      `run \`${ctx.command} init\` in your terminal to migrate it.`,
    ),
  };
}
