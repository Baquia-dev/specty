// SPDX-License-Identifier: Apache-2.0
import { type DiffFile, type DiffLine, parseDiff } from "../data/diff";
import { sampleDiff } from "../data/sample-diffs";
import { type CodeToken, highlightFile, MAX_HIGHLIGHTED_LINES, spansOf } from "./highlight";
import { languageOf } from "./languages";

const [REPOSITORY, REPOSITORY_TEST] = parseDiff(sampleDiff("20261018-asistencia-curso", "T1"));

/** A new file at `path` with these lines. */
function newFile(path: string, lines: readonly string[]): DiffFile {
  const [file] = parseDiff(
    [
      `diff --git a/${path} b/${path}`,
      "new file mode 100644",
      "--- /dev/null",
      `+++ b/${path}`,
      `@@ -0,0 +1,${lines.length} @@`,
      ...lines.map((line) => `+${line}`),
    ].join("\n"),
  );
  if (file === undefined) throw new Error("No file");
  return file;
}

const lineOf = (file: DiffFile | undefined, text: string): DiffLine | undefined =>
  file?.hunks.flatMap((hunk) => hunk.lines).find((line) => line.text.includes(text));

/** The color of the piece of `tokens` that spells `text`. */
const colorOf = (tokens: readonly CodeToken[] | undefined, text: string) =>
  tokens?.find((token) => token.text.trim() === text)?.color;

describe("languageOf", () => {
  it("finds the language by extension or by name", () => {
    expect(languageOf("lib/attendance/panel.dart")?.id).toBe("dart");
    expect(languageOf("src/app.TS")?.id).toBe("typescript");
    expect(languageOf("web/App.tsx")?.id).toBe("tsx");
    expect(languageOf("deploy/Dockerfile")?.id).toBe("dockerfile");
    expect(languageOf(".github/workflows/ci.yml")?.id).toBe("yaml");
  });

  it("leaves out languages not on the list, and files with no extension", () => {
    expect(languageOf("docs/notes.txt")).toBeUndefined();
    expect(languageOf("Makefile")).toBeUndefined();
    expect(languageOf(".gitignore")).toBeUndefined();
  });
});

describe("spansOf", () => {
  const line: DiffLine = {
    kind: "added",
    text: "hasLength(14));",
    changed: [{ start: 10, end: 12 }],
  };

  it("cuts a line into the words that changed and the rest", () => {
    expect(spansOf(line)).toEqual([
      { text: "hasLength(", changed: false },
      { text: "14", changed: true },
      { text: "));", changed: false },
    ]);
    expect(spansOf({ kind: "context", text: "" })).toEqual([{ text: "", changed: false }]);
    expect(spansOf({ kind: "added", text: "all", changed: [{ start: 0, end: 3 }] })).toEqual([
      { text: "all", changed: true },
    ]);
  });

  it("cuts where a color or a changed word begins or ends (AC1)", () => {
    const tokens: readonly CodeToken[] = [
      { text: "hasLength", color: "var(--color-code-function)" },
      { text: "(" },
      { text: "14", color: "var(--color-code-constant)" },
      { text: "));" },
    ];
    expect(spansOf(line, tokens)).toEqual([
      { text: "hasLength", changed: false, color: "var(--color-code-function)" },
      { text: "(", changed: false },
      { text: "14", changed: true, color: "var(--color-code-constant)" },
      { text: "));", changed: false },
    ]);
    // A changed word across two colors keeps both.
    const across = { ...line, changed: [{ start: 8, end: 11 }] };
    expect(spansOf(across, tokens).filter((span) => span.changed)).toEqual([
      { text: "h", changed: true, color: "var(--color-code-function)" },
      { text: "(", changed: true },
      { text: "1", changed: true, color: "var(--color-code-constant)" },
    ]);
  });

  it("leaves out tokens that do not spell the line (AC2)", () => {
    expect(spansOf(line, [{ text: "other", color: "var(--color-code-keyword)" }])).toEqual(
      spansOf(line),
    );
  });
});

describe("highlightFile", () => {
  it("colors each line with the system's code colors (AC1)", async () => {
    const colors = await highlightFile(REPOSITORY ?? newFile("a.dart", []));
    const tokens = (text: string) =>
      colors?.get(lineOf(REPOSITORY, text) ?? { kind: "context", text: "" });
    expect(colorOf(tokens("final inWeek"), "final")).toBe("var(--color-code-keyword)");
    expect(colorOf(tokens("final inWeek"), "recordsFor")).toBe("var(--color-code-function)");
    expect(colorOf(tokens("import 'week.dart'"), "'week.dart'")).toBe("var(--color-code-string)");
    expect(colorOf(tokens("if (inWeek.isEmpty) return 0;"), "0")).toBe(
      "var(--color-code-constant)",
    );
    // Comments, in italics; plain text and punctuation, with no color.
    const comment = tokens("/// Porcentaje")?.find((token) => token.text.includes("Porcentaje"));
    expect(comment).toMatchObject({ color: "var(--color-code-comment)", italic: true });
    expect(colorOf(tokens("final inWeek"), "inWeek")).toBeUndefined();
  });

  it("colors removed lines from the old side and the rest from the new one", async () => {
    const colors = await highlightFile(REPOSITORY_TEST ?? newFile("a.dart", []));
    const lines = REPOSITORY_TEST?.hunks.flatMap((hunk) => hunk.lines) ?? [];
    expect(lines.every((line) => colors?.has(line))).toBe(true);
    for (const line of lines) {
      expect(
        colors
          ?.get(line)
          ?.map((token) => token.text)
          .join(""),
      ).toBe(line.text);
    }
    const removed = lines.find((line) => line.kind === "removed");
    expect(colorOf(colors?.get(removed ?? lines[0] ?? { kind: "context", text: "" }), "12")).toBe(
      "var(--color-code-constant)",
    );
  });

  it("leaves plain the languages not on the list, binary files and very long ones (AC2)", async () => {
    expect(await highlightFile(newFile("notes.txt", ["hello"]))).toBeUndefined();
    const [binary] = parseDiff(
      "diff --git a/logo.png b/logo.png\nBinary files a/logo.png and b/logo.png differ",
    );
    expect(binary && (await highlightFile(binary))).toBeUndefined();
    const long = Array.from({ length: MAX_HIGHLIGHTED_LINES + 1 }, (_, index) => `x = ${index}`);
    expect(await highlightFile(newFile("long.py", long))).toBeUndefined();
  });

  it("leaves the file plain when its grammar does not load (AC2)", async () => {
    const language = languageOf("config.toml");
    if (language === undefined) throw new Error("No TOML");
    const load = vi.spyOn(language, "load").mockRejectedValue(new Error("offline"));
    expect(await highlightFile(newFile("config.toml", ['name = "specty"']))).toBeUndefined();
    load.mockRestore();
    // Once it loads, the same file is highlighted.
    const colors = await highlightFile(newFile("config.toml", ['name = "specty"']));
    expect(colors?.size).toBe(1);
  });
});
