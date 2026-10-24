// SPDX-License-Identifier: Apache-2.0
import { matchesAny } from "../glob";
import type { Layers } from "../schema/checks";

/**
 * Which layer may import which (ADR 0012), on imports already resolved by a tool of the stack:
 * dependency-cruiser in TypeScript, a scanner of its own in Dart. A layer may always import
 * itself and what is in no layer; another layer, only if it names it in `may`; and no package
 * that matches its `forbiddenPackages`.
 */

/** One import of a file: to a file of the repository, or to a package. */
export type ResolvedImport = { readonly from: string; readonly specifier: string } & (
  | { readonly target: string }
  | { readonly package: string }
);

export interface LayerViolation {
  readonly from: string;
  readonly specifier: string;
  /** The layer of the file that imports. */
  readonly layer: string;
  readonly target: { readonly layer: string; readonly path: string } | { readonly package: string };
}

/** The first layer whose paths contain `path`. */
export function layerOf(path: string, layers: Layers): string | undefined {
  return Object.entries(layers).find(([, layer]) => matchesAny(path, layer.paths))?.[0];
}

/** The package of a specifier: `@angular/core/testing` is `@angular/core`; `node:fs/promises`, `node:fs`. */
export function packageName(specifier: string): string {
  if (specifier.startsWith("node:")) return `node:${specifier.slice(5).split("/")[0] ?? ""}`;
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : (parts[0] ?? specifier);
}

export function layerViolations(
  imports: readonly ResolvedImport[],
  layers: Layers,
): LayerViolation[] {
  return imports.flatMap((edge): LayerViolation[] => {
    const layer = layerOf(edge.from, layers);
    const rule = layer === undefined ? undefined : layers[layer];
    if (layer === undefined || rule === undefined) return [];
    const { from, specifier } = edge;
    if ("package" in edge) {
      return matchesAny(edge.package, rule.forbiddenPackages)
        ? [{ from, specifier, layer, target: { package: edge.package } }]
        : [];
    }
    const target = layerOf(edge.target, layers);
    if (target === undefined || target === layer || rule.may.includes(target)) return [];
    return [{ from, specifier, layer, target: { layer: target, path: edge.target } }];
  });
}
