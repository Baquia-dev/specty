// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { DEFAULT_CHECKS, functionMetrics, resolveConfig } from "../../src";

const source = (...lines: string[]) => `${lines.join("\n")}\n`;

describe("functionMetrics", () => {
  it("measures TypeScript functions, arrows, constructors, methods and nested callbacks", () => {
    const text = source(
      "export function greet(name: string): string {",
      '  if (name === "") {',
      '    return "hola";',
      "  }",
      "  // a comment with if (x) { and && inside",
      '  return name.length > 3 && name !== "x" ? \'hola \' + name : "hey";',
      "}",
      "",
      "export const total = (items: number[]): number => {",
      "  let sum = 0;",
      "  for (const item of items) {",
      "    sum += item ?? 0;",
      "  }",
      "  return sum;",
      "};",
      "",
      "class Store {",
      "  constructor(private readonly items: string[]) {",
      "    this.items = items;",
      "  }",
      "",
      "  async load(id: string): Promise<string | undefined> {",
      "    try {",
      "      return this.items.find((item) => {",
      "        return item === id || item.startsWith(id);",
      "      });",
      "    } catch (error) {",
      "      return undefined;",
      "    }",
      "  }",
      "}",
    );
    expect(functionMetrics("src/app.ts", text)).toEqual([
      { name: "greet", start: 1, end: 7, lines: 6, complexity: 4 },
      { name: "total", start: 9, end: 15, lines: 7, complexity: 3 },
      { name: "constructor", start: 18, end: 20, lines: 3, complexity: 1 },
      { name: "load", start: 22, end: 30, lines: 9, complexity: 2 },
      { start: 24, end: 26, lines: 3, complexity: 2 },
    ]);
  });

  it("measures Go, Dart and Java", () => {
    const go = source(
      "func (s *Store) Get(id string) (*User, error) {",
      '\tif id == "" {',
      "\t\treturn nil, errEmpty",
      "\t}",
      "\tswitch s.mode {",
      "\tcase 1:",
      "\t\treturn s.a, nil",
      "\tcase 2:",
      "\t\treturn s.b, nil",
      "\t}",
      "\treturn nil, nil",
      "}",
    );
    expect(functionMetrics("store.go", go)).toEqual([
      { name: "Get", start: 1, end: 12, lines: 12, complexity: 4 },
    ]);
    const dart = source(
      "class Counter extends StatelessWidget {",
      "  const Counter({super.key});",
      "",
      "  @override",
      "  Widget build(BuildContext context) {",
      "    return items.isEmpty ? const Text('none') : ListView(",
      "      children: items.map((item) {",
      "        return Text(item);",
      "      }).toList(),",
      "    );",
      "  }",
      "",
      "  Future<void> load() async {",
      "    for (final item in items) {",
      "      await save(item);",
      "    }",
      "  }",
      "}",
    );
    expect(functionMetrics("lib/counter.dart", dart)).toEqual([
      { name: "build", start: 5, end: 11, lines: 7, complexity: 2 },
      { start: 7, end: 9, lines: 3, complexity: 1 },
      { name: "load", start: 13, end: 17, lines: 5, complexity: 2 },
    ]);
    const java = source(
      "public class Users {",
      "  public User find(String id) throws NotFound {",
      "    while (cursor.next()) {",
      "      if (cursor.id().equals(id)) {",
      "        return cursor.user();",
      "      }",
      "    }",
      "    throw new NotFound(id);",
      "  }",
      "}",
    );
    expect(functionMetrics("src/Users.java", java)).toEqual([
      { name: "find", start: 2, end: 9, lines: 8, complexity: 3 },
    ]);
  });

  it("measures Kotlin, C# in Allman style, Rust, Swift, PHP and C", () => {
    const kotlin = source(
      "fun total(items: List<Int>): Int {",
      "    return when (items.size) {",
      "        0 -> 0",
      "        else -> items.sum()",
      "    }",
      "}",
    );
    expect(functionMetrics("Total.kt", kotlin)).toEqual([
      { name: "total", start: 1, end: 6, lines: 6, complexity: 1 },
    ]);
    const csharp = source(
      "public async Task<User?> GetAsync(string id)",
      "{",
      "    if (id is null)",
      "    {",
      "        return null;",
      "    }",
      "    return id.Length > 0 ? await repo.Find(id) : null;",
      "}",
    );
    expect(functionMetrics("Users.cs", csharp)).toEqual([
      { name: "GetAsync", start: 1, end: 8, lines: 8, complexity: 3 },
    ]);
    const rust = source(
      "fn longest<'a>(a: &'a str, b: &'a str) -> &'a str {",
      "    if a.len() > b.len() { a } else { b }",
      "}",
    );
    expect(functionMetrics("src/lib.rs", rust)).toEqual([
      { name: "longest", start: 1, end: 3, lines: 3, complexity: 2 },
    ]);
    const swift = source(
      "func load(id: String) async throws -> User {",
      "    guard let user = cache[id] else {",
      "        throw LoadError.missing",
      "    }",
      "    return user",
      "}",
    );
    expect(functionMetrics("Load.swift", swift)).toEqual([
      { name: "load", start: 1, end: 6, lines: 6, complexity: 2 },
    ]);
    const php = source(
      "public function find(int $id): ?User {",
      "    return $this->users[$id] ?? null;",
      "}",
    );
    expect(functionMetrics("src/Users.php", php)).toEqual([
      { name: "find", start: 1, end: 3, lines: 3, complexity: 2 },
    ]);
    const c = source(
      "int main(int argc, char **argv) {",
      "  for (int i = 0; i < argc; i++) {",
      '    printf("%s {\\n", argv[i]);',
      "  }",
      "  return 0;",
      "}",
    );
    expect(functionMetrics("main.c", c)).toEqual([
      { name: "main", start: 1, end: 6, lines: 6, complexity: 2 },
    ]);
  });

  it("takes no control block, class, object or call for a function", () => {
    const text = source(
      "if (ready) {",
      "}",
      "for (const x of xs) {",
      "}",
      "while (",
      "  a &&",
      "  b",
      ") {",
      "}",
      "const config = defineConfig({",
      "  plugins: [],",
      "});",
      "switch (kind) {",
      "}",
      "try {",
      "} catch (error) {",
      "}",
      "interface Shape {",
      "}",
      "class User(val name: String) {",
      "}",
      "export default function () {",
      "}",
    );
    expect(functionMetrics("src/app.kt.ts", text)).toEqual([
      { start: 22, end: 23, lines: 2, complexity: 1 },
    ]);
  });

  it("measures nothing in a language it has no estimator for", () => {
    expect(functionMetrics("lib/app.ex", source("def f do", "  if x, do: 1", "end"))).toEqual([]);
    expect(functionMetrics("README", source("function f() {", "}"))).toEqual([]);
  });
});

describe("checks.functions", () => {
  it("defaults to 50 lines and a complexity of 10, each one configurable", () => {
    expect(DEFAULT_CHECKS.functions).toEqual({ maxLines: 50, complexity: 10 });
    const result = resolveConfig({ version: 1, checks: { functions: { maxLines: 80 } } });
    expect(result.ok && result.config.checks.functions).toEqual({ maxLines: 80, complexity: 10 });
  });
});
