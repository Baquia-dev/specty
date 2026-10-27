// SPDX-License-Identifier: Apache-2.0
import { developLine, type Lang } from "@baquia-dev/specty-core";
import type { Git } from "../io/git";

/**
 * Under Git Flow, changes start from `develop` and go to it: when it is missing here, init makes
 * it from the remote's, which it then follows, or else from where it just committed. Returns what
 * it did; nothing when `develop` was there or could not be made, such as with no commit yet.
 */
export async function ensureDevelop(git: Git, lang: Lang): Promise<readonly string[]> {
  const known = async (ref: string) =>
    (await git.run(["rev-parse", "--verify", "-q", ref])).code === 0;
  if (await known("refs/heads/develop")) return [];
  const remote = await known("refs/remotes/origin/develop");
  const args = remote ? ["--track", "develop", "origin/develop"] : ["develop", "HEAD"];
  if ((await git.run(["branch", ...args])).code !== 0) return [];
  return [developLine(remote ? "origin/develop" : ((await git.branch()) ?? "HEAD"), lang)];
}
