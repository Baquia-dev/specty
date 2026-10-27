// SPDX-License-Identifier: Apache-2.0
// The cards: every text the agent and the person see, as each command prints it.

export {
  acceptAnywayQuestion,
  acceptanceSummary,
  acceptedLine,
  acceptQuestion,
  delegatedFailureCard,
  quickClosedLine,
  quickClosing,
  runVerificationQuestion,
  verificationNoteTitle,
  verificationReusedNote,
} from "./accept";
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
export {
  type AuditEvent,
  type AuditRefusal,
  type AuditTask,
  type AuditView,
  auditRefusalCard,
  auditReport,
} from "./audit";
export {
  alreadyClosedLine,
  cancelCommitSubject,
  cancelledLine,
  cancelQuestion,
  cancelReasonQuestion,
  closeCommitSubject,
  closedLine,
  confirmCloseQuestion,
  landQuestion,
  resolvedIntegrationNote,
  verifyHintLine,
} from "./close";
export {
  decisionPostponedCard,
  noSuchChangeCard,
  nothingWaitsCard,
  otherFolderNote,
  whichChangeQuestion,
} from "./decide";
export { type DoctorLine, doctorCard, doctorLine } from "./doctor";
export { enteredCard, noFolderCard } from "./enter";
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
  type StatusEntry,
  statusCard,
} from "./human";
export {
  agentsMdLine,
  backupLine,
  configLine,
  dryRunCard,
  type InitRefusal,
  type InitView,
  initCard,
  initRefusalCard,
  languageChoices,
  languageLine,
  languageQuestion,
  newProjectNext,
  noTestCommandWarning,
  productLine,
} from "./init";
export {
  antigravityTrustWarning,
  changeInProgressWarning,
  claudePermissionsLine,
  claudePointerLine,
  codexGuardLine,
  codexRulesLine,
  codexSandboxKeptWarning,
  codexSandboxLine,
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
  geminiWorkspaceLine,
  geminiWorkspaceVersionedWarning,
  gitHooksLine,
  gitHooksManualWarning,
  guardLine,
  installCommitLine,
  installCommitSubject,
  noHooksWarning,
  notOnPathWarning,
  opencodeGuardLine,
  opencodeWorktreesLine,
  opencodeWorktreesVersionedWarning,
  yoursUncommittedWarning,
} from "./install";
export {
  absorbedLine,
  commandFailsLine,
  holderDirtyLine,
  holderDirtyNext,
  incorporationTitle,
  integrateRetry,
  integrationResolvedLine,
  type MergeVerification,
  markersLeftLine,
  mergeAbortedLine,
  mergeByHandNext,
  mergedVerifyFailsLine,
  mergeFailedLine,
  mergingLabel,
  noIncorporationCard,
  notYetLine,
  outsideIncorporationLine,
  resolveIncorporationNext,
  runAgainNext,
  stillResolvingLine,
  targetConflictsLine,
  undoOutsideNext,
} from "./integration";
export {
  backOnTargetLine,
  folderRemovedLine,
  folderStaysLine,
  landedLine,
  leaveFolderNext,
  notLandedLine,
  retryLandingNext,
  targetAheadLine,
} from "./land";
export { longFileCard, longFileWarnings, splitAdvice } from "./lines";
export {
  changeCreatedLead,
  type NewRefusal,
  newRefusalCard,
  type WorktreeCreated,
  worktreeCreatedCard,
} from "./new";
export { type NextView, nextCard, notInitializedCard, taskCard } from "./next";
export {
  notInTargetBranchLine,
  notInTargetFolderLine,
  preparingNote,
  pruneCard,
  sharedLine,
  sharedTitle,
  workingFolderLine,
} from "./parallel";
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
  type RetroRefusal,
  retroDoneCard,
  retroReasonQuestion,
  retroRefusalCard,
  retroTitle,
} from "./retro";
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
  assumptionDecidedLine,
  changesRequestedLine,
  commentSavedLine,
  emptyCommentCard,
  noAssumptionCard,
  nothingToRequestCard,
} from "./review-ui";
export {
  notBuiltPage,
  type RunRefusal,
  runRefusalCard,
  runStartedCard,
  type UiApprovalRefusal,
  uiApprovalRefusalCard,
} from "./server";
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
export { effortLabel, effortLine, runNext, translator, verifyingNote } from "./text";
export { invalidPortCard, uiOpenedCard, uiStoppedCard } from "./ui";
export {
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
export type {
  CardContext,
  ChangeView,
  CriterionView,
  IntegrationView,
  RejectedView,
  ScopeRequestView,
  SliceView,
  TaskView,
} from "./view";
export {
  type WhyCommit,
  type WhyRefusal,
  type WhyView,
  whyCard,
  whyRefusalCard,
} from "./why";
export { assertionWarnings, NOTE_MAX, riskWarnings } from "./work";
