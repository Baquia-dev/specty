// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type CardContext,
  doctorLine,
  mcpNotOnPathWarning,
  mcpRegisteredLine,
  mcpUserFolderWarning,
} from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

describe("what `init --mcp` says", () => {
  it("AC1: names each agent where it registered the server, with its file", () => {
    const registered = [
      { tool: "claude-code", file: ".mcp.json" },
      { tool: "codex", file: ".codex/config.toml" },
    ] as const;
    expect(mcpRegisteredLine(registered, "es")).toBe(
      "Servidor MCP de Specty (`specty mcp`) registrado: Claude Code (.mcp.json), Codex (.codex/config.toml).",
    );
    expect(mcpRegisteredLine(registered, "en")).toBe(
      "Specty's MCP server (`specty mcp`) registered: Claude Code (.mcp.json), Codex (.codex/config.toml).",
    );
  });

  it("AC2: asks for `specty` on the PATH, and tells how to add it in Antigravity", () => {
    expect(mcpNotOnPathWarning("specty", "es")).toBe(
      "El servidor MCP no se registró: necesita `specty` en el PATH. Instálalo con `npm install -g @baquia-dev/specty` y vuelve a ejecutar `specty init --mcp`.",
    );
    expect(mcpNotOnPathWarning("specty", "en")).toBe(
      "The MCP server was not registered: it needs `specty` on the PATH. Install it with `npm install -g @baquia-dev/specty` and run `specty init --mcp` again.",
    );
    expect(mcpUserFolderWarning("es")).toBe(
      "Antigravity solo lee los servidores MCP de la carpeta del usuario: añade allí, en «Manage MCP Servers», el servidor `specty` con el comando `specty mcp`.",
    );
    expect(mcpUserFolderWarning("en")).toBe(
      'Antigravity only reads MCP servers from the user\'s folder: add there, in "Manage MCP Servers", the server `specty` with the command `specty mcp`.',
    );
  });
});

describe("the lines of `doctor` about the MCP server", () => {
  it("AC4: confirm it, ask for it where it is missing or runs something else, and point Antigravity to its folder", () => {
    expect(doctorLine({ code: "mcp-registered", tool: "claude-code", file: ".mcp.json" }, ES)).toBe(
      "Claude Code: servidor MCP de Specty registrado (.mcp.json).",
    );
    expect(doctorLine({ code: "mcp-missing", tool: "cursor", file: ".cursor/mcp.json" }, ES)).toBe(
      "Cursor: falta el servidor MCP de Specty en .cursor/mcp.json; ejecuta `specty init --mcp`.",
    );
    expect(
      doctorLine({ code: "mcp-other", tool: "gemini-cli", file: ".gemini/settings.json" }, ES),
    ).toBe(
      "Gemini CLI: el servidor MCP «specty» de .gemini/settings.json no ejecuta `specty mcp`; ejecuta `specty init --mcp`.",
    );
    expect(doctorLine({ code: "mcp-user-folder", tool: "antigravity" }, ES)).toBe(
      "Antigravity: solo lee los servidores MCP de la carpeta del usuario; añade allí `specty mcp` en «Manage MCP Servers».",
    );
    expect(doctorLine({ code: "mcp-missing", tool: "opencode", file: "opencode.json" }, EN)).toBe(
      "OpenCode: Specty's MCP server is missing from opencode.json; run `specty init --mcp`.",
    );
  });
});
