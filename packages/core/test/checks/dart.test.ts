// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { analyzerIgnores } from "../../src";

// The comments are put together from parts, so that this file does not trip `specty check`.
const IGNORE = "ignore";

describe("analyzerIgnores", () => {
  it("finds the comments that switch the analyzer off, for a line or for the file", () => {
    const text = [
      `// ${IGNORE}_for_file: type=lint`,
      "import 'package:app/a.dart';",
      `// ${IGNORE}: invalid_assignment`,
      "int x = '';",
      `final y = load(); // ${IGNORE}: unused_local_variable, dead_code`,
      `  //   ${IGNORE}:avoid_print`,
    ].join("\n");
    expect(analyzerIgnores(text)).toEqual([
      { line: 1, scope: "file" },
      { line: 3, scope: "line" },
      { line: 5, scope: "line" },
      { line: 6, scope: "line" },
    ]);
  });

  it("leaves out a comment that only talks about them, and strings", () => {
    const text = [
      `// do not ${IGNORE}: the analyzer knows best`,
      `final hint = '// ${IGNORE}: not a comment';`,
      `/// Docs mention ${IGNORE}_for_file: in passing.`,
      `// ${IGNORE}d: a word that only starts like it`,
    ].join("\n");
    expect(analyzerIgnores(text)).toEqual([]);
  });
});
