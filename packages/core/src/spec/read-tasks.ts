// SPDX-License-Identifier: Apache-2.0
import type { Lang } from "../i18n";
import { type RawField, type RawList, splitList, unwrapCode } from "./list";
import { COMMIT_TYPES, EFFORT_LEVELS, type Task } from "./model";
import {
  claimedHead,
  createReader,
  finish,
  type ListResult,
  prelude,
  type Reader,
  readFields,
  readIdRefs,
  readPath,
} from "./read-helpers";
import { commitTypeFrom, isNoneMarker, TASK_FIELDS } from "./vocabulary";

const CHECKBOX = /^\[([ xX])\][ \t]+/;

/** Reads `- [ ] T1: title` items with their `files`, `ac`, `verify`, `type` and `notes`. */
export function readTasks(raw: RawList, lang: Lang): ListResult<Task> {
  const reader = createReader(lang, "tasks");
  const { none, items } = prelude(raw, reader);
  const tasks = items.flatMap((item): Task[] => {
    const checkbox = CHECKBOX.exec(item.head);
    const head = claimedHead(
      checkbox === null ? item.head : item.head.slice(checkbox[0].length),
      item.line,
      "T",
      "tasks",
      reader,
    );
    if (head === undefined) return [];
    const fields = readFields(item, head.id, taskKey, TASK_FIELDS, reader);
    return [
      {
        id: head.id,
        title: head.text,
        done: (checkbox?.[1] ?? " ").toLowerCase() === "x",
        files: readTaskFiles(fields.get("files"), head.id, reader),
        ...criteria(fields.get("ac"), head.id, reader),
        ...verifyOf(fields.get("verify")),
        ...commitType(fields.get("type"), head.id, reader),
        ...notesOf(fields.get("notes")),
        ...effortOf(fields.get("effort"), head.id, reader),
      },
    ];
  });
  return finish(reader, none, tasks);
}

function taskKey(key: string): string | undefined {
  const lower = key.toLowerCase();
  return TASK_FIELDS.includes(lower) ? lower : undefined;
}

function readTaskFiles(field: RawField | undefined, owner: string, reader: Reader): string[] {
  if (field === undefined) return [];
  const paths = splitList(field.value).flatMap((raw) => {
    const path = readPath(raw, field.line, owner, reader);
    return path === undefined ? [] : [path];
  });
  return [...new Set(paths)];
}

function criteria(
  field: RawField | undefined,
  owner: string,
  reader: Reader,
): Partial<Pick<Task, "ac">> {
  if (field === undefined || field.value.length === 0) return {};
  if (isNoneMarker(field.value)) return { ac: "none" };
  const refs = readIdRefs(field, owner, "AC", reader);
  return refs.length > 0 ? { ac: refs } : {};
}

function commitType(
  field: RawField | undefined,
  owner: string,
  reader: Reader,
): Partial<Pick<Task, "type">> {
  if (field === undefined) return {};
  const type = commitTypeFrom(field.value);
  if (type !== undefined) return { type };
  reader.report({
    code: "field-invalid",
    params: { id: owner, field: field.key, value: field.value, valid: COMMIT_TYPES.join(", ") },
    line: field.line,
    target: owner,
  });
  return {};
}

function verifyOf(field: RawField | undefined): Partial<Pick<Task, "verify">> {
  const verify = field === undefined ? "" : unwrapCode(field.value);
  return verify.length > 0 ? { verify } : {};
}

/** `effort: high`, or `effort: high — reason`, as the reasons of the Files section. */
function effortOf(
  field: RawField | undefined,
  owner: string,
  reader: Reader,
): Partial<Pick<Task, "effort">> {
  if (field === undefined) return {};
  const [raw = "", ...rest] = field.value.split(" — ");
  const level = EFFORT_LEVELS.find((candidate) => candidate === raw.trim().toLowerCase());
  const reason = rest.join(" — ").trim();
  if (level !== undefined) return { effort: { level, ...(reason.length > 0 ? { reason } : {}) } };
  reader.report({
    code: "field-invalid",
    params: { id: owner, field: field.key, value: field.value, valid: EFFORT_LEVELS.join(", ") },
    line: field.line,
    target: owner,
  });
  return {};
}

function notesOf(field: RawField | undefined): Partial<Pick<Task, "notes">> {
  const notes = field?.value.trim() ?? "";
  return notes.length > 0 ? { notes } : {};
}
