// SPDX-License-Identifier: Apache-2.0
import { globBase, isGlob } from "../glob";
import { dirname, isWithin } from "../paths";

const TEST_NAME = [
  /\.(?:test|spec)\.[^/]+$/i,
  /_test\.[^/]+$/i,
  /(?:^|\/)test_[^/]+\.py$/i,
  /(?:Test|Tests|Spec|IT)\.(?:java|kt|kts|cs|scala|swift|groovy)$/,
  /\.snap$/,
];

const TEST_DIRS: ReadonlySet<string> = new Set([
  "test",
  "tests",
  "__tests__",
  "__snapshots__",
  "spec",
  "specs",
  "integration_test",
]);

const MIRROR_ROOTS: ReadonlySet<string> = new Set([
  "test",
  "tests",
  "spec",
  "specs",
  "integration_test",
]);
const SOURCE_ROOTS: readonly string[] = ["lib", "src", "app", ""];

/** True for test files by name (`*.test.ts`, `*_test.dart`…) or location (`test/`, `__tests__/`…). */
export function isTestFile(path: string): boolean {
  if (TEST_NAME.some((pattern) => pattern.test(path))) return true;
  return dirname(path)
    .split("/")
    .some((segment) => TEST_DIRS.has(segment));
}

/**
 * True when `path` is a test next to, or mirroring, a path in scope:
 * `src/x/__tests__/a.test.ts`, `lib/x/a_test.go`, `test/x/a_test.dart` for `lib/x/a.dart`.
 */
export function isImplicitTest(path: string, scope: readonly string[]): boolean {
  if (!isTestFile(path)) return false;
  const candidates = subjectDirectories(path);
  return scope.some((pattern) => {
    if (!isGlob(pattern)) return candidates.includes(dirname(pattern));
    const base = globBase(pattern);
    return candidates.some((candidate) => isWithin(candidate, base));
  });
}

/** Directories whose code a test file can be testing. */
function subjectDirectories(path: string): string[] {
  const segments = dirname(path)
    .split("/")
    .filter((segment) => segment.length > 0);
  const trimmed = dropTrailing(segments, new Set(["__tests__", "__snapshots__"]));
  const own = trimmed.join("/");
  const [root, ...rest] = trimmed;
  if (root === undefined || !MIRROR_ROOTS.has(root)) return [own];
  const mirrored = SOURCE_ROOTS.map((source) => [source, ...rest].filter(Boolean).join("/"));
  return [own, ...mirrored];
}

function dropTrailing(segments: readonly string[], names: ReadonlySet<string>): readonly string[] {
  const last = segments.at(-1);
  return last !== undefined && names.has(last)
    ? dropTrailing(segments.slice(0, -1), names)
    : segments;
}
