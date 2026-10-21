// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { analyzeShell } from "../../src";
import { tokenize } from "../../src/guard/tokens";

const words = (command: string) =>
  tokenize(command).map((segment) => segment.map((token) => token.text));

describe("tokenize", () => {
  it("splits commands and keeps quoted text together", () => {
    expect(words(`git commit -m "a b" && echo 'c;d' | wc -l; ls`)).toEqual([
      ["git", "commit", "-m", "a b"],
      ["echo", "c;d"],
      ["wc", "-l"],
      ["ls"],
    ]);
  });

  it("reads redirections, including descriptors", () => {
    expect(words("cmd >out 2>&1 >>log &>all")).toEqual([
      [`cmd`, ">", "out", "2>", "&1", ">>", "log", "&>", "all"],
    ]);
  });
});

describe("analyzeShell", () => {
  it("finds Specty subcommands however Specty is invoked", () => {
    expect(analyzeShell("specty approve").specty).toEqual(["approve"]);
    expect(analyzeShell('node "/x/packages/cli/dist/specty.mjs" close').specty).toEqual(["close"]);
    expect(analyzeShell("npx -y @baquia-dev/specty accept").specty).toEqual(["accept"]);
    expect(analyzeShell("pnpm exec specty cancel").specty).toEqual(["cancel"]);
    expect(analyzeShell("env FOO=1 specty approve --scope S1").specty).toEqual(["approve"]);
    expect(analyzeShell("sudo specty next").specty).toEqual(["next"]);
  });

  it("flags the unrelated `specty` npm package", () => {
    expect(analyzeShell("npx specty next").unscopedNpx).toBe(true);
    expect(analyzeShell("pnpm dlx specty@latest").unscopedNpx).toBe(true);
    expect(analyzeShell("npx -y @baquia-dev/specty next").unscopedNpx).toBe(false);
  });

  it("detects commits and hook bypasses", () => {
    expect(analyzeShell("git commit -am 'x'").commits).toEqual([{ all: true }]);
    expect(analyzeShell("git commit -m 'x'").commits).toEqual([{ all: false }]);
    expect(analyzeShell("git commit --no-verify -m x").bypass).toBe(true);
    expect(analyzeShell("git commit -nm x").bypass).toBe(true);
    expect(analyzeShell("git -c core.hooksPath=/dev/null commit -m x").bypass).toBe(true);
    expect(analyzeShell("HUSKY=0 git commit -m x").bypass).toBe(true);
    expect(analyzeShell("git config core.hooksPath .nothing").bypass).toBe(true);
    expect(analyzeShell("git status && git log").bypass).toBe(false);
  });

  it("finds files written or removed", () => {
    expect(analyzeShell("echo hi > src/a.ts && cat b >> src/c.ts 2>&1").writes).toEqual([
      "src/a.ts",
      "src/c.ts",
    ]);
    expect(analyzeShell("echo x 2>/dev/null").writes).toEqual([]);
    expect(analyzeShell("sed -i '' 's/a/b/' src/a.ts").writes).toEqual(["src/a.ts"]);
    expect(analyzeShell("sed -i -e 's/a/b/' src/a.ts src/b.ts").writes).toEqual([
      "src/a.ts",
      "src/b.ts",
    ]);
    expect(analyzeShell("cat x | tee -a src/log.ts").writes).toEqual(["src/log.ts"]);
    expect(analyzeShell("rm -rf build src/old.ts").deletes).toEqual(["build", "src/old.ts"]);
    const moved = analyzeShell("mv src/a.ts src/b.ts");
    expect([moved.deletes, moved.writes]).toEqual([["src/a.ts"], ["src/b.ts"]]);
    expect(analyzeShell("cp src/a.ts src/copy.ts").writes).toEqual(["src/copy.ts"]);
    expect(analyzeShell("pnpm test").writes).toEqual([]);
  });
});
