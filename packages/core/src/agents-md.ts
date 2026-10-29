// SPDX-License-Identifier: Apache-2.0

import { type Translate, translator } from "./cards/text";
import { fold, LANGS, type Lang } from "./i18n";

/** Facts that `specty init` detects and writes in the project block of AGENTS.md. */
export interface ProjectFacts {
  /** For example `TypeScript (pnpm)` or `Dart / Flutter`. */
  readonly stacks: readonly string[];
  /** Workspace packages of a monorepo. */
  readonly packages: readonly string[];
  readonly commands: readonly { readonly label: string; readonly command: string }[];
}

/**
 * The flow block (docs/formats.md §8), always loaded by the agent: Specty's flow in eight lines
 * and the five rules no tool can verify. What a tool can verify, `specty check` does (ADR 0012).
 */
export function flowBlock(lang: Lang, command: string): string {
  const t = translator(lang);
  return [...flowLines(t, command), "", ...ruleLines(t, command)].join("\n");
}

/** Specty's flow: where to start, where to work, how to finish a task and what is the person's. */
function flowLines(t: Translate, command: string): string[] {
  return [
    t("## Flujo de trabajo (Specty)", "## Workflow (Specty)"),
    t(
      `Este repositorio usa Specty. Antes de crear, modificar o borrar código, ejecuta \`${command} next\` y sigue su salida hasta la línea \`SIGUIENTE:\`. Habla con el usuario en español.`,
      `This repository uses Specty. Before creating, modifying or deleting code, run \`${command} next\` and follow its output up to the \`NEXT:\` line. Talk to the user in English.`,
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
  ];
}

/**
 * The rules no tool can verify, after the one about `task done`'s gate: it already runs `specty
 * check` and the task's verification, so running them first would only run the tests twice.
 */
function ruleLines(t: Translate, command: string): string[] {
  return [
    t("## Reglas (Specty)", "## Rules (Specty)"),
    t(
      `- \`${command} task done\` ya ejecuta \`${command} check --changed --spec\` y la verificación de la tarea, y no la completa con fallos: no los repitas justo antes; corrige lo que devuelva y no reportes con fallos pendientes.`,
      `- \`${command} task done\` already runs \`${command} check --changed --spec\` and the task's verification, and does not complete the task with failures: do not repeat them right before; fix whatever it returns and do not report with failures pending.`,
    ),
    t(
      "- Antes de crear un módulo, caso de uso, componente o pantalla, busca uno equivalente en el repo y replica su estructura.",
      "- Before creating a module, use case, component or screen, look for an equivalent one in the repo and replicate its structure.",
    ),
    t(
      "- Localiza el código con búsquedas dirigidas por símbolo o texto y lee solo los fragmentos necesarios, no archivos completos.",
      "- Find code with targeted searches by symbol or text and read only the fragments you need, not whole files.",
    ),
    t(
      "- Edita con cambios puntuales; no reescribas archivos completos para cambios pequeños.",
      "- Edit with targeted changes; do not rewrite whole files for small changes.",
    ),
    t(
      "- Reporte final breve: qué cambió, qué se verificó y qué queda pendiente.",
      "- Brief final report: what changed, what was verified and what is pending.",
    ),
  ];
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
      "<!-- Solo lo que no se deduce del código ni verifica `specty check` (formato, lint, tipos, tests, tamaño, capas…). -->",
      "<!-- Only what cannot be inferred from the code and `specty check` does not verify (format, lint, types, tests, size, layers…). -->",
    ),
  ].join("\n");
}

/** The titles `humanSections` writes, in every language: a section is recognized in any. */
const HUMAN_TITLES = LANGS.flatMap((lang) =>
  humanSections(lang)
    .split("\n")
    .flatMap((line) => headingOf(line)?.title ?? []),
).map(fold);

/**
 * The sections people complete by hand that are still empty: up to the next heading of their
 * level or a higher one, nothing but comments, such as the hints, and blank lines. Their titles as
 * written, in order. A section AGENTS.md does not have is not listed: the rest of it is theirs.
 */
export function unfilledSections(text: string): readonly string[] {
  const lines = text.split("\n");
  return lines.flatMap((line, index) => {
    const heading = headingOf(line);
    if (heading === undefined || !HUMAN_TITLES.includes(fold(heading.title))) return [];
    const stop = lines.findIndex((next, at) => {
      const level = at > index ? headingOf(next)?.level : undefined;
      return level !== undefined && level <= heading.level;
    });
    const body = lines.slice(index + 1, stop === -1 ? undefined : stop).join("\n");
    return body.replace(/<!--[\s\S]*?-->/g, "").trim() === "" ? [heading.title] : [];
  });
}

/**
 * The repository paths AGENTS.md cites as inline code, without a trailing `/`, once each: spans of
 * at least two segments (`docs/formats.md`, `packages/core/src/`). Not a fragment (`theme/`, which
 * is relative to the text around it), a command (with spaces), a glob or a placeholder (`*`,
 * `<id>`), a package (`@scope/name`), an address (`:`) or a path that leaves the repository.
 */
export function citedPaths(text: string): readonly string[] {
  const found = new Set<string>();
  for (const [, code = ""] of text.matchAll(/`([^`\n]+)`/g)) {
    const path = code.replace(/\/$/, "");
    if (/[\s*?{}[\]<>:$~"'|]/.test(path) || /^[@/-]|^\.\.?\//.test(path)) continue;
    const segments = path.split("/");
    if (segments.length < 2 || segments.some((segment) => segment === "" || segment === ".."))
      continue;
    found.add(path);
  }
  return [...found];
}

/** A Markdown heading such as `## Title`, maybe closed with `#`s. */
function headingOf(line: string): { readonly level: number; readonly title: string } | undefined {
  const [, hashes, title] = /^(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/.exec(line) ?? [];
  return hashes === undefined || title === undefined ? undefined : { level: hashes.length, title };
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
