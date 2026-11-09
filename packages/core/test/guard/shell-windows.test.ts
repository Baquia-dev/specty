// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { analyzeShell } from "../../src";
import { tokenize } from "../../src/guard/tokens";

const words = (command: string) =>
  tokenize(command).map((piece) =>
    typeof piece === "string" ? piece : piece.map((token) => token.text),
  );

describe("analyzeShell with Windows paths", () => {
  it('AC1: keeps a `\\` inside double quotes unless it escapes `$`, `` ` ``, `"`, `\\` or a newline, as bash', () => {
    expect(words('echo "a\\$b \\"c\\" d\\\\e f\\g h\\`i\\\nj"')).toEqual([
      ["echo", 'a$b "c" d\\e f\\g h`ij'],
    ]);
    expect(words('cd "C:\\Users\\ana\\otro"')).toEqual([["cd", "C:\\Users\\ana\\otro"]]);
    // Single quotes keep every `\`; outside quotes, bash drops it.
    expect(words("echo 'C:\\Users\\ana' C:\\Users\\ana")).toEqual([
      ["echo", "C:\\Users\\ana", "C:Usersana"],
    ]);
  });

  it("AC1: places a commit and a write named between double quotes with `\\`", () => {
    expect(analyzeShell('cd "C:\\Users\\ana\\otro" && git commit -m x').commits).toEqual([
      { all: false, directory: "C:\\Users\\ana\\otro" },
    ]);
    expect(analyzeShell('git -C "C:\\Users\\ana\\otro" commit -am x').commits).toEqual([
      { all: true, directory: "C:\\Users\\ana\\otro" },
    ]);
    expect(analyzeShell('echo x > "C:\\Users\\ana\\a.ts"').writes).toEqual([
      "C:\\Users\\ana\\a.ts",
    ]);
  });

  it("AC2: takes a drive's or a share's path as absolute, also after a `cd`", () => {
    expect(analyzeShell("cd src && echo hi > 'C:\\Users\\ana\\fuera.ts'").writes).toEqual([
      "C:\\Users\\ana\\fuera.ts",
    ]);
    expect(analyzeShell("cd src && echo hi > C:/Users/ana/fuera.ts").writes).toEqual([
      "C:/Users/ana/fuera.ts",
    ]);
    expect(analyzeShell("cd src && rm -rf '\\\\servidor\\share\\x'").deletes).toEqual([
      "\\\\servidor\\share\\x",
    ]);
    expect(
      analyzeShell("cd src && git worktree remove 'D:\\r\\.worktrees\\x'").worktreeRemovals,
    ).toEqual([{ name: "D:\\r\\.worktrees\\x", path: "D:\\r\\.worktrees\\x" }]);
  });

  it("AC2: moves the commands after a `cd` or a `git -C` to a Windows path", () => {
    const moved = analyzeShell(
      "cd src && cd 'C:\\Users\\ana\\otro\\' && echo x > a.ts && pnpm test",
    );
    expect(moved.writes).toEqual(["C:\\Users\\ana\\otro/a.ts"]);
    expect(moved.runsIn).toContain("C:\\Users\\ana\\otro");
    expect(moved.runsIn).not.toContain("src/C:\\Users\\ana\\otro");
    expect(analyzeShell("cd src && cd C:/Users/ana/ && git commit -m x").commits).toEqual([
      { all: false, directory: "C:/Users/ana" },
    ]);
    expect(analyzeShell("cd src && cd 'C:\\' && git commit -m x").commits).toEqual([
      { all: false, directory: "C:\\" },
    ]);
    expect(analyzeShell("cd src && git -C 'C:\\Users\\ana' -C otro commit").commits).toEqual([
      { all: false, directory: "C:\\Users\\ana/otro" },
    ]);
  });

  it("AC2: keeps relative paths with a drive letter but no separator relative, as before", () => {
    expect(analyzeShell("cd src && echo x > C:a.ts").writes).toEqual(["src/C:a.ts"]);
    expect(analyzeShell("cd src && echo x > /tmp/a.ts").writes).toEqual(["/tmp/a.ts"]);
  });
});
