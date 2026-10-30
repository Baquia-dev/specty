// SPDX-License-Identifier: Apache-2.0
import type { TreeGrammar } from "./tree-languages";

/**
 * The tree-sitter grammars of the C family: C, C++, Java, C# and PHP, which share C's statements
 * and name their nodes alike (`if_statement`, `binary_expression`…).
 */

export const C: TreeGrammar = {
  functions: new Set(["function_definition"]),
  branches: new Set([
    "if_statement",
    "for_statement",
    "while_statement",
    "do_statement",
    "conditional_expression",
  ]),
  cases: new Map([["case_statement", "case"]]),
  operators: new Set(["&&", "||"]),
  logical: new Set(["binary_expression"]),
  prefixes: new Set(),
  comments: new Set(["comment"]),
  // `static int *total(int x)`: the name is at the end of a chain of declarators.
  nameFields: ["declarator"],
  carriers: new Set(),
  receivers: new Map(),
  names: new Set(["identifier"]),
};

export const CPP: TreeGrammar = {
  ...C,
  functions: new Set(["function_definition", "lambda_expression"]),
  branches: new Set([...C.branches, "for_range_loop", "catch_clause"]),
  operators: new Set(["&&", "||", "and", "or"]),
  prefixes: new Set(["attribute_declaration"]),
  // `int Orders::total(int x)`: a qualified name gives its last part.
  nameFields: ["declarator", "name"],
  receivers: new Map([["init_declarator", "declarator"]]),
  names: new Set(["identifier", "field_identifier", "destructor_name", "operator_name"]),
};

export const JAVA: TreeGrammar = {
  functions: new Set([
    "method_declaration",
    "constructor_declaration",
    "compact_constructor_declaration",
    "lambda_expression",
  ]),
  branches: new Set([
    "if_statement",
    "for_statement",
    "enhanced_for_statement",
    "while_statement",
    "do_statement",
    "catch_clause",
    "ternary_expression",
  ]),
  cases: new Map([["switch_label", "case"]]),
  operators: new Set(["&&", "||"]),
  logical: new Set(["binary_expression"]),
  prefixes: new Set(["marker_annotation", "annotation"]),
  comments: new Set(["line_comment", "block_comment"]),
  nameFields: ["name"],
  carriers: new Set(),
  receivers: new Map([["variable_declarator", "name"]]),
  names: new Set(["identifier"]),
};

export const CSHARP: TreeGrammar = {
  functions: new Set([
    "method_declaration",
    "constructor_declaration",
    "destructor_declaration",
    "operator_declaration",
    "conversion_operator_declaration",
    "accessor_declaration",
    "local_function_statement",
    "lambda_expression",
    "anonymous_method_expression",
  ]),
  branches: new Set([
    "if_statement",
    "for_statement",
    "foreach_statement",
    "while_statement",
    "do_statement",
    "catch_clause",
    "conditional_expression",
  ]),
  cases: new Map([["switch_section", "case"]]),
  operators: new Set(["&&", "||", "??", "??="]),
  logical: new Set(["binary_expression", "assignment_expression"]),
  prefixes: new Set(["attribute_list"]),
  comments: new Set(["comment"]),
  nameFields: ["name"],
  carriers: new Set(),
  receivers: new Map([["variable_declarator", "name"]]),
  // An accessor's `name` is its keyword, `get` or `set`, which names nothing.
  names: new Set(["identifier"]),
};

export const PHP: TreeGrammar = {
  functions: new Set([
    "function_definition",
    "method_declaration",
    "anonymous_function",
    "anonymous_function_creation_expression",
    "arrow_function",
  ]),
  branches: new Set([
    "if_statement",
    "else_if_clause",
    "for_statement",
    "foreach_statement",
    "while_statement",
    "do_statement",
    "case_statement",
    "catch_clause",
    "conditional_expression",
  ]),
  cases: new Map(),
  operators: new Set(["&&", "||", "??", "??=", "and", "or"]),
  logical: new Set(["binary_expression", "augmented_assignment_expression"]),
  prefixes: new Set(["attribute_list"]),
  comments: new Set(["comment"]),
  nameFields: ["name"],
  carriers: new Set(["variable_name"]),
  receivers: new Map([["assignment_expression", "left"]]),
  names: new Set(["name"]),
};
