// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { analyzeShell } from "../../src";
import { tokenize } from "../../src/guard/tokens";

const waits = (command: string) => analyzeShell(command).waits;

const words = (command: string) =>
  tokenize(command).map((piece) =>
    typeof piece === "string" ? piece : piece.map((token) => token.text),
  );

describe("the shell analysis of the commands that only wait", () => {
  it("AC1: finds `sleep` in any simple command, also inside loops, groups and wrappers", () => {
    for (const command of [
      "sleep 30",
      "sleep 5 && specty status",
      "specty status; sleep 10",
      "while true; do specty status; sleep 10; done",
      "until specty status | grep -q aprobada; do sleep 5; done",
      "if true; then sleep 1; fi",
      "{ sleep 1; }",
      "(sleep 1)",
      "! sleep 1",
      "nohup sleep 60 &",
      "FOO=1 sleep 2",
      "env FOO=1 sleep 2",
      "time sleep 2",
      "/bin/sleep 2",
    ]) {
      expect(waits(command), command).toEqual(["sleep"]);
    }
  });

  it("AC1: finds `caffeinate` with no program to run, whatever its options", () => {
    for (const command of [
      "caffeinate -w 4242",
      "caffeinate -w $PID",
      "caffeinate -t 600",
      "caffeinate -t600",
      "caffeinate -i -w 4242",
      "caffeinate -dimsu -t 60",
      "caffeinate -it 60",
      "caffeinate",
      "/usr/bin/caffeinate -w 4242",
      "specty status; caffeinate -w 4242",
      "if true; then caffeinate -w 4242; fi",
      "nohup caffeinate -t 60 &",
    ]) {
      expect(waits(command), command).toEqual(["caffeinate"]);
    }
  });

  it("AC1: with a program to run, `caffeinate` waits only as that program does", () => {
    for (const command of [
      "caffeinate -i sleep 60",
      "caffeinate -t 600 sleep 600",
      "caffeinate -- sleep 5",
      "caffeinate -i /bin/sleep 60",
    ]) {
      expect(waits(command), command).toEqual(["sleep"]);
    }
    for (const command of [
      "caffeinate -i pnpm test",
      "caffeinate -w 4242 pnpm build",
      "caffeinate -s make",
    ]) {
      expect(waits(command), command).toEqual([]);
    }
  });

  it("AC1: finds the shell's `wait` when the command launched nothing in the background before it", () => {
    for (const command of [
      "wait",
      "wait 4242",
      "wait %1",
      "wait -n",
      "wait $pid",
      "specty status; wait 4242",
      "command wait 4242",
      "while true; do wait; done",
    ]) {
      expect(waits(command), command).toEqual(["wait"]);
    }
  });

  it("AC2: does not count the shell's `wait` that collects the jobs the same command launched", () => {
    for (const command of [
      "pnpm test & pnpm lint & wait",
      "pnpm test &\npnpm lint &\nwait",
      "for f in a b; do gzip $f & done; wait",
      "(pnpm test) & wait",
      "pnpm build > out.log 2>&1 & wait $!",
    ]) {
      expect(waits(command), command).toEqual([]);
    }
    // The jobs it launched still count by themselves.
    expect(waits("sleep 60 & wait")).toEqual(["sleep"]);
  });

  it("AC1: finds `pwait`, `pidwait` and `tail` following only `/dev/null`", () => {
    expect(waits("pwait 4242")).toEqual(["pwait"]);
    expect(waits("pwait -t 60 4242")).toEqual(["pwait"]);
    expect(waits("pidwait node")).toEqual(["pidwait"]);
    for (const command of [
      "tail -f /dev/null",
      "tail -F /dev/null",
      "tail -qf /dev/null",
      "tail --follow /dev/null",
      "tail --follow=name /dev/null",
      "tail --pid=4242 -f /dev/null",
    ]) {
      expect(waits(command), command).toEqual(["tail"]);
    }
  });

  it("AC1: names the program of each simple command that waits, in order", () => {
    expect(waits("sleep 1; caffeinate -w 4242 && wait")).toEqual(["sleep", "caffeinate", "wait"]);
  });

  it("AC2: does not take a mention of those programs, or a command that also does work, for a wait", () => {
    for (const command of [
      "specty status",
      "specty next",
      "specty wait",
      "specty wait --timeout 600",
      "npx -y @baquia-dev/specty wait",
      "pnpm specty wait",
      'echo "sleep 5"',
      "echo wait",
      "grep -r sleep src",
      "grep -r caffeinate src",
      "cat sleep.txt",
      "git commit -m wait",
      "ls # sleep 5",
      "man caffeinate",
      "which pwait",
      "caffeinate -i pnpm test",
      "tail -f build.log",
      "tail -n 20 build.log",
      "tail /dev/null",
      "tail -f /dev/null build.log",
    ]) {
      expect(waits(command), command).toEqual([]);
    }
  });
});

describe("tokenize and the commands sent to the background", () => {
  it("AC2: marks the `&` after a command that runs in the background, and not `&&`, `2>&1`, `&>` or `|&`", () => {
    expect(words("pnpm test & pnpm lint & wait")).toEqual([
      ["pnpm", "test"],
      "&",
      ["pnpm", "lint"],
      "&",
      ["wait"],
    ]);
    expect(words("nohup sleep 60 &")).toEqual([["nohup", "sleep", "60"], "&"]);
    expect(words("a&b")).toEqual([["a"], "&", ["b"]]);
    expect(words("(a) & b")).toEqual(["(", ["a"], ")", "&", ["b"]]);
    expect(words("a && b 2>&1 &>all")).toEqual([["a"], ["b", "2>", "&1", "&>", "all"]]);
    expect(words("a >&2 & b")).toEqual([["a", ">", "&2"], "&", ["b"]]);
    expect(words("a |& b")).toEqual([["a"], ["b"]]);
  });
});
