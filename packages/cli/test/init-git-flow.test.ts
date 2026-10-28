// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { exists } from "../src/io/files";
import type { Terminal } from "../src/session";
import { cli, git, person, read, tempRepo, writeFiles } from "./support";

const CODE = { "src/app.ts": "export const a = 1;\n" };
const init = (root: string, ...flags: string[]) =>
  cli(root, ["init", "--language", "es", "--tools", "claude-code", ...flags]);
const configOf = async (root: string) => read(root, ".specty/config.yaml");
const flowOf = async (root: string) => parse(await configOf(root)).git.flow;

/**
 * A person who answers `answer` to the one question with a single answer init asks here, the
 * flow (`undefined` cancels it), and whose questions of that kind are recorded.
 */
function asking(answer: string | undefined) {
  const asked: { readonly message: string; readonly labels: readonly string[] }[] = [];
  const base = person({ choose: answer === undefined ? [] : [answer] });
  const terminal: Terminal = {
    ...base,
    choose: (message, options) => {
      asked.push({ message, labels: options.map((option) => option.label) });
      return answer === undefined ? Promise.resolve(undefined) : base.choose(message, options);
    },
  };
  return { terminal, asked };
}
const byPerson = (root: string, terminal: Terminal, ...flags: string[]) =>
  cli(root, ["init", "--language", "es", "--tools", "claude-code", ...flags], { terminal });
/** A person who must not be asked anything with a single answer. */
const UNASKED: Terminal = {
  ...person(),
  choose: () => Promise.reject(new Error("no debe preguntar el flujo")),
};

describe("init asks a person for the git flow", () => {
  it("after the agents, with the detected one first, and writes the answer (AC1, AC2)", async () => {
    const root = await tempRepo(CODE);
    git(root, "branch", "develop");
    const { terminal, asked } = asking("github");
    expect((await byPerson(root, terminal)).code).toBe(0);
    expect(asked.map((question) => question.message)).toEqual([
      "¿Qué flujo de git sigue este repositorio? El detectado va primero; Specty nombrará así las ramas de los cambios.",
    ]);
    expect(asked[0]?.labels[0]).toBe("Git Flow: feature/<slug> y bugfix/<slug> (detectado)");
    expect(await flowOf(root)).toBe("github");
  });

  it("offers Specty's first when nothing is detected, and Git Flow prepares develop (AC1, AC2)", async () => {
    const root = await tempRepo(CODE);
    const { terminal, asked } = asking("gitflow");
    await byPerson(root, terminal);
    expect(asked[0]?.message).toBe(
      "¿Qué flujo de git sigue este repositorio? Specty nombrará así las ramas de los cambios.",
    );
    expect(asked[0]?.labels[0]).toBe("Specty: specty/<id>");
    expect(parse(await configOf(root)).git).toMatchObject({ flow: "gitflow", target: "develop" });
    expect(git(root, "branch", "--list", "develop")).toContain("develop");
  });

  it("writes the detected one when the person cancels, or none (AC3)", async () => {
    const detected = await tempRepo(CODE);
    git(detected, "branch", "feat/login");
    await byPerson(detected, asking(undefined).terminal);
    expect(await flowOf(detected)).toBe("github");
    const nothing = await tempRepo(CODE);
    await byPerson(nothing, asking(undefined).terminal);
    expect(await flowOf(nothing)).toBeUndefined();
  });

  it("does not ask with --git-flow, nor in a configuration that exists (AC5)", async () => {
    const root = await tempRepo(CODE);
    expect((await byPerson(root, UNASKED, "--git-flow", "trunk")).code).toBe(0);
    expect((await byPerson(root, UNASKED)).code).toBe(0);
    expect(await flowOf(root)).toBe("trunk");
    // One without a flow keeps it so: --git-flow chooses one.
    const without = await tempRepo(CODE);
    await init(without);
    git(without, "branch", "feat/login");
    expect((await byPerson(without, UNASKED)).code).toBe(0);
    expect(await flowOf(without)).toBeUndefined();
  });
});

describe("init without a person to ask for the git flow", () => {
  it("writes the detected one only when it creates the configuration (AC4)", async () => {
    const created = await tempRepo(CODE);
    git(created, "branch", "hotfix/caida");
    await init(created);
    expect(await flowOf(created)).toBe("gitflow");
    const existing = await tempRepo(CODE);
    await init(existing);
    git(existing, "branch", "feat/login");
    await init(existing);
    expect(await flowOf(existing)).toBeUndefined();
  });

  it("warns a new project with none, and its next step asks the user for it (AC6)", async () => {
    const root = await tempRepo({ "README.md": "# Notas\n" });
    const done = await init(root);
    expect(done.out).toContain(
      "Proyecto nuevo sin flujo de git: las ramas de los cambios serán specty/<id> hasta que lo elijas con",
    );
    expect(done.out).toContain(
      "SIGUIENTE: es un proyecto nuevo: pregúntale al usuario qué flujo de git seguirá",
    );
    const person = await tempRepo({ "README.md": "# Notas\n" });
    const cancelled = await byPerson(person, asking(undefined).terminal);
    expect(cancelled.out).toContain("SIGUIENTE: elige el flujo de git con `");
  });
});

describe("init --git-flow", () => {
  it("creates the configuration with the flow, and says how branches will be named (AC1)", async () => {
    const root = await tempRepo(CODE);
    const done = await init(root, "--git-flow", "github");
    expect(done.code).toBe(0);
    expect(parse(await configOf(root)).git).toMatchObject({
      branchPerChange: true,
      flow: "github",
    });
    expect(done.out).toContain(
      ".specty/config.yaml: git.flow es github; las ramas de los cambios serán <tipo>/<slug>, como feat/<slug>.",
    );
  });

  it("changes only the flow of an existing configuration, and leaves it alone without the flag (AC2, AC3)", async () => {
    const root = await tempRepo(CODE);
    await init(root);
    const mine = `# Mía\n${await configOf(root)}`;
    await writeFiles(root, { ".specty/config.yaml": mine });
    const trunk = await init(root, "--git-flow", "trunk");
    expect(trunk.out).toContain(".specty/config.yaml: git.flow es trunk;");
    expect(await configOf(root)).toBe(
      mine.replace("  branchPerChange: true\n", "  branchPerChange: true\n  flow: trunk\n"),
    );
    // Git Flow replaces the value, and goes to develop when the configuration names no target.
    await init(root, "--git-flow", "gitflow");
    expect(await configOf(root)).toBe(
      mine.replace(
        "  branchPerChange: true\n",
        "  branchPerChange: true\n  flow: gitflow\n  target: develop\n",
      ),
    );
    const again = await init(root);
    expect(again.out).toContain(".specty/config.yaml ya existía; no se tocó.");
    expect(parse(await configOf(root)).git.flow).toBe("gitflow");
  });

  it("keeps the target the configuration already has (AC3)", async () => {
    const root = await tempRepo(CODE);
    await init(root);
    await writeFiles(root, {
      ".specty/config.yaml": `${await configOf(root)}  target: main\n`,
    });
    await init(root, "--git-flow", "gitflow");
    expect(parse(await configOf(root)).git).toMatchObject({ flow: "gitflow", target: "main" });
  });

  it("installs nothing for an unknown flow, and names the valid ones (AC5)", async () => {
    const root = await tempRepo(CODE);
    const refused = await init(root, "--git-flow", "svn");
    expect(refused.code).toBe(1);
    expect(refused.out).toContain("Flujo de git desconocido: svn.");
    expect(refused.out).toContain("--git-flow specty|github|trunk|gitflow");
    expect(await exists(`${root}/.specty/config.yaml`)).toBe(false);
  });
});

describe("init --git-flow gitflow and develop", () => {
  const develop = (root: string) => git(root, "branch", "--list", "develop");

  it("creates develop from where init committed, and says so (AC4)", async () => {
    const root = await tempRepo(CODE);
    const done = await init(root, "--git-flow", "gitflow");
    expect(done.out).toContain(
      "Rama develop creada desde main: ahí empiezan y terminan los cambios.",
    );
    expect(git(root, "rev-parse", "develop")).toBe(git(root, "rev-parse", "main"));
    expect(git(root, "log", "-1", "--format=%s", "develop")).toContain("Specty");
    // An existing develop stays as it is.
    expect((await init(root, "--git-flow", "gitflow")).out).not.toContain("Rama develop creada");
  });

  it("takes the remote's develop when there is one (AC4)", async () => {
    const root = await tempRepo(CODE);
    const before = git(root, "rev-parse", "HEAD");
    git(root, "remote", "add", "origin", "https://example.com/app.git");
    git(root, "update-ref", "refs/remotes/origin/develop", before);
    const done = await init(root, "--git-flow", "gitflow");
    expect(done.out).toContain("Rama develop creada desde origin/develop");
    expect(git(root, "rev-parse", "develop")).toBe(before);
    // It follows the remote's.
    expect(git(root, "config", "--get", "branch.develop.merge")).toBe("refs/heads/develop");
  });

  it("creates no branch in a dry run, nor when changes go elsewhere (AC4)", async () => {
    const dry = await tempRepo(CODE);
    await init(dry, "--git-flow", "gitflow", "--dry-run");
    expect(develop(dry)).toBe("");
    const elsewhere = await tempRepo(CODE);
    await init(elsewhere);
    await writeFiles(elsewhere, {
      ".specty/config.yaml": `${await configOf(elsewhere)}  target: main\n`,
    });
    await init(elsewhere, "--git-flow", "gitflow");
    expect(develop(elsewhere)).toBe("");
  });
});
