// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import {
  DEFAULT_CONFIG,
  flowBlock,
  humanSections,
  type Lang,
  projectBlock,
  removeBlock,
  translator,
  upsertBlock,
} from "@baquia-dev/specty-core";
import type { Detection } from "../detect/project";
import { projectFacts, verifyCommands } from "../detect/project";
import { COMMAND } from "../session";
import { type InstallFiles, installFiles } from "./files";

/** `.specty/config.yaml` with the detected values and short comments (docs/formats.md §6). */
export function renderConfig(lang: Lang, detection: Detection): string {
  const t = translator(lang);
  const verify = verifyCommands(detection.commands);
  const list = (values: readonly string[]) => JSON.stringify(values);
  const optional = (key: string, value: string | undefined) =>
    value === undefined ? [] : [`  ${key}: ${JSON.stringify(value)}`];
  return [
    t(
      "# Configuración de Specty. Referencia: docs/formats.md §6",
      "# Specty configuration. Reference: docs/formats.md §6",
    ),
    "version: 1",
    `language: ${lang}`,
    "mode: individual",
    t(
      "# Rutas donde rige el flujo: código que necesita una spec aprobada.",
      "# Paths under the flow: code that needs an approved spec.",
    ),
    `governed: ${list(DEFAULT_CONFIG.governed)}`,
    t(
      "# Rutas libres: documentación y archivos que no son código.",
      "# Free paths: documentation and non-code files.",
    ),
    `ignored: ${list(DEFAULT_CONFIG.ignored)}`,
    t(
      "# Rutas que nunca se aprueban solas y que pesan en el tamaño.",
      "# Paths never approved automatically, weighed in the size.",
    ),
    `sensitive: ${list(DEFAULT_CONFIG.sensitive)}`,
    "verify:",
    ...optional("default", verify.default),
    ...optional("full", verify.full),
    `  timeoutSec: ${DEFAULT_CONFIG.verify.timeoutSec}`,
    "scope:",
    "  implicitTests: true",
    `  generated: ${list(detection.generated)}`,
    "  autoApprove: tests-and-generated",
    "policy:",
    "  tests: recommended",
    "retro:",
    "  mode: agent",
    "git:",
    "  branchPerChange: true",
    "",
  ].join("\n");
}

/** Writes or refreshes the managed blocks of AGENTS.md; the rest of the file is the user's. */
export async function writeAgentsMd(
  root: string,
  lang: Lang,
  detection: Detection,
  files: InstallFiles = installFiles(),
): Promise<"created" | "updated"> {
  const path = join(root, "AGENTS.md");
  const current = await files.read(path);
  const base = current ?? `# ${detection.name}\n\n${humanSections(lang)}\n`;
  const withProject = upsertBlock(base, "project", projectBlock(projectFacts(detection), lang));
  await files.write(path, upsertBlock(withProject, "flow", flowBlock(lang, COMMAND)));
  return current === undefined ? "created" : "updated";
}

/** Takes Specty's blocks out of AGENTS.md; the rest of the file is the person's and stays. */
export async function removeAgentsBlocks(root: string, files: InstallFiles): Promise<void> {
  const path = join(root, "AGENTS.md");
  const current = await files.read(path);
  if (current === undefined) return;
  const left = removeBlock(removeBlock(current, "flow"), "project");
  if (left === current) return;
  if (left.trim() === "") await files.remove(path);
  else await files.write(path, left);
}

/** Claude Code reads CLAUDE.md: it imports AGENTS.md instead of copying it. */
export async function writeClaudePointer(
  root: string,
  files: InstallFiles = installFiles(),
): Promise<boolean> {
  const path = join(root, "CLAUDE.md");
  const current = await files.read(path);
  if (current?.split("\n").some((line) => line.trim() === "@AGENTS.md") === true) return false;
  await files.write(path, current === undefined ? "@AGENTS.md\n" : `@AGENTS.md\n\n${current}`);
  return true;
}
