import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  Columns3,
  Copy,
  EllipsisVertical,
  ExternalLink,
  FileCode,
  FileInput,
  FileOutput,
  FolderTree,
  Grid2x2,
  Grip,
  GripVertical,
  Inbox,
  Leaf,
  Lightbulb,
  List,
  LoaderCircle,
  type LucideIcon,
  Minus,
  Paperclip,
  Pencil,
  Pin,
  Plus,
  RefreshCw,
  RotateCw,
  Rows3,
  Save,
  Search,
  Settings,
  Trash2,
  TriangleAlert,
  Unlink,
  WandSparkles,
  X,
} from "lucide-react";

const ICONS = {
  "arrow-down": ArrowDown,
  "arrow-left": ArrowLeft,
  "arrow-up": ArrowUp,
  book: BookOpen,
  canvas: Grid2x2,
  cards: Grip,
  check: Check,
  "chevron-down": ChevronDown,
  "chevron-left": ChevronLeft,
  close: X,
  copy: Copy,
  "drag-handle": GripVertical,
  edit: Pencil,
  export: FileOutput,
  "external-link": ExternalLink,
  "file-code": FileCode,
  "folder-tree": FolderTree,
  import: FileInput,
  inbox: Inbox,
  kanban: Columns3,
  leaf: Leaf,
  lightbulb: Lightbulb,
  list: List,
  "list-rows": Rows3,
  menu: EllipsisVertical,
  minus: Minus,
  paperclip: Paperclip,
  pin: Pin,
  plus: Plus,
  rebuild: RefreshCw,
  refresh: RotateCw,
  save: Save,
  search: Search,
  settings: Settings,
  spinner: LoaderCircle,
  trash: Trash2,
  unlink: Unlink,
  wand: WandSparkles,
  warning: TriangleAlert,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

interface IconProps {
  name: IconName;
  className?: string;
}

/** Decorative inline SVG icon sized by the surrounding font size (`text-*` classes). */
export function Icon({ name, className }: IconProps) {
  const Component = ICONS[name];
  return (
    <Component
      aria-hidden
      focusable={false}
      size="1em"
      strokeWidth={2.25}
      className={className ? `tb-icon ${className}` : "tb-icon"}
    />
  );
}
