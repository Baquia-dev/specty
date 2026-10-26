// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { suppressions } from "../../src";

/** `line:marker` for each suppression in `lines`, one source line each. */
const found = (path: string, ...lines: string[]) =>
  suppressions(path, lines.join("\n")).map((mark) => `${mark.line}:${mark.marker}`);

describe("suppressions", () => {
  it("finds the directives of ruff, flake8, mypy, pyright and pylint in Python comments", () => {
    expect(
      found(
        "src/app.py",
        "import os  # noqa",
        "x = cast(int, y)  # type: ignore[assignment]",
        "# ruff: noqa: F401",
        "def f():  # pylint: disable=too-many-branches",
        "y = 1  # pyright: ignore[reportAssignmentType]",
        "# mypy: ignore-errors",
        "w = 2  # type: ignore  # NOQA: E501",
        "# flake8: noqa",
        "# ruff: disable[E501]",
        "# pylint: disable-next=unused-import",
        "z = 3  #noqa",
      ),
    ).toEqual([
      "1:noqa",
      "2:type: ignore",
      "3:ruff: noqa",
      "4:pylint: disable",
      "5:pyright: ignore",
      "6:mypy: ignore-errors",
      "7:type: ignore",
      "8:flake8: noqa",
      "9:ruff: disable",
      "10:pylint: disable-next",
      "11:noqa",
    ]);
  });

  it("leaves out a Python string, a comment that only names a directive and other comments", () => {
    expect(
      found(
        "src/app.pyi",
        'z = "# noqa"',
        "# remove the noqa once the stubs land",
        "x = 1  # pragma: no cover",
        "s = 'a # type: ignore'",
      ),
    ).toEqual([]);
  });

  it("finds RuboCop and Credo directives in Ruby and Elixir", () => {
    expect(
      found(
        "app/models/user.rb",
        "def x # rubocop:disable Metrics/AbcSize",
        "# rubocop:todo Layout/LineLength",
        'puts "# rubocop:disable all"',
        "# we used to rubocop:disable here",
        "# rubocop:enable all",
      ),
    ).toEqual(["1:rubocop:disable", "2:rubocop:todo"]);
    expect(found("lib/app.ex", "# credo:disable-for-next-line", "x = 1")).toEqual([
      "1:credo:disable-for-next-line",
    ]);
  });

  it("finds ESLint and Biome directives in JavaScript and TypeScript comments", () => {
    expect(
      found(
        "src/app.ts",
        "// eslint-disable-next-line no-console",
        "/* eslint-disable */",
        "run(); // eslint-disable-line",
        "// biome-ignore lint/suspicious/noDebugger: legacy",
        "// biome-ignore-end lint: legacy",
        'const s = "// eslint-disable";',
        "// see the eslint-disable docs",
      ),
    ).toEqual([
      "1:eslint-disable-next-line",
      "2:eslint-disable",
      "3:eslint-disable-line",
      "4:biome-ignore",
    ]);
  });

  it("finds the annotations and comments that silence Java and Kotlin", () => {
    expect(
      found(
        "src/main/java/App.java",
        '@SuppressWarnings("unchecked")',
        '@SuppressFBWarnings(value = "EI_EXPOSE_REP")',
        "int x = 1; // NOSONAR",
        "// CHECKSTYLE:OFF",
        'String s = "@SuppressWarnings(";',
        "// We avoid @SuppressWarnings here",
      ),
    ).toEqual(["1:@SuppressWarnings", "2:@SuppressFBWarnings", "3:NOSONAR", "4:CHECKSTYLE:OFF"]);
    expect(
      found("src/App.kt", '@file:Suppress("UNUSED")', '@Suppress("MagicNumber")', "val a = 1"),
    ).toEqual(["1:@file:Suppress", "2:@Suppress"]);
  });

  it("finds the directives, attributes and comments that silence C#", () => {
    expect(
      found(
        "src/App.cs",
        "#pragma warning disable CA2200 // Rethrow",
        "#pragma warning restore CA2200",
        "#nullable disable",
        '[SuppressMessage("Usage", "CA2200")]',
        '[assembly: UnconditionalSuppressMessage("Trimming", "IL2026")]',
        "// ReSharper disable once UnusedMember.Global",
        '[System.Diagnostics.CodeAnalysis.SuppressMessage("Style", "IDE0060")]',
        'var s = "#pragma warning disable";',
      ),
    ).toEqual([
      "1:#pragma warning disable",
      "3:#nullable disable",
      "4:SuppressMessage",
      "5:UnconditionalSuppressMessage",
      "6:ReSharper disable",
      "7:SuppressMessage",
    ]);
  });

  it("finds golangci-lint, staticcheck and gosec directives in Go, written as each tool reads them", () => {
    expect(
      found(
        "cmd/app/main.go",
        "x := y //nolint:errcheck",
        "z := w // nolint",
        "//lint:ignore U1000 kept for the plugin API",
        "//lint:file-ignore U1000 generated",
        "key := k // #nosec G101",
        's := "//nolint"',
      ),
    ).toEqual(["1:nolint", "3:lint:ignore", "4:lint:file-ignore", "5:#nosec"]);
  });

  it("finds Rust's allow and expect attributes, outer and inner, and nothing else", () => {
    expect(
      found(
        "src/lib.rs",
        "#[allow(dead_code)]",
        "#![allow(clippy::all)]",
        '#[expect(unused_variables, reason = "kept")]',
        "#[deny(warnings)]",
        'let s = "#[allow(x)]";',
        "// #[allow(dead_code)] was here",
        "fn f<'a>(x: &'a str) -> &'a str { x }",
      ),
    ).toEqual(["1:#[allow(", "2:#![allow(", "3:#[expect("]);
  });

  it("finds PHPStan, PHP_CodeSniffer, Psalm and PHPMD directives in PHP comments and doc blocks", () => {
    expect(
      found(
        "src/App.php",
        "echo $foo; // @phpstan-ignore variable.undefined",
        "// @phpstan-ignore-next-line",
        "/** @psalm-suppress InvalidArgument */",
        "// phpcs:ignore Squiz.Arrays.ArrayDeclaration",
        "// phpcs:disable",
        "// phpcs:enable",
        "/**",
        " * @SuppressWarnings(PHPMD.StaticAccess)",
        " */",
        "$s = '// phpcs:ignore';",
      ),
    ).toEqual([
      "1:@phpstan-ignore",
      "2:@phpstan-ignore-next-line",
      "3:@psalm-suppress",
      "4:phpcs:ignore",
      "5:phpcs:disable",
      "8:@SuppressWarnings",
    ]);
  });

  it("finds SwiftLint and swift-format directives in Swift", () => {
    expect(
      found(
        "Sources/App/App.swift",
        "// swiftlint:disable:next force_cast",
        "// swiftlint:disable all",
        "// swiftlint:enable all",
        "// swift-format-ignore",
      ),
    ).toEqual(["1:swiftlint:disable:next", "2:swiftlint:disable", "4:swift-format-ignore"]);
  });

  it("finds clang-tidy comments and the pragmas that switch warnings off in C and C++", () => {
    expect(
      found(
        "src/app.cpp",
        "int x; // NOLINT(readability-*)",
        "// NOLINTNEXTLINE",
        "#pragma warning(disable : 4996)",
        '#pragma GCC diagnostic ignored "-Wunused"',
        '#pragma clang diagnostic ignored "-Wshadow"',
        "#pragma GCC diagnostic push",
      ),
    ).toEqual([
      "1:NOLINT",
      "2:NOLINTNEXTLINE",
      "3:#pragma warning(disable",
      "4:#pragma GCC diagnostic ignored",
      "5:#pragma clang diagnostic ignored",
    ]);
  });

  it("knows no suppression of Dart, whose comments dart-strict watches, nor of other files", () => {
    expect(found("lib/app.dart", "// ignore: avoid_print", "print(1);")).toEqual([]);
    expect(found("README.md", "# noqa", "// eslint-disable")).toEqual([]);
    expect(found("Makefile", "# noqa")).toEqual([]);
  });
});
