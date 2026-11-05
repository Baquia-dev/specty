// SPDX-License-Identifier: Apache-2.0
// The cards: every text the agent and the person see, as each command prints it.

export {
  acceptAnywayQuestion,
  acceptanceSummary,
  acceptedLine,
  acceptQuestion,
  delegatedFailureCard,
  noCodeVerificationNote,
  quickClosedLine,
  quickClosing,
  runVerificationQuestion,
  verificationNoteTitle,
  verificationReusedNote,
} from "./accept";
export { assertionWarnings, riskWarnings } from "./acceptance";
export { type AdjustRefusal, adjustRefusalCard } from "./adjust";
export {
  type ApprovalView,
  approvalPostponedCard,
  approvalSummary,
  approveSpecQuestion,
  askAgentNext,
  assumptionChoices,
  noScopeRequestCard,
  rejectedAssumptionsLine,
  rejectionQuestion,
  type ScopeRequestDecided,
  scopeDecidedLine,
  scopeDecisionQuestion,
  specApprovedLine,
  specChangedCard,
} from "./approve";
export { firedRemindersBlocks, harvestedBlocks } from "./archived-memory";
export {
  type AuditEvent,
  type AuditRefusal,
  type AuditTask,
  type AuditView,
  auditRefusalCard,
  auditReport,
} from "./audit";
export { type AuditSource, auditViewOf } from "./audit-view";
export { type CheckDebt, checkDebt, checkDebtLines } from "./check-debt";
export { type CiCommit, type CiFacts, type CiLevel, ciReport } from "./ci";
export {
  alreadyClosedLine,
  cancelCommitSubject,
  cancelledLine,
  cancelQuestion,
  cancelReasonQuestion,
  closeCommitSubject,
  closedLine,
  closingCommitSubject,
  confirmCloseQuestion,
  landQuestion,
  resolvedIntegrationNote,
  verifyHintLine,
} from "./close";
export { coverageLines } from "./coverage";
export {
  decisionPostponedCard,
  noSuchChangeCard,
  nothingWaitsCard,
  otherFolderNote,
  whichChangeQuestion,
} from "./decide";
export { type DoctorLine, doctorCard, doctorLine } from "./doctor";
export {
  type DuplicateFilesView,
  type DuplicateView,
  duplicateApproveNext,
  duplicateCard,
  duplicateFilesBlock,
} from "./duplicates";
export { enteredCard, lostFolderCard, noFolderCard } from "./enter";
export { epicCard, type SliceRefusal, sliceLines, sliceRefusalCard } from "./epic";
export { type ExportRefusal, exportedCard, exportRefusalCard } from "./export";
export {
  blockedCard,
  changeHeader,
  deltaLine,
  invalidSpecCard,
  notProposableCard,
  outOfScopeCard,
  type ProposedView,
  proposedCard,
  retroCreatedCard,
  revisionLabel,
  scopeRequestedCard,
  verifyFailedCard,
  withLead,
} from "./flow";
export {
  type FreshOutcome,
  type FreshRefusal,
  type FreshResult,
  type FreshTarget,
  type FreshUnit,
  freshCard,
  freshMemoryText,
  freshProgressLine,
  freshRefusalCard,
} from "./fresh";
export {
  foreignFrontsBlock,
  frontFreedCard,
  frontHeldDenial,
  frontResolvesDenial,
  frontTakenCard,
} from "./front-owners";
export {
  type FrontOwner,
  type FrontRefusal,
  frontAddedCard,
  frontAssignedCard,
  frontCommitSubject,
  frontListCard,
  frontRefusalCard,
} from "./fronts";
export { gitFailedCard } from "./git-failed";
export {
  type BlockedCommitView,
  blockedCommitMessage,
  checkChangedFailedLine,
  checkStagedFailedLine,
  type WorktreeHookRefusal,
  worktreeHookRefusal,
} from "./hooks";
export {
  cancelledCard,
  closedCard,
  decisionCard,
  delegationCard,
  delegationChoices,
  delegationNoteTitle,
  delegationQuestion,
  delegationWarning,
  nothingPendingCard,
  notInteractiveCard,
} from "./human";
export { impactLine, impactTitle } from "./impact";
export {
  type ImportedChange,
  importedLead,
  importedSections,
  importListCard,
  importRefusalCard,
  importRequest,
} from "./import";
export {
  agentsMdLine,
  backupLine,
  configLine,
  developLine,
  dryRunCard,
  type InitRefusal,
  type InitView,
  initCard,
  initRefusalCard,
  languageLine,
  newProjectNext,
  noTestCommandWarning,
  productLine,
  worktreesIgnoreLine,
} from "./init";
export {
  agentChoices,
  agentQuestion,
  flowChoices,
  flowLine,
  flowQuestion,
  languageChoices,
  languageQuestion,
  noAgentWarning,
  noFlowWarning,
} from "./init-questions";
export {
  antigravityAppRuleWarning,
  antigravityCliInvalidWarning,
  antigravityCliRuleLine,
  antigravityTrustWarning,
  changeInProgressWarning,
  claudePermissionsLine,
  claudePointerLine,
  codexGuardLine,
  codexRulesLine,
  codexTrustWarning,
  cursorSandboxLine,
  cursorSandboxTrackedWarning,
  devinCommandsLine,
  devinRestrictedWarning,
  devinSandboxLine,
  devinSandboxTrackedWarning,
  geminiPointerLine,
  geminiSandboxLine,
  geminiSandboxVersionedWarning,
  geminiTrustWarning,
  gitHooksLine,
  gitHooksManualWarning,
  guardLine,
  installCommitFailedWarning,
  installCommitLine,
  installCommitSubject,
  noHooksWarning,
  notOnPathWarning,
  opencodeGuardLine,
  yoursUncommittedWarning,
} from "./install";
export {
  absorbedLine,
  commandFailsLine,
  commitOrDiscardNext,
  holderDirtyLine,
  holderDirtyNext,
  incorporationTitle,
  integrateRetry,
  integrationResolvedLine,
  type MergeVerification,
  markersLeftLine,
  mergeAbortedLine,
  mergeByHandNext,
  mergedConfigInvalidLine,
  mergedConfigNext,
  mergedVerifyFailsLine,
  mergeFailedLine,
  mergingLabel,
  noIncorporationCard,
  notYetLine,
  outsideIncorporationLine,
  personOnlyLine,
  resolveIncorporationNext,
  runAgainNext,
  stillResolvingLine,
  targetConflictsLine,
  uncommittedOverlapLine,
  undoOutsideNext,
} from "./integration";
export {
  type AfterLanding,
  afterLandingLine,
  backOnTargetLine,
  folderRemovedLine,
  folderStaysLine,
  landedLine,
  landingNote,
  leaveFolderNext,
  notLandedLine,
  retryLandingNext,
  targetAheadLine,
} from "./land";
export {
  legacyDoneLines,
  legacyMoveBody,
  legacyPlanCard,
  legacyRefusalCard,
  legacyRemovalBody,
  legacyStepQuestion,
  legacyStepTitle,
} from "./legacy";
export { longFileCard, longFileWarnings, splitAdvice } from "./lines";
export {
  busyChangeCard,
  fullVerificationWaitNote,
  type LockHolderView,
  verifySlotsWaitNote,
} from "./lock";
export { mcpNotOnPathWarning, mcpRegisteredLine, mcpUserFolderWarning } from "./mcp";
export {
  type MemoryListOutput,
  memoryAddedCard,
  memoryCommitSubject,
  memoryDoneCard,
  memoryListCard,
  memoryReadme,
} from "./memory";
export { type ResolvesRefusal, resolvesRefusalCard } from "./memory-claims";
export {
  type MemoryDropRefusal,
  memoryDropCard,
  memoryDropRefusalCard,
  memoryKeptCard,
} from "./memory-drop";
export { type MemoryRefusal, memoryRefusalCard } from "./memory-refusals";
export { memoryStopReason } from "./memory-turn";
export {
  type MessageRefusal,
  type MessageView,
  messageLeftCard,
  messageRefusalCard,
  messagesNote,
} from "./messages";
export {
  changeCreatedLead,
  type NewRefusal,
  newRefusalCard,
  type WorktreeCreated,
  worktreeCreatedCard,
} from "./new";
export { type NextView, nextCard, notInitializedCard, taskCard } from "./next";
export { type NoteRefusal, notedCard, noteRefusalCard } from "./notes";
export {
  notInTargetBranchLine,
  notInTargetFolderLine,
  preparingNote,
  pruneCard,
  sharedLine,
  sharedTitle,
  workingFolderLine,
} from "./parallel";
export { withDevPorts } from "./ports";
export {
  type Asker,
  checkStatus,
  invalidConfigCard,
  noActiveChangeCard,
  notGitCard,
  nothingChangedCard,
  reloadNext,
} from "./refusals";
export {
  type Restored,
  type RestoreRefusal,
  restoredCard,
  restoreRefusalCard,
} from "./restore";
export {
  type RetroRefusal,
  retroDoneCard,
  retroReasonQuestion,
  retroRefusalCard,
  retroTitle,
} from "./retro";
export {
  type RetroIntoRefusal,
  retroIntoApprovedCard,
  retroIntoRefusalCard,
  retroIntoRequestedCard,
  retroIntoStaleCard,
  retroIntoStaleReason,
} from "./retro-into";
export {
  diffReviewPrompt,
  type ReviewedView,
  type ReviewRefusal,
  reviewedCard,
  reviewingNote,
  reviewRefusalCard,
  specReviewPrompt,
} from "./review";
export {
  type ReviewRemark,
  reviewRemarks,
  reviewRemarkText,
  uncitedRemarks,
} from "./review-remarks";
export {
  assumptionDecidedLine,
  changesRequestedLine,
  commentSavedLine,
  emptyCommentCard,
  noAssumptionCard,
  nothingToRequestCard,
} from "./review-ui";
export { type RiskLesson, riskLessons, riskLessonsLine } from "./risk-lessons";
export {
  notBuiltPage,
  type RunRefusal,
  runRefusalCard,
  runStartedCard,
  type UiApprovalRefusal,
  uiApprovalRefusalCard,
} from "./server";
export { type StatusEntry, statusCard } from "./status";
export {
  type AutoApproved,
  autoApprovedLead,
  inScopeLead,
  type ScopeAddRefusal,
  scopeAddRefusalCard,
  type TaskDoneRefusal,
  taskDoneCard,
  taskDoneRefusalCard,
} from "./task";
export { slowTestLines, slowTestMessage } from "./test-time";
export {
  approveTestsQuestion,
  type TestsRefusal,
  testsApprovedLine,
  testsLockedLead,
  testsRefusedCard,
  testsSubmittedCard,
  unlockRefusedCard,
} from "./testing";
export { effortLabel, effortLine, runNext, translator, verifyingNote } from "./text";
export { invalidPortCard, uiOpenedCard, uiStoppedCard } from "./ui";
export {
  antigravityRuleStaysLine,
  claudePointerStaysLine,
  geminiPointerStaysLine,
  globalGuardStaysLine,
  historyStaysLine,
  nothingRemovedCard,
  nothingToRemoveCard,
  removalChoices,
  removalLine,
  removalNoteTitle,
  removalPlanCard,
  removalQuestion,
  removedCard,
  unwatchedChangeWarning,
} from "./uninstall";
export {
  timedOutLine,
  type UnitsOutcome,
  type UnitTime,
  unitsLines,
  unitsReusedNote,
} from "./units";
export {
  ccusageAddedLine,
  ccusageFailedWarning,
  ccusageHint,
  ccusageQuestion,
  freshSessionLine,
  usageLine,
} from "./usage";
export type {
  CardContext,
  ChangeView,
  CoverageView,
  CriterionView,
  IntegrationView,
  NoteView,
  RejectedView,
  ScopeRequestView,
  SliceView,
  TaskView,
} from "./view";
export { waitTimeoutCard } from "./wait";
export {
  type WhyCommit,
  type WhyRefusal,
  type WhyView,
  whyCard,
  whyRefusalCard,
} from "./why";
export { NOTE_MAX } from "./work";
