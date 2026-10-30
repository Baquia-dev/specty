// SPDX-License-Identifier: Apache-2.0
import type { FunctionMetric } from "./function-spans";
import {
  TREE_GRAMMARS,
  type TreeCalls,
  type TreeGrammar,
  type TreeLanguage,
} from "./tree-languages";

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
  readonly previousNamedSibling: SyntaxNode | null;
  readonly children: readonly SyntaxNode[];
  childForFieldName(name: string): SyntaxNode | null;
}

/** A function found in the tree: its rows, from 0. */
interface Found {
  readonly name?: string;
  readonly start: number;
  readonly end: number;
}

// How far a name may be from its function, field after field: C's `static int *total(int x)`
// takes three steps.
const NAME_DEPTH = 5;

export function treeFunctions(language: TreeLanguage, root: SyntaxNode): FunctionMetric[] {
  const { rows, found, branches } = walk(TREE_GRAMMARS[language], root);
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

/** What one pass over the tree gathers. */
interface Walked {
  /** The rows with code. */
  readonly rows: Set<number>;
  /** The functions, in the order of the source. */
  readonly found: Found[];
  /** The branches of each function, without those of the functions inside it. */
  readonly branches: Map<Found, number>;
}

function walk(grammar: TreeGrammar, root: SyntaxNode): Walked {
  const walked: Walked = { rows: new Set(), found: [], branches: new Map() };
  // Depth first, in the order of the source, without recursion: a long chain of `+` or of
  // `else if` nests as deep as it is long.
  const pending: [SyntaxNode, Found | undefined][] = [[root, undefined]];
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    const [node, owner] = next;
    if (isNoCode(grammar, node)) continue;
    const inner = visit(grammar, node, owner, walked);
    if (grammar.strings?.has(node.type) === true) {
      walked.rows.add(node.startPosition.row);
      continue;
    }
    const children = node.children;
    if (children.length === 0) codeRows(node, walked.rows);
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      if (child !== undefined) pending.push([child, inner]);
    }
  }
  return walked;
}

/** A comment, with its children, as the doc comments of Rust have, or a docstring of Python. */
function isNoCode(grammar: TreeGrammar, node: SyntaxNode): boolean {
  if (grammar.comments.has(node.type)) return true;
  const only = grammar.docstrings?.get(node.type);
  if (only === undefined) return false;
  const named = node.children.filter((child) => child.isNamed);
  return named.length === 1 && named[0]?.type === only;
}

/** A node as a function, which owns what is inside it, or as a branch of the one that owns it. */
function visit(
  grammar: TreeGrammar,
  node: SyntaxNode,
  owner: Found | undefined,
  walked: Walked,
): Found | undefined {
  const fn = functionAt(grammar, node);
  if (fn !== undefined) {
    walked.found.push(fn);
    return fn;
  }
  if (owner !== undefined && isBranch(grammar, node)) {
    walked.branches.set(owner, (walked.branches.get(owner) ?? 0) + 1);
  }
  return owner;
}

/**
 * The function a node is: one of `functions`, or one of `bodies` with its signature before it.
 * Each goes from its first token past its decorators and comments to its last row.
 */
function functionAt(grammar: TreeGrammar, node: SyntaxNode): Found | undefined {
  if (!node.isNamed) return undefined;
  if (grammar.functions.has(node.type)) {
    const name = nameIn(grammar, node, 0) ?? receivedName(grammar, node);
    return found(firstToken(grammar, node) ?? node, node, name);
  }
  const definition = callDefinition(grammar, node);
  if (definition !== undefined)
    return found(firstToken(grammar, node) ?? node, node, definition.name);
  const signature = signatureOf(grammar, node);
  if (signature === undefined) return undefined;
  return found(firstToken(grammar, signature) ?? signature, node, nameIn(grammar, signature, 0));
}

/** A call that defines a function, as Elixir's `def`, with the name of the call in its arguments. */
function callDefinition(
  grammar: TreeGrammar,
  node: SyntaxNode,
): { readonly name: string | undefined } | undefined {
  const calls = grammar.calls;
  if (calls === undefined || !calls.functions.has(targetOf(calls, node) ?? "")) return undefined;
  const args = node.children.find((child) => child.type === calls.arguments);
  return { name: args === undefined ? undefined : nameIn(grammar, args, 0) };
}

/** What a call calls, by its text: `def`, `if`… */
function targetOf(calls: TreeCalls, node: SyntaxNode): string | undefined {
  return node.type === calls.node ? node.childForFieldName(calls.target)?.text : undefined;
}

function found(header: SyntaxNode, last: SyntaxNode, name: string | undefined): Found {
  const rows = { start: header.startPosition.row, end: last.endPosition.row };
  return name === undefined ? rows : { name, ...rows };
}

/** The signature of a body that is not part of a function already: its named sibling before it. */
function signatureOf(grammar: TreeGrammar, body: SyntaxNode): SyntaxNode | undefined {
  if (grammar.bodies?.has(body.type) !== true) return undefined;
  const parent = body.parent;
  if (parent !== null && grammar.functions.has(parent.type)) return undefined;
  let signature = body.previousNamedSibling;
  while (signature !== null && grammar.comments.has(signature.type)) {
    signature = signature.previousNamedSibling;
  }
  return signature !== null && grammar.signatures?.has(signature.type) === true
    ? signature
    : undefined;
}

function firstToken(grammar: TreeGrammar, node: SyntaxNode): SyntaxNode | undefined {
  if (grammar.prefixes.has(node.type) || grammar.comments.has(node.type)) return undefined;
  if (node.children.length === 0) return node;
  for (const child of node.children) {
    const token = firstToken(grammar, child);
    if (token !== undefined) return token;
  }
  return undefined;
}

/** The name that `nameFields` and `carriers` lead to from a node, which is not itself a name. */
function nameIn(grammar: TreeGrammar, node: SyntaxNode, depth: number): string | undefined {
  if (depth > 0 && grammar.names.has(node.type)) {
    return node.text.replace(/^(["'`])(.*)\1$/s, "$2");
  }
  if (depth >= NAME_DEPTH) return undefined;
  for (const field of grammar.nameFields) {
    const child = node.childForFieldName(field);
    const name = child === null ? undefined : nameIn(grammar, child, depth + 1);
    if (name !== undefined) return name;
  }
  if (!grammar.carriers.has(node.type)) return undefined;
  const first = node.children.find((child) => child.isNamed);
  return first === undefined ? undefined : nameIn(grammar, first, depth + 1);
}

/** For a function without a name, that of the variable, member or key that receives it. */
function receivedName(grammar: TreeGrammar, node: SyntaxNode): string | undefined {
  const parent = node.parent;
  const key = parent === null ? undefined : grammar.receivers.get(parent.type);
  if (parent === null || key === undefined) return undefined;
  const target =
    parent.childForFieldName(key) ?? parent.children.find((child) => child.type === key);
  return target === undefined ? undefined : nameIn(grammar, target, 1);
}

function isBranch(grammar: TreeGrammar, node: SyntaxNode): boolean {
  if (!node.isNamed) {
    // A logical operator, as a token: some grammars nest `a && b && c`, others keep it flat.
    const parent = node.parent;
    return grammar.operators.has(node.type) && parent !== null && grammar.logical.has(parent.type);
  }
  if (grammar.branches.has(node.type)) return true;
  const keyword = grammar.cases.get(node.type);
  if (keyword !== undefined) return node.children[0]?.type === keyword;
  return grammar.calls !== undefined && isCallBranch(grammar.calls, node);
}

/** A call that is a branch, as `if`, or a clause of a `case` or of a `rescue` block. */
function isCallBranch(calls: TreeCalls, node: SyntaxNode): boolean {
  if (calls.branches.has(targetOf(calls, node) ?? "")) return true;
  if (node.type !== calls.clause) return false;
  const block = node.parent;
  if (block === null) return false;
  if (calls.blocks.has(block.type)) return true;
  const call = block.parent;
  return call !== null && calls.clauses.has(targetOf(calls, call) ?? "");
}

/** The rows where a leaf has code: not blank inside a string of many lines. */
function codeRows(leaf: SyntaxNode, rows: Set<number>): void {
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
