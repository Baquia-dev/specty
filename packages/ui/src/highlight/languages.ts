// SPDX-License-Identifier: Apache-2.0
// The languages the diff viewer highlights (docs/ui.md, Visor de diffs). Each grammar is a chunk
// of its own, downloaded the first time a file of it shows: never in the first load.
import type { LanguageRegistration } from "shiki/core";

type Grammar = () => Promise<{ readonly default: LanguageRegistration[] }>;

const GRAMMARS = {
  typescript: () => import("shiki/langs/typescript.mjs"),
  tsx: () => import("shiki/langs/tsx.mjs"),
  javascript: () => import("shiki/langs/javascript.mjs"),
  jsx: () => import("shiki/langs/jsx.mjs"),
  json: () => import("shiki/langs/json.mjs"),
  css: () => import("shiki/langs/css.mjs"),
  scss: () => import("shiki/langs/scss.mjs"),
  html: () => import("shiki/langs/html.mjs"),
  markdown: () => import("shiki/langs/markdown.mjs"),
  yaml: () => import("shiki/langs/yaml.mjs"),
  toml: () => import("shiki/langs/toml.mjs"),
  shellscript: () => import("shiki/langs/shellscript.mjs"),
  dockerfile: () => import("shiki/langs/dockerfile.mjs"),
  python: () => import("shiki/langs/python.mjs"),
  go: () => import("shiki/langs/go.mjs"),
  rust: () => import("shiki/langs/rust.mjs"),
  java: () => import("shiki/langs/java.mjs"),
  kotlin: () => import("shiki/langs/kotlin.mjs"),
  swift: () => import("shiki/langs/swift.mjs"),
  dart: () => import("shiki/langs/dart.mjs"),
  c: () => import("shiki/langs/c.mjs"),
  cpp: () => import("shiki/langs/cpp.mjs"),
  csharp: () => import("shiki/langs/csharp.mjs"),
  php: () => import("shiki/langs/php.mjs"),
  ruby: () => import("shiki/langs/ruby.mjs"),
  sql: () => import("shiki/langs/sql.mjs"),
  graphql: () => import("shiki/langs/graphql.mjs"),
  xml: () => import("shiki/langs/xml.mjs"),
  vue: () => import("shiki/langs/vue.mjs"),
  svelte: () => import("shiki/langs/svelte.mjs"),
} satisfies Record<string, Grammar>;

export type LanguageId = keyof typeof GRAMMARS;

/** Extensions in lower case, without the dot; or whole names, as «Dockerfile». */
const FILES: Readonly<Record<LanguageId, readonly string[]>> = {
  typescript: ["ts", "mts", "cts"],
  tsx: ["tsx"],
  javascript: ["js", "mjs", "cjs"],
  jsx: ["jsx"],
  json: ["json"],
  css: ["css"],
  scss: ["scss"],
  html: ["html", "htm"],
  markdown: ["md", "markdown"],
  yaml: ["yml", "yaml"],
  toml: ["toml"],
  shellscript: ["sh", "bash", "zsh"],
  dockerfile: ["Dockerfile", "dockerfile"],
  python: ["py"],
  go: ["go"],
  rust: ["rs"],
  java: ["java"],
  kotlin: ["kt", "kts"],
  swift: ["swift"],
  dart: ["dart"],
  c: ["c", "h"],
  cpp: ["cpp", "cc", "cxx", "hpp", "hh"],
  csharp: ["cs"],
  php: ["php"],
  ruby: ["rb"],
  sql: ["sql"],
  graphql: ["graphql", "gql"],
  xml: ["xml", "svg"],
  vue: ["vue"],
  svelte: ["svelte"],
};

export interface Language {
  readonly id: LanguageId;
  readonly load: Grammar;
}

const isLanguage = (id: string): id is LanguageId => Object.hasOwn(GRAMMARS, id);

const LANGUAGES: readonly Language[] = Object.keys(GRAMMARS)
  .filter(isLanguage)
  .map((id) => ({ id, load: GRAMMARS[id] }));

/** The language of a path, by its name or its extension; none when it is not highlighted. */
export function languageOf(path: string): Language | undefined {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  const extension = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  return LANGUAGES.find(({ id }) => FILES[id].includes(name) || FILES[id].includes(extension));
}
