// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { CONFIG, cli, tempRepo, writeFiles } from "./support";

/** No Dart tool runs in the tests: the project's commands and `secrets` stay off. */
const OFF = "checks:\n  levels: { secrets: off, tests: off, lint: off, format: off }\n";

const STRICT = [
  "analyzer:",
  "  language:",
  "    strict-casts: true",
  "    strict-inference: true",
  "    strict-raw-types: true",
  "",
].join("\n");

const NOT_STRICT =
  "  analysis_options.yaml el analizador no está en modo estricto: pon a true strict-casts, strict-inference y strict-raw-types en `analyzer.language`";

async function repo(files: Readonly<Record<string, string>> = {}, config = OFF): Promise<string> {
  return tempRepo({
    "pubspec.yaml": "name: app\n",
    "lib/app.dart": "void main() {}\n",
    ".specty/config.yaml": `${CONFIG()}${config}`,
    ...files,
  });
}

describe("dart-strict in specty check", () => {
  it("fails when the analyzer is not in strict mode", async () => {
    const missing = await repo();
    expect(await cli(missing, ["check"])).toMatchObject({
      code: 1,
      out: ["FALLA dart-strict", NOT_STRICT, "OK 6/7 · FALLA: dart-strict"].join("\n"),
    });
    const partial = await repo({
      "analysis_options.yaml": STRICT.replace("strict-casts: true", "strict-casts: false").replace(
        "    strict-raw-types: true\n",
        "",
      ),
    });
    expect((await cli(partial, ["check"])).out).toContain(
      "  analysis_options.yaml el analizador no está en modo estricto: pon a true strict-casts y strict-raw-types en `analyzer.language`",
    );
  });

  it("follows the includes, by package and by path, and lets its own options win", async () => {
    const packaged = await repo({
      "analysis_options.yaml": "include: package:team_lints/strict.yaml\n",
      ".dart_tool/package_config.json": `${JSON.stringify({
        configVersion: 2,
        packages: [{ name: "team_lints", rootUri: "../vendor/team_lints", packageUri: "lib/" }],
      })}\n`,
      "vendor/team_lints/lib/strict.yaml": STRICT,
    });
    expect(await cli(packaged, ["check"])).toMatchObject({ code: 0, out: "OK 7/7" });
    const relative = await repo({
      "analysis_options.yaml": "include:\n  - tools/team.yaml\n",
      "tools/team.yaml": STRICT,
    });
    expect((await cli(relative, ["check"])).out).toBe("OK 7/7");
    await writeFiles(packaged, {
      "analysis_options.yaml":
        "include: package:team_lints/strict.yaml\nanalyzer:\n  language:\n    strict-casts: false\n",
    });
    expect((await cli(packaged, ["check"])).out).toContain(
      "  analysis_options.yaml el analizador no está en modo estricto: pon a true strict-casts en `analyzer.language`",
    );
  });

  it("only warns when an include cannot be read", async () => {
    const root = await repo({
      "analysis_options.yaml": "include: package:very_good_analysis/analysis_options.yaml\n",
    });
    expect(await cli(root, ["check"])).toMatchObject({
      code: 0,
      out: [
        "AVISO dart-strict",
        "  analysis_options.yaml no encuentro `package:very_good_analysis/analysis_options.yaml` (¿falta `dart pub get`?): no sé si trae el modo estricto",
        "OK 6/7 · AVISO: dart-strict",
      ].join("\n"),
    });
  });

  it("fails on each comment the change adds that switches the analyzer off", async () => {
    const root = await repo({
      "analysis_options.yaml": STRICT,
      "lib/app.dart": "// ignore: avoid_print\nvoid main() {}\n",
    });
    await writeFiles(root, {
      "lib/app.dart": [
        "// ignore_for_file: type=lint",
        "// ignore: avoid_print",
        "void main() {}",
        "final y = load(); // ignore: dead_code",
        "",
      ].join("\n"),
    });
    const run = await cli(root, ["check"]);
    expect(run.code).toBe(1);
    expect(run.out).toBe(
      [
        "FALLA dart-strict",
        "  lib/app.dart:1 `// ignore_for_file:` apaga el analizador en todo el archivo",
        "  lib/app.dart:4 `// ignore:` apaga el analizador en esa línea",
        "OK 6/7 · FALLA: dart-strict",
      ].join("\n"),
    );
  });

  it("is absent with no Dart, and speaks English", async () => {
    const plain = await tempRepo({
      "package.json": `${JSON.stringify({ name: "app" })}\n`,
      ".specty/config.yaml": `${CONFIG()}checks:\n  levels: { secrets: off }\n`,
    });
    const ids = JSON.parse((await cli(plain, ["--json", "check"])).out).checks.map(
      (check: { id: string }) => check.id,
    );
    expect(ids).not.toContain("dart-strict");
    const root = await repo({
      ".specty/config.yaml": `${CONFIG().replace("language: es", "language: en")}${OFF}`,
    });
    expect((await cli(root, ["check"])).out).toContain(
      "  analysis_options.yaml the analyzer is not in strict mode: set strict-casts, strict-inference and strict-raw-types to true in `analyzer.language`",
    );
  });
});
