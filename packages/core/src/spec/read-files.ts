// SPDX-License-Identifier: Apache-2.0
import type { Lang } from "../i18n";
import type { RawItem, RawList } from "./list";
import type { FileEntry } from "./model";
import {
  createReader,
  EXAMPLES,
  finish,
  type ListResult,
  prelude,
  type Reader,
  readPath,
} from "./read-helpers";
import { fileActionFrom } from "./vocabulary";

const ACTION = /^(\S+)[ \t]+(.+)$/;
const ARROW = /^(?:->|→)/;
const SEPARATOR = /^(?:—|–|--|-|:)\s*/;

/** Reads `- modificar ruta — motivo` and `- renombrar origen -> destino — motivo` entries. */
export function readFiles(raw: RawList, lang: Lang): ListResult<FileEntry> {
  const reader = createReader(lang, "files");
  const { none, items } = prelude(raw, reader);
  const entries = items.flatMap((item) => readEntry(item, reader));
  return finish(reader, none, entries);
}

function readEntry(item: RawItem, reader: Reader): FileEntry[] {
  const match = ACTION.exec(item.head);
  if (match === null) {
    reader.report({
      code: "item-invalid",
      params: { section: reader.sectionName, example: EXAMPLES.files[reader.lang] },
      line: item.line,
    });
    return [];
  }
  const word = match[1] ?? "";
  const action = fileActionFrom(word);
  if (action === undefined) {
    reader.report({ code: "file-action-unknown", params: { action: word }, line: item.line });
    return [];
  }
  const [first, afterFirst] = takePath(match[2] ?? "");
  const arrow = ARROW.exec(afterFirst.trimStart());
  const renamed = action === "rename" && arrow !== null;
  if (action === "rename" && !renamed) {
    reader.report({ code: "file-rename-target", line: item.line });
  }
  const [second, afterSecond] = renamed
    ? takePath(afterFirst.trimStart().slice(arrow[0].length))
    : (["", afterFirst] as const);
  const path = readPath(renamed ? second : first, item.line, undefined, reader);
  const from = renamed ? readPath(first, item.line, undefined, reader) : undefined;
  if (path === undefined || (renamed && from === undefined)) return [];
  reportFields(item, path, reader);
  const reason = afterSecond.trim().replace(SEPARATOR, "").trim();
  const claimed = reader.claim(path, item.line, {
    code: "file-duplicate",
    params: { path },
    line: item.line,
    target: path,
  });
  if (!claimed) return [];
  return [
    {
      action,
      path,
      ...(from !== undefined ? { from } : {}),
      ...(reason.length > 0 ? { reason } : {}),
    },
  ];
}

/** Takes a path token (backticked or up to the next space or dash) and returns the rest. */
function takePath(text: string): readonly [string, string] {
  const trimmed = text.trimStart();
  if (trimmed.startsWith("`")) {
    const end = trimmed.indexOf("`", 1);
    if (end > 0) return [trimmed.slice(1, end), trimmed.slice(end + 1)];
  }
  const token = /^\S*/.exec(trimmed)?.[0] ?? "";
  const dash = token.search(/[—–]/);
  const cut = dash > 0 ? dash : token.length;
  return [token.slice(0, cut), trimmed.slice(cut)];
}

function reportFields(item: RawItem, path: string, reader: Reader): void {
  for (const field of item.fields) {
    reader.report({
      code: "field-unknown",
      params: { field: field.key, id: path, valid: "—" },
      line: field.line,
      target: path,
    });
  }
}
