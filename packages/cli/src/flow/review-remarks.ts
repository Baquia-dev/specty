// SPDX-License-Identifier: Apache-2.0
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  type ChangeView,
  parseSpec,
  type ReviewRemark,
  reviewRemarks,
  reviewRemarkText,
  type Spec,
  uncitedRemarks,
} from "@baquia-dev/specty-core";
import type { Harvest } from "../commands/memory";
import { isMissing, readText } from "../io/files";
import type { Session } from "../session";
import { readSpec } from "../store/changes";
import type { ChangeFiles } from "../store/paths";

// The remarks of a change's last independent review of the result (ADR 0011) that its closing
// does not cite: the closing card shows them, and the closed change leaves them in the memory.
// Only types come from `commands/`: the session-start hook also loads the views.

/** The folder of a change's reviews, and the high and medium remarks of its last one. */
interface LastReview {
  readonly dir: string;
  readonly remarks: readonly ReviewRemark[];
}

/** `reviews/diff-<n>.md` with the highest `n`; the reviews of the spec do not count. */
async function lastReview(files: ChangeFiles): Promise<LastReview> {
  const dir = join(files.dir, "reviews");
  const numbered = (await reviewFiles(dir)).flatMap((name) => {
    const n = /^diff-([1-9]\d*)\.md$/.exec(name)?.[1];
    return n === undefined ? [] : [{ name, n: Number(n) }];
  });
  const last = numbered.sort((a, b) => b.n - a.n)[0];
  if (last === undefined) return { dir, remarks: [] };
  return { dir, remarks: reviewRemarks(last.name, (await readText(join(dir, last.name))) ?? "") };
}

async function reviewFiles(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
}

/** While closing, the remarks of the last review of the result that the closing does not cite. */
export async function closingRemarks(
  files: ChangeFiles,
  spec: Spec,
): Promise<Pick<ChangeView, "reviewRemarks">> {
  const { remarks } = await lastReview(files);
  const uncited = uncitedRemarks(remarks, spec.sections.closing);
  return uncited.length === 0 ? {} : { reviewRemarks: uncited };
}

/** The pending items a closed change leaves for the remarks its closing does not cite. */
export async function remarkHarvest(session: Session, files: ChangeFiles): Promise<Harvest[]> {
  const { dir, remarks } = await lastReview(files);
  if (remarks.length === 0) return [];
  const spec = parseSpec(await readSpec(files), { language: session.lang }).spec;
  const where = session.paths.relative(dir);
  return uncitedRemarks(remarks, spec.sections.closing).map((remark) => ({
    text: reviewRemarkText(remark, where, session.lang),
  }));
}
