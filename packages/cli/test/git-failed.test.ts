// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { APP, CONFIG, cli, git, person, SPEC, SPEC_PATH, tempRepo, writeFiles } from "./support";

/** Makes `git commit` fail in `root` without touching the index: it signs with a program that fails. */
function failingCommits(root: string): void {
  git(root, "config", "commit.gpgsign", "true");
  git(root, "config", "gpg.program", "false");
}

/** A change in review in a repository whose sessions speak `language`, ready to approve. */
async function inReview(language: "es" | "en"): Promise<string> {
  const config = CONFIG().replace("language: es", `language: ${language}`);
  const root = await tempRepo({ ...APP, ".specty/config.yaml": config });
  expect((await cli(root, ["new", "Saludo personalizado"])).code).toBe(0);
  await writeFiles(root, { [SPEC_PATH]: SPEC });
  expect((await cli(root, ["propose"])).code).toBe(0);
  return root;
}

describe("a git failure inside a Specty command", () => {
  it("AC1: ends with an error card that names the git command and its error, not a trace", async () => {
    const root = await inReview("es");
    failingCommits(root);
    const approved = await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
    expect(approved.code).toBe(1);
    expect(approved.out).toContain(
      "Git falló y Specty no terminó el comando: git commit: error: gpg failed to sign",
    );
    expect(approved.out).toContain(
      "SIGUIENTE: corrige lo que hizo fallar a git (un hook, la firma, un archivo bloqueado…) y vuelve a ejecutar el comando.",
    );
    expect(`${approved.out}${approved.err}`).not.toMatch(/GitError|hint:|\n\s+at /);
  });

  it("AC2: says it in English in an English session", async () => {
    const root = await inReview("en");
    failingCommits(root);
    const approved = await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
    expect(approved.code).toBe(1);
    expect(approved.out).toContain(
      "Git failed and Specty did not finish the command: git commit: error: gpg failed to sign",
    );
    expect(approved.out).toContain("NEXT: fix what made git fail");
  });
});
