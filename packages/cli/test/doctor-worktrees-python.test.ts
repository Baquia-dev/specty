// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { APP, cli, tempRepo, writeFiles } from "./support";

const seen = (name: string, add: string, file: string) =>
  `${name} también revisa .worktrees/, que escribe Specty: añade ${add} en ${file}.`;

/**
 * The doctor of a project where `new` already made a change in `.worktrees/`, with `files` written
 * afterwards: Python's manifests in the commit could make `new` install the project in the worktree.
 */
async function doctorWith(files: Readonly<Record<string, string>>) {
  const root = await tempRepo(APP);
  expect((await cli(root, ["new", "--worktree", "Saludo personalizado"])).code).toBe(0);
  await writeFiles(root, files);
  return { root, doctor: await cli(root, ["doctor"]) };
}

describe("doctor and the Python tools that would see the changes' worktrees", () => {
  it("AC1: asks flake8 for .worktrees in extend-exclude of the file that configures it", async () => {
    const { root, doctor } = await doctorWith({ ".flake8": "[flake8]\nmax-line-length = 100\n" });
    expect(doctor.code).toBe(1);
    expect(doctor.out).toContain(seen("flake8", ".worktrees", ".flake8 ([flake8] extend-exclude)"));

    await writeFiles(root, {
      ".flake8": "[flake8]\nmax-line-length = 100\nextend-exclude = .worktrees\n",
    });
    const fixed = await cli(root, ["doctor"]);
    expect(fixed.out).toContain("flake8 excluye .worktrees/.");
    expect(fixed.out).not.toContain("también revisa .worktrees/");

    // In setup.cfg's section, when there is no .flake8.
    const { doctor: cfg } = await doctorWith({
      "setup.cfg": "[metadata]\nname = x\n\n[flake8]\nmax-line-length = 100\n",
    });
    expect(cfg.out).toContain(seen("flake8", ".worktrees", "setup.cfg ([flake8] extend-exclude)"));
  });

  it("AC2: asks Pylint for .worktrees in ignore, in pyproject.toml or its own file", async () => {
    const { root, doctor } = await doctorWith({
      "pyproject.toml": '[project]\nname = "x"\n\n[tool.pylint.format]\nmax-line-length = 100\n',
    });
    expect(doctor.code).toBe(1);
    expect(doctor.out).toContain(
      seen("Pylint", '"CVS", ".worktrees"', "pyproject.toml ([tool.pylint.main] ignore)"),
    );

    await writeFiles(root, {
      "pyproject.toml":
        '[project]\nname = "x"\n\n[tool.pylint.main]\nignore = ["CVS", ".worktrees"]\n',
    });
    const fixed = await cli(root, ["doctor"]);
    expect(fixed.out).toContain("Pylint excluye .worktrees/.");
    expect(fixed.out).not.toContain("también revisa .worktrees/");

    const { doctor: rc } = await doctorWith({ ".pylintrc": "[MAIN]\njobs = 2\n" });
    expect(rc.out).toContain(seen("Pylint", "CVS,.worktrees", ".pylintrc ([MAIN] ignore)"));

    // Only in the requirements, run with its defaults.
    const { doctor: required } = await doctorWith({ "requirements.txt": "pylint==4.1.3\n" });
    expect(required.out).toContain(
      seen("Pylint", '"CVS", ".worktrees"', "pyproject.toml ([tool.pylint.main] ignore)"),
    );
  });

  it("AC3: asks isort for .worktrees in extend_skip, in pyproject.toml or its own file", async () => {
    const { root, doctor } = await doctorWith({
      "pyproject.toml": '[project]\nname = "x"\n\n[tool.isort]\nprofile = "black"\n',
    });
    expect(doctor.code).toBe(1);
    expect(doctor.out).toContain(
      seen("isort", '".worktrees"', "pyproject.toml ([tool.isort] extend_skip)"),
    );

    await writeFiles(root, {
      "pyproject.toml":
        '[project]\nname = "x"\n\n[tool.isort]\nprofile = "black"\nextend_skip = [".worktrees"]\n',
    });
    const fixed = await cli(root, ["doctor"]);
    expect(fixed.out).toContain("isort excluye .worktrees/.");
    expect(fixed.out).not.toContain("también revisa .worktrees/");

    const { doctor: own } = await doctorWith({ ".isort.cfg": "[settings]\nprofile = black\n" });
    expect(own.out).toContain(seen("isort", ".worktrees", ".isort.cfg ([settings] extend_skip)"));

    const { doctor: cfg } = await doctorWith({ "setup.cfg": "[isort]\nprofile = black\n" });
    expect(cfg.out).toContain(seen("isort", ".worktrees", "setup.cfg ([isort] extend_skip)"));
  });

  it("AC4: asks Black for its extend-exclude only when the project sets its own exclude", async () => {
    const { root, doctor } = await doctorWith({
      "pyproject.toml": "[tool.black]\nline-length = 100\nexclude = '/(build|migrations)/'\n",
    });
    expect(doctor.code).toBe(1);
    expect(doctor.out).toContain(
      seen("Black", "'^/\\.worktrees/'", "pyproject.toml ([tool.black] extend-exclude)"),
    );

    await writeFiles(root, {
      "pyproject.toml":
        "[tool.black]\nline-length = 100\nexclude = '/(build|migrations)/'\nextend-exclude = '^/\\.worktrees/'\n",
    });
    const fixed = await cli(root, ["doctor"]);
    expect(fixed.out).toContain("Black excluye .worktrees/.");
    expect(fixed.out).not.toContain("también revisa .worktrees/");

    // With its default exclude, Black reads .gitignore: nothing to ask.
    await writeFiles(root, {
      "pyproject.toml": "[tool.black]\nline-length = 100\n\n[tool.other]\nexclude = 'x'\n",
    });
    const defaults = await cli(root, ["doctor"]);
    expect(defaults.out).not.toContain("Black");
  });
});
