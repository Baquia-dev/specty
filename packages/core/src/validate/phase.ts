// SPDX-License-Identifier: Apache-2.0
import { parseItemId } from "../ids";
import { itemHashes } from "../spec/canonical";
import type { Diagnostic } from "../spec/diagnostics";
import type { Spec } from "../spec/model";
import { itemLine, type Rule, report } from "./context";
import { declaredPaths, isDeclared } from "./references";

/** Adjustments add work: done tasks are immutable, new files may be new scope. */
export const checkAdjusting: Rule = (spec, ctx, lang) => {
  const approved = ctx.approved;
  if (ctx.phase !== "adjusting" || approved === undefined) return [];
  const before = itemHashes(approved);
  const after = itemHashes(spec);
  const changed = [...(ctx.doneTasks ?? [])]
    .filter((id) => before.has(id) && before.get(id) !== after.get(id))
    .map((id) =>
      report(lang, {
        code: "done-task-changed",
        params: { id },
        line: itemLine(ctx, id),
        target: id,
      }),
    );
  const approvedIds = new Set((approved.sections.tasks?.items ?? []).map((task) => task.id));
  const approvedFiles = declaredPaths(approved);
  const newScope = (spec.sections.tasks?.items ?? [])
    .filter((task) => !approvedIds.has(task.id))
    .flatMap((task) =>
      task.files
        .filter((path) => !isDeclared(path, approvedFiles))
        .map((path) =>
          report(lang, {
            code: "possible-new-scope",
            params: { id: task.id, path },
            line: itemLine(ctx, task.id),
            target: task.id,
          }),
        ),
    );
  return [...changed, ...newScope];
};

/** While closing, only the Closing section may change. */
export const checkClosing: Rule = (spec, ctx, lang) => {
  const approved = ctx.approved;
  if (ctx.phase !== "closing" || approved === undefined) return [];
  const before = itemHashes(approved);
  const after = itemHashes(spec);
  const keys = [...new Set([...before.keys(), ...after.keys()])].filter(
    (key) => key !== "section:closing",
  );
  return keys
    .filter((key) => before.get(key) !== after.get(key))
    .map((key) => report(lang, { code: "closing-outside", params: { target: key }, target: key }));
};

/** A deleted id is never given to a different item. */
export const checkIdReuse: Rule = (spec, ctx, lang) => {
  const { previous, maxIds } = ctx;
  if (previous === undefined || maxIds === undefined) return [];
  const known = new Set(itemIds(previous));
  return itemIds(spec).flatMap((id): Diagnostic[] => {
    const parsed = parseItemId(id);
    if (parsed === undefined || known.has(id)) return [];
    const max = maxIds[parsed.prefix] ?? 0;
    if (parsed.number > max) return [];
    return [
      report(lang, {
        code: "id-reused",
        params: { id, next: `${parsed.prefix}${max + 1}` },
        line: itemLine(ctx, id),
        target: id,
      }),
    ];
  });
};

function itemIds(spec: Spec): string[] {
  const { sections } = spec;
  return [
    ...(sections.assumptions?.items ?? []),
    ...(sections.criteria?.items ?? []),
    ...(sections.tasks?.items ?? []),
    ...(sections.slices?.items ?? []),
    ...(sections.risks?.items ?? []),
  ].map((item) => item.id);
}
