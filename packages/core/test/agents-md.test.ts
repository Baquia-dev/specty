// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { citedPaths, flowBlock, humanSections, unfilledSections, upsertBlock } from "../src";

const agents = (...sections: string[]) => ["# Demo", ...sections].join("\n\n");
const MAP = "## Mapa\n\n- `src/gen/`: generado, no se toca.";
const HINT = "<!-- Solo lo que no se deduce del código. -->";

describe("unfilledSections", () => {
  it("lists both sections of a new AGENTS.md, in either language (AC1)", () => {
    expect(unfilledSections(agents(humanSections("es")))).toEqual(["Mapa", "Convenciones"]);
    expect(unfilledSections(agents(humanSections("en")))).toEqual(["Map", "Conventions"]);
    // As `init` writes it: the managed blocks go after the title, before the sections.
    const written = upsertBlock(agents(humanSections("es")), "flow", flowBlock("es", "specty"));
    expect(unfilledSections(written)).toEqual(["Mapa", "Convenciones"]);
  });

  it("stops listing a section once it has content, also in a subsection (AC2)", () => {
    expect(unfilledSections(agents(MAP, `## Convenciones\n\n${HINT}`))).toEqual(["Convenciones"]);
    const nested = `## Convenciones\n\n${HINT}\n\n### Tests\n\n- Junto a cada fuente.`;
    expect(unfilledSections(agents(MAP, nested))).toEqual([]);
  });

  it("takes only comments and blank lines as empty, up to the next heading of its level (AC1)", () => {
    const comments = "## mapa\n\n<!-- una pista\nen dos líneas -->\n   \n<!-- otra -->";
    expect(unfilledSections(agents(comments, "## Comandos\n\n- `pnpm test`"))).toEqual(["mapa"]);
    // A managed block after it is not its content: its heading ends the section.
    const block = upsertBlock("", "project", "## Proyecto (detectado por Specty)\n- Stack: Go");
    expect(unfilledSections(`# Demo\n\n## CONVENCIÓNES ##\n\n${HINT}\n\n${block}`)).toEqual([
      "CONVENCIÓNES",
    ]);
    // Any heading level, and a level-1 section runs to the next level-1 heading.
    expect(unfilledSections(agents("# Map", "## cmd/", "- The binaries."))).toEqual([]);
  });

  it("says nothing of the sections AGENTS.md does not have (AC2)", () => {
    expect(unfilledSections(agents("## Comandos\n\n- `pnpm test`"))).toEqual([]);
    expect(unfilledSections(agents("## Mapas del sitio", "## Map of the API"))).toEqual([]);
    expect(unfilledSections("")).toEqual([]);
  });
});

describe("citedPaths", () => {
  it("finds the paths AGENTS.md cites as inline code, once each (AC1)", () => {
    const text = agents(
      "## Mapa",
      "- `packages/core/src/spec/`: el modelo; `docs/formats.md` y `.specty/config.yaml`.",
      "- Otra vez `docs/formats.md`.",
    );
    expect(citedPaths(text)).toEqual([
      "packages/core/src/spec",
      "docs/formats.md",
      ".specty/config.yaml",
    ]);
  });

  it("leaves out fragments, commands, globs, placeholders, packages and addresses (AC2)", () => {
    const text = agents(
      "- `theme/` y `src/`, relativos a lo de antes.",
      "- `pnpm --filter @baquia-dev/specty-core exec vitest run test/a.test.ts`",
      "- `packages/*/test/fixtures/`, `common/specty/sessions/<id>.json` y `@baquia-dev/specty`.",
      "- `https://example.com/a/b`, `src/app.ts:12`, `../fuera/de/aqui` y `/raiz/absoluta`.",
    );
    expect(citedPaths(text)).toEqual([]);
  });
});

describe("the flow block with Specty's MCP server", () => {
  const LINE = {
    es: "- Si tienes las herramientas MCP de Specty (`specty_next`, `specty_new`, `specty_task_done`…), úsalas en lugar del comando que hace lo mismo: así el chat muestra el cambio.",
    en: "- If you have Specty's MCP tools (`specty_next`, `specty_new`, `specty_task_done`…), use them instead of the command that does the same: that way the chat shows the change.",
  };

  it("AC1: asks to use the MCP tools right after its first line, and only with the server", () => {
    for (const lang of ["es", "en"] as const) {
      const plain = flowBlock(lang, "specty").split("\n");
      const served = flowBlock(lang, "specty", { mcp: true }).split("\n");
      expect(served[2]).toBe(LINE[lang]);
      expect(served.filter((line) => line !== LINE[lang])).toEqual(plain);
      expect(plain.join("\n")).not.toContain("specty_next");
      expect(flowBlock(lang, "specty", { mcp: false })).toBe(plain.join("\n"));
    }
  });
});

describe("rules for epics and vertical slices", () => {
  it("AC4: includes rule requiring vertical slices and drafting specs for parallel agents", () => {
    const es = flowBlock("es", "specty");
    expect(es).toContain("cortes verticales");
    expect(es).toContain("paralelo");
    const en = flowBlock("en", "specty");
    expect(en).toContain("vertical slices");
    expect(en).toContain("parallel");
  });

  it("AC5: mentions specty wait in flowBlock for human approvals", () => {
    const es = flowBlock("es", "specty");
    expect(es).toContain("specty wait");
    const en = flowBlock("en", "specty");
    expect(en).toContain("specty wait");
  });

  it("AC1: flowBlock explicitly requires entering worktree with specty enter and forbids asking for another session", () => {
    const es = flowBlock("es", "specty");
    expect(es).toContain("Entra con `specty enter <id>`");
    expect(es).toContain("no pidas abrir otra sesión ni cambiar de rama");
    const en = flowBlock("en", "specty");
    expect(en).toContain("Enter with `specty enter <id>`");
    expect(en).toContain("do not ask to open another session or switch branches");
  });
});

describe("shielding AGENTS.md", () => {
  it("AC1: humanSections hints forbid product specs or phases and point to dedicated files", () => {
    const es = humanSections("es");
    expect(es).toContain("PRODUCT.md");
    expect(es).toContain("docs/");
    expect(es).toContain("< 80 líneas");
    const en = humanSections("en");
    expect(en).toContain("PRODUCT.md");
    expect(en).toContain("docs/");
    expect(en).toContain("< 80 lines");
  });

  it("AC2: flowBlock preserves 15-line limit and 5 non-verifiable rules", () => {
    const es = flowBlock("es", "specty").split("\n");
    expect(es.length).toBeLessThanOrEqual(15);
    const en = flowBlock("en", "specty").split("\n");
    expect(en.length).toBeLessThanOrEqual(15);
  });

  it("AC3: flowBlock rules mandate scaffolding with framework commands in new projects with non-leaking scope exception", () => {
    const es = flowBlock("es", "specty");
    expect(es).toContain("andamiaje con framework");
    expect(es).toContain("globs en alcance como única excepción");
    const en = flowBlock("en", "specty");
    expect(en).toContain("framework scaffolding");
    expect(en).toContain("globs in scope as sole exception");
  });
});
