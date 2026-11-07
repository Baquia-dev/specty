// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { contentRisks, isRiskRule, riskLabel } from "../../src";

/** A `git diff -U0` block for `path`: its headers, then one hunk from line `start`. */
function block(path: string, start: number, lines: readonly string[], headers: string[] = []) {
  return [
    `diff --git a/${path} b/${path}`,
    ...headers,
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -1,0 +${start},${lines.length} @@`,
    ...lines,
  ].join("\n");
}

const rules = (diff: string) =>
  contentRisks(diff).map((risk) => `${risk.path}:${risk.line ?? "-"} ${risk.rule}`);

describe("contentRisks", () => {
  it("flags the added lines that match a rule, with their line and CWE", () => {
    const diff = block("src/api.ts", 13, [
      "+const agent = new Agent({ rejectUnauthorized: false });",
      "+const value = eval(input);",
      "+const fine = 1;",
      "-const old = eval(other);",
      "+el.innerHTML = html;",
    ]);
    expect(contentRisks(diff)).toEqual([
      { path: "src/api.ts", line: 13, rule: "tls-disabled", cwe: "CWE-295" },
      { path: "src/api.ts", line: 14, rule: "eval", cwe: "CWE-95" },
      { path: "src/api.ts", line: 16, rule: "html-unescaped", cwe: "CWE-79" },
    ]);
  });

  it("knows the usual sinks of each language", () => {
    const python = block("app/jobs.py", 1, [
      "+subprocess.run(cmd, shell=True)",
      "+data = pickle.loads(blob)",
      "+exec(code)",
      "+digest = hashlib.md5(password).hexdigest()",
      "+os.chmod(path, 0o777)",
    ]);
    const go = block("cmd/client.go", 1, ["+tls := &tls.Config{InsecureSkipVerify: true}"]);
    const web = block("src/server.ts", 1, [
      "+const match = pattern.exec(text);",
      "+app.use(cors({ origin: true, credentials: true }));",
      "+const key = 'AKIAABCDEFGHIJKLMNOP';",
    ]);
    expect(rules([python, go, web].join("\n"))).toEqual([
      "app/jobs.py:1 shell",
      "app/jobs.py:2 deserialization",
      "app/jobs.py:3 python-exec",
      "app/jobs.py:4 weak-hash",
      "app/jobs.py:5 world-writable",
      "cmd/client.go:1 tls-disabled",
      "src/server.ts:2 cors-any",
      "src/server.ts:3 secret",
    ]);
  });

  it("flags files that become executable and paths of payments, webhooks or security", () => {
    const executable = block(
      "scripts/run.sh",
      1,
      ["+echo hola"],
      ["old mode 100644", "new mode 100755"],
    );
    const created = [
      "diff --git a/bin/tool b/bin/tool",
      "new file mode 100755",
      "--- /dev/null",
      "+++ b/bin/tool",
      "@@ -0,0 +1 @@",
      "+#!/bin/sh",
    ].join("\n");
    const paths = [
      block("src/payments/charge.ts", 1, ["+export const charge = 1;"]),
      block("src/webhook.ts", 1, ["+export const hook = 1;"]),
    ];
    expect(rules([executable, created, ...paths].join("\n"))).toEqual([
      "bin/tool:- executable",
      "scripts/run.sh:- executable",
      "src/payments/charge.ts:- risky-path",
      "src/webhook.ts:- risky-path",
    ]);
  });

  it("leaves tests alone", () => {
    const diff = block("src/api.test.ts", 1, ["+expect(eval('1')).toBe(1);"]);
    expect(contentRisks(diff)).toEqual([]);
  });

  it("names each rule in both languages", () => {
    expect(riskLabel("tls-disabled", "es")).toBe("desactiva la verificación TLS");
    expect(riskLabel("risky-path", "en")).toBe("is in a payments, webhooks or security path");
  });
});

describe("the person's risk rules (warnings.risks)", () => {
  /** A `console.log` left in the code, with its CWE, in any file. */
  const CONSOLE = { label: "deja un console.log", pattern: "console\\.log\\(", cwe: "CWE-532" };
  /** A `print` call, only in Python files, with no CWE. */
  const PRINT = { label: "llama a print", pattern: "\\bprint\\(", extensions: ["PY"] };
  const named = (diff: string) =>
    contentRisks(diff, [CONSOLE, PRINT]).map(
      (risk) => `${risk.path}:${risk.line ?? "-"} ${risk.label ?? risk.rule}`,
    );

  it("AC1: adds a finding with the person's text and CWE for each added line that matches, after Specty's", () => {
    const diff = block("src/api.ts", 3, [
      "+const value = eval(input); console.log(value);",
      "+console.log('hola');",
      "+const fine = 1;",
      "-console.log('old');",
    ]);
    expect(contentRisks(diff, [CONSOLE])).toEqual([
      { path: "src/api.ts", line: 3, rule: "eval", cwe: "CWE-95" },
      { path: "src/api.ts", line: 3, rule: "custom", label: "deja un console.log", cwe: "CWE-532" },
      { path: "src/api.ts", line: 4, rule: "custom", label: "deja un console.log", cwe: "CWE-532" },
    ]);
    const withoutCwe = contentRisks(block("tools/run.py", 1, ["+print(value)"]), [PRINT]);
    expect(withoutCwe).toEqual([
      { path: "tools/run.py", line: 1, rule: "custom", label: "llama a print" },
    ]);
    expect(withoutCwe[0]).not.toHaveProperty("cwe");
  });

  it("AC1: without rules of the person, finds what it found before", () => {
    const diff = block("src/api.ts", 1, ["+console.log(eval(x));"]);
    expect(contentRisks(diff, [])).toEqual(contentRisks(diff));
    expect(contentRisks(diff)).toEqual([
      { path: "src/api.ts", line: 1, rule: "eval", cwe: "CWE-95" },
    ]);
  });

  it("AC2: a rule with extensions looks only at those files, ignoring capitals; one without, at every file; none at tests", () => {
    const diff = [
      block("tools/run.py", 1, ["+print(value)"]),
      block("tools/build.PY", 2, ["+print(value)"]),
      block("src/view.ts", 1, ["+print(value); console.log(1);"]),
      block("src/api.test.ts", 1, ["+console.log(1); print(2)"]),
      block("tools/test_run.py", 1, ["+print(value); console.log(1)"]),
    ].join("\n");
    expect(named(diff)).toEqual([
      "src/view.ts:1 deja un console.log",
      "tools/build.PY:2 llama a print",
      "tools/run.py:1 llama a print",
    ]);
  });

  it("AC4: names a rule of the person by its text in both languages, and one with no text by a generic one", () => {
    expect(isRiskRule("custom")).toBe(true);
    expect(riskLabel("custom", "es", "deja un console.log")).toBe("deja un console.log");
    expect(riskLabel("custom", "en", "deja un console.log")).toBe("deja un console.log");
    expect(riskLabel("custom", "es")).toBe("coincide con una regla de riesgo del proyecto");
    expect(riskLabel("custom", "en")).toBe("matches a risk rule of the project");
    expect(riskLabel("eval", "es", undefined)).toBe("ejecuta código construido al vuelo (eval)");
  });
});
