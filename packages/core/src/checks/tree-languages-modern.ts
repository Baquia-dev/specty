// SPDX-License-Identifier: Apache-2.0
import type { TreeGrammar } from "./tree-languages";

/**
 * The tree-sitter grammars of the languages with braces born after C's family: Go, Rust, Swift,
 * Dart and Kotlin. Their grammars name nodes their own way: the `if` of Rust and Kotlin is an
 * expression, and Swift and Dart keep each logical operator in its own node.
 */

export const GO: TreeGrammar = {
  functions: new Set(["function_declaration", "method_declaration", "func_literal"]),
  branches: new Set([
    "if_statement",
    "for_statement",
    "expression_case",
    "type_case",
    "communication_case",
  ]),
  cases: new Map(),
  operators: new Set(["&&", "||"]),
  logical: new Set(["binary_expression"]),
  prefixes: new Set(),
  comments: new Set(["comment"]),
  nameFields: ["name"],
  carriers: new Set(),
  receivers: new Map(),
  names: new Set(["identifier", "field_identifier"]),
};

export const RUST: TreeGrammar = {
  functions: new Set(["function_item", "closure_expression"]),
  branches: new Set(["if_expression", "for_expression", "while_expression"]),
  cases: new Map(),
  operators: new Set(["&&", "||"]),
  logical: new Set(["binary_expression"]),
  // Attributes and doc comments stand before the `fn`, outside it.
  prefixes: new Set(),
  comments: new Set(["line_comment", "block_comment"]),
  nameFields: ["name"],
  carriers: new Set(),
  receivers: new Map([["let_declaration", "pattern"]]),
  names: new Set(["identifier"]),
};

export const SWIFT: TreeGrammar = {
  functions: new Set([
    "function_declaration",
    "init_declaration",
    "deinit_declaration",
    "subscript_declaration",
    "computed_getter",
    "computed_setter",
    "lambda_literal",
  ]),
  branches: new Set([
    "if_statement",
    "guard_statement",
    "for_statement",
    "while_statement",
    "repeat_while_statement",
    "catch_block",
    "ternary_expression",
  ]),
  cases: new Map([["switch_entry", "case"]]),
  operators: new Set(["&&", "||", "??"]),
  logical: new Set([
    "conjunction_expression",
    "disjunction_expression",
    "nil_coalescing_expression",
  ]),
  prefixes: new Set(["attribute"]),
  comments: new Set(["comment", "multiline_comment"]),
  // `let twice = { … }`: a property names its value through its pattern.
  nameFields: ["name", "bound_identifier"],
  carriers: new Set(),
  receivers: new Map([["property_declaration", "name"]]),
  names: new Set(["simple_identifier"]),
};

export const DART: TreeGrammar = {
  functions: new Set(["function_expression", "lambda_expression"]),
  // A method, a top-level function, a getter or a constructor: a signature and its body, siblings.
  bodies: new Set(["function_body"]),
  signatures: new Set([
    "method_signature",
    "function_signature",
    "getter_signature",
    "setter_signature",
    "constructor_signature",
    "factory_constructor_signature",
    "operator_signature",
  ]),
  branches: new Set([
    "if_statement",
    "for_statement",
    "while_statement",
    "do_statement",
    "switch_statement_case",
    "catch_clause",
    "conditional_expression",
  ]),
  cases: new Map(),
  operators: new Set(["&&", "||", "??"]),
  logical: new Set(["logical_and_operator", "logical_or_operator", "if_null_expression"]),
  prefixes: new Set(["annotation"]),
  comments: new Set(["comment", "documentation_comment"]),
  // A local function keeps its name in the signature it has as `parameters`.
  nameFields: ["name", "parameters"],
  carriers: new Set(["method_signature"]),
  receivers: new Map([["initialized_variable_definition", "name"]]),
  names: new Set(["identifier"]),
};

export const KOTLIN: TreeGrammar = {
  functions: new Set([
    "function_declaration",
    "secondary_constructor",
    "getter",
    "setter",
    "anonymous_function",
    "lambda_literal",
  ]),
  branches: new Set([
    "if_expression",
    "for_statement",
    "while_statement",
    "do_while_statement",
    "catch_block",
  ]),
  cases: new Map(),
  operators: new Set(["&&", "||"]),
  logical: new Set(["binary_expression"]),
  prefixes: new Set(["annotation"]),
  comments: new Set(["line_comment", "block_comment"]),
  nameFields: ["name"],
  // `val size: Int get() { … }`: a getter, a lambda or an anonymous function takes the name of the
  // property that holds it, the first child of its `variable_declaration`.
  carriers: new Set(["variable_declaration"]),
  receivers: new Map([["property_declaration", "variable_declaration"]]),
  names: new Set(["identifier"]),
};
