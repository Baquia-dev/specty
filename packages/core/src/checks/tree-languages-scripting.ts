// SPDX-License-Identifier: Apache-2.0
import type { TreeGrammar } from "./tree-languages";

/**
 * The tree-sitter grammars of the scripting languages without braces: Python and Ruby. Each one
 * measures as its line estimator did (`functions-python.ts`, `functions-ruby.ts`), so that the
 * limits mean the same: in Ruby, the blocks stay inside their method.
 */

export const PYTHON: TreeGrammar = {
  functions: new Set(["function_definition"]),
  branches: new Set([
    "if_statement",
    "elif_clause",
    "for_statement",
    "while_statement",
    "except_clause",
    "case_clause",
    // The `for` and the `if` of a comprehension, and the `if` of a conditional expression.
    "for_in_clause",
    "if_clause",
    "conditional_expression",
  ]),
  cases: new Map(),
  operators: new Set(["and", "or"]),
  logical: new Set(["boolean_operator"]),
  prefixes: new Set(),
  comments: new Set(["comment"]),
  // A statement that is only a string, a docstring, is no code; of a string of many lines, only
  // the row where it starts is.
  docstrings: new Map([["expression_statement", "string"]]),
  strings: new Set(["string"]),
  nameFields: ["name"],
  carriers: new Set(),
  receivers: new Map(),
  names: new Set(["identifier"]),
};

export const RUBY: TreeGrammar = {
  functions: new Set(["method", "singleton_method"]),
  branches: new Set([
    "if",
    "elsif",
    "unless",
    "while",
    "until",
    "for",
    "when",
    "rescue",
    "if_modifier",
    "unless_modifier",
    "while_modifier",
    "until_modifier",
    "rescue_modifier",
    "conditional",
  ]),
  cases: new Map(),
  operators: new Set(["&&", "||", "and", "or"]),
  logical: new Set(["binary"]),
  prefixes: new Set(),
  comments: new Set(["comment"]),
  nameFields: ["name"],
  carriers: new Set(),
  receivers: new Map(),
  names: new Set(["identifier", "constant", "setter", "operator"]),
};
