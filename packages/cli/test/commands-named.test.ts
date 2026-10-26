// SPDX-License-Identifier: Apache-2.0
import { mkdtemp, readdir, readFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cli } from "./support";

const PACKAGES = join(import.meta.dirname, "..", "..");
const SOURCES = ["core/src", "cli/src"];

/**
 * A command a text names between backticks: `specty <verb> …` or `${ctx.command} <verb> …`, in a
 * plain string or a template literal (where its backticks are escaped).
 */
const NAMED = /\\?`(?:specty|\$\{(?:[\w.]*\.)?command\}) ([a-z][\w-]*(?: [^`]*?)?)\\?`/g;
const COMMENT = /^\s*(?:\/\/|\/\*|\*)/;

interface Named {
  readonly file: string;
  readonly text: string;
}

/** Every command the texts of core and the CLI name, outside comments. */
async function namedCommands(): Promise<Named[]> {
  const files = (
    await Promise.all(
      SOURCES.map(async (source) =>
        (
          await readdir(join(PACKAGES, source), { recursive: true })
        )
          .filter((path) => path.endsWith(".ts"))
          .map((path) => join(source, path)),
      ),
    )
  ).flat();
  const named = await Promise.all(
    files.map(async (file) =>
      (await readFile(join(PACKAGES, file), "utf8"))
        .split("\n")
        .filter((line) => !COMMENT.test(line))
        .flatMap((line) =>
          [...line.matchAll(NAMED)].map((match) => ({ file, text: match[1] ?? "" })),
        ),
    ),
  );
  const unique = new Map(named.flat().map((entry) => [entry.text, entry]));
  return [...unique.values()];
}

/**
 * The argument lists a named command stands for: placeholders become a value, optional brackets
 * go, and `on|off` gives one list per alternative.
 */
function argvsOf(text: string): string[][] {
  const words = [
    ...text
      .replace(/\$\{[^}]*\}/g, "x")
      .replace(/<[^>]*>/g, "x")
      .replace(/[[\]]/g, "")
      .matchAll(/"[^"]*"|\S+/g),
  ].map(([word]) => (word.startsWith('"') ? word.slice(1, -1) : word));
  return words.reduce<string[][]>(
    (lists, word) =>
      word.includes("|") && !word.startsWith("-")
        ? lists.flatMap((list) => word.split("|").map((choice) => [...list, choice]))
        : lists.map((list) => [...list, word]),
    [[]],
  );
}

/** How the CLI's parser rejects an argument list. */
const REJECTED =
  /error: (?:unknown (?:command|option)|option .* argument missing|command-argument value)[^\n]*/;

describe("commands named in texts", () => {
  it("split placeholders, brackets and alternatives", () => {
    // A placeholder as the sources write it.
    expect(argvsOf(`task done \${id} --summary "<qué hiciste>"`)).toEqual([
      ["task", "done", "x", "--summary", "x"],
    ]);
    expect(argvsOf("delegate on|off")).toEqual([
      ["delegate", "on"],
      ["delegate", "off"],
    ]);
    expect(argvsOf("approve [--scope <S>]")).toEqual([["approve", "--scope", "x"]]);
  });

  it("exist, with every option they use", async () => {
    // Outside git, a command the parser accepts stops at the session: no repository.
    const outside = await realpath(await mkdtemp(join(tmpdir(), "specty-named-")));
    const rejects = async (argv: string[]) => {
      const run = await cli(outside, argv);
      return REJECTED.exec(`${run.out}\n${run.err}`)?.[0];
    };
    expect(await rejects(["approve", "--scope", "S1"])).toBeUndefined();
    expect(await rejects(["approve", "--alcance", "S1"])).toContain("unknown option");
    expect(await rejects(["aprobar"])).toContain("unknown command");
    const named = await namedCommands();
    expect(named.length).toBeGreaterThan(30);
    const rejected: string[] = [];
    for (const { file, text } of named) {
      for (const argv of argvsOf(text)) {
        const error = await rejects(argv);
        if (error !== undefined) rejected.push(`${file}: specty ${argv.join(" ")} — ${error}`);
      }
    }
    expect(rejected).toEqual([]);
  });
});
