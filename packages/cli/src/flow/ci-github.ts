// SPDX-License-Identifier: Apache-2.0
import { isRecord, parseJson, readText } from "../io/files";
import type { CiOptions } from "./ci-commits";

/**
 * What a GitHub Actions run says of the commits `specty ci` checks (ARCHITECTURE §10): a pull
 * request's base and branch, or a push's previous commit and branch. Outside GitHub Actions, or
 * in another event, nothing: the range is then the target branch's.
 */
export async function githubOptions(env: NodeJS.ProcessEnv): Promise<CiOptions> {
  if (env.GITHUB_ACTIONS !== "true") return {};
  switch (env.GITHUB_EVENT_NAME) {
    case "pull_request":
    case "pull_request_target":
      return pullRequest(env);
    case "push":
      return push(env);
    default:
      return {};
  }
}

/** From the pull request's base, into it, from its branch. */
function pullRequest(env: NodeJS.ProcessEnv): CiOptions {
  const base = env.GITHUB_BASE_REF;
  const head = env.GITHUB_HEAD_REF;
  return {
    ...(base !== undefined && base !== "" ? { base: `origin/${base}`, into: base } : {}),
    ...(head !== undefined && head !== "" ? { headRef: head } : {}),
  };
}

/**
 * From the commit before the push, into the branch pushed. A push that creates the branch has
 * no commit before (all zeros): it starts at the repository's default branch.
 */
async function push(env: NodeJS.ProcessEnv): Promise<CiOptions> {
  const path = env.GITHUB_EVENT_PATH;
  const payload = path === undefined ? undefined : parseJson(await readText(path));
  const before = isRecord(payload) && typeof payload.before === "string" ? payload.before : "";
  const repository = isRecord(payload) && isRecord(payload.repository) ? payload.repository : {};
  const main =
    typeof repository.default_branch === "string" ? repository.default_branch : undefined;
  const base = /^[0-9a-f]*[1-9a-f][0-9a-f]*$/.test(before)
    ? before
    : main === undefined
      ? undefined
      : `origin/${main}`;
  const into = env.GITHUB_REF_NAME;
  return {
    ...(base !== undefined ? { base } : {}),
    ...(into !== undefined && into !== "" ? { into } : {}),
  };
}
