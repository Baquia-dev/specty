// SPDX-License-Identifier: Apache-2.0

/**
 * The coverage reports `diff-coverage` reads, in the four formats coverage tools write: LCOV,
 * Cobertura, JaCoCo and Go's profile. Each gives, per file as the report names it, every line it
 * measured and whether some test ran it.
 */

/** Per file, each measured line and whether some test ran it. */
export type Coverage = ReadonlyMap<string, ReadonlyMap<number, boolean>>;

type Lines = Map<number, boolean>;

/** The report in `text`, by its format; an absolute path inside `root` becomes relative. */
export function parseCoverage(text: string, root: string): Coverage {
  const files = new Map<string, Lines>();
  const lines = (path: string): Lines => {
    const key = relative(path, root);
    const found = files.get(key) ?? new Map<number, boolean>();
    files.set(key, found);
    return found;
  };
  if (/^mode: \w+/.test(text)) goProfile(text, lines);
  else if (/^SF:/m.test(text)) lcov(text, lines);
  else if (/<report[\s>]/.test(text) && /<sourcefile[\s>]/.test(text)) jacoco(text, lines);
  else if (/<coverage[\s>]/.test(text) && /<class\s/.test(text)) cobertura(text, root, lines);
  return files;
}

/** A line ran when any record of it ran. */
function mark(lines: Lines, line: number, ran: boolean): void {
  lines.set(line, lines.get(line) === true || ran);
}

/** `SF:<file>` opens a file, `DA:<line>,<hits>` measures a line, `end_of_record` closes it. */
function lcov(text: string, lines: (path: string) => Lines): void {
  let current: Lines | undefined;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("SF:")) current = lines(line.slice(3));
    else if (line === "end_of_record") current = undefined;
    else if (current !== undefined && line.startsWith("DA:")) {
      const [number, hits] = line.slice(3).split(",");
      if (number !== undefined && hits !== undefined)
        mark(current, Number(number), Number(hits) > 0);
    }
  }
}

/** `<class filename>` holds `<line number hits>`, the file relative to the first `<source>`. */
function cobertura(text: string, root: string, lines: (path: string) => Lines): void {
  const source = /<source>([^<]*)<\/source>/.exec(text)?.[1]?.trim();
  const base = source === undefined ? undefined : inside(source, root);
  for (const block of text.split(/<class\s/).slice(1)) {
    const filename = attribute(block.slice(0, block.indexOf(">")), "filename");
    if (filename === undefined) continue;
    const file = lines(base === undefined || base === "" ? filename : `${base}/${filename}`);
    for (const tag of block.split(/<\/class>/)[0]?.match(/<line\s[^>]*>/g) ?? []) {
      const number = attribute(tag, "number");
      const hits = attribute(tag, "hits");
      if (number !== undefined && hits !== undefined) mark(file, Number(number), Number(hits) > 0);
    }
  }
}

/** `<package name>` holds `<sourcefile name>` with `<line nr ci>`: run when `ci` is above 0. */
function jacoco(text: string, lines: (path: string) => Lines): void {
  for (const pack of text.split(/<package\s/).slice(1)) {
    const name = attribute(pack.slice(0, pack.indexOf(">")), "name") ?? "";
    for (const source of pack.split(/<sourcefile\s/).slice(1)) {
      const file = attribute(source.slice(0, source.indexOf(">")), "name");
      if (file === undefined) continue;
      const measured = lines(name === "" ? file : `${name}/${file}`);
      for (const tag of source.split(/<\/sourcefile>/)[0]?.match(/<line\s[^>]*>/g) ?? []) {
        const number = attribute(tag, "nr");
        const covered = attribute(tag, "ci");
        if (number !== undefined && covered !== undefined)
          mark(measured, Number(number), Number(covered) > 0);
      }
    }
  }
}

/** `<file>:<l1>.<c1>,<l2>.<c2> <statements> <count>`: the block's lines ran when its count is above 0. */
function goProfile(text: string, lines: (path: string) => Lines): void {
  for (const line of text.split("\n").slice(1)) {
    const block = /^(.+):(\d+)\.\d+,(\d+)\.\d+ \d+ (\d+)$/.exec(line.trim());
    if (block === null) continue;
    const [, file = "", from = "0", to = "0", count = "0"] = block;
    const measured = lines(file);
    for (let number = Number(from); number <= Number(to); number++)
      mark(measured, number, Number(count) > 0);
  }
}

function attribute(tag: string, name: string): string | undefined {
  return new RegExp(`\\s${name}="([^"]*)"`).exec(` ${tag}`)?.[1];
}

/** `path` relative to `root` when it is inside it; otherwise as given, with forward slashes. */
function relative(path: string, root: string): string {
  const slashed = path.replaceAll("\\", "/");
  return inside(slashed, root) ?? slashed.replace(/^\.\//, "");
}

/** `path` relative to `root`, `""` for the root itself, or undefined when it is outside. */
function inside(path: string, root: string): string | undefined {
  const base = root.replaceAll("\\", "/").replace(/\/+$/, "");
  const slashed = path.replaceAll("\\", "/").replace(/\/+$/, "");
  if (slashed === base) return "";
  return slashed.startsWith(`${base}/`) ? slashed.slice(base.length + 1) : undefined;
}
