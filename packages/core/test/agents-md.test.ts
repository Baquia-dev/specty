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
