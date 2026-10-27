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
  const tasks = taskLines(spec);
  return [
    { path: `${dir}/spec.md`, content: featureLines(spec, context).join("\n") },
    { path: `${dir}/plan.md`, content: planLines(spec, context).join("\n") },
    { path: `${dir}/tasks.md`, content: [`# Tasks: ${spec.title}`, "", ...tasks, ""].join("\n") },
  ];
}

/** The feature's spec: its one user story, its acceptance scenarios and its requirements. */
function featureLines(spec: Spec, context: ExportContext): string[] {
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
  return [
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
}

/** The implementation plan: its summary, design, project structure and risks. */
function planLines(spec: Spec, context: ExportContext): string[] {
  return [
    `# Implementation Plan: ${spec.title}`,
    "",
    `**Branch**: \`${context.branch ?? context.id}\`${context.created === undefined ? "" : ` | **Date**: ${context.created}`} | **Spec**: [spec.md](./spec.md)`,
    "",
    ...block("## Summary", textLines(spec.sections.goal)),
    ...block("## Design", textLines(spec.sections.design)),
    ...block("## Project Structure", fileLines(spec)),
    ...block("## Risks", riskLines(spec)),
  ];
}

/** One line per task, numbered as Spec Kit does, with the files it works on. */
function taskLines(spec: Spec): string[] {
  return (spec.sections.tasks?.items ?? []).map((task, index) => {
    const paths = task.files.map((path) => `\`${path}\``).join(", ");
    const id = `T${String(index + 1).padStart(3, "0")}`;
    return `- [${task.done ? "x" : " "}] ${id} [US1] ${task.title}${paths === "" ? "" : ` in ${paths}`}`;
  });
}
