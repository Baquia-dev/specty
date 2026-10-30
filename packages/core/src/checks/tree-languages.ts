// SPDX-License-Identifier: Apache-2.0
import { C, CPP, CSHARP, JAVA, PHP } from "./tree-languages-c";
import { DART, GO, KOTLIN, RUST, SWIFT } from "./tree-languages-modern";
import { ELIXIR, PYTHON, RUBY } from "./tree-languages-scripting";

/**
 * What `treeFunctions` needs to know of each language's tree-sitter grammar: which nodes are a
 * function, which a branch, which are not code, and where a function gets its name.
 */

/** The languages measured on their syntax tree. TSX has the node types of TypeScript. */
export type TreeLanguage =
  | "typescript"
  | "javascript"
  | "java"
  | "csharp"
  | "php"
  | "c"
  | "cpp"
  | "go"
  | "rust"
  | "swift"
  | "dart"
  | "kotlin"
  | "python"
  | "ruby"
  | "elixir";

export interface TreeGrammar {
  /** The named nodes that are a function. */
  readonly functions: ReadonlySet<string>;
  /**
   * The bodies that are a function with the signature before them, its sibling (Dart), unless
   * their parent is already one.
   */
  readonly bodies?: ReadonlySet<string>;
  readonly signatures?: ReadonlySet<string>;
  /** The statements that are no code when their only named child is this node: a docstring. */
  readonly docstrings?: ReadonlyMap<string, string>;
  /** The nodes that are code only in their first row: Python's strings, as its estimator. */
  readonly strings?: ReadonlySet<string>;
  /** In a language whose definitions and branches are calls, as Elixir's `def` and `if`. */
  readonly calls?: TreeCalls;
  /** The named nodes that are a branch: a condition, a loop, a catch or a ternary. */
  readonly branches: ReadonlySet<string>;
  /** The named nodes that are a branch when their first token is this one: a `case`, not a `default`. */
  readonly cases: ReadonlyMap<string, string>;
  /** The logical operators that are a branch, as tokens whose parent is one of `logical`. */
  readonly operators: ReadonlySet<string>;
  readonly logical: ReadonlySet<string>;
  /** The nodes that do not start a function's header: decorators, annotations, attributes. */
  readonly prefixes: ReadonlySet<string>;
  /** The nodes that are not code, with all their children. */
  readonly comments: ReadonlySet<string>;
  /** The fields that lead from a function to its name, tried in order at each step. */
  readonly nameFields: readonly string[];
  /** The nodes whose name is their first named child, as `$total` in PHP. */
  readonly carriers: ReadonlySet<string>;
  /** For a function without a name, the field or the child of its parent that names it. */
  readonly receivers: ReadonlyMap<string, string>;
  /** The nodes that are a name. */
  readonly names: ReadonlySet<string>;
}

/** Calls told apart by the text of what they call. */
export interface TreeCalls {
  /** The node of a call, the field of what it calls and the node of its arguments. */
  readonly node: string;
  readonly target: string;
  readonly arguments: string;
  /** The calls that define a function, named by the call in their arguments: `def`, `defp`… */
  readonly functions: ReadonlySet<string>;
  /** The calls that are a branch: `if`, `unless`. */
  readonly branches: ReadonlySet<string>;
  /** The calls whose clauses are each a branch, as the cases of a switch: `case`, `cond`… */
  readonly clauses: ReadonlySet<string>;
  /** The node of a clause, and the blocks whose clauses are each a branch: `rescue`, `catch`. */
  readonly clause: string;
  readonly blocks: ReadonlySet<string>;
}

const SCRIPT: TreeGrammar = {
  functions: new Set([
    "function_declaration",
    "generator_function_declaration",
    "function_expression",
    "function",
    "generator_function",
    "arrow_function",
    "method_definition",
  ]),
  branches: new Set([
    "if_statement",
    "for_statement",
    "for_in_statement",
    "while_statement",
    "do_statement",
    "switch_case",
    "catch_clause",
    "ternary_expression",
  ]),
  cases: new Map(),
  operators: new Set(["&&", "||", "??", "&&=", "||=", "??="]),
  logical: new Set(["binary_expression", "augmented_assignment_expression"]),
  prefixes: new Set(["decorator"]),
  comments: new Set(["comment", "html_comment"]),
  nameFields: ["name", "property"],
  carriers: new Set(),
  receivers: new Map([
    ["variable_declarator", "name"],
    ["assignment_expression", "left"],
    ["pair", "key"],
    ["public_field_definition", "name"],
  ]),
  names: new Set(["identifier", "property_identifier", "private_property_identifier", "string"]),
};

export const TREE_GRAMMARS: Readonly<Record<TreeLanguage, TreeGrammar>> = {
  typescript: SCRIPT,
  javascript: SCRIPT,
  java: JAVA,
  csharp: CSHARP,
  php: PHP,
  c: C,
  cpp: CPP,
  go: GO,
  rust: RUST,
  swift: SWIFT,
  dart: DART,
  kotlin: KOTLIN,
  python: PYTHON,
  ruby: RUBY,
  elixir: ELIXIR,
};
