// SPDX-License-Identifier: Apache-2.0
import type { Spec } from "@baquia-dev/specty-core";
import {
  assumptionLines,
  block,
  type ExportContext,
  type ExportedFile,
  fileLines,
  riskLines,
  textLines,
} from "./parts";
import { scenarioOf } from "./scenario";

/**
 * GitHub Spec Kit: a feature folder `specs/<id>/` with its spec (one user story, its acceptance
 * scenarios and functional requirements), its plan and its tasks (formats.md §10).
 */
export function specKit(spec: Spec, context: ExportContext): ExportedFile[] {
  const dir = `specs/${context.id}`;
  const criteria = spec.sections.criteria?.items ?? [];
  const scenarios = criteria.map((criterion, index) => {
    const scenario = scenarioOf(criterion.text);
    return scenario === undefined
      ? `${index + 1}. **Then** ${criterion.text}`
      : `${index + 1}. **When** ${scenario.condition}, **Then** ${scenario.result}`;
  });
  const requirements = criteria.map(
    (criterion, index) =>
      `- **FR-${String(index + 1).padStart(3, "0")}**: ${criterion.text} (${criterion.id})`,
  );
  const feature = [
    `# Feature Specification: ${spec.title}`,
    "",
    `**Feature Branch**: \`${context.branch ?? context.id}\``,
    ...(context.created === undefined ? [] : [`**Created**: ${context.created}`]),
    "**Status**: Draft",
    ...(context.request === undefined ? [] : [`**Input**: User description: "${context.request}"`]),
    "",
    "## User Scenarios & Testing *(mandatory)*",
    "",
    `### User Story 1 - ${spec.title} (Priority: P1)`,
    "",
    ...textLines(spec.sections.goal),
    "",
    ...block("**Acceptance Scenarios**:", scenarios),
    ...block(
      "## Requirements *(mandatory)*",
      requirements.length === 0 ? [] : ["### Functional Requirements", "", ...requirements],
    ),
    ...block("## Assumptions", assumptionLines(spec)),
    ...block("## Out of Scope", textLines(spec.sections.outOfScope)),
  ];
  const plan = [
    `# Implementation Plan: ${spec.title}`,
    "",
    `**Branch**: \`${context.branch ?? context.id}\`${context.created === undefined ? "" : ` | **Date**: ${context.created}`} | **Spec**: [spec.md](./spec.md)`,
    "",
    ...block("## Summary", textLines(spec.sections.goal)),
    ...block("## Design", textLines(spec.sections.design)),
    ...block("## Project Structure", fileLines(spec)),
    ...block("## Risks", riskLines(spec)),
  ];
  const tasks = (spec.sections.tasks?.items ?? []).map((task, index) => {
    const paths = task.files.map((path) => `\`${path}\``).join(", ");
    const id = `T${String(index + 1).padStart(3, "0")}`;
    return `- [${task.done ? "x" : " "}] ${id} [US1] ${task.title}${paths === "" ? "" : ` in ${paths}`}`;
  });
  return [
    { path: `${dir}/spec.md`, content: feature.join("\n") },
    { path: `${dir}/plan.md`, content: plan.join("\n") },
    { path: `${dir}/tasks.md`, content: [`# Tasks: ${spec.title}`, "", ...tasks, ""].join("\n") },
  ];
}
