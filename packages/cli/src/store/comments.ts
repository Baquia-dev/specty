// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import { isRecord, parseJson, readText, writeText } from "../io/files";
import type { ChangeFiles } from "./paths";

/** Where a comment points: an item (`A1`), or a quote inside a section. */
export type CommentAnchor =
  | { readonly item: string }
  | { readonly section: string; readonly quote: string };

/** A person's comment on the spec, as `comments.json` keeps it (formats.md §5). */
export interface StoredComment {
  readonly id: string;
  readonly revision: number;
  readonly anchor: CommentAnchor;
  readonly author: string;
  readonly body: string;
  readonly createdAt: string;
  /** The revision the agent proposed after it, which answers it. */
  readonly resolvedInRevision?: number;
}

const fileOf = (files: ChangeFiles) => join(files.dir, "comments.json");

/** The change's comments, oldest first; a malformed entry is left out. */
export async function readComments(files: ChangeFiles): Promise<StoredComment[]> {
  const value = parseJson(await readText(fileOf(files)));
  return Array.isArray(value) ? value.filter(isComment) : [];
}

export async function writeComments(
  files: ChangeFiles,
  comments: readonly StoredComment[],
): Promise<void> {
  await writeText(fileOf(files), `${JSON.stringify(comments, null, 2)}\n`);
}

/** A new revision answers every unresolved comment: it records that revision on them. */
export async function resolveComments(files: ChangeFiles, revision: number): Promise<void> {
  const comments = await readComments(files);
  if (comments.every((comment) => comment.resolvedInRevision !== undefined)) return;
  await writeComments(
    files,
    comments.map((comment) =>
      comment.resolvedInRevision === undefined
        ? { ...comment, resolvedInRevision: revision }
        : comment,
    ),
  );
}

export function isAnchor(value: unknown): value is CommentAnchor {
  if (!isRecord(value)) return false;
  if (typeof value.item === "string") return value.item.length > 0;
  return typeof value.section === "string" && typeof value.quote === "string";
}

function isComment(value: unknown): value is StoredComment {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.revision === "number" &&
    isAnchor(value.anchor) &&
    typeof value.author === "string" &&
    typeof value.body === "string" &&
    typeof value.createdAt === "string" &&
    (value.resolvedInRevision === undefined || typeof value.resolvedInRevision === "number")
  );
}
