// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { detectProject } from "../src/detect/project";
import { cargoWorkspace } from "../src/detect/units-cargo";
import { goWorkspace } from "../src/detect/units-go";
import { gradleWorkspace } from "../src/detect/units-gradle";
import { DETECTORS, proposedUnits } from "../src/detect/workspace-units";
import { cli, tempRepo } from "./support";

const TITLE = "UNIDADES DE VERIFICACIÓN PROPUESTAS";

/** A subproject's test source, so its folder has `src/test`. */
const TEST = "class DemoTest\n";

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null;

/** The units of YAML lines that go under `verify:`. */
function unitsOf(lines: readonly string[] | undefined): unknown {
  const doc: unknown = parse(`verify:\n${(lines ?? []).join("\n")}\n`);
  return isRecord(doc) && isRecord(doc.verify) ? doc.verify.units : undefined;
}

/** The units of the block in `init`'s card, without the block's indent. */
function proposed(out: string): unknown {
  const after = (out.split(`${TITLE}:\n`)[1] ?? "").split("\n");
  const end = after.findIndex((line) => !line.startsWith("  "));
  const lines = (end < 0 ? after : after.slice(0, end)).map((line) => line.slice(2));
  return unitsOf(lines.filter((line) => line === "  units:" || line.startsWith("    ")));
}

/** The units `init` would propose for a repository with `files`. */
async function unitsFor(files: Readonly<Record<string, string>>) {
  const root = await tempRepo(files);
  return proposedUnits(root, await detectProject(root, "demo"), "en");
}

describe("specty init in a Gradle project", () => {
  it("AC4: proposes the static checks and one unit per subproject with tests, with its test task and the folders it uses", async () => {
    const root = await tempRepo({
      "settings.gradle.kts": [
        'rootProject.name = "demo"',
        "",
        "pluginManagement {",
        '    includeBuild("build-logic")',
        "}",
        "",
        'include(":core")',
        "include(",
        '    ":app", // la app',
        '    ":docs",',
        ")",
        '// include(":legacy")',
        "",
      ].join("\n"),
      "build.gradle.kts":
        'plugins {\n    kotlin("jvm") version "2.0.0" apply false\n    id("io.gitlab.arturbosch.detekt") version "1.23.6"\n}\n',
      gradlew: "#!/bin/sh\n",
      "gradle.properties": "org.gradle.jvmargs=-Xmx2g\n",
      "gradle/libs.versions.toml": '[versions]\nkotlin = "2.0.0"\n',
      "build-logic/settings.gradle.kts": 'rootProject.name = "build-logic"\n',
      "core/build.gradle.kts": 'plugins {\n    kotlin("jvm")\n}\n',
      "core/src/test/kotlin/CoreTest.kt": TEST,
      "app/build.gradle.kts": 'dependencies {\n    implementation(project(":core"))\n}\n',
      "app/src/test/kotlin/AppTest.kt": TEST,
      "docs/build.gradle.kts": "\n",
      "legacy/src/test/kotlin/LegacyTest.kt": TEST,
    });
    const result = await cli(root, ["init", "--language", "es"]);
    expect(result.code).toBe(0);
    expect(result.out).toContain(`${TITLE}:`);
    const shared = [
      "settings.gradle.kts",
      "build.gradle.kts",
      "gradle.properties",
      "gradle/**",
      "build-logic/**",
    ];
    expect(proposed(result.out)).toEqual([
      { name: "estático", command: "./gradlew detekt", paths: ["**"] },
      { name: "core", command: "./gradlew :core:test", paths: ["core/**", ...shared] },
      {
        name: "app",
        command: "./gradlew :app:test",
        paths: ["app/**", "core/**", ...shared],
      },
    ]);
  });

  it("AC4: reads Groovy includes and dependencies by path, named or typed, also through a subproject without tests", async () => {
    const lines = await unitsFor({
      "settings.gradle": [
        "/* subproyectos antiguos",
        "include ':legacy'",
        "*/",
        "include 'libs:core-data', ':libs:util',",
        "        ':services:api'",
        "include(':services:web')",
        "include ':missing'",
        "",
      ].join("\n"),
      "buildSrc/build.gradle": "plugins {\n    id 'groovy-gradle-plugin'\n}\n",
      "libs/core-data/build.gradle": "plugins {\n    id 'java-library'\n}\n",
      "libs/core-data/src/test/java/CoreDataTest.java": TEST,
      "libs/util/build.gradle":
        "dependencies {\n    implementation project(path: ':libs:core-data')\n}\n",
      "services/api/build.gradle":
        "repositories {\n    maven { url 'https://repo.example.com/maven' }\n}\n\ndependencies {\n    implementation project(':libs:util') // util\n}\n",
      "services/api/src/test/java/ApiTest.java": TEST,
      "services/web/build.gradle":
        "dependencies {\n    implementation projects.libs.coreData\n    // implementation project(':services:api')\n}\n",
      "services/web/src/test/java/WebTest.java": TEST,
      "legacy/src/test/java/LegacyTest.java": TEST,
    });
    const shared = ["settings.gradle", "buildSrc/**"];
    expect(unitsOf(lines)).toEqual([
      {
        name: "core-data",
        command: "gradle :libs:core-data:test",
        paths: ["libs/core-data/**", ...shared],
      },
      {
        name: "web",
        command: "gradle :services:web:test",
        paths: ["services/web/**", "libs/core-data/**", ...shared],
      },
      {
        name: "api",
        command: "gradle :services:api:test",
        paths: ["services/api/**", "libs/core-data/**", "libs/util/**", ...shared],
      },
    ]);
  });

  it("AC4: proposes nothing with fewer than two subprojects with tests", async () => {
    const single = await unitsFor({
      "settings.gradle.kts": 'include(":core", ":app")\n',
      "core/src/test/kotlin/CoreTest.kt": TEST,
      "app/build.gradle.kts": 'dependencies {\n    implementation(project(":core"))\n}\n',
    });
    expect(single).toBeUndefined();
    const root = await tempRepo({
      "settings.gradle.kts": 'include(":core")\n',
      "core/src/test/kotlin/CoreTest.kt": TEST,
    });
    expect((await cli(root, ["init", "--language", "es"])).out).not.toContain(TITLE);
  });

  it("AC4: tries the Gradle detector after the Cargo and Go ones", () => {
    const at = DETECTORS.indexOf(gradleWorkspace);
    expect(at).toBeGreaterThan(DETECTORS.indexOf(cargoWorkspace));
    expect(at).toBeGreaterThan(DETECTORS.indexOf(goWorkspace));
  });
});

/** A Gradle build whose root project has tests, with core and app, which depends on the root. */
const ROOTED = {
  "settings.gradle.kts": 'rootProject.name = "demo"\ninclude(":core", ":app")\n',
  "build.gradle.kts": "plugins {\n    java\n}\n",
  "src/main/kotlin/Root.kt": "class Root\n",
  "src/test/kotlin/RootTest.kt": TEST,
  "gradle/libs.versions.toml": "[versions]\n",
  "README.md": "# demo\n",
  ".github/workflows/ci.yml": "on: push\n",
  "core/src/test/kotlin/CoreTest.kt": TEST,
  "app/src/test/kotlin/AppTest.kt": TEST,
  "app/build.gradle.kts": 'dependencies {\n    implementation(project(":"))\n}\n',
};

describe("specty init in a Gradle project whose root project has tests", () => {
  it("AC2: proposes the root's unit with its :test task, named as the root project, also in the subprojects that depend on it", async () => {
    const units = unitsOf(await unitsFor(ROOTED));
    const own = ["README.md", "build.gradle.kts", "gradle/**", "settings.gradle.kts", "src/**"];
    const shared = ["settings.gradle.kts", "build.gradle.kts", "gradle/**"];
    expect(units).toEqual([
      { name: "demo", command: "gradle :test", paths: own },
      { name: "core", command: "gradle :core:test", paths: ["core/**", ...shared] },
      { name: "app", command: "gradle :app:test", paths: ["app/**", ...own] },
    ]);
  });

  it("AC2: names the root's unit `root` when the settings do not name the root project", async () => {
    const units = unitsOf(
      await unitsFor({
        ...ROOTED,
        "settings.gradle.kts": 'include(":core", ":app")\n',
      }),
    );
    expect(units).toContainEqual(
      expect.objectContaining({ name: "root", command: "gradle :test" }),
    );
    expect(units).toContainEqual(expect.objectContaining({ name: "core" }));
  });
});
