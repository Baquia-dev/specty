// SPDX-License-Identifier: Apache-2.0
// The cards: every text the agent and the person see, as each command prints it.

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
  type AuditTask,
  type AuditView,
  auditReport,
} from "./audit";
export {
  decisionPostponedCard,
  noSuchChangeCard,
  nothingWaitsCard,
  otherFolderNote,
  whichChangeQuestion,
} from "./decide";
export { epicCard, sliceLines } from "./epic";
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
export { type BlockedCommitView, blockedCommitMessage } from "./hooks";
export {
  cancelledCard,
  closedCard,
  decisionCard,
  delegationCard,
  delegationWarning,
  nothingPendingCard,
  notInteractiveCard,
  type StatusEntry,
  statusCard,
} from "./human";
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
  type Asker,
  checkStatus,
  noActiveChangeCard,
  nothingChangedCard,
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
  reviewedCard,
  specReviewPrompt,
} from "./review";
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
export { effortLabel, effortLine, runNext, translator } from "./text";
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
export { type WhyCommit, type WhyView, whyCard } from "./why";
export { assertionWarnings, NOTE_MAX, riskWarnings } from "./work";
