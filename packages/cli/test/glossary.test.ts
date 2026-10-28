// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  APP,
  CONFIG,
  cli,
  git,
  person,
  read,
  SPEC,
  SPEC_PATH,
  tempRepo,
  writeFiles,
} from "./support";

const GLOSSARY = [
  "# Dominio",
  "",
  "- **Nombre** (`name`): cómo llama la app a quien saluda.",
  "- **Despedida**: lo contrario del saludo.",
  "",
].join("\n");

/** SPEC's change approved, with T1 «Saludar por nombre» active, in a repository with `files`. */
async function approvedWith(files: Readonly<Record<string, string>>): Promise<string> {
  const root = await tempRepo({ ...APP, ...files });
  expect((await cli(root, ["new", "Saludo personalizado"])).code).toBe(0);
  await writeFiles(root, { [SPEC_PATH]: SPEC });
  expect((await cli(root, ["propose"])).code).toBe(0);
  const approved = await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
  expect(approved.code).toBe(0);
  return root;
}

describe("the project's glossary", () => {
  it("AC1: brings to the task card the terms of the task, from the configured glossary", async () => {
    const root = await approvedWith({ "docs/dominio.md": GLOSSARY });
    const card = (await cli(root, ["next"])).out;
    expect(card).toContain(
      "TÉRMINOS DEL DOMINIO:\n  Nombre (name): cómo llama la app a quien saluda.\n",
    );
    expect(card).not.toContain("Despedida");
    const elsewhere = await approvedWith({
      "GLOSARIO.md": GLOSSARY,
      ".specty/config.yaml": `${CONFIG()}glossary: GLOSARIO.md\n`,
    });
    expect((await cli(elsewhere, ["next"])).out).toContain("Nombre (name):");
  });

  it("AC5: leaves the cards as they were without a glossary, or with only its hints", async () => {
    const none = await approvedWith({});
    expect((await cli(none, ["next"])).out).not.toContain("TÉRMINOS DEL DOMINIO");
    const hints = await approvedWith({
      "docs/dominio.md": "# Dominio\n\n<!-- - **Nombre** (`name`): cómo se llama. -->\n",
    });
    expect((await cli(hints, ["next"])).out).not.toContain("TÉRMINOS DEL DOMINIO");
  });

  it("AC6: the closing asks for the change's new terms, and closing the change commits them", async () => {
    const root = await approvedWith({ "docs/dominio.md": GLOSSARY });
    await writeFiles(root, {
      "src/app.ts": "1\n",
      "src/app.test.ts": "it('AC1: greets Ana', () => {});\n",
    });
    await cli(root, ["next"]);
    expect((await cli(root, ["task", "done", "T1", "--summary", "Uno"])).code).toBe(0);
    await writeFiles(root, { "src/app.ts": "2\n" });
    expect((await cli(root, ["task", "done", "T2", "--summary", "Dos"])).code).toBe(0);
    expect((await cli(root, ["accept"], { terminal: person() })).code).toBe(0);
    expect((await cli(root, ["next"])).out).toContain("añádelos o corrígelos en docs/dominio.md");
    const closing = "\n## Cierre\n\n### Resumen\n\nSaludo listo.\n";
    await writeFiles(root, {
      "docs/dominio.md": `${GLOSSARY}- **Saludo** (\`greet\`): lo que la app imprime.\n`,
      [SPEC_PATH]: `${await read(root, SPEC_PATH)}${closing}`,
    });
    expect((await cli(root, ["propose"])).code).toBe(0);
    expect((await cli(root, ["close"], { terminal: person() })).code).toBe(0);
    expect(git(root, "show", "main:docs/dominio.md")).toContain("- **Saludo** (`greet`)");
    expect(git(root, "status", "--porcelain")).toBe("");
  });
});
