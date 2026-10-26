// SPDX-License-Identifier: Apache-2.0

import { type Dialect, describeExamples, indent, pascal, snake } from "./stack-dialect";
import { repeat } from "./stack-examples";

/**
 * A Go, a Rust and a Swift repository (AC1, AC2, AC3). Their commands stand in for golangci-lint,
 * whose gofmt checks the format, and `go test`; `cargo fmt --check`, Clippy and `cargo test`; and
 * swift-format, SwiftLint and `swift test`. The compilers run with the tests, so there is no
 * typecheck of its own. Go's tests use Ginkgo, whose `FIt` is the focus marker; its pending
 * `PIt`, XCTest's `XCTSkip` and the focus of Rust and XCTest are not in the catalog, and Specty
 * reads no layers in Swift.
 */

const GINKGO = ["import (", '\t. "github.com/onsi/ginkgo/v2"', '\t. "github.com/onsi/gomega"', ")"];

/** The Ginkgo suite of a Go package, which `go test` runs. */
const suite = (name: string) =>
  [
    `package ${name.toLowerCase()}_test`,
    "",
    "import (",
    '\t"testing"',
    "",
    ...GINKGO.slice(1, -1),
    ")",
    "",
    `func Test${name}(t *testing.T) {`,
    "\tRegisterFailHandler(Fail)",
    `\tRunSpecs(t, "${name}")`,
    "}",
    "",
  ].join("\n");

const GO: Dialect = {
  name: "Go",
  paths: {
    manifest: "go.mod",
    cart: "internal/shop/cart.go",
    cartTest: "internal/shop/cart_test.go",
    catalog: "internal/shop/catalog.go",
    prices: "internal/shop/prices.json",
    pricesData: "internal/shop/prices_data.go",
    user: "internal/shop/domain/user.go",
    userTest: "internal/shop/domain/user_test.go",
    legacyTest: "internal/shop/legacy_test.go",
    leak: "internal/shop/settings.go",
  },
  files: {
    "internal/shop/shop_suite_test.go": suite("Shop"),
    "internal/shop/domain/domain_suite_test.go": suite("Domain"),
  },
  manifest: (added) =>
    [
      "module github.com/acme/shop",
      "",
      "go 1.23",
      "",
      "require (",
      ...["github.com/onsi/ginkgo/v2 v2.22.0", "github.com/onsi/gomega v1.36.0", ...added].map(
        (line) => `\t${line}`,
      ),
      ")",
      "",
    ].join("\n"),
  dependencies: {
    allowed: "github.com/shopspring/decimal",
    line: "github.com/shopspring/decimal v1.4.0",
    forbidden: "github.com/gin-gonic/gin v1.10.0",
  },
  tools: {
    lint: {
      folder: "internal",
      token: "result:=price",
      output: "{path}:{line}:1: File is not properly formatted (gofmt)",
    },
    tests: {
      folder: "internal",
      token: "Equal(2)",
      output: "  [FAIL] User [It] names the user\n  {path}:{line}",
    },
  },
  layers: { domain: "internal/shop/domain/**", forbidden: "net/http" },
  markers: { focused: true, skipped: false },
  code: {
    comment: "//",
    cart: (discount) =>
      [
        "package shop",
        "",
        "// Total adds the prices.",
        "func Total(prices []int) int {",
        "\tsum := 0",
        "\tfor _, price := range prices {",
        "\t\tsum += price",
        "\t}",
        "\treturn sum",
        "}",
        ...(discount.length > 0 ? ["", ...discount] : []),
        "",
      ].join("\n"),
    discount: (body) => [
      "// Discount applies a discount code.",
      "func Discount(price float64, code string) float64 {",
      ...indent(body, "\t"),
      "}",
    ],
    fixed: ['if code == "C1" {', "\treturn price - 1", "}", "return price"],
    broken: ["result:=price //nolint:ineffassign"],
    branch: (index) => `if code == "C${index}" { result -= ${index} }`,
    step: (index) => `result += ${index} - ${index}`,
    result: "return result",
    catalog: (count) =>
      [
        "package shop",
        "",
        "const (",
        ...repeat(count, (index) => `\tItem${index} = ${index}`),
        ")",
        "",
      ].join("\n"),
    prices: 'package shop\n\nconst pricesJSON = "{json}"\n',
    user: ({ email, forbidden }) =>
      [
        "package domain",
        "",
        ...(forbidden ? ['import "net/http"', ""] : []),
        "// User is someone who buys.",
        "type User struct {",
        "\tName string",
        ...(email ? ["\tEmail string"] : []),
        ...(forbidden ? ["\tClient *http.Client"] : []),
        "}",
        "",
      ].join("\n"),
    tests: (subject, cases) =>
      [
        `package ${subject === "User" ? "domain" : "shop"}_test`,
        "",
        ...GINKGO,
        "",
        `var _ = Describe("${subject}", func() {`,
        ...cases.flatMap((test) => [
          `\t${test.focused ? `F${"It"}` : test.skipped ? `P${"It"}` : "It"}("${test.name}", func() {`,
          `\t\tExpect(1).To(Equal(${test.fails ? 2 : 1}))`,
          "\t})",
        ]),
        "})",
        "",
      ].join("\n"),
    leak: (token) => `package shop\n\nconst githubToken = "${token}"\n`,
  },
};

const RUST: Dialect = {
  name: "Rust",
  paths: {
    manifest: "Cargo.toml",
    cart: "src/cart.rs",
    cartTest: "tests/cart.rs",
    catalog: "src/catalog.rs",
    prices: "src/prices.json",
    pricesData: "src/prices.rs",
    user: "src/domain/user.rs",
    // Cargo finds `tests/*/main.rs` too. A test right under `tests/` mirrors all of `src/`, and
    // `fix-tests` would take it for one of the cart's.
    userTest: "tests/domain/main.rs",
    legacyTest: "tests/legacy.rs",
    leak: "src/settings.rs",
  },
  files: {
    "src/lib.rs": "pub mod cart;\npub mod domain;\npub mod prices;\n",
    "src/domain/mod.rs": "pub mod user;\n",
  },
  manifest: (added) =>
    [
      "[package]",
      'name = "shop"',
      'version = "0.1.0"',
      'edition = "2021"',
      "",
      "[dependencies]",
      'serde = "1.0"',
      ...added,
      "",
    ].join("\n"),
  dependencies: {
    allowed: "rust_decimal",
    line: 'rust_decimal = "1.36"',
    forbidden: 'reqwest = "0.12"',
  },
  tools: {
    format: { folder: "src", token: "result=price", output: "Diff in {abs}:{line}:" },
    lint: {
      folder: "src",
      token: "3.14",
      output: "error: approximate value of `f64::consts::PI` found\n  --> {path}:{line}:15",
    },
    tests: {
      folder: "tests",
      token: "assert_eq!(2, 1)",
      output:
        "---- names_the_user stdout ----\nthread 'names_the_user' panicked at {path}:{line}:5:\nassertion `left == right` failed",
    },
  },
  layers: { domain: "src/domain/**", forbidden: "reqwest" },
  markers: { focused: false, skipped: true },
  code: {
    comment: "//",
    cart: (discount) =>
      [
        "pub fn total(prices: &[u32]) -> u32 {",
        "    prices.iter().sum()",
        "}",
        ...(discount.length > 0 ? ["", ...discount] : []),
        "",
      ].join("\n"),
    discount: (body) => [
      "pub fn discount(price: f64, code: &str) -> f64 {",
      ...indent(body, "    "),
      "}",
    ],
    fixed: ['if code == "C1" { price - 1.0 } else { price }'],
    broken: ["let _pi = 3.14;", "#[allow(unused_mut)]", "let mut result=price;"],
    branch: (index) => `if code == "C${index}" { result -= ${index}.0; }`,
    step: (index) => `result += ${index}.0 - ${index}.0;`,
    result: "result",
    catalog: (count) =>
      `${repeat(count, (index) => `pub const ITEM_${index}: u32 = ${index};`).join("\n")}\n`,
    prices: 'pub const PRICES: &str = "{json}";\n',
    user: ({ email, forbidden }) =>
      [
        ...(forbidden ? ["use reqwest::Client;", ""] : []),
        "pub struct User {",
        "    pub name: String,",
        ...(email ? ["    pub email: String,"] : []),
        ...(forbidden ? ["    pub client: Client,"] : []),
        "}",
        "",
      ].join("\n"),
    tests: (_, cases) =>
      [
        ...cases.flatMap((test, index) => [
          ...(index > 0 ? [""] : []),
          "#[test]",
          ...(test.skipped ? [`#[${"ignore"}]`] : []),
          `fn ${snake(test.name)}() {`,
          `    assert_eq!(${test.fails ? 2 : 1}, 1);`,
          "}",
        ]),
        "",
      ].join("\n"),
    leak: (token) => `pub const GITHUB_TOKEN: &str = "${token}";\n`,
  },
};

/** A `.package` of Package.swift, by its repository. */
const swiftPackage = (repository: string, from: string) =>
  `.package(url: "https://github.com/${repository}.git", from: "${from}"),`;

const SWIFT: Dialect = {
  name: "Swift",
  paths: {
    manifest: "Package.swift",
    cart: "Sources/Shop/Cart.swift",
    cartTest: "Tests/ShopTests/CartTests.swift",
    catalog: "Sources/Shop/Catalog.swift",
    prices: "Sources/Shop/prices.json",
    pricesData: "Sources/Shop/Prices.swift",
    user: "Sources/Shop/Domain/User.swift",
    userTest: "Tests/ShopTests/Domain/UserTests.swift",
    legacyTest: "Tests/ShopTests/LegacyTests.swift",
    leak: "Sources/Shop/Settings.swift",
  },
  manifest: (added) =>
    [
      "// swift-tools-version:6.0",
      "import PackageDescription",
      "",
      "let package = Package(",
      '    name: "Shop",',
      "    dependencies: [",
      ...[swiftPackage("apple/swift-collections", "1.1.4"), ...added].map(
        (line) => `        ${line}`,
      ),
      "    ],",
      "    targets: [",
      '        .target(name: "Shop"),',
      '        .testTarget(name: "ShopTests", dependencies: ["Shop"]),',
      "    ]",
      ")",
      "",
    ].join("\n"),
  dependencies: {
    allowed: "swift-numerics",
    line: swiftPackage("apple/swift-numerics", "1.0.2"),
    forbidden: swiftPackage("Alamofire/Alamofire", "5.10.2"),
  },
  tools: {
    format: {
      folder: "Sources",
      token: "result=price",
      output: "{path}:{line}:15: error: [Spacing] add 1 space",
    },
    lint: {
      folder: "Sources",
      token: "as! Double",
      output:
        "{abs}:{line}:23: error: Force Cast Violation: Force casts should be avoided (force_cast)",
    },
    tests: {
      folder: "Tests",
      token: "XCTAssertEqual(2, 1)",
      output:
        '{abs}:{line}: error: -[ShopTests.UserTests testNamesTheUser] : XCTAssertEqual failed: ("2") is not equal to ("1")',
    },
  },
  markers: { focused: false, skipped: false },
  code: {
    comment: "//",
    cart: (discount) =>
      [
        "func total(_ prices: [Int]) -> Int {",
        "    prices.reduce(0, +)",
        "}",
        ...(discount.length > 0 ? ["", ...discount] : []),
        "",
      ].join("\n"),
    discount: (body) => [
      "func discount(_ price: Double, _ code: String) -> Double {",
      ...indent(body, "    "),
      "}",
    ],
    fixed: ['return code == "C1" ? price - 1 : price'],
    broken: [
      "// swiftlint:disable:next force_cast",
      "let count = price as! Double",
      "var result=price",
    ],
    branch: (index) => `if code == "C${index}" { result -= ${index} }`,
    step: (index) => `result += ${index} - ${index}`,
    result: "return result",
    catalog: (count) => `${repeat(count, (index) => `let item${index} = ${index}`).join("\n")}\n`,
    prices: 'let pricesJSON = "{json}"\n',
    user: ({ email, forbidden }) =>
      [
        ...(forbidden ? ["import Alamofire", ""] : []),
        "struct User {",
        "    let name: String",
        ...(email ? ['    var email = ""'] : []),
        "}",
        "",
      ].join("\n"),
    tests: (subject, cases) =>
      [
        "import XCTest",
        "@testable import Shop",
        "",
        `final class ${subject}Tests: XCTestCase {`,
        ...cases.flatMap((test, index) => [
          ...(index > 0 ? [""] : []),
          `    func test${pascal(test.name)}() throws {`,
          ...(test.skipped ? ['        throw XCTSkip("flaky")'] : []),
          `        XCTAssertEqual(${test.fails ? 2 : 1}, 1)`,
          "    }",
        ]),
        "}",
        "",
      ].join("\n"),
    leak: (token) => `let githubToken = "${token}"\n`,
  },
};

describeExamples([GO, RUST, SWIFT]);
