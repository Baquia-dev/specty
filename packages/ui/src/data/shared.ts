// SPDX-License-Identifier: Apache-2.0
// The files two open changes would both touch, as `specty approve` warns about them
// (cli/flow/shared.ts): listed in the Files section or approved as a scope extension, governed,
// with globs matching both ways. Pure.
import { DEFAULT_CONFIG, isGoverned, matchesAny, parseSpec } from "@baquia-dev/specty-core";
import type { ChangeRecord, SharedFile } from "./records";

/** A finished change touches nothing more. */
const FINISHED: ReadonlySet<string> = new Set(["done", "cancelled"]);

/**
 * For each open change that shares files, those files and the other open changes that list them.
 * The UI has no `config.yaml`: what is governed is the default, as for the size.
 */
export function sharedFiles(
  records: readonly ChangeRecord[],
): ReadonlyMap<string, readonly SharedFile[]> {
  const open = records
    .filter((record) => !FINISHED.has(record.state.phase))
    .map((record) => {
      const { spec } = parseSpec(record.spec);
      const listed = (spec.sections.files?.items ?? []).flatMap((entry) =>
        entry.from === undefined ? [entry.path] : [entry.from, entry.path],
      );
      const extras = Object.values(record.state.tasks).flatMap((task) => task.scopeExtra);
      const files = [...new Set([...listed, ...extras])].filter((path) =>
        isGoverned(path, DEFAULT_CONFIG),
      );
      return { id: record.state.id, title: spec.title || record.state.id, files };
    });
  const result = new Map<string, readonly SharedFile[]>();
  for (const change of open) {
    const shared = change.files.flatMap((path) => {
      const changes = open
        .filter(
          (other) =>
            other.id !== change.id &&
            (matchesAny(path, other.files) || other.files.some((file) => matchesAny(file, [path]))),
        )
        .map(({ id, title }) => ({ id, title }));
      return changes.length === 0 ? [] : [{ path, changes }];
    });
    if (shared.length > 0) result.set(change.id, shared);
  }
  return result;
}
