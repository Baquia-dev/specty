// SPDX-License-Identifier: Apache-2.0
import { type Output, whyCard, whyRefusalCard } from "@baquia-dev/specty-core";
import { ChangeSpecs, logged } from "../flow/traced";
import type { Session } from "../session";

/** How many entries `why` lists for a file: one per change, the most recent ones. */
const MAX_ENTRIES = 10;

/**
 * `specty why <path>[:<line>]` (ARCHITECTURE §13): blame, commit, trailers, and the change, task
 * and criteria behind a line; for a file, the changes that touched it, newest first. It only
 * reads, so the agent may run it too.
 */
export async function why(session: Session, target: string): Promise<Output> {
  const [, file = target, number] = /^(.*?)(?::(\d+))?$/.exec(target) ?? [];
  const noHistory = () => whyRefusalCard({ reason: "no-history", file }, session.cards);
  const changes = new ChangeSpecs(session);
  if (number !== undefined) {
    const blamed = await session.git.run([
      "blame",
      "--porcelain",
      "-L",
      `${number},${number}`,
      "--",
      file,
    ]);
    // By the file's history, not by git's message, which a translated git words otherwise.
    if (blamed.code !== 0) {
      return (await logged(session, ["-1", "--", file])).length > 0
        ? whyRefusalCard({ reason: "no-line", file, line: number }, session.cards)
        : noHistory();
    }
    const hash = blamed.stdout.split(" ")[0] ?? "";
    // A line not committed yet is blamed on the zero hash.
    if (/^0+$/.test(hash))
      return whyCard({ target, uncommitted: true, commits: [] }, session.cards);
    const [commit] = await logged(session, ["-1", hash]);
    return whyCard(
      { target, commits: commit === undefined ? [] : [await changes.of(commit)] },
      session.cards,
    );
  }
  const history = await logged(session, ["--", file]);
  if (history.length === 0) return noHistory();
  // One entry per change, its newest commit; each commit outside Specty on its own.
  const seen = new Set<string>();
  const entries = history.filter((commit) => {
    const key = commit.trailers.change ?? commit.hash;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const commits = await Promise.all(
    entries.slice(0, MAX_ENTRIES).map((commit) => changes.of(commit)),
  );
  return whyCard({ target, commits }, session.cards);
}
