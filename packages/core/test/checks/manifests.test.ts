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

  it("reads pyproject.toml: PEP 621, its extras and groups, and Poetry", () => {
    expect(
      added(
        "pyproject.toml",
        ['[project]\ndependencies = ["requests>=2.32"]'],
        "[project]",
        'name = "app"',
        "dependencies = [",
        '  "requests>=2.33",',
        '  "httpx[http2]>=0.27",  # the client',
        "]",
        "",
        "[project.optional-dependencies]",
        'docs = ["mkdocs"]',
        "",
        "[dependency-groups]",
        'coverage = ["coverage[toml]"]',
        'test = ["pytest>7", {include-group = "coverage"}]',
        "",
        "[tool.poetry.dependencies]",
        'python = "^3.12"',
        'fastapi = "^0.115"',
        "",
        "[tool.poetry.group.dev.dependencies]",
        'ruff = "^0.8"',
      ),
    ).toEqual(["httpx@5", "mkdocs@9", "coverage@12", "pytest@13", "fastapi@17", "ruff@20"]);
  });

  it("reads Cargo.toml: every dependency table, by key or by header", () => {
    expect(
      added(
        "crates/cli/Cargo.toml",
        ['[dependencies]\nserde = "1"'],
        "[package]",
        'name = "cli"',
        "",
        "[dependencies]",
        'serde = { version = "1.0.210", features = ["derive"] }',
        "clap.workspace = true",
        "",
        "[dev-dependencies]",
        'insta = "1"',
        "",
        "[target.'cfg(windows)'.dependencies]",
        'winapi = "0.3"',
        "",
        "[dependencies.tokio]",
        'version = "1"',
      ),
    ).toEqual(["clap@6", "insta@9", "winapi@12", "tokio@14"]);
  });

  it("reads the libraries of Gradle's version catalog in each of their forms", () => {
    expect(
      added(
        "gradle/libs.versions.toml",
        ["[libraries]", 'okhttp = "com.squareup.okhttp3:okhttp:4.12.0"'],
        "[versions]",
        'kotlin = "2.2.0"',
        "",
        "[libraries]",
        'okhttp = "com.squareup.okhttp3:okhttp:4.12.0"',
        'coroutines = { module = "org.jetbrains.kotlinx:kotlinx-coroutines-core", version.ref = "kotlin" }',
        'junit = { group = "org.junit.jupiter", name = "junit-jupiter", version = "5.11.0" }',
        'mockk.module = "io.mockk:mockk"',
        "",
        "[plugins]",
        'kotlin = { id = "org.jetbrains.kotlin.jvm", version.ref = "kotlin" }',
      ),
    ).toEqual([
      "org.jetbrains.kotlinx:kotlinx-coroutines-core@6",
      "org.junit.jupiter:junit-jupiter@7",
      "io.mockk:mockk@8",
    ]);
  });

  it("reads the dependencies of pom.xml, not the managed ones, the plugins' or comments", () => {
    const dependency = (group: string, artifact: string) =>
      `    <dependency>\n      <groupId>${group}</groupId>\n      <artifactId>${artifact}</artifactId>\n    </dependency>`;
    expect(
      added(
        "pom.xml",
        [
          "<project><dependencies>",
          dependency("org.slf4j", "slf4j-api"),
          "</dependencies></project>",
        ],
        "<project>",
        "  <dependencyManagement><dependencies>",
        dependency("org.junit", "junit-bom"),
        "  </dependencies></dependencyManagement>",
        "  <dependencies>",
        dependency("org.slf4j", "slf4j-api"),
        dependency("com.google.guava", "guava"),
        "    <!--",
        dependency("org.old", "legacy"),
        "    -->",
        "  </dependencies>",
        "  <build><plugins><plugin><dependencies>",
        dependency("org.ow2.asm", "asm"),
        "  </dependencies></plugin></plugins></build>",
        "</project>",
      ),
    ).toEqual(["com.google.guava:guava@15"]);
  });

  it("reads the packages of MSBuild's project files and Directory.Packages.props", () => {
    expect(
      added(
        "src/App/App.csproj",
        ['<Project><ItemGroup><PackageReference Include="Serilog" /></ItemGroup></Project>'],
        '<Project Sdk="Microsoft.NET.Sdk">',
        "  <ItemGroup>",
        '    <PackageReference Include="Serilog" Version="4.1.0" />',
        '    <PackageReference Version="8.0.0" Include="Microsoft.Extensions.Http" />',
        '    <!-- <PackageReference Include="Old.Package" /> -->',
        "  </ItemGroup>",
        "</Project>",
      ),
    ).toEqual(["Microsoft.Extensions.Http@4"]);
    expect(readsDependencies("tests/App.Tests.fsproj")).toBe(true);
    expect(
      added(
        "Directory.Packages.props",
        undefined,
        "<Project>",
        "  <ItemGroup>",
        '    <PackageVersion Include="xunit" Version="2.9.2" />',
        '    <GlobalPackageReference Include="Nerdbank.GitVersioning" Version="3.6.143" />',
        "  </ItemGroup>",
        "</Project>",
      ),
    ).toEqual(["xunit@3", "Nerdbank.GitVersioning@4"]);
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
