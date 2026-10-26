// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { analyzerIgnores, dartImports } from "../../src";

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

describe("dartImports", () => {
  it("resolves each import and export: its own package, a relative path, a package and dart:", () => {
    const text = [
      "import 'dart:io';",
      'import "package:flutter/material.dart";',
      "import 'package:app/infrastructure/db.dart' as db;",
      "import '../infrastructure/cache.dart' show Cache;",
      "export 'user_repository.dart';",
      "import 'package:app/domain/email.dart'",
      "    if (dart.library.html) 'package:app/domain/web_email.dart';",
      "// import 'package:app/ui/home.dart';",
      "part 'user.g.dart';",
      "final note = \"import 'package:app/ui/page.dart';\";",
    ].join("\n");
    expect(dartImports("lib/domain/user.dart", text, "app")).toEqual([
      { from: "lib/domain/user.dart", specifier: "dart:io", package: "dart:io" },
      {
        from: "lib/domain/user.dart",
        specifier: "package:flutter/material.dart",
        package: "flutter",
      },
      {
        from: "lib/domain/user.dart",
        specifier: "package:app/infrastructure/db.dart",
        target: "lib/infrastructure/db.dart",
      },
      {
        from: "lib/domain/user.dart",
        specifier: "../infrastructure/cache.dart",
        target: "lib/infrastructure/cache.dart",
      },
      {
        from: "lib/domain/user.dart",
        specifier: "user_repository.dart",
        target: "lib/domain/user_repository.dart",
      },
      {
        from: "lib/domain/user.dart",
        specifier: "package:app/domain/email.dart",
        target: "lib/domain/email.dart",
      },
    ]);
  });

  it("takes another package of the repository for a package, without a pubspec name", () => {
    expect(dartImports("lib/a.dart", "import 'package:app/b.dart';", undefined)).toEqual([
      { from: "lib/a.dart", specifier: "package:app/b.dart", package: "app" },
    ]);
  });
});
