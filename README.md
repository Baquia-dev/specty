# Specty

[Español](https://github.com/Baquia-dev/specty/blob/main/README.es.md)

**Spec-driven development, enforced, for any AI coding agent.**

> **Public beta, 0.1.0.** Specty runs on macOS, Linux and Windows. Its commands, its API and its file formats may still change before 1.0.

Specty enforces spec-driven development when you code with AI agents. No agent writes code without a spec that a person approved, every task lands in a traceable commit, and any change, the agent's or a manual one, can be traced back to the spec that justifies it. It works inside your agent's chat: this version offers Claude Code and Antigravity, and Codex, OpenCode, Cursor and Devin (Windsurf) will come later. It needs no API keys: Specty calls no model itself.

## Why

- Agents write code right away from vague prompts. Afterwards, nobody knows what was done, where or why.
- Writing specs by hand is tedious, and whoever writes them leaves out details the model could spell out.
- Rules written in prose are soft obedience: the model skips them, above all when the flow blocks it without offering a legitimate way forward.
- Every tool expects its own configuration, and a bad one makes the agent lose context.
- Manual changes and the agent's get mixed with no record, and auditing them afterwards is impossible.

With Specty:

- **You stay in control.** Nothing is coded without your approval, and you always know which phase each change is in and what comes next.
- **The agent loses less context.** It gets only what it needs for the task at hand.
- **Fewer rounds.** Doubts and assumptions are settled before any code is written.

## Requirements

- Node.js 22 or later.
- git.
- An AI coding agent that can run terminal commands.

## Install

```sh
npm install -g @baquia-dev/specty
```

Or run it without installing it: `npx -y @baquia-dev/specty <command>`.

> Always use the full name, `@baquia-dev/specty`: `npx specty` runs a different package.

## Set up a repository

In the root of a git repository:

```sh
specty init
```

`init` asks which language Specty works in (English or Spanish) and which agents you work with. It detects the stack, the package manager and the project's commands, runs those commands to check that they work, and asks only for what is missing. Then it writes, and commits:

- `.specty/config.yaml`, the configuration;
- Specty's blocks in `AGENTS.md`, the instructions every agent reads;
- the guard and the hooks of each agent you chose;
- the git hooks (`pre-commit` and `prepare-commit-msg`).

It ends with `specty doctor`, which checks the configuration and the hooks; run it again whenever you like.

- `specty init --dry-run` lists what it would create or change, without writing anything. Before changing a file that already exists, `init` keeps a backup.
- `--language <es|en>`, `--tools <list>` (`claude-code`, `antigravity` or `claude-code,antigravity`) and `--git-flow <specty|github|trunk|gitflow>` answer its questions up front, and `--mcp` also registers Specty's MCP server.
- `specty uninstall` removes what Specty installed; `specty uninstall --dry-run` only lists it.

## Your first change, end to end

1. **Ask your agent for a change**, in its chat, as usual. `AGENTS.md` tells it to run `specty next` before touching code and to follow its output up to the `NEXT:` line.
2. **The agent writes the spec.** It creates the change with `specty new "<title>"`, which gets its own branch and its own folder, a git worktree in `.worktrees/<id>`, so several changes can move in parallel. In `.specty/changes/<id>/spec.md` it writes the goal, what is out of scope, the assumptions, the acceptance criteria, the files, the tasks and the risks, and sends it with `specty propose`. Specty validates it, measures its size, recommends the model's effort and, if it is too big, asks to split it into an epic.
3. **You approve it**, with `specty approve` in your terminal or in the local UI (`specty ui`), where you can also confirm assumptions, comment and edit. The agent cannot do it for you: its guard blocks your commands (`approve`, `accept`, `close`…), and they need a real terminal.
4. **The agent implements it, task by task.** `specty task done <id>` checks that the task touched only its files, runs `specty check` and the task's verification, and makes the task's commit. If the agent needs a file outside the task, it asks for it with `specty scope add`, and you decide. With `policy.tests: contract`, a feature's tests come first: the agent writes them and you approve them before any code.
5. **You accept the result** with `specty accept`, or ask for adjustments, which the agent records with `specty adjust`. New tasks go back to approval, showing only what changed.
6. **Closing.** The agent writes the closing summary, you confirm it with `specty close`, and Specty merges the change into your main branch and archives it with its audit trail.

While the change waits for you, the agent runs `specty wait`, which returns as soon as you decide. If someone commits code without a spec, the git hooks stop the commit until it is documented with `specty retro`.

If you would rather let the agent move on its own in a repository, `specty delegate on` hands it your decisions after a warning you confirm in your terminal, and `specty delegate off` takes them back. Every delegated action stays in the audit trail as the agent's.

## Lanes

Each change follows a lane, chosen with `specty new --kind <lane>`:

| Lane | When | How it differs from the standard flow |
| --- | --- | --- |
| `quick` | Up to 3 files, no sensitive paths | Minimal spec (goal, files and one task, by default); one-click approval and acceptance; closes on its own |
| `standard` | By default | The full flow |
| `spike` | Technical uncertainty | A `spike/<id>` branch that is never merged; it ends in a decision (an ADR or a follow-up spec) |
| `retro` | Code written without a spec, by hand or by an agent without hooks | Documents changes already made; the person confirms; the commit is allowed |
| `epic` | `XL` scope | No tasks: vertical slices with their dependencies, each one a child change with its own folder (`specty new --epic <id> --slice C1`) |

Specty decides whether a change fits `quick`: if the spec goes over its limits, `propose` rejects it and asks for `standard`.

## Local UI

```sh
specty ui
```

`specty ui` serves the changes of every worktree on `localhost` (port 4173, or the next free one; `--port <port>` to try another first) and opens your browser with a link that carries a session token (`--no-open` to skip that). It runs until Ctrl+C.

- **Inbox:** first what waits for your decision, then the active changes by phase, then the recent ones.
- **Each change:** Spec, Progress, Acceptance and History tabs, to review the spec, confirm assumptions, comment, edit, approve and accept.
- **More pages:** epics as a board of slices, the traceability of a file or a line, Specty's memory, the agents' sessions, a dashboard of what was done in a period, and the settings of `.specty/config.yaml` and delegated mode.

The UI only takes decisions when you start it from an interactive terminal. Started by an agent, it is read-only, because the agent would see the link with its token.

## Agents

Specty enforces the flow in layers:

| Layer | What it does | Can it be bypassed? |
| --- | --- | --- |
| 1. Instructions (`AGENTS.md` and Specty's output) | Guides the agent | Yes |
| 2. The agent's hooks (the guard) | Blocks writes outside the task's scope, a direct `git commit`, the person's commands and edits of Specty's files and of each agent's hooks, with the reason and the next valid step; after each shell command, warns about what changed without permission | Yes, through an indirect shell; the warning comes after the change is made |
| 3. git hooks | Blocks commits without a receipt or a spec | Yes, with `--no-verify` |
| 4. CI (`specty ci` as a required check) | Rejects commits that do not trace back to an approved change | Only by copying the trailers by hand |

What Specty does with each agent this version offers (`specty init --tools <list>` installs it):

| Agent | Guard | Warning after each command | Card after compaction | Worktree by name | Slices in subagents | End of turn | Exclusion | Permissions |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Claude Code | yes | yes | yes | yes | yes | yes | yes | yes |
| Antigravity | yes | indirect | indirect | indirect | yes | yes | yes | yes |

Antigravity is both the app and its CLI, `agy`. Codex, OpenCode, Cursor and Devin (Windsurf) will come later: Specty already has their guard, but this version does not offer them, so `init` neither detects nor installs them.

- **Guard:** judges each action of the agent before it happens.
- **Warning after each command:** after each shell command, Specty judges what changed with the same rules and warns the agent, so it also sees what scripts and generators write.
- **Card after compaction:** when the agent compacts its context, it gets the current change's card again.
- **Worktree by name:** the conversation moves into the change's folder (with `EnterWorktree` in Claude Code, with `specty enter <id>` in the rest).
- **Slices in subagents:** an epic's ready slices go to subagents in parallel, each one in its slice's folder.
- **End of turn:** when the agent ends its turn, `specty check` runs and, if it fails, the agent gets the report and goes on.
- **Exclusion:** the agent does not read dependencies, build output or generated code (`specty check --install` sets it up).
- **Permissions:** the tool's own permissions leave the decision to Specty.

*yes* works as in Claude Code; *indirect* goes through another event of the tool, a little later; *not possible* means the tool has nothing Specty can use. How each indirect capability works, and why each one is not possible, is in [ARCHITECTURE §10](https://github.com/Baquia-dev/specty/blob/main/docs/ARCHITECTURE.md#10-cumplimiento-por-capas) (in Spanish).

Any other agent (GitHub Copilot, Aider, Zed, Cline, Continue…) gets layers 1, 3 and 4: the instructions, the git hooks and CI.

Specty does not protect against people or agents that set out to bypass it with write access to the repository: CI is the final guarantee.

## CI

`specty ci` checks that every commit of a pull request or a push traces back to an approved change: that each commit of governed code names its change, that each task's commit carries an approval valid for its spec, and that no spike reaches the target branch. In GitHub Actions it reads the event itself. The Action at the root of this repository runs it:

```yaml
on: [pull_request]

jobs:
  specty:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0
      - uses: Baquia-dev/specty@v0.1.0 # runs @baquia-dev/specty@0.1.0; or set the input `version`
```

Outside GitHub Actions, `--base <ref>` says where the commits start (by default, the target branch). `specty check --install` can also write a CI workflow template that runs it on pull requests, and `specty check --all` runs the quality checks on everything git tracks ([the checks](https://github.com/Baquia-dev/specty/blob/main/docs/checks.en.md)).

## MCP

`specty mcp` serves the agent's commands as MCP tools over stdio (`specty_next`, `specty_new`, `specty_propose`, `specty_task_done`, `specty_scope_add`, `specty_check`…), with the same output and the same rules as the CLI. Your decisions have no tool, not even in delegated mode. `specty init --mcp` registers the server in each agent's project configuration. It is optional: every MCP tool takes up context in each turn, and the CLI already does the same.

In hosts that support MCP Apps, the change is also shown in the chat, read-only: the tab of the step the agent is on (Spec, Progress or Acceptance). You still decide in your terminal or in `specty ui`.

## Export and import

- `specty export [id] --to <openspec|speckit|kiro>` writes a change's spec, the active one by default, in OpenSpec, GitHub Spec Kit or Kiro format, in `.specty/exports/<format>` or the folder of `--out <folder>`.
- `specty import [folder]` brings an OpenSpec change (from `openspec/changes/`) in as a draft; without a folder, it lists the ones there are.

## More commands

- `specty status`: open changes and pending decisions.
- `specty why <path>[:<line>]`: the change, task and criteria a file or a line comes from.
- `specty audit [id]`: a change's report, with its tasks and its timeline.
- `specty check`: the quality checks on what changed.
- `specty stats`: the UI's dashboard, in the terminal.
- `specty memory`: Specty's memory of pending items, improvements, reminders and decisions.
- `specty prune`: removes the folders of finished changes and the branches already merged.
- `specty --help` and `specty <command> --help`: every command and option.

## Documentation

- [Product](https://github.com/Baquia-dev/specty/blob/main/PRODUCT.md) (in Spanish)
- [Architecture](https://github.com/Baquia-dev/specty/blob/main/docs/ARCHITECTURE.md) (in Spanish)
- [File formats](https://github.com/Baquia-dev/specty/blob/main/docs/formats.md) (in Spanish)
- [`specty check` checks](https://github.com/Baquia-dev/specty/blob/main/docs/checks.en.md)
- [UI](https://github.com/Baquia-dev/specty/blob/main/docs/ui.md) (in Spanish)
- [Decisions (ADRs)](https://github.com/Baquia-dev/specty/tree/main/docs/decisions) (in Spanish)

## License

Specty is licensed under [Apache-2.0](https://github.com/Baquia-dev/specty/blob/main/LICENSE) (see [NOTICE](https://github.com/Baquia-dev/specty/blob/main/NOTICE)). What Specty generates in your repository is licensed under MIT-0: you can use, modify and redistribute it without attribution ([ADR 0008](https://github.com/Baquia-dev/specty/blob/main/docs/decisions/0008-licencia-apache.md), in Spanish).
