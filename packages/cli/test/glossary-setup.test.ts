// SPDX-License-Identifier: Apache-2.0
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { glossaryTemplate } from "@baquia-dev/specty-core";
import { describe, expect, it } from "vitest";
import { cli, git, read, tempRepo, writeFiles } from "./support";

const INIT = ["init", "--language", "es", "--tools", "claude-code"];

/** The files of the last commit. */
const committed = (root: string) =>
  git(root, "show", "--name-only", "--format=", "HEAD").split("\n");

describe("the glossary init creates", () => {
  it("AC1: init creates it with its hints, in the project's language, says so and commits it", async () => {
    const root = await tempRepo({ "src/app.ts": "x\n" });
    const result = await cli(root, INIT);
    expect(result.code).toBe(0);
    expect(result.out).toContain("Glosario del dominio creado con pistas: docs/dominio.md.");
    expect(await read(root, "docs/dominio.md")).toBe(glossaryTemplate("es"));
    expect(committed(root)).toContain("docs/dominio.md");
    const english = await tempRepo({ "src/app.ts": "x\n" });
    const installed = await cli(english, ["init", "--language", "en", "--tools", "claude-code"]);
    expect(installed.out).toContain("Domain glossary created with hints: docs/domain.md.");
    expect(await read(english, "docs/domain.md")).toBe(glossaryTemplate("en"));
  });

  it("AC2: init leaves an existing glossary alone, even one with only its hints", async () => {
    const root = await tempRepo({ "src/app.ts": "x\n", "docs/dominio.md": "# Mío\n" });
    expect((await cli(root, INIT)).out).not.toContain("Glosario del dominio creado");
    expect(await read(root, "docs/dominio.md")).toBe("# Mío\n");
    const again = await tempRepo({ "src/app.ts": "x\n" });
    await cli(again, INIT);
    expect((await cli(again, INIT)).out).not.toContain("Glosario del dominio creado");
    expect(await read(again, "docs/dominio.md")).toBe(glossaryTemplate("es"));
  });

  it("AC3: doctor warns while the glossary defines no term, without turning red", async () => {
    const root = await tempRepo({ "src/app.ts": "x\n" });
    await cli(root, INIT);
    const warned = await cli(root, ["doctor"]);
    expect(warned.out).toContain("El glosario (`docs/dominio.md`) no define ningún término");
    const term = "- **Saludo** (`greet`): lo que la app imprime.\n";
    await writeFiles(root, { "docs/dominio.md": `${glossaryTemplate("es")}${term}` });
    const defined = await cli(root, ["doctor"]);
    expect(defined.out).not.toContain("El glosario");
    expect(warned.code).toBe(defined.code);
    await rm(join(root, "docs/dominio.md"));
    expect((await cli(root, ["doctor"])).out).not.toContain("El glosario");
  });
});
