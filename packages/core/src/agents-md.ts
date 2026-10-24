// SPDX-License-Identifier: Apache-2.0

import { translator } from "./cards/text";
import type { Lang } from "./i18n";

/** Facts that `specty init` detects and writes in the project block of AGENTS.md. */
export interface ProjectFacts {
  /** For example `TypeScript (pnpm)` or `Dart / Flutter`. */
  readonly stacks: readonly string[];
  /** Workspace packages of a monorepo. */
  readonly packages: readonly string[];
  readonly commands: readonly { readonly label: string; readonly command: string }[];
}

/** The flow block (docs/formats.md §8): about eight lines, always loaded by the agent. */
export function flowBlock(lang: Lang, command: string): string {
  const t = translator(lang);
  return [
    t("## Flujo de trabajo (Specty)", "## Workflow (Specty)"),
    t(
      `Este repositorio usa Specty. Antes de crear, modificar o borrar código, ejecuta \`${command} next\` y sigue su salida hasta la línea \`SIGUIENTE:\`.`,
      `This repository uses Specty. Before creating, modifying or deleting code, run \`${command} next\` and follow its output up to the \`NEXT:\` line.`,
    ),
    t(
      `- Si el usuario pide un cambio y no hay uno activo, \`${command} next\` te indica cómo crear la spec.`,
      `- If the user asks for a change and none is active, \`${command} next\` tells you how to create the spec.`,
    ),
    t(
      `- Cada cambio vive en su propia carpeta (una worktree): tras \`${command} new\`, trabaja en la carpeta que indica, no en la principal.`,
      `- Each change lives in its own folder (a worktree): after \`${command} new\`, work in the folder it names, not in the main one.`,
    ),
    t(
      `- Completa cada tarea con \`${command} task done <id>\`; no ejecutes \`git commit\` tú mismo.`,
      `- Complete each task with \`${command} task done <id>\`; do not run \`git commit\` yourself.`,
    ),
    t(
      `- Si necesitas un archivo fuera del alcance de la tarea, pídelo con \`${command} scope add\`.`,
      `- If you need a file outside the task's scope, request it with \`${command} scope add\`.`,
    ),
    t(
      "- Aprobar, aceptar y cerrar lo hace el usuario en su terminal; tú se lo pides y terminas tu turno. Solo si `SIGUIENTE:` te lo pide (modo delegado), los ejecutas tú.",
      "- Approving, accepting and closing are done by the user in their terminal; ask them and end your turn. Only when `NEXT:` tells you to (delegated mode) do you run them yourself.",
    ),
    t(
      "- Si el comando `specty` no existe, usa `npx -y @baquia-dev/specty <comando>`. Nunca uses `npx specty`: es otro paquete.",
      "- If the `specty` command does not exist, use `npx -y @baquia-dev/specty <command>`. Never use `npx specty`: it is another package.",
    ),
  ].join("\n");
}

export function projectBlock(facts: ProjectFacts, lang: Lang): string {
  const t = translator(lang);
  const stack =
    facts.stacks.length > 0 ? facts.stacks.join(", ") : t("sin detectar", "not detected");
  const packages =
    facts.packages.length > 0
      ? [t(`- Paquetes: ${facts.packages.join(", ")}`, `- Packages: ${facts.packages.join(", ")}`)]
      : [];
  const commands =
    facts.commands.length > 0
      ? [
          t("- Comandos:", "- Commands:"),
          ...facts.commands.map((entry) => `  - ${entry.label}: \`${entry.command}\``),
        ]
      : [];
  return [
    t("## Proyecto (detectado por Specty)", "## Project (detected by Specty)"),
    `- Stack: ${stack}`,
    ...packages,
    ...commands,
  ].join("\n");
}

/** Sections people complete by hand; `init` adds them once, with hints, to a new AGENTS.md. */
export function humanSections(lang: Lang): string {
  const t = translator(lang);
  return [
    t("## Mapa", "## Map"),
    "",
    t(
      "<!-- Directorios cuyo propósito no es obvio y lo que no se toca (generado, migraciones aplicadas…). -->",
      "<!-- Directories whose purpose is not obvious, and what must not be touched (generated code, applied migrations…). -->",
    ),
    "",
    t("## Convenciones", "## Conventions"),
    "",
    t(
      "<!-- Solo lo que no se deduce del código ni lo aplica un linter. Cada regla, verificable. -->",
      "<!-- Only what cannot be inferred from the code and no linter enforces. Every rule, verifiable. -->",
    ),
  ].join("\n");
}

const begin = (id: string) => `<!-- specty:begin id=${id} -->`;
const end = (id: string) => `<!-- specty:end id=${id} -->`;

/**
 * Inserts or replaces a managed block. Text outside the markers belongs to people and is
 * never touched. New blocks go after the first `#` title, or at the end.
 */
export function upsertBlock(text: string, id: string, content: string): string {
  const block = `${begin(id)}\n${content.trim()}\n${end(id)}`;
  const start = text.indexOf(begin(id));
  const stop = text.indexOf(end(id));
  if (start !== -1 && stop > start) {
    return `${text.slice(0, start)}${block}${text.slice(stop + end(id).length)}`;
  }
  const lines = text.split("\n");
  const title = lines.findIndex((line) => /^#\s/.test(line));
  if (title === -1) return `${text.trimEnd()}${text.trim().length > 0 ? "\n\n" : ""}${block}\n`;
  const lastBlock = lastManagedLine(lines);
  const at = Math.max(title, lastBlock) + 1;
  return [...lines.slice(0, at), "", block, ...lines.slice(at)]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

/** Takes a managed block out, with the blank line that set it apart; the rest stays as it was. */
export function removeBlock(text: string, id: string): string {
  const start = text.indexOf(begin(id));
  const stop = text.indexOf(end(id));
  if (start === -1 || stop < start) return text;
  const left = `${text.slice(0, start)}${text.slice(stop + end(id).length)}`;
  if (left.trim() === "") return "";
  return `${left
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+/, "")
    .trimEnd()}\n`;
}

export function hasBlock(text: string, id: string): boolean {
  return text.includes(begin(id)) && text.includes(end(id));
}

function lastManagedLine(lines: readonly string[]): number {
  return lines.reduce(
    (last, line, index) => (line.startsWith("<!-- specty:end ") ? index : last),
    -1,
  );
}
