// SPDX-License-Identifier: Apache-2.0
import { AGENT_NAMES, type AgentTool } from "../agents";
import type { Lang } from "../i18n";
import type { DoctorLine } from "./doctor";
import { type Translate, translator } from "./text";

/**
 * What `init --mcp` and `doctor` say about Specty's MCP server in each agent's project
 * configuration (ARCHITECTURE §6).
 */

/** The agents `init --mcp` registered the server for, each with its file. */
export function mcpRegisteredLine(
  registered: readonly { readonly tool: AgentTool; readonly file: string }[],
  lang: Lang,
): string {
  const list = registered.map(({ tool, file }) => `${AGENT_NAMES[tool]} (${file})`).join(", ");
  return translator(lang)(
    `Servidor MCP de Specty (\`specty mcp\`) registrado: ${list}.`,
    `Specty's MCP server (\`specty mcp\`) registered: ${list}.`,
  );
}

/** The server runs `specty mcp`, so it is only registered with `specty` on the PATH. */
export function mcpNotOnPathWarning(command: string, lang: Lang): string {
  return translator(lang)(
    `El servidor MCP no se registró: necesita \`${command}\` en el PATH. Instálalo con \`npm install -g @baquia-dev/specty\` y vuelve a ejecutar \`${command} init --mcp\`.`,
    `The MCP server was not registered: it needs \`${command}\` on the PATH. Install it with \`npm install -g @baquia-dev/specty\` and run \`${command} init --mcp\` again.`,
  );
}

/** Antigravity reads MCP servers only from the user's folder, where Specty never writes. */
export function mcpUserFolderWarning(lang: Lang): string {
  return translator(lang)(
    "Antigravity solo lee los servidores MCP de la carpeta del usuario: añade allí, en «Manage MCP Servers», el servidor `specty` con el comando `specty mcp`.",
    'Antigravity only reads MCP servers from the user\'s folder: add there, in "Manage MCP Servers", the server `specty` with the command `specty mcp`.',
  );
}

type McpCode = "mcp-registered" | "mcp-missing" | "mcp-other" | "mcp-user-folder";

/** The lines of `doctor` about the MCP server, which `cards/doctor.ts` adds to its own. */
export const MCP_WRITERS: {
  readonly [C in McpCode]: (
    line: DoctorLine & { readonly code: C },
    t: Translate,
    command: string,
  ) => string;
} = {
  "mcp-registered": (line, t) =>
    t(
      `${AGENT_NAMES[line.tool]}: servidor MCP de Specty registrado (${line.file}).`,
      `${AGENT_NAMES[line.tool]}: Specty's MCP server registered (${line.file}).`,
    ),
  "mcp-missing": (line, t, command) =>
    t(
      `${AGENT_NAMES[line.tool]}: falta el servidor MCP de Specty en ${line.file}; ejecuta \`${command} init --mcp\`.`,
      `${AGENT_NAMES[line.tool]}: Specty's MCP server is missing from ${line.file}; run \`${command} init --mcp\`.`,
    ),
  "mcp-other": (line, t, command) =>
    t(
      `${AGENT_NAMES[line.tool]}: el servidor MCP «specty» de ${line.file} no ejecuta \`${command} mcp\`; ejecuta \`${command} init --mcp\`.`,
      `${AGENT_NAMES[line.tool]}: the MCP server "specty" in ${line.file} does not run \`${command} mcp\`; run \`${command} init --mcp\`.`,
    ),
  "mcp-user-folder": (line, t, command) =>
    t(
      `${AGENT_NAMES[line.tool]}: solo lee los servidores MCP de la carpeta del usuario; añade allí \`${command} mcp\` en «Manage MCP Servers».`,
      `${AGENT_NAMES[line.tool]}: it only reads MCP servers from the user's folder; add \`${command} mcp\` there, in "Manage MCP Servers".`,
    ),
};
