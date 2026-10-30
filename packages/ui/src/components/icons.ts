// SPDX-License-Identifier: Apache-2.0
// The UI's icons, as plain data for `LucideDynamicIcon` (`<svg [lucideIcon]="…">`). Each icon of
// `@lucide/angular` is a component that carries its own compiled copy of the same SVG template,
// about 3 KB each; `lucide` gives each drawing as one array, so the bundle keeps only the
// drawings in use. To use a new icon, add it here, with the name it has in Lucide.
import type { LucideIconData } from "@lucide/angular";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  Ban,
  Bot,
  Check,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleDot,
  CircleX,
  Code,
  Component,
  Download,
  Eye,
  FilePlus,
  FileQuestionMark,
  FlaskConical,
  GitCommitHorizontal,
  GitCompareArrows,
  Hourglass,
  type IconNode,
  Inbox,
  Info,
  Layers,
  LayoutGrid,
  LayoutList,
  Lightbulb,
  ListChecks,
  Loader2,
  Lock,
  LockOpen,
  MessageSquare,
  MessageSquarePlus,
  Minus,
  Monitor,
  Moon,
  Palette,
  Pencil,
  PencilLine,
  Play,
  Plus,
  Quote,
  Search,
  SearchX,
  Settings,
  ShieldAlert,
  SlidersHorizontal,
  Sun,
  Trash,
  TriangleAlert,
  Type,
  Wrench,
  X,
} from "lucide";

const icon = (name: string, node: IconNode): LucideIconData => ({ name, node });

export const LucideArchive = icon("archive", Archive);
export const LucideArrowLeft = icon("arrow-left", ArrowLeft);
export const LucideArrowRight = icon("arrow-right", ArrowRight);
export const LucideBan = icon("ban", Ban);
export const LucideBot = icon("bot", Bot);
export const LucideCheck = icon("check", Check);
export const LucideChevronDown = icon("chevron-down", ChevronDown);
export const LucideCircleAlert = icon("circle-alert", CircleAlert);
export const LucideCircleCheck = icon("circle-check", CircleCheck);
export const LucideCircleDashed = icon("circle-dashed", CircleDashed);
export const LucideCircleDot = icon("circle-dot", CircleDot);
export const LucideCircleX = icon("circle-x", CircleX);
export const LucideCode = icon("code", Code);
export const LucideComponent = icon("component", Component);
export const LucideDownload = icon("download", Download);
export const LucideEye = icon("eye", Eye);
export const LucideFilePlus = icon("file-plus", FilePlus);
export const LucideFileQuestion = icon("file-question-mark", FileQuestionMark);
export const LucideFlaskConical = icon("flask-conical", FlaskConical);
export const LucideGitCommitHorizontal = icon("git-commit-horizontal", GitCommitHorizontal);
export const LucideGitCompareArrows = icon("git-compare-arrows", GitCompareArrows);
export const LucideHourglass = icon("hourglass", Hourglass);
export const LucideInbox = icon("inbox", Inbox);
export const LucideInfo = icon("info", Info);
export const LucideLayers = icon("layers", Layers);
export const LucideLayoutGrid = icon("layout-grid", LayoutGrid);
export const LucideLayoutList = icon("layout-list", LayoutList);
export const LucideLightbulb = icon("lightbulb", Lightbulb);
export const LucideListChecks = icon("list-checks", ListChecks);
export const LucideLoader2 = icon("loader-2", Loader2);
export const LucideLock = icon("lock", Lock);
export const LucideLockOpen = icon("lock-open", LockOpen);
export const LucideMessageSquare = icon("message-square", MessageSquare);
export const LucideMessageSquarePlus = icon("message-square-plus", MessageSquarePlus);
export const LucideMinus = icon("minus", Minus);
export const LucideMonitor = icon("monitor", Monitor);
export const LucideMoon = icon("moon", Moon);
export const LucidePalette = icon("palette", Palette);
export const LucidePencil = icon("pencil", Pencil);
export const LucidePencilLine = icon("pencil-line", PencilLine);
export const LucidePlay = icon("play", Play);
export const LucidePlus = icon("plus", Plus);
export const LucideQuote = icon("quote", Quote);
export const LucideSearch = icon("search", Search);
export const LucideSearchX = icon("search-x", SearchX);
export const LucideSettings = icon("settings", Settings);
export const LucideShieldAlert = icon("shield-alert", ShieldAlert);
export const LucideSlidersHorizontal = icon("sliders-horizontal", SlidersHorizontal);
export const LucideSun = icon("sun", Sun);
export const LucideTrash2 = icon("trash", Trash);
export const LucideTriangleAlert = icon("triangle-alert", TriangleAlert);
export const LucideType = icon("type", Type);
export const LucideWrench = icon("wrench", Wrench);
export const LucideX = icon("x", X);
