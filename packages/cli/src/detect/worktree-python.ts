// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import { readText } from "../io/files";
import type { FormatterExclusion } from "./formatters";
import { requirement } from "./quality";

/**
 * Python's linters that walk every folder under the root, hidden ones too: from the main folder,
 * flake8, Pylint and isort check a change's copies in `.worktrees/`, and Black does when the project
 * sets its own `exclude` (its default one reads `.gitignore`). Each exclusion compares the folder's
 * name, or a pattern from the project's root, so it holds inside a worktree and with any path
 * (ADR 0018). Flask's and Uvicorn's reloaders see it too, but take their exclusion on the command
 * line, which `doctor` can't read.
 */
const PATH = ".worktrees/";

/** A file and section where a tool reads its settings, and how its exclusion is written there. */
interface Place {
  readonly file: string;
  readonly header: RegExp;
  readonly key: string;
  readonly add: string;
}

interface Tool {
  readonly name: string;
  /** In the order the tool looks for them. */
  readonly places: readonly Place[];
  /** Run with its defaults when only the requirements name it: then it goes in `pyproject.toml`. */
  readonly requirement?: string;
  /** Whether the settings found make it see the folder; always, unless said otherwise. */
  readonly sees?: (settings: string) => boolean;
}

const INI = ".worktrees";
const TOML = '".worktrees"';
const FLAKE8 = /^\[flake8\]$/;
const ISORT = /^\[(?:isort|tool:isort)\]$/;

const PYPROJECT_PYLINT: Place = {
  file: "pyproject.toml",
  header: /^\[tool\.pylint[.\]]/,
  key: "[tool.pylint.main] ignore",
  add: '"CVS", ".worktrees"',
};
const PYPROJECT_ISORT: Place = {
  file: "pyproject.toml",
  header: /^\[tool\.isort\]$/,
  key: "[tool.isort] extend_skip",
  add: TOML,
};

const TOOLS: readonly Tool[] = [
  {
    name: "flake8",
    places: [".flake8", "setup.cfg", "tox.ini"].map((file) => ({
      file,
      header: FLAKE8,
      key: "[flake8] extend-exclude",
      add: INI,
    })),
  },
  {
    name: "Pylint",
    places: [
      // Pylint's own file: any of its sections may hold `ignore`, which goes in `[MAIN]`.
      ...["pylintrc", ".pylintrc"].map((file) => ({
        file,
        header: /^\[/,
        key: "[MAIN] ignore",
        add: "CVS,.worktrees",
      })),
      PYPROJECT_PYLINT,
    ],
    requirement: "pylint",
  },
  {
    name: "isort",
    places: [
      {
        file: ".isort.cfg",
        header: /^\[(?:settings|isort)\]$/,
        key: "[settings] extend_skip",
        add: INI,
      },
      PYPROJECT_ISORT,
      ...["setup.cfg", "tox.ini"].map((file) => ({
        file,
        header: ISORT,
        key: "[isort] extend_skip",
        add: INI,
      })),
    ],
    requirement: "isort",
  },
  {
    name: "Black",
    places: [
      {
        file: "pyproject.toml",
        header: /^\[tool\.black\]$/,
        key: "[tool.black] extend-exclude",
        add: "'^/\\.worktrees/'",
      },
    ],
    sees: (settings) => /^\s*exclude\s*=/m.test(settings),
  },
];

/** The Python tools at the root that would check `.worktrees/`, with their exclusion. */
export async function pythonExclusions(root: string): Promise<FormatterExclusion[]> {
  const found = await Promise.all(TOOLS.map((tool) => detect(root, tool)));
  return found.filter((one): one is FormatterExclusion => one !== undefined);
}

/** The tool's settings in the first place it reads them, or its requirement alone. */
async function detect(root: string, tool: Tool): Promise<FormatterExclusion | undefined> {
  for (const place of tool.places) {
    const settings = sections((await readText(join(root, place.file))) ?? "", place.header);
    if (settings === undefined) continue;
    return (tool.sees?.(settings) ?? true) ? exclusion(tool.name, place, settings) : undefined;
  }
  if (tool.requirement === undefined || !(await requirement(tool.requirement)(root))) {
    return undefined;
  }
  const pyproject = tool.places.find((place) => place.file === "pyproject.toml");
  return pyproject === undefined ? undefined : exclusion(tool.name, pyproject, "");
}

function exclusion(name: string, place: Place, settings: string): FormatterExclusion {
  return {
    name,
    path: PATH,
    file: `${place.file} (${place.key})`,
    add: place.add,
    excluded: settings.includes(".worktrees"),
  };
}

/** A section header of an INI or TOML file, alone on its line. */
const HEADER = /^\[\[?[^[\]]+\]\]?\s*(?:[#;].*)?$/;

/** The lines of every section whose header matches `header`, or undefined when there is none. */
function sections(text: string, header: RegExp): string | undefined {
  let inside = false;
  let found = false;
  const kept: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (HEADER.test(trimmed)) {
      inside = header.test(trimmed);
      found ||= inside;
    }
    if (inside) kept.push(line);
  }
  return found ? kept.join("\n") : undefined;
}
