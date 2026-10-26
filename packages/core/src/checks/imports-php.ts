// SPDX-License-Identifier: Apache-2.0
import type { ResolvedImport } from "./layers";

/**
 * The imports of a PHP file for `layers` (ADR 0012), without tools: the `use` statements before
 * its first class, interface, trait or enum (inside one, `use` brings a trait), with `use
 * function`, `use const` and groups (`use A\{B, C}`) by their common prefix. A name under a
 * prefix of the project's PSR-4 autoload is the file PSR-4 gives it; any other is its package,
 * with its `\` as `/` (`Illuminate/Support/Facades/DB`), so that globs work as in other languages.
 */

/** Namespace prefixes (`App\`) and the folders they load from (`src/`), as in `composer.json`. */
export type Psr4 = Readonly<Record<string, string>>;

const USE = /^use\s+(?:function\s+|const\s+)?\\?(\w+(?:\\\w+)*)(?:(\\\{)|(?:\s+as\s+\w+)?\s*[;,])/;
const TYPE = /^(?:(?:abstract|final|readonly)\s+)*(?:class|interface|trait|enum)\b/;

export function phpImports(path: string, text: string, psr4: Psr4): ResolvedImport[] {
  const lines = text.split(/\r?\n/);
  const end = lines.findIndex((line) => TYPE.test(line.trim()));
  return lines.slice(0, end === -1 ? undefined : end).flatMap((raw, index): ResolvedImport[] => {
    const match = USE.exec(raw.replace(/(?:\/\/|#).*$/, "").trim());
    const name = match?.[1];
    if (name === undefined) return [];
    const group = match?.[2] !== undefined;
    return [{ ...resolved(path, name, group, psr4), specifier: name, line: index + 1 }];
  });
}

function resolved(
  from: string,
  name: string,
  group: boolean,
  psr4: Psr4,
): { readonly from: string } & ({ readonly target: string } | { readonly package: string }) {
  // The longest prefix wins, as Composer's autoloader does.
  const prefix = Object.keys(psr4)
    .filter((candidate) => `${name}\\`.startsWith(candidate))
    .toSorted((a, b) => b.length - a.length)[0];
  if (prefix === undefined) return { from, package: name.replaceAll("\\", "/") };
  const folder = (psr4[prefix] ?? "").replace(/\/?$/, "/").replace(/^\/$/, "");
  const rest = name.slice(prefix.length).replaceAll("\\", "/");
  return { from, target: group ? `${folder}${rest}/*` : `${folder}${rest}.php` };
}
