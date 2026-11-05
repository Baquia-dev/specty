// SPDX-License-Identifier: Apache-2.0
import { closingCommitSubject } from "@baquia-dev/specty-core";
import { describe, expect, it } from "vitest";
import { exists } from "../src/io/files";
import {
  APP,
  CHANGE,
  cli,
  git,
  inWorktree,
  person,
  read,
  stateIn,
  toClosing,
  tryGit,
  writeFiles,
} from "./support";

const BRANCH = `specty/${CHANGE}`;
/** The glossary of a project in Spanish, where a closing adds the terms it introduced. */
const GLOSSARY = "docs/dominio.md";
const TERMS =
  "# Dominio\n\n- Saludo: lo que dice la app al abrirse.\n\n- Usuario: quien la abre.\n";
const NAME = "\n- Nombre: cómo se llama quien abre la app.\n";
const FAREWELL = "\n- Despedida: lo que dice la app al cerrarse.\n";

/**
 * A change whose closing, still uncommitted, writes `closing` to the glossary, while main commits
 * `main` to it meanwhile.
 */
async function bothChangeTheGlossary(closing: string, main: string) {
  const { root, folder } = await inWorktree({ ...APP, [GLOSSARY]: TERMS });
  await toClosing(folder);
  await writeFiles(folder, { [GLOSSARY]: closing });
  await writeFiles(root, { [GLOSSARY]: main });
  git(root, "commit", "-q", "-am", "main cambia el glosario");
  return { root, folder };
}

describe("closing when the closing and main changed the same file", () => {
  it("AC3: names the closing's own commit in Spanish and in English", () => {
    expect(closingCommitSubject("Saludo", "es")).toBe("docs(spec): cierre de Saludo");
    expect(closingCommitSubject("Greeting", "en")).toBe("docs(spec): closing of Greeting");
  });

  it("AC1: commits the closing first, incorporates main and lands with both changes", async () => {
    const { root, folder } = await bothChangeTheGlossary(
      `${TERMS}${NAME}`,
      TERMS.replace("# Dominio", "# Dominio de la app"),
    );
    const closed = await cli(folder, ["close"], { terminal: person() });
    expect(closed.code).toBe(0);
    expect(closed.out).toContain("Incorporado a main.");
    expect(git(root, "rev-parse", "main")).toBe(git(root, "rev-parse", BRANCH));
    // The merge's first parent is the closing's own commit.
    const merge = git(root, "rev-list", "--merges", "-1", BRANCH);
    expect(git(root, "log", "-1", "--format=%s", `${merge}^1`)).toBe(
      "docs(spec): cierre de Saludo personalizado",
    );
    expect(await read(root, GLOSSARY)).toBe(
      `${TERMS.replace("# Dominio", "# Dominio de la app")}${NAME}`,
    );
    expect(await exists(folder)).toBe(false);
  });

  it("AC2: leaves a conflict in the glossary for `specty integrate`, and closes after it", async () => {
    const { root, folder } = await bothChangeTheGlossary(`${TERMS}${NAME}`, `${TERMS}${FAREWELL}`);
    const stopped = await cli(folder, ["close"], { terminal: person() });
    expect(stopped.code).toBe(2);
    expect(stopped.out).toContain("ejecuta `specty integrate`");
    expect(tryGit(folder, "rev-parse", "-q", "--verify", "MERGE_HEAD").status).toBe(0);
    expect(await stateIn(folder)).toHaveProperty("integration.conflicts", [GLOSSARY]);
    expect((await cli(folder, ["next"])).out).toContain(`CONFLICTOS:\n  ${GLOSSARY}`);

    const resolved = `${TERMS}${FAREWELL}${NAME}`;
    await writeFiles(folder, { [GLOSSARY]: resolved });
    expect((await cli(folder, ["integrate"])).code).toBe(0);
    const closed = await cli(folder, ["close"], { terminal: person() });
    expect(closed.code).toBe(0);
    expect(closed.out).toContain("Incorporado a main.");
    expect(git(root, "rev-parse", "main")).toBe(git(root, "rev-parse", BRANCH));
    expect(await read(root, GLOSSARY)).toBe(resolved);
    expect(await exists(folder)).toBe(false);
  });
});
