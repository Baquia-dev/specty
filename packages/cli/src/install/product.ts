// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import {
  AGENT_CAPABILITIES,
  isAgentTool,
  isGoverned,
  type Lang,
  type ResolvedConfig,
  translator,
} from "@baquia-dev/specty-core";
import type { Detection } from "../detect/project";
import type { Terminal } from "../session";
import type { InstallFiles } from "./files";

/** Repository metadata, which exists before any code does: it does not make a project. */
const METADATA =
  /^(?:\.gitignore|\.gitattributes|\.editorconfig|(?:LICENSE|LICENCE|COPYING|NOTICE)(?:\.[^/]*)?)$/i;

/** The agents' own files (`.claude/`, `.cursor/`…), from the capability table. */
const AGENT_PATHS: readonly string[] = Object.keys(AGENT_CAPABILITIES)
  .filter(isAgentTool)
  .flatMap((tool) => AGENT_CAPABILITIES[tool].markers);

/** The brief interview of ARCHITECTURE §14: a section of PRODUCT.md and its question, per language. */
const QUESTIONS: Readonly<Record<Lang, readonly (readonly [string, string])[]>> = {
  es: [
    ["Qué es", "¿Qué vas a construir? Una o dos frases."],
    ["Para quién", "¿Para quién es?"],
    ["Alcance del MVP", "¿Qué tiene que hacer la primera versión?"],
    ["Fuera de alcance", "¿Qué queda fuera, al menos por ahora?"],
    ["Stack", "¿Con qué lenguaje y herramientas? (o «recomiéndame»)"],
    ["Despliegue", "¿Dónde y cómo se va a usar o desplegar?"],
    ["Restricciones", "¿Alguna restricción? (plazos, presupuesto, normas, compatibilidad…)"],
  ],
  en: [
    ["What it is", "What are you building? One or two sentences."],
    ["Who it is for", "Who is it for?"],
    ["MVP scope", "What must the first version do?"],
    ["Out of scope", "What stays out, at least for now?"],
    ["Stack", 'Which language and tools? (or "recommend one")'],
    ["Deployment", "Where and how will it be used or deployed?"],
    ["Constraints", "Any constraints? (deadlines, budget, rules, compatibility…)"],
  ],
};

/**
 * A new project: the detection finds no stack, and the repository has no governed code besides
 * repository metadata and the agents' own files. Nothing here depends on a language.
 */
export function isNewProject(
  detection: Detection,
  paths: readonly string[],
  config: Pick<ResolvedConfig, "governed" | "ignored">,
): boolean {
  const agentFile = (path: string) =>
    AGENT_PATHS.some((marker) => path === marker || path.startsWith(`${marker}/`));
  const code = paths.filter(
    (path) => isGoverned(path, config) && !METADATA.test(path) && !agentFile(path),
  );
  return detection.stacks.length === 0 && code.length === 0;
}

/**
 * In a new project without PRODUCT.md, writes it: with a person at the terminal, from the
 * interview; otherwise with the questions left as comments, for the agent to ask in the chat.
 */
export async function writeProduct(options: {
  readonly root: string;
  readonly name: string;
  readonly lang: Lang;
  readonly terminal: Terminal;
  readonly ask: boolean;
  readonly files: InstallFiles;
}): Promise<"interviewed" | "skeleton" | undefined> {
  const path = join(options.root, "PRODUCT.md");
  if ((await options.files.read(path)) !== undefined) return undefined;
  const questions = QUESTIONS[options.lang];
  const answers: string[] = [];
  if (options.ask) {
    for (const [, question] of questions) {
      answers.push(((await options.terminal.ask(question)) ?? "").trim());
    }
  }
  const sections = questions.map(([heading, question], index) => {
    const answer = answers[index] ?? "";
    return `## ${heading}\n\n${answer === "" ? `<!-- ${question} -->` : answer}\n`;
  });
  await options.files.write(path, [`# ${options.name}\n`, ...sections].join("\n"));
  return options.ask ? "interviewed" : "skeleton";
}

/** What comes after `init` in a new project, for whoever ran it. */
export function newProjectNext(lang: Lang, interviewed: boolean, command: string): string {
  const t = translator(lang);
  return interviewed
    ? t(
        "pídele a tu agente el primer cambio: el esqueleto del proyecto, a partir de PRODUCT.md.",
        "ask your agent for the first change: the project's skeleton, from PRODUCT.md.",
      )
    : t(
        `es un proyecto nuevo: hazle al usuario las preguntas de PRODUCT.md, complétalo con sus respuestas y crea el primer cambio, el esqueleto del proyecto, con \`${command} new "Esqueleto del proyecto" --request "<petición literal del usuario>"\`.`,
        `this is a new project: ask the user the questions in PRODUCT.md, fill it in with their answers and create the first change, the project's skeleton, with \`${command} new "Project skeleton" --request "<the user's literal request>"\`.`,
      );
}
