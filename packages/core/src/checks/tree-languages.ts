// SPDX-License-Identifier: Apache-2.0

/**
 * What `treeFunctions` needs to know of each language's tree-sitter grammar: which nodes are a
 * function, which a branch, which are not code, and where an anonymous function gets its name.
 */

/** The languages measured on their syntax tree. TSX has the node types of TypeScript. */
export type TreeLanguage = "typescript" | "javascript";

export interface TreeGrammar {
  /** The named nodes that are a function. */
  readonly functions: ReadonlySet<string>;
  /** The named nodes that are a branch: a condition, a loop, a case, a catch or a ternary. */
  readonly branches: ReadonlySet<string>;
  /** The named nodes that are a branch when their `operator` is one of `operators`. */
  readonly logical: ReadonlySet<string>;
  readonly operators: ReadonlySet<string>;
  /** The children before a function's header, which do not start it: decorators and comments. */
  readonly prefixes: ReadonlySet<string>;
  /** The nodes that are not code. */
  readonly comments: ReadonlySet<string>;
  /** For a function without a name, the field of its parent that names it, by the parent's type. */
  readonly receivers: Readonly<Record<string, string>>;
  /** The nodes that reach a member, named by their `property`: `this.load`. */
  readonly members: ReadonlySet<string>;
  /** The nodes that can be a name. */
  readonly names: ReadonlySet<string>;
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
  logical: new Set(["binary_expression", "augmented_assignment_expression"]),
  operators: new Set(["&&", "||", "??", "&&=", "||=", "??="]),
  prefixes: new Set(["decorator", "comment"]),
  comments: new Set(["comment", "html_comment"]),
  receivers: {
    variable_declarator: "name",
    assignment_expression: "left",
    pair: "key",
    public_field_definition: "name",
  },
  members: new Set(["member_expression"]),
  names: new Set(["identifier", "property_identifier", "private_property_identifier", "string"]),
};

export const TREE_GRAMMARS: Readonly<Record<TreeLanguage, TreeGrammar>> = {
  typescript: SCRIPT,
  javascript: SCRIPT,
};
