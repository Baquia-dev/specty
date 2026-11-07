// SPDX-License-Identifier: Apache-2.0
// Core's light entry (`@baquia-dev/specty-core/light`): what the UI's main thread uses, without
// the parser, zod or yaml. Importing the index there would pull them into the page's first load
// as soon as a lazy chunk uses the parser; the worker and the lazy chunks use the index.

export { AGENT_NAMES } from "./agents";
export { optionName, sectionName, settingText } from "./cards/settings";
export { flowSentences, pieceText } from "./cards/settings-pieces";
export { translator } from "./cards/text";
export { usageOf, usageWords } from "./cards/usage";
export { PHASES, type Phase } from "./flow/phases";
export { fold, LANGS, type Lang } from "./i18n";
export { CHANGE_SORTS, type ChangeSort, matchesQuery, sortChanges } from "./listing";
export type { SessionView } from "./memory/sessions";
export { localDay, sessionEntries } from "./memory/triggers";
export {
  type ConfigEdit,
  SETTING_SECTIONS,
  SETTINGS,
  type Setting,
  type SettingChange,
  type SettingSection,
  settingChanges,
  settingOf,
} from "./settings/catalog";
export {
  FLOW_PHASES,
  type FlowPhase,
  flowPhases,
  isEquipped,
  PIECES,
  type Piece,
  pieceEdits,
  type SettingValue,
} from "./settings/pieces";
