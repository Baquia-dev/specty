// SPDX-License-Identifier: Apache-2.0
// Public API of the Specty core. Pure: no file system, network or Node APIs.

export {
  AGENT_NAMES,
  type AgentTool,
  detectAgentTool,
  effortName,
  isAgentTool,
  personAtTerminal,
} from "./agents";
export {
  citedPaths,
  flowBlock,
  hasBlock,
  humanSections,
  type ProjectFacts,
  projectBlock,
  removeBlock,
  unfilledSections,
  upsertBlock,
} from "./agents-md";
export { type Analysis, analyzeSpec } from "./analyze";
export {
  branchName,
  branchPatternIssue,
  branchUsesType,
  GIT_FLOWS,
  type GitFlow,
} from "./branches";
export {
  AGENT_CAPABILITIES,
  type AgentCapabilities,
  capabilityTable,
  type GuardedAgent,
  isGuardedAgent,
  type Support,
} from "./capabilities";
export * from "./cards";
export { type AnalyzerIgnore, analyzerIgnores, dartImports } from "./checks/dart";
export { type AddedDependency, addedDependencies, readsDependencies } from "./checks/dependencies";
export { type FunctionMetric, functionMetrics } from "./checks/functions";
export { csharpImports, csharpNamespaces } from "./checks/imports-csharp";
export { goImports } from "./checks/imports-go";
export { jvmImports, jvmPackages } from "./checks/imports-jvm";
export { phpImports } from "./checks/imports-php";
export { pythonImports, pythonProject } from "./checks/imports-python";
export { rustImports } from "./checks/imports-rust";
export {
  type LayerViolation,
  layerOf,
  layerViolations,
  packageName,
  type ResolvedImport,
} from "./checks/layers";
export {
  criterionMarks,
  focusedTests,
  type Mark,
  skippedTests,
  testCases,
  unreferencedTodos,
} from "./checks/markers";
export { findingsInOutput } from "./checks/output";
export {
  type CheckMode,
  type CheckReport,
  type CheckResult,
  type CheckStatus,
  type Finding,
  type RenderOptions,
  renderReport,
  reportExitCode,
  reportJson,
  statusOf,
  summaryLine,
} from "./checks/report";
export {
  type StrictTypeRule,
  type StrictTypeViolation,
  strictTypeViolations,
} from "./checks/strict-types";
export { suppressions } from "./checks/suppressions";
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
export { type GlossaryEntry, parseGlossary, termsIn } from "./glossary";
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
export type { GuardIntegration } from "./guard/integration";
export { movePatch, type PatchPaths, patchPaths } from "./guard/patch";
export type { BoundSession } from "./guard/session";
export { analyzeShell, type ShellAnalysis } from "./guard/shell";
export { type ForeignPath, nativeEnterDenial } from "./guard/worktrees";
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
  type CheckLevel,
  type ChecksConfig,
  COMMAND_CHECKS,
  type CommandCheck,
  checkLevel,
  DEFAULT_CHECKS,
  type GeneratorConfig,
  type LayerRule,
  type Layers,
  type TodoConfig,
} from "./schema/checks";
export {
  type ConfigInput,
  type ConfigIssue,
  type ConfigResult,
  ConfigSchema,
  DEFAULT_CONFIG,
  type LineLimits,
  type ResolvedConfig,
  resolveConfig,
  type TestsPolicy,
} from "./schema/config";
export {
  type ChangeState,
  ChangeStateSchema,
  type IntegrationState,
  isIntegrating,
  PhaseSchema,
  parseChangeState,
  type StateResult,
} from "./schema/state";
export { type AssertionLoss, removedAssertions } from "./scope/assertions";
export { isGoverned } from "./scope/governed";
export { isLockfile, isLockfileFor, isManifest } from "./scope/lockfiles";
export { contentRisks, isRiskRule, type RiskFinding, type RiskRule, riskLabel } from "./scope/risk";
export {
  type AutoBasis,
  autoBasis,
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
export { isImplicitTest, isTestFile, isTestOf } from "./scope/tests";
export {
  type EffortLevel,
  type EffortRecommendation,
  recommendEffort,
  recommendTaskEffort,
} from "./sizing/effort";
export {
  codeLines,
  fileSize,
  isGeneratedText,
  type LongFile,
  longFiles,
  type SizedFile,
} from "./sizing/lines";
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
export {
  type ConfigTemplateOptions,
  configTemplate,
  productQuestions,
  productTemplate,
  specTemplate,
  type TemplateOptions,
} from "./templates";
export { type ProposePhase, type ValidationContext, validateSpec } from "./validate";
export { type TestRules, testRules, testsFirst } from "./validate/quality";
