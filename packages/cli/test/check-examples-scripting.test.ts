// SPDX-License-Identifier: Apache-2.0

import { type Dialect, describeExamples, indent, pascal, snake } from "./stack-dialect";
import { repeat } from "./stack-examples";

/**
 * A Python, a Ruby and a PHP repository (AC1, AC2, AC3). Their commands stand in for ruff, mypy
 * and pytest; RuboCop, Sorbet and RSpec, with no format of its own, which RuboCop checks as lint;
 * and PHP CS Fixer, PHP_CodeSniffer, PHPStan and PHPUnit. Neither pytest nor PHPUnit has a
 * focus marker, and PHPUnit skips with `markTestSkipped()`, a decision of the test that does not
 * count; Specty reads no layers in Ruby.
 */

const IT = "it";

const PYTHON: Dialect = {
  name: "Python",
  paths: {
    manifest: "pyproject.toml",
    cart: "src/shop/cart.py",
    cartTest: "tests/shop/test_cart.py",
    catalog: "src/shop/catalog.py",
    prices: "src/shop/prices.json",
    pricesData: "src/shop/prices_data.py",
    user: "src/shop/domain/user.py",
    userTest: "tests/shop/domain/test_user.py",
    legacyTest: "tests/shop/test_legacy.py",
    leak: "src/shop/settings.py",
  },
  manifest: (added) =>
    [
      "[project]",
      'name = "tienda"',
      'version = "0.1.0"',
      'requires-python = ">=3.12"',
      "dependencies = [",
      ...['"httpx>=0.27"', ...added].map((line) => `  ${line},`),
      "]",
      "",
    ].join("\n"),
  dependencies: { allowed: "attrs", line: '"attrs>=24.2"', forbidden: '"requests>=2.32"' },
  tools: {
    format: { folder: "src", token: "result=price", output: "Would reformat: {path}" },
    lint: {
      folder: "src",
      token: "import os",
      output: "{path}:{line}:5: F401 [*] `os` imported but unused",
    },
    typecheck: {
      folder: "src",
      token: ': int = "',
      output:
        '{path}:{line}: error: Incompatible types in assignment (expression has type "str", variable has type "int")  [assignment]',
    },
    tests: {
      folder: "tests",
      token: "assert 1 == 2",
      output: "FAILED {path}::test_names_the_user - assert 1 == 2",
    },
  },
  layers: { domain: "src/shop/domain/**", forbidden: "requests" },
  markers: { focused: false, skipped: true },
  code: {
    comment: "#",
    cart: (discount) =>
      [
        "def total(prices: list[int]) -> int:",
        "    return sum(prices)",
        ...(discount.length > 0 ? ["", "", ...discount] : []),
        "",
      ].join("\n"),
    discount: (body) => [
      "def discount(price: float, code: str) -> float:",
      ...indent(body, "    "),
    ],
    fixed: ['return price - 1 if code == "C1" else price'],
    broken: ["import os", 'count: int = "1"', "result=price  # noqa: E225"],
    branch: (index) => `if code == "C${index}": result -= ${index}`,
    step: (index) => `result += ${index} - ${index}`,
    result: "return result",
    catalog: (count) => `${repeat(count, (index) => `ITEM_${index} = ${index}`).join("\n")}\n`,
    prices: "PRICES = {json}\n",
    user: ({ email, forbidden }) =>
      [
        ...(forbidden ? ["import requests"] : []),
        "from dataclasses import dataclass",
        "",
        "",
        "@dataclass(frozen=True)",
        "class User:",
        "    name: str",
        ...(email ? ['    email: str = ""'] : []),
        "",
      ].join("\n"),
    tests: (_, cases) =>
      [
        "import pytest",
        ...cases.flatMap((test) => [
          "",
          "",
          ...(test.skipped ? [`@pytest.mark.${"skip"}`] : []),
          `def test_${snake(test.name)}():`,
          `    assert 1 == ${test.fails ? 2 : 1}`,
        ]),
        "",
      ].join("\n"),
    leak: (token) => `GITHUB_TOKEN = "${token}"\n`,
  },
};

const RUBY: Dialect = {
  name: "Ruby",
  paths: {
    manifest: "Gemfile",
    cart: "lib/shop/cart.rb",
    cartTest: "spec/shop/cart_spec.rb",
    catalog: "lib/shop/catalog.rb",
    prices: "lib/shop/prices.json",
    pricesData: "lib/shop/prices.rb",
    user: "lib/shop/domain/user.rb",
    userTest: "spec/shop/domain/user_spec.rb",
    legacyTest: "spec/shop/legacy_spec.rb",
    leak: "lib/shop/settings.rb",
  },
  manifest: (added) =>
    ['source "https://rubygems.org"', "", 'gem "rack", "~> 3.1"', ...added, ""].join("\n"),
  dependencies: {
    allowed: "money",
    line: 'gem "money", "~> 6.19"',
    forbidden: 'gem "httparty", "~> 0.22"',
  },
  tools: {
    lint: {
      folder: "lib",
      token: "binding.irb",
      output: "{path}:{line}:5: W: Lint/Debugger: Remove debugger entry point `binding.irb`.",
    },
    typecheck: {
      folder: "lib",
      token: 'T.let("1", Integer)',
      output: "{path}:{line}: Argument does not have asserted type `Integer` https://srb.help/7007",
    },
    tests: {
      folder: "spec",
      token: "eq(2)",
      output: "rspec ./{path}:{line} # User names the user",
    },
  },
  markers: { focused: true, skipped: true },
  code: {
    comment: "#",
    cart: (discount) =>
      [
        "module Cart",
        "  def self.total(prices)",
        "    prices.sum",
        "  end",
        ...(discount.length > 0 ? ["", ...indent(discount, "  ")] : []),
        "end",
        "",
      ].join("\n"),
    discount: (body) => ["def self.discount(price, code)", ...indent(body, "  "), "end"],
    fixed: ['code == "C1" ? price - 1 : price'],
    broken: [
      "binding.irb",
      'count = T.let("1", Integer)',
      "result = price # rubocop:disable Metrics/AbcSize",
    ],
    branch: (index) => `result -= ${index} if code == "C${index}"`,
    step: (index) => `result += ${index} - ${index}`,
    result: "result",
    catalog: (count) =>
      ["module Catalog", ...repeat(count, (index) => `  ITEM_${index} = ${index}`), "end", ""].join(
        "\n",
      ),
    prices: "PRICES = {json}.freeze\n",
    user: ({ email, forbidden }) =>
      [
        ...(forbidden ? ['require "httparty"', ""] : []),
        "module Domain",
        `  User = Struct.new(:name${email ? ", :email" : ""}, keyword_init: true)`,
        "end",
        "",
      ].join("\n"),
    tests: (subject, cases) =>
      [
        `RSpec.describe "${subject}" do`,
        ...cases.flatMap((test, index) => [
          ...(index > 0 ? [""] : []),
          `  ${test.focused ? `f${IT}` : test.skipped ? `x${IT}` : IT} "${test.name}" do`,
          `    expect(1).to eq(${test.fails ? 2 : 1})`,
          "  end",
        ]),
        "end",
        "",
      ].join("\n"),
    leak: (token) => `GITHUB_TOKEN = "${token}"\n`,
  },
};

const PHP: Dialect = {
  name: "PHP",
  paths: {
    manifest: "composer.json",
    cart: "src/Cart.php",
    cartTest: "tests/CartTest.php",
    catalog: "src/Catalog.php",
    prices: "src/prices.json",
    pricesData: "src/Prices.php",
    user: "src/Domain/User.php",
    userTest: "tests/Domain/UserTest.php",
    legacyTest: "tests/LegacyTest.php",
    leak: "src/Settings.php",
  },
  manifest: (added) =>
    [
      "{",
      '  "name": "acme/tienda",',
      '  "require": {',
      `    ${['"php": "^8.3"', ...added].join(",\n    ")}`,
      "  },",
      '  "autoload": {',
      String.raw`    "psr-4": { "App\\": "src/" }`,
      "  }",
      "}",
      "",
    ].join("\n"),
  dependencies: {
    allowed: "brick/money",
    line: '"brick/money": "^0.10"',
    forbidden: '"guzzlehttp/guzzle": "^7.9"',
  },
  tools: {
    format: { folder: "src", token: "$result=$price", output: "   1) {path}" },
    lint: {
      folder: "src",
      token: "var_dump(",
      output:
        "{abs}:{line}:9: error - The use of function var_dump() is forbidden (Generic.PHP.ForbiddenFunctions.Found)",
    },
    typecheck: {
      folder: "src",
      token: "total('1')",
      output:
        "{abs}:{line}:Parameter #1 $prices of static method App\\Cart::total() expects array<int>, string given.",
    },
    tests: {
      folder: "tests",
      token: "assertSame(2, 1)",
      output:
        "1) Tests\\UserTest::testNamesTheUser\nFailed asserting that 1 is identical to 2.\n\n{abs}:{line}",
    },
  },
  layers: { domain: "src/Domain/**", forbidden: "Illuminate/**" },
  markers: { focused: false, skipped: false },
  code: {
    comment: "//",
    cart: (discount) =>
      [
        ...php("App"),
        "final class Cart",
        "{",
        "    /** @param list<int> $prices */",
        "    public static function total(array $prices): int",
        "    {",
        "        return array_sum($prices);",
        "    }",
        ...(discount.length > 0 ? ["", ...indent(discount, "    ")] : []),
        "}",
        "",
      ].join("\n"),
    discount: (body) => [
      "public static function discount(float $price, string $code): float",
      "{",
      ...indent(body, "    "),
      "}",
    ],
    fixed: ["return $code === 'C1' ? $price - 1 : $price;"],
    broken: [
      "var_dump($price);",
      "$count = self::total('1');",
      "$result=$price; // @phpstan-ignore-line",
    ],
    branch: (index) => `if ($code === 'C${index}') { $result -= ${index}; }`,
    step: (index) => `$result += ${index} - ${index};`,
    result: "return $result;",
    catalog: (count) =>
      [
        ...php("App"),
        "final class Catalog",
        "{",
        ...repeat(count, (index) => `    public const ITEM_${index} = ${index};`),
        "}",
        "",
      ].join("\n"),
    prices: `${php("App").join("\n")}const PRICES = {json};\n`,
    user: ({ email, forbidden }) =>
      [
        ...php("App\\Domain"),
        ...(forbidden ? ["use Illuminate\\Support\\Facades\\DB;", ""] : []),
        "final class User",
        "{",
        "    public function __construct(",
        "        public readonly string $name,",
        ...(email ? ["        public readonly string $email = '',"] : []),
        "    ) {",
        "    }",
        "}",
        "",
      ].join("\n"),
    tests: (subject, cases) =>
      [
        ...php("Tests"),
        "use PHPUnit\\Framework\\TestCase;",
        "",
        `final class ${subject}Test extends TestCase`,
        "{",
        ...cases.flatMap((test, index) => [
          ...(index > 0 ? [""] : []),
          `    public function test${pascal(test.name)}(): void`,
          "    {",
          ...(test.skipped ? ["        $this->markTestSkipped('flaky');"] : []),
          `        $this->assertSame(${test.fails ? 2 : 1}, 1);`,
          "    }",
        ]),
        "}",
        "",
      ].join("\n"),
    leak: (token) => `${php("App").join("\n")}const GITHUB_TOKEN = '${token}';\n`,
  },
};

/** The opening of a PHP source in `namespace`. */
function php(namespace: string): string[] {
  return ["<?php", "", "declare(strict_types=1);", "", `namespace ${namespace};`, ""];
}

describeExamples([PYTHON, RUBY, PHP]);
