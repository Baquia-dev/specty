// SPDX-License-Identifier: Apache-2.0
// Core's light entry (`@baquia-dev/specty-core/light`): what the UI's main thread uses, without
// the parser, zod or yaml. Importing the index there would pull them into the page's first load
// as soon as a lazy chunk uses the parser; the worker and the lazy chunks use the index.

export { translator } from "./cards/text";
export { PHASES, type Phase } from "./flow/phases";
export { fold, LANGS, type Lang } from "./i18n";
