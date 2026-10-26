// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { addedDependencies, readsDependencies } from "../../src";

/** `name@line` of each dependency `after` adds to `before`, lines given one per argument. */
const added = (path: string, before: readonly string[] | undefined, ...after: string[]) =>
  addedDependencies(path, before?.join("\n"), after.join("\n")).map(
    (dependency) => `${dependency.name}@${dependency.line ?? "?"}`,
  );

describe("the manifests of each ecosystem", () => {
  it("reads Python's requirements files, without comments, options or bare URLs", () => {
    expect(
      added(
        "requirements-dev.txt",
        ["requests==2.32.0"],
        "# tools",
        "requests==2.33.0",
        "black>=24 ; python_version > '3.9'",
        "-r requirements.txt",
        "-e .",
        "git+https://github.com/acme/tool.git#egg=tool",
        "pkg[extra] @ https://example.com/pkg.whl",
        "  pytest  # tests",
      ),
    ).toEqual(["black@3", "pkg@7", "pytest@8"]);
    expect(readsDependencies("services/api/requirements.txt")).toBe(true);
  });

  it("reads go.mod, in one line and in a block, without indirect requirements", () => {
    expect(
      added(
        "go.mod",
        ["module example.com/app", "require golang.org/x/net v0.30.0"],
        "module example.com/app",
        "require golang.org/x/net v0.31.0",
        "require (",
        "\tgithub.com/spf13/cobra v1.8.1",
        "\tgolang.org/x/text v0.20.0 // indirect",
        ")",
        "require github.com/google/uuid v1.6.0",
      ),
    ).toEqual(["github.com/spf13/cobra@4", "github.com/google/uuid@7"]);
  });

  it("reads the gems of a Gemfile", () => {
    expect(
      added(
        "Gemfile",
        ['gem "rails", "~> 8.0"'],
        'source "https://rubygems.org"',
        'gem "rails", "~> 8.1"',
        '# gem "pry"',
        "group :test do",
        "  gem 'rspec-rails'",
        "end",
      ),
    ).toEqual(["rspec-rails@5"]);
  });

  it("reads the packages of Package.swift by their url, path or id", () => {
    expect(
      added(
        "Package.swift",
        undefined,
        "let package = Package(",
        "  dependencies: [",
        '    .package(url: "https://github.com/apple/swift-argument-parser.git", from: "1.5.0"),',
        "    .package(",
        '      url: "https://github.com/vapor/vapor", .upToNextMajor(from: "4.0.0")',
        "    ),",
        '    .package(path: "../Shared"),',
        "  ]",
        ")",
      ),
    ).toEqual(["swift-argument-parser@3", "vapor@4", "Shared@7"]);
  });

  it("reads the coordinates of Gradle's build scripts, in Kotlin and Groovy", () => {
    expect(
      added(
        "app/build.gradle.kts",
        ['dependencies {\n  implementation("com.squareup.okhttp3:okhttp:4.11.0")\n}'],
        "plugins {",
        '  id("org.jetbrains.kotlin.jvm") version "2.2.0"',
        "}",
        'repositories { maven("https://jitpack.io") }',
        "dependencies {",
        '  implementation("com.squareup.okhttp3:okhttp:4.12.0")',
        '  testImplementation(platform("org.junit:junit-bom:5.11.0"))',
        "  implementation(libs.kotlinx.coroutines)",
        '  // implementation("com.example:old:1.0")',
        "}",
      ),
    ).toEqual(["org.junit:junit-bom@7"]);
    expect(
      added(
        "build.gradle",
        undefined,
        "dependencies {",
        "  compileOnly group: 'org.projectlombok', name: 'lombok', version: '1.18.34'",
        "}",
      ),
    ).toEqual(["org.projectlombok:lombok@2"]);
  });

  it("reads composer.json without PHP's own platform packages", () => {
    const composer = (require: Record<string, string>) =>
      JSON.stringify({ require, "require-dev": { "phpunit/phpunit": "^11" } }, null, 2).split("\n");
    expect(
      added(
        "composer.json",
        composer({ php: "^8.3" }),
        ...composer({ php: "^8.4", "ext-json": "*", "guzzlehttp/guzzle": "^7.9" }),
      ),
    ).toEqual(["guzzlehttp/guzzle@5"]);
  });
});
