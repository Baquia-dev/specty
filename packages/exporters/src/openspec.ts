// SPDX-License-Identifier: Apache-2.0
import type { Spec } from "@baquia-dev/specty-core";
import {
  assumptionLines,
  block,
  type ExportContext,
  type ExportedFile,
  featureOf,
  fileLines,
  riskLines,
  textLines,
} from "./parts";
import { scenarioOf } from "./scenario";

/**
 * OpenSpec: a change folder `openspec/changes/<id>/` with its proposal, design, tasks and a spec
 * delta for one capability, named after the change (formats.md §10).
 */
export function openSpec(spec: Spec, context: ExportContext): ExportedFile[] {
  const dir = `openspec/changes/${context.id}`;
  const design = designLines(spec);
  const tasks = (spec.sections.tasks?.items ?? []).map(
    (task, index) => `- [${task.done ? "x" : " "}] 1.${index + 1} ${task.title}`,
  );
  const requirements = requirementLines(spec);
  return [
    { path: `${dir}/proposal.md`, content: proposalLines(spec).join("\n") },
    ...(design.length === 0
      ? []
      : [
          {
            path: `${dir}/design.md`,
            content: [`# Design: ${spec.title}`, "", ...design].join("\n"),
          },
        ]),
    { path: `${dir}/tasks.md`, content: ["## 1. Implementation", "", ...tasks, ""].join("\n") },
    ...(requirements.length === 0
      ? []
      : [
          {
            path: `${dir}/specs/${featureOf(context.id)}/spec.md`,
            content: ["## ADDED Requirements", "", ...requirements].join("\n"),
          },
        ]),
  ];
}

/** Why the change, what it changes, the code it affects and what it leaves out. */
function proposalLines(spec: Spec): string[] {
  const files = spec.sections.files?.items ?? [];
  const affected = files.map((entry) => `\`${entry.path}\``).join(", ");
  return [
    `# ${spec.title}`,
    "",
    ...block("## Why", textLines(spec.sections.goal)),
    ...block("## What Changes", fileLines(spec)),
    ...block("## Impact", affected === "" ? [] : [`- Affected code: ${affected}`]),
    ...block("## Out of Scope", textLines(spec.sections.outOfScope)),
  ];
}

/** The assumptions, the design and the risks; nothing when the spec has none. */
function designLines(spec: Spec): string[] {
  return [
    ...block("## Assumptions", assumptionLines(spec)),
    ...block("## Design", textLines(spec.sections.design)),
    ...block("## Risks", riskLines(spec)),
  ];
}

/** One requirement per criterion, with its scenario. */
function requirementLines(spec: Spec): string[] {
  return (spec.sections.criteria?.items ?? []).flatMap((criterion) => {
    const scenario = scenarioOf(criterion.text);
    return [
      `### Requirement: ${criterion.id}`,
      "",
      `The system SHALL meet this criterion: ${criterion.text}`,
      "",
      `#### Scenario: ${criterion.id}`,
      "",
      ...(scenario === undefined
        ? [`- **THEN** ${criterion.text}`]
        : [`- **WHEN** ${scenario.condition}`, `- **THEN** ${scenario.result}`]),
      "",
    ];
  });
}
