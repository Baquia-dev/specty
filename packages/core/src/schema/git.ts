// SPDX-License-Identifier: Apache-2.0
import * as z from "zod";
import { branchPatternIssue, GIT_FLOWS, type GitFlow } from "../branches";

/** `git` in `.specty/config.yaml`: where each change lives and how its branch is named. */
export interface GitConfig {
  readonly branchPerChange: boolean;
  /** `new` creates each change in a worktree of its own (needs `branchPerChange`). */
  readonly worktrees: boolean;
  /**
   * What prepares a new worktree, such as installing dependencies; `false` runs nothing.
   * Unset: the install command of the stack detected there.
   */
  readonly setup?: string | false;
  /** The branch changes start from and go to when finished. Unset: the main branch. */
  readonly target?: string;
  /** How the changes' branches are named (`branchName`). Unset: Specty's own, `specty/<id>`. */
  readonly flow?: GitFlow;
  /** A name with `{type}`, `{slug}` and `{id}` for the changes' branches, over `flow`. */
  readonly branchPattern?: string;
}

export const DEFAULT_GIT: GitConfig = { branchPerChange: true, worktrees: true };

export const GitSchema = z.strictObject({
  branchPerChange: z.boolean().optional(),
  worktrees: z.boolean().optional(),
  setup: z.union([z.string().min(1), z.literal(false)]).optional(),
  target: z.string().min(1).optional(),
  flow: z.enum(GIT_FLOWS).optional(),
  branchPattern: z
    .string()
    .min(1)
    .superRefine((pattern, context) => {
      const issue = branchPatternIssue(pattern);
      if (issue !== undefined) context.addIssue({ code: "custom", message: issue });
    })
    .optional(),
});

/** The `git` section with its defaults applied; the optional keys only when set. */
export function resolveGit(git: z.infer<typeof GitSchema> | undefined): GitConfig {
  return {
    branchPerChange: git?.branchPerChange ?? DEFAULT_GIT.branchPerChange,
    worktrees: git?.worktrees ?? DEFAULT_GIT.worktrees,
    ...(git?.setup !== undefined ? { setup: git.setup } : {}),
    ...(git?.target !== undefined ? { target: git.target } : {}),
    ...(git?.flow !== undefined ? { flow: git.flow } : {}),
    ...(git?.branchPattern !== undefined ? { branchPattern: git.branchPattern } : {}),
  };
}
