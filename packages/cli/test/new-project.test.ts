// SPDX-License-Identifier: Apache-2.0
import { basename } from "node:path";
import { describe, expect, it } from "vitest";
import { exists } from "../src/io/files";
import { cli, git, person, read, tempRepo } from "./support";

const INIT = ["init", "--language", "es", "--tools", "claude-code"];

describe("init in a new project", () => {
  it("interviews a person at the terminal and writes PRODUCT.md with the answers (AC1, AC4)", async () => {
    const root = await tempRepo({
      "README.md": "# Notas\n",
      LICENSE: "MIT\n",
      ".gitignore": "dist/\n",
    });
    const answers = ["Una app de notas.", "Para mí.", "", "Sincronizar.", "recomiéndame", "", ""];
    const done = await cli(root, INIT, { terminal: person({ ask: answers }) });
    expect(done.code).toBe(0);
    expect(done.out).toContain("Proyecto nuevo: PRODUCT.md creado con tus respuestas.");
    expect(done.out).toContain(
      "SIGUIENTE: pídele a tu agente el primer cambio: el esqueleto del proyecto, a partir de PRODUCT.md.",
    );
    const product = await read(root, "PRODUCT.md");
    expect(product).toBe(
      [
        `# ${basename(root)}\n`,
        "## Qué es\n\nUna app de notas.\n",
        "## Para quién\n\nPara mí.\n",
        "## Alcance del MVP\n\n<!-- ¿Qué tiene que hacer la primera versión? -->\n",
        "## Fuera de alcance\n\nSincronizar.\n",
        "## Stack\n\nrecomiéndame\n",
        "## Despliegue\n\n<!-- ¿Dónde y cómo se va a usar o desplegar? -->\n",
        "## Restricciones\n\n<!-- ¿Alguna restricción? (plazos, presupuesto, normas, compatibilidad…) -->\n",
      ].join("\n"),
    );
    expect(git(root, "show", "--name-only", "--format=", "HEAD")).toContain("PRODUCT.md");
  });

  it("leaves the questions for the agent to ask in the chat (AC2)", async () => {
    const root = await tempRepo({ "README.md": "# Notas\n" });
    const done = await cli(root, INIT);
    expect(done.out).toContain(
      "Proyecto nuevo: PRODUCT.md creado con las preguntas por responder.",
    );
    expect(done.out).toContain(
      'SIGUIENTE: es un proyecto nuevo: hazle al usuario las preguntas de PRODUCT.md, complétalo con sus respuestas y crea el primer cambio, el esqueleto del proyecto, con `specty new "Esqueleto del proyecto" --request "<petición literal del usuario>"`.',
    );
    const product = await read(root, "PRODUCT.md");
    expect(product.match(/<!-- /g)).toHaveLength(7);
    expect(product).toContain(
      "## Stack\n\n<!-- ¿Con qué lenguaje y herramientas? (o «recomiéndame») -->\n",
    );
  });

  it("plans PRODUCT.md with --dry-run, without asking or writing (AC4)", async () => {
    const root = await tempRepo({ "README.md": "# Notas\n" });
    // A person at the terminal, but a dry run never asks.
    const terminal = { ...person(), ask: () => Promise.reject(new Error("no debe preguntar")) };
    const planned = await cli(root, [...INIT, "--dry-run"], { terminal });
    expect(planned.code).toBe(0);
    expect(planned.out).toContain("crear PRODUCT.md");
    expect(await exists(`${root}/PRODUCT.md`)).toBe(false);
  });

  it("does nothing new with code, a detected stack or a PRODUCT.md already there (AC3)", async () => {
    const cases: readonly [Record<string, string>, string | undefined][] = [
      [{ "src/app.c": "int main(void) { return 0; }\n" }, undefined],
      [{ "package.json": '{"name":"x","scripts":{"test":"true"}}\n' }, undefined],
      [{ "README.md": "# Notas\n", "PRODUCT.md": "# Mío\n" }, "# Mío\n"],
    ];
    for (const [files, product] of cases) {
      const root = await tempRepo(files);
      const done = await cli(root, INIT);
      expect(done.out).not.toContain("Proyecto nuevo");
      expect(done.out).toContain("SIGUIENTE: completa las secciones «Mapa» y «Convenciones»");
      if (product === undefined) expect(await exists(`${root}/PRODUCT.md`)).toBe(false);
      else expect(await read(root, "PRODUCT.md")).toBe(product);
    }
  });
});
