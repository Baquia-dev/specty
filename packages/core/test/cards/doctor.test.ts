// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type CardContext,
  type DoctorLine,
  doctorCard,
  doctorLine,
  invalidConfigCard,
  notGitCard,
  renderText,
} from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

describe("the lines of `doctor`", () => {
  it("say what is in place and how to fix what is not, for every check", () => {
    const cases: readonly [DoctorLine, string][] = [
      [{ code: "config-valid" }, ".specty/config.yaml es válido."],
      [{ code: "flow-block" }, "AGENTS.md tiene el bloque de flujo."],
      [{ code: "no-flow-block" }, "AGENTS.md no tiene el bloque de flujo: ejecuta `specty init`."],
      [{ code: "git-hooks" }, "Hooks de git instalados."],
      [{ code: "no-git-hooks" }, "Faltan los hooks de git: ejecuta `specty init`."],
      [{ code: "claude-guard" }, "Claude Code: guard instalado."],
      [{ code: "no-claude-guard" }, "Claude Code: falta el guard; ejecuta `specty init`."],
      [
        { code: "claude-after-bash", events: "PostToolUse" },
        "Claude Code: falta la comprobación tras cada comando de Bash (PostToolUse); ejecuta `specty init`.",
      ],
      [
        { code: "claude-worktrees", events: "WorktreeCreate" },
        "Claude Code: faltan los hooks de las worktrees (WorktreeCreate), así que `EnterWorktree` por nombre no entra en la carpeta del cambio; ejecuta `specty init`.",
      ],
      [
        { code: "claude-compact", events: "SessionStart" },
        "Claude Code: falta la tarjeta de Specty tras compactar (SessionStart); ejecuta `specty init`.",
      ],
      [
        { code: "no-claude-permissions" },
        "Claude Code: faltan los permisos de los comandos de la persona, así que su modo auto puede vetárselos al agente aunque Specty se los permita; ejecuta `specty init`.",
      ],
      [{ code: "cursor-guard" }, "Cursor: guard instalado."],
      [
        { code: "no-cursor-guard" },
        "Cursor: falta el guard; ejecuta `specty init --tools cursor`.",
      ],
      [
        { code: "cursor-after-command", events: "postToolUse" },
        "Cursor: falta la comprobación tras cada comando (postToolUse); ejecuta `specty init --tools cursor`.",
      ],
      [
        { code: "codex-guard", file: "~/.codex/hooks.json" },
        "Codex: guard en ~/.codex/hooks.json; Codex lo ejecuta cuando confías en él con `/hooks`.",
      ],
      [
        { code: "no-codex-guard", file: "~/.codex/hooks.json" },
        "Codex: falta el guard en ~/.codex/hooks.json; ejecuta `specty init --tools codex`.",
      ],
      [
        { code: "codex-rules", file: ".codex/rules/specty.rules" },
        "Codex: regla de Specty en .codex/rules/specty.rules.",
      ],
      [
        { code: "no-codex-rules", file: ".codex/rules/specty.rules" },
        "Codex: falta la regla de Specty en .codex/rules/specty.rules, así que cada commit de Specty pide permiso; ejecuta `specty init --tools codex`.",
      ],
      [{ code: "opencode-guard", file: "p.js" }, "OpenCode: plugin del guard en p.js."],
      [
        { code: "opencode-after-command", file: "p.js" },
        "OpenCode: al plugin del guard le falta la comprobación tras cada comando; ejecuta `specty init --tools opencode`.",
      ],
      [
        { code: "no-opencode-guard", file: "p.js" },
        "OpenCode: falta el plugin del guard en p.js; ejecuta `specty init --tools opencode`.",
      ],
      [
        { code: "gentle-ai", file: "CLAUDE.md", blocks: ["sdd", "commits"] },
        "gentle-ai: CLAUDE.md tiene su guía de flujo (`sdd`, `commits`), que pide al agente sus propios commits y su propio plan; el guard de Specty bloquea esos commits. Quita esos bloques de CLAUDE.md para trabajar con Specty.",
      ],
      [{ code: "formatter-excludes", name: "Biome", path: ".specty" }, "Biome excluye .specty."],
      [
        {
          code: "formatter-checks",
          name: "Biome",
          path: ".specty",
          add: "!**/.specty",
          file: "biome.json",
        },
        "Biome también revisa .specty, que escribe Specty: añade !**/.specty en biome.json.",
      ],
      [
        { code: "specty-reachable", command: "specty" },
        "Los hooks pueden ejecutar Specty (specty).",
      ],
      [
        { code: "specty-unreachable" },
        "Los hooks no encuentran Specty: instálalo con `npm i -g @baquia-dev/specty`.",
      ],
      [{ code: "verify-default", command: "pnpm test" }, "Verificación por defecto: `pnpm test`."],
      [{ code: "no-verify-default" }, "Falta verify.default en .specty/config.yaml."],
      [{ code: "node", version: "24.1.0" }, "Node 24.1.0."],
      [
        { code: "old-node", version: "20.1.0" },
        "Node 20.1.0: Specty necesita Node 22 o posterior.",
      ],
      [
        { code: "missing-paths", paths: ["src/old", "docs/x.md"] },
        "AGENTS.md cita rutas que no existen: `src/old`, `docs/x.md`. Corrígelas o quítalas: el agente lee AGENTS.md en cada sesión.",
      ],
      [
        { code: "unfilled-sections", sections: ["Mapa", "Convenciones"] },
        "AGENTS.md tiene sin completar «Mapa» y «Convenciones»: el agente lo lee en cada sesión, así que escribe ahí lo que el código no dice (los directorios cuyo propósito no es obvio, lo que no se toca, las reglas que no verifica `specty check`).",
      ],
      [
        { code: "delegated", since: "2026-10-23", by: "Ana" },
        "Modo delegado activo desde el 2026-10-23 (Ana): tu agente toma tus decisiones. Para desactivarlo: `specty delegate off`.",
      ],
    ];
    for (const [line, text] of cases) expect(doctorLine(line, ES)).toBe(text);
  });

  it("are written in English too", () => {
    expect(doctorLine({ code: "no-git-hooks" }, EN)).toBe(
      "Git hooks are missing: run `specty init`.",
    );
    const unfilled = doctorLine(
      { code: "unfilled-sections", sections: ["Map", "Conventions"] },
      EN,
    );
    expect(unfilled).toMatch(/^AGENTS\.md has "Map" and "Conventions" not filled in:/);
    expect(unfilled).toMatch(/rules `specty check` does not verify\)\.$/);
  });
});

describe("the card of `doctor`", () => {
  it("is green without problems, and sends the agent to `next`", () => {
    const card = doctorCard(
      {
        ok: [{ code: "config-valid" }],
        warnings: [{ code: "delegated", since: "2026-10-23", by: "Ana" }],
        problems: [],
      },
      ES,
    );
    expect(card.status).toBe("ok");
    expect(card.header).toBe("SPECTY · doctor");
    expect(renderText(card, "es")).toContain(
      "OK:\n  .specty/config.yaml es válido.\nAVISOS:\n  Modo delegado activo",
    );
    expect(card.next).toBe("todo listo; el agente empieza con `specty next`.");
  });

  it("is red with a problem, and asks to fix it", () => {
    const card = doctorCard({ ok: [], warnings: [], problems: [{ code: "no-git-hooks" }] }, EN);
    expect(card.status).toBe("invalid");
    expect(renderText(card, "en")).toBe(
      [
        "SPECTY · doctor",
        "PROBLEMS:",
        "  Git hooks are missing: run `specty init`.",
        "NEXT: fix the problems and run `specty doctor` again.",
      ].join("\n"),
    );
  });
});

describe("the refusals before a session opens", () => {
  it("ask for a git repository or a valid configuration", () => {
    expect(renderText(notGitCard(ES), "es")).toBe(
      "SPECTY\nEsto no es un repositorio git.\nSIGUIENTE: ejecuta `git init`.",
    );
    const invalid = invalidConfigCard("mode: no válido", EN);
    expect(invalid.status).toBe("invalid");
    expect(renderText(invalid, "en")).toBe(
      "SPECTY\nmode: no válido\nNEXT: fix .specty/config.yaml.",
    );
  });
});
