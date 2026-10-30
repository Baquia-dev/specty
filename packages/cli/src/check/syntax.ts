// SPDX-License-Identifier: Apache-2.0
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { brotliDecompress } from "node:zlib";
import { type FunctionMetric, type TreeLanguage, treeFunctions } from "@baquia-dev/specty-core";
import type { Language, Parser } from "web-tree-sitter";

/**
 * The functions of a file measured on its tree-sitter syntax tree (ADR 0016). The runtime and each
 * grammar load the first time a file needs them, once per process. The bundle carries them
 * compressed in `grammars/`, next to it (`build.mjs`), and reads no other copy; from the sources,
 * as in the tests, they come from `node_modules`.
 */

interface Grammar {
  /** Its file: `tree-sitter-<file>.wasm`. */
  readonly file: string;
  readonly language: TreeLanguage;
}

const GRAMMARS: readonly (readonly [RegExp, Grammar])[] = [
  [/\.[cm]?ts$/, { file: "typescript", language: "typescript" }],
  [/\.tsx$/, { file: "tsx", language: "typescript" }],
  [/\.[cm]?jsx?$/, { file: "javascript", language: "javascript" }],
];

// The files in `node_modules`, each package named whole in a `require.resolve`, so that knip sees
// it used. The `require` is local: the bundle's banner declares one in every chunk.
function runtimeFile(): string {
  const require = createRequire(import.meta.url);
  return require.resolve("web-tree-sitter/web-tree-sitter.wasm");
}

function grammarFile(name: string): string {
  const require = createRequire(import.meta.url);
  const folder = dirname(require.resolve("@repomix/tree-sitter-wasms/package.json"));
  return join(folder, "out", `${name}.wasm`);
}

// Run from `dist`, not from the TypeScript sources.
const BUNDLED = !import.meta.url.endsWith(".ts");
const decompress = promisify(brotliDecompress);

let parser: Promise<Parser | undefined> | undefined;
const languages = new Map<string, Promise<Language | undefined>>();

/**
 * Its functions, or `undefined` when its language has no grammar, the runtime or the grammar do
 * not load, or the source does not parse without errors: then the line estimator measures it.
 */
export async function treeMetrics(
  path: string,
  text: string,
): Promise<FunctionMetric[] | undefined> {
  const grammar = GRAMMARS.find(([pattern]) => pattern.test(path))?.[1];
  if (grammar === undefined) return undefined;
  const shared = await parserOnce();
  // A grammar loads only once the runtime has started.
  const language = shared === undefined ? undefined : await languageOf(grammar.file);
  if (shared === undefined || language === undefined) return undefined;
  // From here to the end nothing awaits, so the measures that run together share the parser.
  shared.setLanguage(language);
  const tree = shared.parse(text);
  if (tree === null) return undefined;
  try {
    return tree.rootNode.hasError ? undefined : treeFunctions(grammar.language, tree.rootNode);
  } finally {
    tree.delete();
  }
}

function parserOnce(): Promise<Parser | undefined> {
  parser ??= (async () => {
    const bytes = await wasm("web-tree-sitter", runtimeFile);
    if (bytes === undefined) return undefined;
    const { Parser } = await import("web-tree-sitter");
    await Parser.init({ wasmBinary: bytes });
    return new Parser();
  })().catch(() => undefined);
  return parser;
}

function languageOf(file: string): Promise<Language | undefined> {
  const known = languages.get(file);
  if (known !== undefined) return known;
  const loading = (async () => {
    const name = `tree-sitter-${file}`;
    const bytes = await wasm(name, () => grammarFile(name));
    if (bytes === undefined) return undefined;
    const { Language } = await import("web-tree-sitter");
    return Language.load(bytes);
  })().catch(() => undefined);
  languages.set(file, loading);
  return loading;
}

/**
 * A WebAssembly file: in the bundle, only its own compressed copy, because pnpm's `NODE_PATH` would
 * let it find another one; from the sources, the package's in `node_modules`.
 */
async function wasm(name: string, source: () => string): Promise<Uint8Array | undefined> {
  try {
    if (!BUNDLED) return await readFile(source());
    return await decompress(await readFile(new URL(`grammars/${name}.wasm.br`, import.meta.url)));
  } catch {
    return undefined;
  }
}
