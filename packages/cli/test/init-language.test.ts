// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import type { Terminal } from "../src/session";
import { cli, person, read, tempRepo, writeFiles } from "./support";

const QUESTION = "¿En qué idioma trabaja Specty? · Which language should Specty work in?";
/** A terminal like macOS's or VS Code's: its locale says nothing about the person. */
const C_LOCALE = { LANG: "C.UTF-8", LC_ALL: "C.UTF-8" };

/** A person who answers `language` and the interview, and whose questions are recorded in order. */
function recorded(language: string) {
  const questions: string[] = [];
  const offered: string[][] = [];
  const base = person({ choose: [language], ask: ["Una app de notas."] });
  const terminal: Terminal = {
    ...base,
    choose: async (message, options) => {
      questions.push(message);
      offered.push(options.map((option) => option.value));
      return base.choose(message, options);
    },
    ask: async (message) => {
      questions.push(message);
      return base.ask(message);
    },
  };
  return { terminal, questions, offered };
}

/** A person at the terminal who must not be asked anything. */
const UNASKED: Terminal = {
  ...person(),
  choose: () => Promise.reject(new Error("no debe preguntar el idioma")),
};

describe("init asks first which language Specty works in", () => {
  it("before anything else, and uses the answer for everything (AC1)", async () => {
    const root = await tempRepo({ "README.md": "# Notas\n" });
    const { terminal, questions, offered } = recorded("es");
    const done = await cli(root, ["init", "--tools", "claude-code"], { terminal, env: C_LOCALE });
    expect(done.code).toBe(0);
    // The question, the git flow's, then the interview of a new project, already in Spanish.
    expect(questions.slice(0, 3)).toEqual([
      QUESTION,
      "¿Qué flujo de git sigue este repositorio? Specty nombrará así las ramas de los cambios.",
      "¿Qué vas a construir? Una o dos frases.",
    ]);
    // The C locale detects English: offered first, and the person picked Spanish.
    expect(offered[0]).toEqual(["en", "es"]);
    expect(parse(await read(root, ".specty/config.yaml")).language).toBe("es");
    const agents = await read(root, "AGENTS.md");
    expect(agents).toContain("## Flujo de trabajo (Specty)");
    expect(agents).toContain("Habla con el usuario en español.");
    expect(await read(root, "PRODUCT.md")).toContain("## Qué es\n\nUna app de notas.");
    expect(done.out).toContain("SIGUIENTE:");
  });

  it("offers the detected language first, and the answer still rules (AC1)", async () => {
    const root = await tempRepo({ "src/app.ts": "export const a = 1;\n" });
    const { terminal, offered } = recorded("en");
    const done = await cli(root, ["init", "--tools", "claude-code"], { terminal });
    // The languages, then the git flows.
    expect(offered).toEqual([
      ["es", "en"],
      ["specty", "github", "gitflow", "trunk"],
    ]);
    expect(parse(await read(root, ".specty/config.yaml")).language).toBe("en");
    expect(await read(root, "AGENTS.md")).toContain("Talk to the user in English.");
    expect(done.out).toContain("NEXT:");
  });

  it("is not asked with --language, by an agent or in a dry run (AC2)", async () => {
    const files = { "src/app.ts": "export const a = 1;\n" };
    const chosen = await tempRepo(files);
    // With the agents and the flow given too, nothing is left to ask.
    const given = await cli(
      chosen,
      ["init", "--language", "es", "--tools", "claude-code", "--git-flow", "specty"],
      { terminal: UNASKED, env: C_LOCALE },
    );
    expect(given.code).toBe(0);
    expect(parse(await read(chosen, ".specty/config.yaml")).language).toBe("es");
    const planned = await cli(await tempRepo(files), ["init", "--dry-run"], { terminal: UNASKED });
    expect(planned.code).toBe(0);
    // An agent cannot answer: it gets the system's language.
    const agent = await tempRepo(files);
    expect((await cli(agent, ["init", "--tools", "claude-code"], { env: C_LOCALE })).code).toBe(0);
    expect(parse(await read(agent, ".specty/config.yaml")).language).toBe("en");
  });
});

describe("init --language on a configured repository", () => {
  it("changes only the language, and rewrites Specty's blocks in it (AC3)", async () => {
    const root = await tempRepo({ "src/app.ts": "export const a = 1;\n" });
    await cli(root, ["init", "--language", "en", "--tools", "claude-code"]);
    const config = `# Mine\n${await read(root, ".specty/config.yaml")}`;
    await writeFiles(root, { ".specty/config.yaml": config });
    const changed = await cli(root, ["init", "--language", "es", "--tools", "claude-code"]);
    expect(changed.code).toBe(0);
    expect(changed.out).toContain(".specty/config.yaml: Specty trabaja ahora en español.");
    expect(await read(root, ".specty/config.yaml")).toBe(
      config.replace(/^language: en$/m, "language: es"),
    );
    const agents = await read(root, "AGENTS.md");
    expect(agents).toContain("## Flujo de trabajo (Specty)");
    expect(agents).not.toContain("## Workflow (Specty)");
    // Without --language, a person is not asked again and the language stays.
    const again = await cli(root, ["init", "--tools", "claude-code"], { terminal: UNASKED });
    expect(again.out).toContain(".specty/config.yaml ya existía; no se tocó.");
    expect(parse(await read(root, ".specty/config.yaml")).language).toBe("es");
  });
});
