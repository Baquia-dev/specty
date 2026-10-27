// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  criterionMarks,
  DEFAULT_CHECKS,
  focusedTests,
  resolveConfig,
  skippedTests,
  testCases,
  unreferencedTodos,
} from "../../src";

// The markers are put together from parts, so that this file does not trip `specty check`.
const ONLY = ".only";
const SKIP = ".skip";
const F = "f";
const X = "x";
const TODO = "TODO";
const FIXME = "FIXME";

/** The markers found in `lines`, one source line each. */
const found = (find: (text: string) => readonly { marker: string }[], ...lines: string[]) =>
  find(lines.join("\n")).map((mark) => mark.marker);

describe("focusedTests", () => {
  it("finds the focus markers of each family of frameworks, with their line", () => {
    const text = [
      `describe${ONLY}("a", () => {`,
      `  it${ONLY}("b", () => {});`,
      `  test${ONLY}.each([1])("c", () => {});`,
      `  ${F}it("d", () => {});`,
      `${F}describe('e', () => {});`,
      `  test('f', () {}, solo${": true"});`,
      `  ${F}it "g" do`,
      `  it "h", focus${": true"} do`,
      `  it "i", :${"focus"} do`,
      `  ${"F"}It("j", func() {})`,
      `  test.concurrent${ONLY}("k", async () => {});`,
      "});",
    ].join("\n");
    expect(focusedTests(text)).toEqual([
      { line: 1, marker: `describe${ONLY}` },
      { line: 2, marker: `it${ONLY}` },
      { line: 3, marker: `test${ONLY}` },
      { line: 4, marker: `${F}it` },
      { line: 5, marker: `${F}describe` },
      { line: 6, marker: `solo${": true"}` },
      { line: 7, marker: `${F}it` },
      { line: 8, marker: `focus${": true"}` },
      { line: 9, marker: `:${"focus"}` },
      { line: 10, marker: `${"F"}It` },
      { line: 11, marker: `test.concurrent${ONLY}` },
    ]);
  });

  it("finds the focus of Ginkgo's other nodes and decorator, and of Pest (AC1)", () => {
    expect(
      found(
        focusedTests,
        `  ${"F"}Specify("a", func() {})`,
        `  ${"F"}DescribeTableSubtree("b", func(n int) {})`,
        `  It("c", Label("db"), ${"Focus"}, func() {})`,
        `Describe("d", ${"Focus"}, func() {})`,
        `})->${"only"}();`,
        `pest()->${"only"}();`,
      ),
    ).toEqual([
      `${"F"}Specify`,
      `${"F"}DescribeTableSubtree`,
      "Focus",
      "Focus",
      `->${"only"}()`,
      `->${"only"}()`,
    ]);
  });

  it("leaves out what only looks like a focus marker", () => {
    expect(
      found(
        focusedTests,
        "model.fit(x, y);",
        "def fit(self, data):",
        `expect(layout).toBe("${F}it");`,
        "const it = describe;",
        `runner${ONLY}("a");`,
        `this.describe${ONLY}("a");`,
        "solo: false,",
        "$credentials = $request->only(['email', 'password']);",
        "Expect(view.Focus).To(BeTrue())",
        `client.${"F"}It("a")`,
      ),
    ).toEqual([]);
  });
});

describe("skippedTests", () => {
  it("finds the declarative skip markers of each family of frameworks", () => {
    expect(
      found(
        skippedTests,
        `it${SKIP}("a", () => {});`,
        `describe${SKIP}.each([1])("b", () => {});`,
        `${X}it("c", () => {});`,
        `${X}describe('d', () => {});`,
        `test('e', () {}, skip${": true"});`,
        `group('f', () {}, skip${": 'flaky on CI'"});`,
        `@pytest.mark.${"skip"}(reason="slow")`,
        `@unittest.${"skip"}("slow")`,
        `#[${"ignore"}]`,
        `#[${"ignore"} = "slow"]`,
        `@${"Disabled"}("flaky")`,
        `@${"Ignore"}`,
        `@Test(groups = "db", enabled${" = false"})`,
        `[${"Ignore"}("flaky")]`,
        `[Test, ${"Ignore"}("flaky")]`,
        `[Fact(Skip${' = "flaky"'})]`,
      ),
    ).toEqual([
      `it${SKIP}`,
      `describe${SKIP}`,
      `${X}it`,
      `${X}describe`,
      `skip${": true"}`,
      `skip${": 'flaky on CI'"}`,
      `@pytest.mark.${"skip"}`,
      `@unittest.${"skip"}`,
      `#[${"ignore"}]`,
      `#[${"ignore"} = "slow"]`,
      `@${"Disabled"}`,
      `@${"Ignore"}`,
      `enabled${" = false"}`,
      `${"Ignore"}`,
      `${"Ignore"}`,
      `Skip${' = "flaky"'}`,
    ]);
  });

  it("finds the skip markers of Ginkgo, Swift Testing and Pest (AC2)", () => {
    expect(
      found(
        skippedTests,
        `  ${"P"}It("a", func() {})`,
        `  ${"X"}It("b", func() {})`,
        `${"P"}Describe("c", func() {})`,
        `  ${"X"}Entry("d", 1)`,
        `  It("e", ${"Pending"})`,
        `  It("f", Label("db"), ${"Pending"}, func() {})`,
        `@Test(.${"disabled"}())`,
        `@Suite("g", .${"disabled"}("flaky"))`,
        `})->${"skip"}();`,
        `})->${"skip"}('flaky on CI');`,
      ),
    ).toEqual([
      `${"P"}It`,
      `${"X"}It`,
      `${"P"}Describe`,
      `${"X"}Entry`,
      "Pending",
      "Pending",
      `.${"disabled"}()`,
      `.${"disabled"}("flaky")`,
      `->${"skip"}()`,
      `->${"skip"}('flaky on CI')`,
    ]);
  });

  it("leaves out what decides or only looks like a skip (AC3)", () => {
    expect(
      found(
        skippedTests,
        "$users = User::query()->skip(10)->take(5)->get();",
        `})->${"skip"}($isCi, 'slow on CI');`,
        `})->${"skip"}(fn () => true);`,
        `Button("Save").${"disabled"}(isLoading)`,
        "@Test(.enabled(if: isCI))",
        "Expect(job.State).To(Equal(Pending))",
        "send(job, Pending)",
      ),
    ).toEqual([]);
  });

  it("leaves out the conditional skips, which run elsewhere", () => {
    expect(
      found(
        skippedTests,
        `test${SKIP}If(process.platform === "win32")("a", () => {});`,
        `@pytest.mark.${"skip"}if(sys.platform == "win32", reason="posix")`,
        `@unittest.${"skip"}Unless(HAS_GPU, "gpu")`,
        `    t.${"Skip"}("short mode")`,
        `    pytest.${"skip"}("no network")`,
        `@${"Ignore"}ExtraProperties`,
        "let enabled = false;",
        "skip: false,",
        "const skipped = items.skip(2);",
      ),
    ).toEqual([]);
  });
});

describe("unreferencedTodos", () => {
  const todo = DEFAULT_CHECKS.todo;

  it("finds a marker that starts a comment and points to no issue", () => {
    const text = [
      `// ${TODO}: split this`,
      `# ${FIXME} the encoding`,
      "/**",
      ` * ${TODO} explain the cache`,
      " */",
      `-- ${TODO}(ana): index the column`,
      `<!-- ${FIXME} the layout -->`,
      `x = 1; // ${TODO}`,
      `/* ${FIXME}: old api */`,
      `; ${TODO} the register`,
      `% ${TODO} the proof`,
    ].join("\n");
    expect(unreferencedTodos(text, todo)).toEqual([
      { line: 1, marker: TODO },
      { line: 2, marker: FIXME },
      { line: 4, marker: TODO },
      { line: 6, marker: TODO },
      { line: 7, marker: FIXME },
      { line: 8, marker: TODO },
      { line: 9, marker: FIXME },
      { line: 10, marker: TODO },
      { line: 11, marker: TODO },
    ]);
  });

  it("accepts an issue number, a key or a link, and a marker that starts no comment", () => {
    expect(
      found(
        (text) => unreferencedTodos(text, todo),
        `// ${TODO}(#12): split this`,
        `# ${FIXME} ABC-12 the encoding`,
        `// ${TODO} see https://github.com/acme/app/issues/3`,
        `// ${TODO} acme/app#40`,
        `enum Status { ${TODO}, DONE }`,
        `const status = "${TODO}";`,
        `// see the ${TODO} list`,
        `// ${TODO.toLowerCase()}: lower case is prose`,
        `// ${TODO}S are tracked elsewhere`,
      ),
    ).toEqual([]);
  });

  it("follows the configured markers and reference", () => {
    const custom = { markers: ["HACK", "X.Y"], reference: String.raw`\bPROJ-\d+\b` };
    expect(
      found(
        (text) => unreferencedTodos(text, custom),
        "// HACK: around the driver",
        "// HACK PROJ-9 around the driver",
        `// ${TODO}: not a marker here`,
        "// HACK #12 is not a reference here",
        "// XzY is not X.Y",
        "// X.Y: escaped as it is",
      ),
    ).toEqual(["HACK", "HACK", "X.Y"]);
  });
});

describe("testCases", () => {
  it("counts one case per line that declares it, in each family of frameworks", () => {
    const text = [
      'it("adds", () => {});',
      "  test('subtracts', () {});",
      "  testWidgets('renders', (tester) async {});",
      "  it.each([1, 2])('adds %i', (n) => {});",
      "def test_parses():",
      "    async def test_fetches():",
      "func TestParse(t *testing.T) {",
      "  @Test",
      "  @ParameterizedTest",
      "  [Fact]",
      "  [TestMethod]",
      "#[test]",
      "#[tokio::test]",
      '  it "adds" do',
      "  func testParses() {",
      "  public function testParses(): void",
    ].join("\n");
    expect(testCases(text)).toBe(16);
  });

  it("leaves out what only looks like a case", () => {
    const text = [
      "const it = 1;",
      "model.test(x);",
      'describe("suite", () => {',
      '// it("commented out", () => {});',
      "@Testable",
      "def helper():",
      "function testHelper() {}",
    ].join("\n");
    expect(testCases(text)).toBe(0);
  });
});

describe("criterionMarks", () => {
  it("AC3: finds each id where a line carries it, as the spec writes it", () => {
    const text = [
      'it("AC1: greets by name", () => {});',
      "  // AC2, and AC1 again",
      "it('AC20 is another criterion', () => {});",
      "def test_AC3_parses():",
      "func TestAC2Greets(t *testing.T) {",
      "it('ac1 in lower case', () => {});",
      "const XAC1 = 1;",
    ].join("\n");
    expect(criterionMarks(text, ["AC1", "AC2", "AC3"])).toEqual([
      { line: 1, marker: "AC1" },
      { line: 2, marker: "AC2" },
      { line: 2, marker: "AC1" },
      { line: 4, marker: "AC3" },
      { line: 5, marker: "AC2" },
    ]);
  });

  it("finds nothing without ids", () => {
    expect(criterionMarks("it('AC1: greets', () => {});", [])).toEqual([]);
  });
});

describe("checks.todo", () => {
  it("defaults to TODO and FIXME, an issue number, a key or a link", () => {
    expect(DEFAULT_CHECKS.todo.markers).toEqual([TODO, FIXME]);
    const result = resolveConfig({ version: 1, checks: { todo: { markers: ["XXX"] } } });
    expect(result.ok && result.config.checks.todo).toEqual({
      markers: ["XXX"],
      reference: DEFAULT_CHECKS.todo.reference,
    });
  });

  it("does not accept a reference that is not a regular expression", () => {
    const result = resolveConfig({ version: 1, checks: { todo: { reference: "(#" } } });
    expect(result).toMatchObject({ ok: false, issues: [{ path: "checks.todo.reference" }] });
  });
});
