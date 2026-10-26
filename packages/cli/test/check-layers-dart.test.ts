// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { CONFIG, cli, tempRepo, writeFiles } from "./support";

/** No Dart tool runs in the tests: the project's commands, `dart-strict` and `secrets` stay off. */
const LAYERS = [
  "checks:",
  "  levels: { secrets: off, tests: off, lint: off, format: off, dart-strict: off }",
  "  layers:",
  '    domain: { paths: ["lib/domain/**"], forbiddenPackages: ["flutter", "dart:io"] }',
  '    infrastructure: { paths: ["lib/infrastructure/**"], may: [domain] }',
  '    ui: { paths: ["lib/ui/**"], may: [domain] }',
  "",
].join("\n");

const CHANGED = [
  "import 'package:app/infrastructure/old.dart';",
  "import 'package:flutter/material.dart';",
  "import '../infrastructure/db.dart';",
  "import 'dart:io';",
  "import 'email.dart';",
  "// import 'package:app/ui/home.dart';",
  "part 'user.g.dart';",
  "",
  "class User {}",
  "",
].join("\n");

async function repo(config = LAYERS): Promise<string> {
  return tempRepo({
    "pubspec.yaml": "name: app\n",
    ".specty/config.yaml": `${CONFIG()}${config}`,
    "lib/domain/user.dart": "import 'package:app/infrastructure/old.dart';\n\nclass User {}\n",
    "lib/domain/email.dart": "class Email {}\n",
    "lib/infrastructure/db.dart": "import '../domain/user.dart';\n",
    "lib/ui/home.dart": "import 'package:app/domain/user.dart';\n",
  });
}

describe("the layers check of specty check in Dart", () => {
  it("fails on each import the change adds across the layers, with no dependency-cruiser", async () => {
    const root = await repo();
    await writeFiles(root, { "lib/domain/user.dart": CHANGED });
    const run = await cli(root, ["check"]);
    expect(run.code).toBe(1);
    expect(run.out).toBe(
      [
        "FALLA layers",
        "  lib/domain/user.dart:2 `domain` no puede importar el paquete `flutter`",
        "  lib/domain/user.dart:3 `domain` no puede importar `infrastructure` (lib/infrastructure/db.dart)",
        "  lib/domain/user.dart:4 `domain` no puede importar el paquete `dart:io`",
        "OK 6/7 · FALLA: layers",
      ].join("\n"),
    );
  });

  it("looks at every import with --all", async () => {
    const root = await repo();
    await writeFiles(root, {
      "lib/ui/home.dart":
        "import 'package:app/domain/user.dart';\nimport 'package:app/infrastructure/db.dart';\n",
    });
    const all = await cli(root, ["check", "--all"]);
    expect(all.out).toContain(
      "  lib/domain/user.dart:1 `domain` no puede importar `infrastructure` (lib/infrastructure/old.dart)",
    );
    expect(all.out).toContain(
      "  lib/ui/home.dart:2 `ui` no puede importar `infrastructure` (lib/infrastructure/db.dart)",
    );
  });

  it("says it in English", async () => {
    const root = await repo();
    await writeFiles(root, {
      ".specty/config.yaml": `${CONFIG().replace("language: es", "language: en")}${LAYERS}`,
      "lib/domain/user.dart": CHANGED,
    });
    const run = await cli(root, ["check"]);
    expect(run.out).toContain(
      "  lib/domain/user.dart:2 `domain` may not import the package `flutter`",
    );
    expect(run.out).toContain(
      "  lib/domain/user.dart:3 `domain` may not import `infrastructure` (lib/infrastructure/db.dart)",
    );
  });
});
