// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { analyzeShell } from "../../src";
import { tokenize } from "../../src/guard/tokens";

const words = (command: string) =>
  tokenize(command).map((piece) =>
    typeof piece === "string" ? piece : piece.map((token) => token.text),
  );

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

  it("skips comments and heredoc bodies, as bash does not run them", () => {
    expect(words("cat <<'EOF' > out # note\nx > y\nEOF\nls")).toEqual([
      ["cat", "<<", "EOF", ">", "out"],
      ["ls"],
    ]);
  });

  it("marks subshells, but not the parentheses of arithmetic", () => {
    expect(words("(specty next 2>&1 || echo x) | head -60")).toEqual([
      "(",
      ["specty", "next", "2>", "&1"],
      ["echo", "x"],
      ")",
      ["head", "-60"],
    ]);
    expect(words("echo $(pwd)")).toEqual([["echo", "$"], "(", ["pwd"], ")"]);
    expect(words("echo $(( (1 + 2) * 3 ))")).toEqual([
      ["echo", "$((", "(1", "+", "2)", "*", "3", "))"],
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

  it("names the change each `specty enter` enters (AC1)", () => {
    expect(analyzeShell("specty enter 20261026-saludo").enters).toEqual(["20261026-saludo"]);
    expect(analyzeShell('node "/x/dist/specty.mjs" enter --x 2026-a && ls').enters).toEqual([
      "2026-a",
    ]);
    expect(analyzeShell("specty next").enters).toEqual([]);
    expect(analyzeShell("specty enter").enters).toEqual([]);
  });

  it("says where each command runs, following its `cd`s, but not the `cd`s (AC4)", () => {
    expect(analyzeShell("pnpm test").runsIn).toEqual([""]);
    expect(analyzeShell("cd /w/x && pnpm test; ls").runsIn).toEqual(["/w/x", "/w/x"]);
    expect(analyzeShell("cd src && cat a.ts").runsIn).toEqual(["src"]);
    expect(analyzeShell("(cd /w/x && make) && ls").runsIn).toEqual(["/w/x", ""]);
    expect(analyzeShell("cd $HOME && ls").runsIn).toEqual([undefined]);
    expect(analyzeShell("cd /w/x").runsIn).toEqual([]);
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

  it("lets `git config` read `core.hooksPath` (AC1)", () => {
    for (const command of [
      "git config --get core.hooksPath",
      "git config core.hooksPath",
      "git config --get-all core.hooksPath",
      "git config --show-origin --get-regexp core.hookspath",
      "git config --file .git/config --get core.hooksPath",
      "git config get core.hooksPath",
      "git config --list | grep core.hooksPath",
    ]) {
      expect(analyzeShell(command).bypass).toBe(false);
    }
  });

  it("still blocks `git config` that changes `core.hooksPath` (AC2)", () => {
    for (const command of [
      "git config core.hooksPath .nothing",
      "git config --local core.hooksPath ''",
      "git config core.hooksPath get",
      "git config --add core.hooksPath x",
      "git config --replace-all core.hooksPath x",
      "git config --unset core.hooksPath",
      "git config --unset-all core.hooksPath",
      "git config set core.hooksPath x",
      "git config unset core.hooksPath",
      "git -c core.hooksPath=x config --get core.hooksPath",
    ]) {
      expect(analyzeShell(command).bypass).toBe(true);
    }
  });

  it("says where a commit runs when a `cd` or `git -C` names another folder", () => {
    const other = analyzeShell("cd /tmp/other && git init -q && git commit -m x");
    expect(other.commits).toEqual([{ all: false, directory: "/tmp/other" }]);
    expect(analyzeShell("git -C ../other commit -am x").commits).toEqual([
      { all: true, directory: "../other" },
    ]);
    expect(analyzeShell("cd sub && git -C ../x commit -m y").commits).toEqual([
      { all: false, directory: "sub/../x" },
    ]);
    expect(analyzeShell("git -C /a -C b commit").commits).toEqual([
      { all: false, directory: "/a/b" },
    ]);
    expect(analyzeShell("cd $X && git commit -m x").commits).toEqual([{ all: false }]);
    expect(analyzeShell("cd - && git commit -m x").commits).toEqual([{ all: false }]);
  });

  it("reads inside subshells and does not take `2>&1)` for a file (AC5)", () => {
    const next = analyzeShell(
      "(specty next 2>&1 || npx -y @baquia-dev/specty next 2>&1) | head -60",
    );
    expect([next.writes, next.specty]).toEqual([[], ["next", "next"]]);
    expect(analyzeShell("(git commit -m x)").commits).toEqual([{ all: false }]);
    expect(analyzeShell("echo $(git commit -m x)").commits).toEqual([{ all: false }]);
    expect(analyzeShell("echo $(pwd) > src/a.ts").writes).toEqual(["src/a.ts"]);
    expect(analyzeShell("(echo hi > src/a.ts)").writes).toEqual(["src/a.ts"]);
  });

  it("keeps a subshell's `cd` inside it (AC6)", () => {
    expect(analyzeShell("(cd /tmp) && echo hi > src/app.ts").writes).toEqual(["src/app.ts"]);
    expect(analyzeShell("(cd /tmp && echo hi > a.ts)").writes).toEqual(["/tmp/a.ts"]);
    expect(analyzeShell("cd a && (cd b; touch c) && touch d").writes).toEqual(["a/b/c", "a/d"]);
    expect(analyzeShell("echo $(cd /tmp; pwd) > a.ts").writes).toEqual(["a.ts"]);
    expect(analyzeShell("cd sub ) ; touch a").writes).toEqual(["sub/a"]);
    expect(analyzeShell("(cd /tmp/other && git commit -m x)").commits).toEqual([
      { all: false, directory: "/tmp/other" },
    ]);
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

  it("does not take a heredoc delimiter or a here-string for a file", () => {
    const heredoc = analyzeShell("cat > src/a.ts <<'EOF'\nx\nEOF");
    expect(heredoc.writes).toEqual(["src/a.ts"]);
    expect(analyzeShell("wc -l <<< 'text'").writes).toEqual([]);
  });

  it("does not read heredoc bodies as commands (AC1, AC2, AC7)", () => {
    const body = "x => src/a.ts\ngit commit -m x\n";
    for (const open of ["<<EOF", "<< EOF", "<<'EOF'", '<<"EOF"', "<<\\EOF"]) {
      expect(analyzeShell(`cat ${open}\n${body}EOF`)).toMatchObject({ writes: [], commits: [] });
    }
    const python = "python3 - <<'PY'\n# map: old => packages/core/src/index.ts\nprint(1)\nPY";
    expect(analyzeShell(python).writes).toEqual([]);
    const after = analyzeShell("cat <<'EOF' > /dev/null\ndon't\nEOF\ngit commit -m x");
    expect(after.commits).toEqual([{ all: false }]);
    expect(analyzeShell("cat <<EOF\nx\nEOF\necho hi > src/b.ts").writes).toEqual(["src/b.ts"]);
    const open = analyzeShell("cat <<EOF\nx > src/a.ts\ngit commit -m x");
    expect([open.writes, open.commits]).toEqual([[], []]);
  });

  it("closes a `<<-` heredoc on a line indented with tabs (AC3)", () => {
    const dashed = analyzeShell("cat <<-EOF\n\tx > src/a.ts\n\tEOF\ngit commit -m x");
    expect([dashed.writes, dashed.commits]).toEqual([[], [{ all: false }]]);
    expect(analyzeShell("cat <<EOF\n\tEOF\ngit commit -m x").commits).toEqual([]);
  });

  it("skips the bodies of several heredocs in order (AC4)", () => {
    const both = analyzeShell(
      "cat <<A; cat <<'B'\na > src/a.ts\nA\nb > src/b.ts\nB\ngit commit -m x",
    );
    expect([both.writes, both.commits]).toEqual([[], [{ all: false }]]);
  });

  it("does not take arithmetic or a here-string for a heredoc (AC5)", () => {
    for (const command of ["echo $((1 << 2))", "(( x = 1 << 2 ))", "wc -l <<< 'text'"]) {
      expect(analyzeShell(`${command}\ngit commit -m x`).commits).toEqual([{ all: false }]);
    }
    expect(analyzeShell("echo $((a > b)) > src/a.ts").writes).toEqual(["src/a.ts"]);
  });

  it("ignores comments, but not a `#` inside a word (AC6)", () => {
    expect(analyzeShell("echo hi # > src/a.ts").writes).toEqual([]);
    expect(analyzeShell("# git commit -m x\nls").commits).toEqual([]);
    expect(analyzeShell("echo a#b > src/a.ts").writes).toEqual(["src/a.ts"]);
    expect(analyzeShell('echo "#" $# > src/a.ts').writes).toEqual(["src/a.ts"]);
  });

  it("places relative paths after `cd` (AC2)", () => {
    const edit = analyzeShell("cd packages/ui && sed -i '' 's/a/b/' src/catalog/catalog.ts");
    expect(edit.writes).toEqual(["packages/ui/src/catalog/catalog.ts"]);
    expect(analyzeShell("cd /tmp/x/ && rm -rf foo").deletes).toEqual(["/tmp/x/foo"]);
    expect(analyzeShell("cd .. && rm x").deletes).toEqual(["../x"]);
    expect(analyzeShell("cd a; cd b && touch c").writes).toEqual(["a/b/c"]);
    expect(analyzeShell("cd -P src && mv a.ts b.ts").deletes).toEqual(["src/a.ts"]);
    expect(analyzeShell("echo x > /abs/path").writes).toEqual(["/abs/path"]);
  });

  it("reports what it cannot place instead of guessing (AC3)", () => {
    const scratch = analyzeShell("S=/tmp/x && mkdir -p $S/biome && cd $S/biome && cat > a.css");
    expect(scratch.writes).toEqual([]);
    expect(scratch.unresolved).toEqual(["a.css"]);
    expect(analyzeShell('echo > "$HOME/a" && rm ~/b').unresolved).toEqual(["$HOME/a", "~/b"]);
    expect(analyzeShell("cd - && rm a").unresolved).toEqual(["a"]);
    expect(analyzeShell("cd && rm a").unresolved).toEqual(["a"]);
    const absolute = analyzeShell("cd $X && cd /repo && rm a");
    expect([absolute.deletes, absolute.unresolved]).toEqual([["/repo/a"], []]);
  });
});
