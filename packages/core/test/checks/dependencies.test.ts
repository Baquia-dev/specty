// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { addedDependencies, readsDependencies } from "../../src";

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

describe("addedDependencies", () => {
  it("gives the names a package.json gained in any of its sections, with their line", () => {
    const before = json({ name: "app", dependencies: { react: "^18.0.0" } });
    const after = json({
      name: "app",
      dependencies: { react: "^19.0.0", zod: "4.0.0" },
      devDependencies: { vitest: "5.0.0" },
      peerDependencies: { "@angular/core": "22.0.0" },
      optionalDependencies: { fsevents: "2.3.3" },
    });
    expect(addedDependencies("packages/app/package.json", before, after)).toEqual([
      { name: "zod", line: 5 },
      { name: "vitest", line: 8 },
      { name: "@angular/core", line: 11 },
      { name: "fsevents", line: 14 },
    ]);
  });

  it("counts every dependency of a new manifest, and none of one it cannot read", () => {
    expect(
      addedDependencies("package.json", undefined, json({ dependencies: { zod: "4" } })),
    ).toEqual([{ name: "zod", line: 3 }]);
    expect(addedDependencies("package.json", "{", json({ dependencies: { zod: "4" } }))).toEqual(
      [],
    );
    expect(addedDependencies("package.json", undefined, "{ broken")).toEqual([]);
    expect(addedDependencies("package.json", undefined, json(["not", "an", "object"]))).toEqual([]);
  });

  it("reads pubspec.yaml, leaving out the SDK's packages", () => {
    const before = "name: app\ndependencies:\n  flutter:\n    sdk: flutter\n  http: ^1.0.0\n";
    const after = [
      "name: app",
      "dependencies:",
      "  flutter:",
      "    sdk: flutter",
      "  http: ^1.2.0",
      "  riverpod:",
      "    git: https://github.com/rrousselGit/riverpod",
      "dev_dependencies:",
      "  flutter_test:",
      "    sdk: flutter",
      "  mocktail: ^1.0.0",
      "",
    ].join("\n");
    expect(addedDependencies("app/pubspec.yaml", before, after)).toEqual([
      { name: "riverpod", line: 6 },
      { name: "mocktail", line: 11 },
    ]);
  });

  it("knows its manifests by file name, in any folder", () => {
    expect(readsDependencies("package.json")).toBe(true);
    expect(readsDependencies("packages/ui/package.json")).toBe(true);
    expect(readsDependencies("apps/mobile/pubspec.yaml")).toBe(true);
    expect(readsDependencies("src/package.json.ts")).toBe(false);
    expect(addedDependencies("src/app.ts", undefined, "import zod from 'zod';\n")).toEqual([]);
  });
});
