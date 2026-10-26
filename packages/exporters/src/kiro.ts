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
 * Kiro: a spec folder `.kiro/specs/<name>/` with its requirements, one requirement whose
 * acceptance criteria are in EARS notation, its design and its tasks, each citing the criteria it
 * covers as `_Requirements: 1.2_` (formats.md §10).
 */
export function kiro(spec: Spec, context: ExportContext): ExportedFile[] {
  const dir = `.kiro/specs/${featureOf(context.id)}`;
  const criteria = spec.sections.criteria?.items ?? [];
  const numbers = new Map(criteria.map((criterion, index) => [criterion.id, `1.${index + 1}`]));
  const ears = criteria.map((criterion, index) => {
    const scenario = scenarioOf(criterion.text);
    return scenario === undefined
      ? `${index + 1}. THE SYSTEM SHALL meet: ${criterion.text}`
      : `${index + 1}. WHEN ${scenario.condition} THE SYSTEM SHALL ${scenario.result}`;
  });
  const requirements = [
    "# Requirements Document",
    "",
    ...block("## Introduction", textLines(spec.sections.goal)),
    "## Requirements",
    "",
    "### Requirement 1",
    "",
    `**User Story:** ${context.request ?? spec.title}`,
    "",
    ...block("#### Acceptance Criteria", ears),
  ];
  const design = [
    "# Design Document",
    "",
    ...block("## Overview", textLines(spec.sections.goal)),
    ...block("## Architecture", textLines(spec.sections.design)),
    ...block("## Assumptions", assumptionLines(spec)),
    ...block("## Components and Interfaces", fileLines(spec)),
    ...block("## Risks", riskLines(spec)),
  ];
  const tasks = (spec.sections.tasks?.items ?? []).flatMap((task, index) => {
    const cited = (task.ac === undefined || task.ac === "none" ? [] : task.ac).flatMap(
      (id) => numbers.get(id) ?? [],
    );
    return [
      `- [${task.done ? "x" : " "}] ${index + 1}. ${task.title}`,
      ...(task.files.length === 0
        ? []
        : [`  - Files: ${task.files.map((path) => `\`${path}\``).join(", ")}`]),
      ...(cited.length === 0 ? [] : [`  - _Requirements: ${cited.join(", ")}_`]),
    ];
  });
  return [
    { path: `${dir}/requirements.md`, content: requirements.join("\n") },
    { path: `${dir}/design.md`, content: design.join("\n") },
    { path: `${dir}/tasks.md`, content: ["# Implementation Plan", "", ...tasks, ""].join("\n") },
  ];
}
