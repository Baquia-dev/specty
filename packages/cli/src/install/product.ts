// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import {
  AGENT_CAPABILITIES,
  isAgentTool,
  isGoverned,
  type Lang,
  productQuestions,
  productTemplate,
  type ResolvedConfig,
} from "@baquia-dev/specty-core";
import { type Detection, detectProject } from "../detect/project";
import type { Session, Terminal } from "../session";
import type { InstallFiles } from "./files";

/** Repository metadata, which exists before any code does: it does not make a project. */
const METADATA =
  /^(?:\.gitignore|\.gitattributes|\.editorconfig|(?:LICENSE|LICENCE|COPYING|NOTICE)(?:\.[^/]*)?)$/i;

/** The agents' own files (`.claude/`, `.cursor/`…), from the capability table. */
const AGENT_PATHS: readonly string[] = Object.keys(AGENT_CAPABILITIES)
  .filter(isAgentTool)
  .flatMap((tool) => AGENT_CAPABILITIES[tool].markers);

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

/** Whether this folder holds a new project, as `init` sees it: for `next` and the first `new`. */
export async function freshProject(session: Session): Promise<boolean> {
  const detection = await detectProject(session.root, "");
  return isNewProject(detection, await session.git.files(), session.config);
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
  const answers: string[] = [];
  if (options.ask) {
    for (const [, question] of productQuestions(options.lang)) {
      answers.push(((await options.terminal.ask(question)) ?? "").trim());
    }
  }
  await options.files.write(path, productTemplate(options.name, options.lang, answers));
  return options.ask ? "interviewed" : "skeleton";
}
