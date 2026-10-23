// SPDX-License-Identifier: Apache-2.0
// Public API of the Specty core. Pure: no file system, network or Node APIs.

export {
  AGENT_NAMES,
  type AgentTool,
  detectAgentTool,
  effortName,
  isAgentTool,
} from "./agents";
export {
  flowBlock,
  hasBlock,
  humanSections,
  type ProjectFacts,
  projectBlock,
  upsertBlock,
} from "./agents-md";
export { type Analysis, analyzeSpec } from "./analyze";
export {
  blockedCard,
  changeHeader,
  deltaLine,
  invalidSpecCard,
  outOfScopeCard,
  type ProposedView,
  proposedCard,
  retroCreatedCard,
  scopeRequestedCard,
  verifyFailedCard,
  withLead,
} from "./cards/flow";
export { type BlockedCommitView, blockedCommitMessage } from "./cards/hooks";
export {
  closedCard,
  decisionCard,
  nothingPendingCard,
  notInteractiveCard,
  type StatusEntry,
  statusCard,
} from "./cards/human";
export { type NextView, nextCard, notInitializedCard, taskCard } from "./cards/next";
export { effortLabel, effortLine, translator } from "./cards/text";
export type {
  CardContext,
  ChangeView,
  CriterionView,
  RejectedView,
  ScopeRequestView,
  TaskView,
} from "./cards/view";
export {
  type Actor,
  EVENT_RULES,
  type EventRule,
  FLOW_EVENTS,
  type FlowEvent,
  type FlowEventType,
  type RejectionCode,
  type TransitionInput,
  type TransitionResult,
  transition,
} from "./flow/machine";
export {
  type CodeAccess,
  PHASES,
  type Phase,
  type PhasePermissions,
  phasePermissions,
  type SpecAccess,
  type WaitingFor,
} from "./flow/phases";
export { globBase, isGlob, matchesAny, matchesPattern } from "./glob";
export {
  DELETED,
  decideAfterShell,
  type ShellChanges,
  type ShellSnapshot,
  shellChanges,
} from "./guard/after";
export {
  decideGuard,
  type GuardAction,
  type GuardChange,
  type GuardContext,
  type GuardDecision,
  type GuardRule,
  HUMAN_COMMANDS,
  type ShellFacts,
} from "./guard/decide";
export { analyzeShell, type ShellAnalysis } from "./guard/shell";
export type { ForeignPath } from "./guard/worktrees";
export { hashText, type Sha256Hash, shortHash } from "./hash";
export { fold, LANGS, type Lang } from "./i18n";
export {
  CHANGE_ID,
  ITEM_PREFIXES,
  type ItemId,
  type ItemPrefix,
  makeChangeId,
  parseItemId,
  slugify,
} from "./ids";
export {
  EXIT_CODES,
  headerOf,
  type Output,
  type OutputBlock,
  type OutputStatus,
  renderText,
  section,
} from "./output";
export { basename, dirname, moduleOf, normalizePath, type PathProblem, pathProblem } from "./paths";
export {
  type ConfigInput,
  type ConfigIssue,
  type ConfigResult,
  ConfigSchema,
  DEFAULT_CONFIG,
  type ResolvedConfig,
  resolveConfig,
  type TestsPolicy,
} from "./schema/config";
export {
  type ChangeState,
  ChangeStateSchema,
  PhaseSchema,
  parseChangeState,
  type StateResult,
} from "./schema/state";
export { isGoverned } from "./scope/governed";
export { isLockfileFor, isManifest } from "./scope/lockfiles";
export {
  type ChangedFile,
  type ChangeStatus,
  classifyPath,
  decideScopeRequest,
  evaluateTaskScope,
  isSensitive,
  type ScopeEvaluation,
  type ScopeInput,
  type ScopeRules,
  type ScopeVerdict,
  scopeRulesFrom,
} from "./scope/scope";
export { isImplicitTest, isTestFile } from "./scope/tests";
export {
  type EffortLevel,
  type EffortRecommendation,
  recommendEffort,
  recommendTaskEffort,
} from "./sizing/effort";
export {
  collectSignals,
  computeSize,
  formatSizeReason,
  type RepoSignals,
  SIZE_LEVELS,
  type SizeLevel,
  type SizeReason,
  type SizeResult,
  type SizeSignals,
} from "./sizing/size";
export {
  type CanonicalResult,
  canonicalize,
  itemHashes,
  specHash,
  withPendingTasks,
} from "./spec/canonical";
export {
  type DeltaChange,
  type DeltaEntry,
  type DeltaKind,
  type SpecDelta,
  specDelta,
} from "./spec/delta";
export {
  type Diagnostic,
  type DiagnosticCode,
  hasErrors,
  type Severity,
} from "./spec/diagnostics";
export * from "./spec/model";
export { type ParseOptions, type ParseResult, parseSpec } from "./spec/parse";
export { hashUnits, serializeSpec } from "./spec/serialize";
export { KIND_RULES, SECTION_TITLES } from "./spec/vocabulary";
export { specTemplate, type TemplateOptions } from "./templates";
export { type ProposePhase, type ValidationContext, validateSpec } from "./validate";
