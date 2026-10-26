// SPDX-License-Identifier: Apache-2.0

import { camel, type Dialect, describeExamples, indent, pascal } from "./stack-dialect";
import { repeat } from "./stack-examples";

/**
 * A Java (Maven), a Kotlin (Gradle) and a C# (.NET) repository (AC1, AC2, AC3). Their commands
 * stand in for Spotless, Checkstyle and `mvn test`; ktlint, detekt and `gradle test`; and
 * `dotnet format`, `dotnet build` and `dotnet test`. On the JVM the compiler runs with the tests,
 * so there is no typecheck of its own. JUnit and xUnit have no focus marker.
 */

const JAVA_PACKAGE = "com.acme.shop";

/** The package of a test of `subject`: the user's is in the domain. */
const javaPackage = (subject: string) =>
  subject === "User" ? `${JAVA_PACKAGE}.domain` : JAVA_PACKAGE;

const SPRING = "org.springframework.stereotype.Service";

function mavenDependency(group: string, artifact: string, version: string): string {
  return [
    "<dependency>",
    `  <groupId>${group}</groupId>`,
    `  <artifactId>${artifact}</artifactId>`,
    `  <version>${version}</version>`,
    "</dependency>",
  ].join("\n    ");
}

const JAVA: Dialect = {
  name: "Java",
  paths: {
    manifest: "pom.xml",
    cart: "src/main/java/com/acme/shop/Cart.java",
    cartTest: "src/test/java/com/acme/shop/CartTest.java",
    catalog: "src/main/java/com/acme/shop/Catalog.java",
    prices: "src/main/resources/prices.json",
    pricesData: "src/main/java/com/acme/shop/Prices.java",
    user: "src/main/java/com/acme/shop/domain/User.java",
    userTest: "src/test/java/com/acme/shop/domain/UserTest.java",
    legacyTest: "src/test/java/com/acme/shop/LegacyTest.java",
    leak: "src/main/java/com/acme/shop/Settings.java",
  },
  manifest: (added) =>
    [
      '<project xmlns="http://maven.apache.org/POM/4.0.0">',
      "  <modelVersion>4.0.0</modelVersion>",
      "  <groupId>com.acme</groupId>",
      "  <artifactId>shop</artifactId>",
      "  <version>0.1.0</version>",
      "  <dependencies>",
      `    ${mavenDependency("org.junit.jupiter", "junit-jupiter", "5.11.3")}`,
      ...added.map((dependency) => `    ${dependency}`),
      "  </dependencies>",
      "</project>",
      "",
    ].join("\n"),
  dependencies: {
    allowed: "org.apache.commons:commons-lang3",
    line: mavenDependency("org.apache.commons", "commons-lang3", "3.17.0"),
    forbidden: mavenDependency("com.squareup.okhttp3", "okhttp", "4.12.0"),
  },
  tools: {
    format: {
      folder: "src/main",
      token: "result=price",
      output: "[ERROR] The following files had format violations:\n[ERROR]     {path}",
    },
    lint: {
      folder: "src/main",
      token: "System.out.println",
      output:
        "[ERROR] {abs}:[{line},5] (regexp) RegexpSinglelineJava: Use a logger, not System.out.",
    },
    tests: {
      folder: "src/test",
      token: "assertEquals(2, 1)",
      output: "[ERROR]   UserTest.namesTheUser:{line} expected: <2> but was: <1>",
    },
  },
  layers: { domain: "src/main/java/com/acme/shop/domain/**", forbidden: "org.springframework.*" },
  markers: { focused: false, skipped: true },
  code: {
    comment: "//",
    cart: (discount) =>
      [
        `package ${JAVA_PACKAGE};`,
        "",
        "import java.util.List;",
        "",
        "public final class Cart {",
        "  public static int total(List<Integer> prices) {",
        "    return prices.stream().mapToInt(Integer::intValue).sum();",
        "  }",
        ...(discount.length > 0 ? ["", ...indent(discount, "  ")] : []),
        "}",
        "",
      ].join("\n"),
    discount: (body) => [
      "public static double discount(double price, String code) {",
      ...indent(body, "  "),
      "}",
    ],
    fixed: ['return "C1".equals(code) ? price - 1 : price;'],
    broken: [
      "System.out.println(price);",
      '@SuppressWarnings("unused") int unused = 0;',
      "double result=price;",
    ],
    branch: (index) => `if ("C${index}".equals(code)) result -= ${index};`,
    step: (index) => `result += ${index} - ${index};`,
    result: "return result;",
    catalog: (count) =>
      [
        `package ${JAVA_PACKAGE};`,
        "",
        "final class Catalog {",
        ...repeat(count, (index) => `  static final int ITEM_${index} = ${index};`),
        "}",
        "",
      ].join("\n"),
    prices: `package ${JAVA_PACKAGE};\n\nfinal class Prices {\n  static final String JSON = "{json}";\n}\n`,
    user: ({ email, forbidden }) =>
      [
        `package ${JAVA_PACKAGE}.domain;`,
        "",
        ...(forbidden ? [`import ${SPRING};`, ""] : []),
        `public record User(String name${email ? ", String email" : ""}) {}`,
        "",
      ].join("\n"),
    tests: (subject, cases) =>
      [
        `package ${javaPackage(subject)};`,
        "",
        "import static org.junit.jupiter.api.Assertions.assertEquals;",
        "",
        "import org.junit.jupiter.api.Disabled;",
        "import org.junit.jupiter.api.Test;",
        "",
        `class ${subject}Test {`,
        ...cases.flatMap((test, index) => [
          ...(index > 0 ? [""] : []),
          "  @Test",
          ...(test.skipped ? [`  @${"Disabled"}`] : []),
          `  void ${camel(test.name)}() {`,
          `    assertEquals(${test.fails ? 2 : 1}, 1);`,
          "  }",
        ]),
        "}",
        "",
      ].join("\n"),
    leak: (token) =>
      `package ${JAVA_PACKAGE};\n\nfinal class Settings {\n  static final String GITHUB_TOKEN = "${token}";\n}\n`,
  },
};

const KOTLIN: Dialect = {
  name: "Kotlin",
  paths: {
    manifest: "build.gradle.kts",
    cart: "src/main/kotlin/com/acme/shop/Cart.kt",
    cartTest: "src/test/kotlin/com/acme/shop/CartTest.kt",
    catalog: "src/main/kotlin/com/acme/shop/Catalog.kt",
    prices: "src/main/resources/prices.json",
    pricesData: "src/main/kotlin/com/acme/shop/Prices.kt",
    user: "src/main/kotlin/com/acme/shop/domain/User.kt",
    userTest: "src/test/kotlin/com/acme/shop/domain/UserTest.kt",
    legacyTest: "src/test/kotlin/com/acme/shop/LegacyTest.kt",
    leak: "src/main/kotlin/com/acme/shop/Settings.kt",
  },
  files: { "settings.gradle.kts": 'rootProject.name = "shop"\n' },
  manifest: (added) =>
    [
      "plugins {",
      '    kotlin("jvm") version "2.0.21"',
      "}",
      "",
      "repositories {",
      "    mavenCentral()",
      "}",
      "",
      "dependencies {",
      '    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.9.0")',
      ...added.map((line) => `    ${line}`),
      '    testImplementation(kotlin("test"))',
      "}",
      "",
    ].join("\n"),
  dependencies: {
    allowed: "org.jetbrains.kotlinx:kotlinx-datetime",
    line: 'implementation("org.jetbrains.kotlinx:kotlinx-datetime:0.6.1")',
    forbidden: 'implementation("com.squareup.okhttp3:okhttp:4.12.0")',
  },
  tools: {
    format: {
      folder: "src/main",
      token: "result=price",
      output: '{path}:{line}:15: Missing spacing around "=" (standard:op-spacing)',
    },
    lint: {
      folder: "src/main",
      token: "println(",
      output:
        "{path}:{line}:9: The method `kotlin.io.println` has been forbidden in the detekt config. [ForbiddenMethodCall]",
    },
    tests: {
      folder: "src/test",
      token: "assertEquals(2, 1)",
      output:
        "UserTest > namesTheUser() FAILED\n    org.opentest4j.AssertionFailedError at {path}:{line}",
    },
  },
  layers: {
    domain: "src/main/kotlin/com/acme/shop/domain/**",
    forbidden: "org.springframework.*",
  },
  markers: { focused: false, skipped: true },
  code: {
    comment: "//",
    cart: (discount) =>
      [
        `package ${JAVA_PACKAGE}`,
        "",
        "fun total(prices: List<Int>): Int {",
        "    return prices.sum()",
        "}",
        ...(discount.length > 0 ? ["", ...discount] : []),
        "",
      ].join("\n"),
    discount: (body) => [
      "fun discount(price: Double, code: String): Double {",
      ...indent(body, "    "),
      "}",
    ],
    fixed: ['return if (code == "C1") price - 1 else price'],
    broken: ["println(price)", '@Suppress("UNUSED_VARIABLE") val unused = 0', "var result=price"],
    branch: (index) => `if (code == "C${index}") result -= ${index}`,
    step: (index) => `result += ${index} - ${index}`,
    result: "return result",
    catalog: (count) =>
      [
        `package ${JAVA_PACKAGE}`,
        "",
        ...repeat(count, (index) => `const val ITEM_${index} = ${index}`),
        "",
      ].join("\n"),
    prices: `package ${JAVA_PACKAGE}\n\nconst val PRICES = "{json}"\n`,
    user: ({ email, forbidden }) =>
      [
        `package ${JAVA_PACKAGE}.domain`,
        "",
        ...(forbidden ? [`import ${SPRING}`, ""] : []),
        `data class User(val name: String${email ? ', val email: String = ""' : ""})`,
        "",
      ].join("\n"),
    tests: (subject, cases) =>
      [
        `package ${javaPackage(subject)}`,
        "",
        "import org.junit.jupiter.api.Disabled",
        "import kotlin.test.Test",
        "import kotlin.test.assertEquals",
        "",
        `class ${subject}Test {`,
        ...cases.flatMap((test, index) => [
          ...(index > 0 ? [""] : []),
          "    @Test",
          ...(test.skipped ? [`    @${"Disabled"}`] : []),
          `    fun ${camel(test.name)}() {`,
          `        assertEquals(${test.fails ? 2 : 1}, 1)`,
          "    }",
        ]),
        "}",
        "",
      ].join("\n"),
    leak: (token) => `package ${JAVA_PACKAGE}\n\nconst val GITHUB_TOKEN = "${token}"\n`,
  },
};

const PROJECT = (references: readonly string[]) =>
  [
    '<Project Sdk="Microsoft.NET.Sdk">',
    "  <PropertyGroup>",
    "    <TargetFramework>net9.0</TargetFramework>",
    "    <ImplicitUsings>enable</ImplicitUsings>",
    "    <Nullable>enable</Nullable>",
    "  </PropertyGroup>",
    "  <ItemGroup>",
    ...references.map((reference) => `    ${reference}`),
    "  </ItemGroup>",
    "</Project>",
    "",
  ].join("\n");

const reference = (name: string, version: string) =>
  `<PackageReference Include="${name}" Version="${version}" />`;

/** A C# source in `namespace` with a static class of `members`. */
const csharp = (namespace: string, name: string, members: readonly string[]) =>
  [`namespace ${namespace};`, "", `public static class ${name}`, "{", ...members, "}", ""].join(
    "\n",
  );

const CSHARP: Dialect = {
  name: "C#",
  paths: {
    manifest: "src/Shop/Shop.csproj",
    cart: "src/Shop/Cart.cs",
    cartTest: "tests/Shop.Tests/CartTests.cs",
    catalog: "src/Shop/Catalog.cs",
    prices: "src/Shop/prices.json",
    pricesData: "src/Shop/Prices.cs",
    user: "src/Shop/Domain/User.cs",
    userTest: "tests/Shop.Tests/Domain/UserTests.cs",
    legacyTest: "tests/Shop.Tests/LegacyTests.cs",
    leak: "src/Shop/Settings.cs",
  },
  files: {
    "Shop.slnx": [
      "<Solution>",
      '  <Project Path="src/Shop/Shop.csproj" />',
      '  <Project Path="tests/Shop.Tests/Shop.Tests.csproj" />',
      "</Solution>",
      "",
    ].join("\n"),
    "tests/Shop.Tests/Shop.Tests.csproj": PROJECT([
      reference("Microsoft.NET.Test.Sdk", "17.12.0"),
      reference("xunit", "2.9.2"),
      reference("xunit.runner.visualstudio", "2.8.2"),
      '<ProjectReference Include="../../src/Shop/Shop.csproj" />',
    ]),
  },
  manifest: (added) => PROJECT([reference("Humanizer.Core", "2.14.1"), ...added]),
  dependencies: {
    allowed: "NodaTime",
    line: reference("NodaTime", "3.2.0"),
    forbidden: reference("Microsoft.EntityFrameworkCore", "9.0.0"),
  },
  tools: {
    format: {
      folder: "src",
      token: "result=price",
      output: "{abs}({line},19): error WHITESPACE: Fix whitespace formatting. Insert '\\s'.",
    },
    typecheck: {
      folder: "src",
      token: 'int count = "1"',
      output: "{abs}({line},21): error CS0029: Cannot implicitly convert type 'string' to 'int'",
    },
    tests: {
      folder: "tests",
      token: "Assert.Equal(2, 1)",
      output:
        "  Failed Shop.Tests.Domain.UserTests.NamesTheUser [1 ms]\n  Stack Trace:\n     at Shop.Tests.Domain.UserTests.NamesTheUser() in {abs}:line {line}",
    },
  },
  layers: { domain: "src/Shop/Domain/**", forbidden: "Microsoft.EntityFrameworkCore*" },
  markers: { focused: false, skipped: true },
  code: {
    comment: "//",
    cart: (discount) =>
      csharp("Shop", "Cart", [
        "    public static int Total(IEnumerable<int> prices)",
        "    {",
        "        return prices.Sum();",
        "    }",
        ...(discount.length > 0 ? ["", ...indent(discount, "    ")] : []),
      ]),
    discount: (body) => [
      "public static double Discount(double price, string code)",
      "{",
      ...indent(body, "    "),
      "}",
    ],
    fixed: ['return code == "C1" ? price - 1 : price;'],
    broken: ["#pragma warning disable CS0219", 'int count = "1";', "var result=price;"],
    branch: (index) => `if (code == "C${index}") result -= ${index};`,
    step: (index) => `result += ${index} - ${index};`,
    result: "return result;",
    catalog: (count) =>
      csharp(
        "Shop",
        "Catalog",
        repeat(count, (index) => `    public const int Item${index} = ${index};`),
      ),
    prices: csharp("Shop", "Prices", ['    public const string Json = "{json}";']),
    user: ({ email, forbidden }) =>
      [
        ...(forbidden ? ["using Microsoft.EntityFrameworkCore;", ""] : []),
        "namespace Shop.Domain;",
        "",
        `public sealed record User(string Name${email ? ', string Email = ""' : ""});`,
        "",
      ].join("\n"),
    tests: (subject, cases) =>
      [
        "using Xunit;",
        "",
        `namespace Shop.Tests${subject === "User" ? ".Domain" : ""};`,
        "",
        `public class ${subject}Tests`,
        "{",
        ...cases.flatMap((test, index) => [
          ...(index > 0 ? [""] : []),
          test.skipped ? `    [Fact(${"Skip"} = "flaky")]` : "    [Fact]",
          `    public void ${pascal(test.name)}()`,
          "    {",
          `        Assert.Equal(${test.fails ? 2 : 1}, 1);`,
          "    }",
        ]),
        "}",
        "",
      ].join("\n"),
    leak: (token) =>
      csharp("Shop", "Settings", [`    public const string GitHubToken = "${token}";`]),
  },
};

describeExamples([JAVA, KOTLIN, CSHARP]);
