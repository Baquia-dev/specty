// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { contentRisks, riskLabel } from "../../src";

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
