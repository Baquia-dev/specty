// SPDX-License-Identifier: Apache-2.0
import { basename, dirname, isWithin } from "../paths";

const LOCKFILES_BY_MANIFEST: Readonly<Record<string, readonly string[]>> = {
  "package.json": [
    "package-lock.json",
    "npm-shrinkwrap.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "bun.lock",
    "bun.lockb",
  ],
  "deno.json": ["deno.lock"],
  "pubspec.yaml": ["pubspec.lock"],
  "pyproject.toml": ["poetry.lock", "uv.lock", "pdm.lock"],
  Pipfile: ["Pipfile.lock"],
  "go.mod": ["go.sum"],
  "Cargo.toml": ["Cargo.lock"],
  Gemfile: ["Gemfile.lock"],
  "composer.json": ["composer.lock"],
  "mix.exs": ["mix.lock"],
  "Package.swift": ["Package.resolved"],
  Podfile: ["Podfile.lock"],
};

const DOTNET_PROJECT = /\.(?:cs|fs|vb)proj$/;
const OTHER_MANIFESTS = [
  /(?:^|\/)build\.gradle(?:\.kts)?$/,
  /(?:^|\/)pom\.xml$/,
  /(?:^|\/)requirements[^/]*\.txt$/,
];

/** True for files that declare dependencies (`package.json`, `pubspec.yaml`, `*.csproj`…). */
export function isManifest(path: string): boolean {
  return (
    basename(path) in LOCKFILES_BY_MANIFEST ||
    DOTNET_PROJECT.test(path) ||
    OTHER_MANIFESTS.some((pattern) => pattern.test(path))
  );
}

/**
 * True when `path` is the lockfile of one of the manifests, in the manifest's directory or
 * above it (workspaces keep a single lockfile at the root).
 */
export function isLockfileFor(path: string, manifests: readonly string[]): boolean {
  const name = basename(path);
  const directory = dirname(path);
  return manifests.some((manifest) => {
    const lockfiles = DOTNET_PROJECT.test(manifest)
      ? ["packages.lock.json"]
      : (LOCKFILES_BY_MANIFEST[basename(manifest)] ?? []);
    return lockfiles.includes(name) && isWithin(dirname(manifest), directory);
  });
}
