// SPDX-License-Identifier: Apache-2.0
import type { FunctionMetric } from "./function-spans";
import { TREE_GRAMMARS, type TreeGrammar, type TreeLanguage } from "./tree-languages";

/**
 * The functions of a source measured on its syntax tree, which the CLI gets from tree-sitter, by
 * the same definition as the line estimator (`functions.ts`), so that the limits of
 * `checks.functions` mean the same: lines of code from the first line of the header to the last
 * of the body, without blanks or comments, and 1 plus each branch outside the functions inside.
 */

export type { TreeLanguage } from "./tree-languages";

/** What the measure reads of a node. web-tree-sitter's `Node` has all of it. */
export interface SyntaxNode {
  readonly type: string;
  readonly isNamed: boolean;
  readonly text: string;
  readonly startPosition: { readonly row: number; readonly column: number };
  readonly endPosition: { readonly row: number; readonly column: number };
  readonly parent: SyntaxNode | null;
  readonly children: readonly SyntaxNode[];
  childForFieldName(name: string): SyntaxNode | null;
}

/** A function found in the tree: its rows, from 0. */
interface Found {
  readonly name?: string;
  readonly start: number;
  readonly end: number;
}

export function treeFunctions(language: TreeLanguage, root: SyntaxNode): FunctionMetric[] {
  const grammar = TREE_GRAMMARS[language];
  const rows = new Set<number>();
  const found: Found[] = [];
  const branches = new Map<Found, number>();
  // Depth first, in the order of the source, without recursion: a long chain of `+` or of
  // `else if` nests as deep as it is long.
  const pending: [SyntaxNode, Found | undefined][] = [[root, undefined]];
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    const [node, owner] = next;
    let inner = owner;
    if (node.isNamed && grammar.functions.has(node.type)) {
      inner = functionOf(grammar, node);
      found.push(inner);
    } else if (owner !== undefined && isBranch(grammar, node)) {
      branches.set(owner, (branches.get(owner) ?? 0) + 1);
    }
    const children = node.children;
    if (children.length === 0) codeRows(grammar, node, rows);
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      if (child !== undefined) pending.push([child, inner]);
    }
  }
  return found.map((fn) => {
    let lines = 0;
    for (let row = fn.start; row <= fn.end; row += 1) if (rows.has(row)) lines += 1;
    return {
      ...(fn.name !== undefined ? { name: fn.name } : {}),
      start: fn.start + 1,
      end: fn.end + 1,
      lines,
      complexity: 1 + (branches.get(fn) ?? 0),
    };
  });
}

/** A function from its first child that is not a decorator or a comment to its last row. */
function functionOf(grammar: TreeGrammar, node: SyntaxNode): Found {
  const header = node.children.find((child) => !grammar.prefixes.has(child.type)) ?? node;
  const name = nameOf(grammar, node);
  const rows = { start: header.startPosition.row, end: node.endPosition.row };
  return name === undefined ? rows : { name, ...rows };
}

/** Its own name or, when it has none, that of the variable, member or key that receives it. */
function nameOf(grammar: TreeGrammar, node: SyntaxNode): string | undefined {
  const own = node.childForFieldName("name");
  if (own !== null) return nameText(grammar, own);
  const parent = node.parent;
  const field = parent === null ? undefined : grammar.receivers[parent.type];
  const target = field === undefined ? null : (parent?.childForFieldName(field) ?? null);
  if (target === null) return undefined;
  const named = grammar.members.has(target.type) ? target.childForFieldName("property") : target;
  return named === null ? undefined : nameText(grammar, named);
}

function nameText(grammar: TreeGrammar, node: SyntaxNode): string | undefined {
  if (!grammar.names.has(node.type)) return undefined;
  return node.text.replace(/^(["'`])(.*)\1$/s, "$2");
}

function isBranch(grammar: TreeGrammar, node: SyntaxNode): boolean {
  if (!node.isNamed) return false;
  if (grammar.branches.has(node.type)) return true;
  if (!grammar.logical.has(node.type)) return false;
  const operator = node.childForFieldName("operator");
  return operator !== null && grammar.operators.has(operator.type);
}

/** The rows where a leaf has code: not a comment, and not blank inside a string of many lines. */
function codeRows(grammar: TreeGrammar, leaf: SyntaxNode, rows: Set<number>): void {
  if (grammar.comments.has(leaf.type)) return;
  const { startPosition: start, endPosition: end } = leaf;
  if (start.row === end.row) {
    // A token without width, as the semicolon that JavaScript inserts, is no code.
    if (start.column !== end.column) rows.add(start.row);
    return;
  }
  leaf.text.split(/\r?\n/).forEach((line, offset) => {
    if (line.trim() !== "") rows.add(start.row + offset);
  });
}
