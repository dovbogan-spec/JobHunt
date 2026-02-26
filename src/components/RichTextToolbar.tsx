import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  Link,
  List,
  ListOrdered,
  Underline,
} from "lucide-react";

type RichCommand =
  | "bold"
  | "italic"
  | "underline"
  | "justifyLeft"
  | "justifyCenter"
  | "justifyRight"
  | "insertUnorderedList"
  | "insertOrderedList"
  | "createLink";

type ToolbarAction = {
  command: RichCommand;
  icon: typeof Bold;
  title: string;
};

type RichTextToolbarProps = {
  activeCommands: Set<RichCommand>;
  onCommand: (command: RichCommand) => void;
};

const TOOLBAR_ACTIONS: ToolbarAction[] = [
  { command: "bold", icon: Bold, title: "Bold" },
  { command: "italic", icon: Italic, title: "Italic" },
  { command: "underline", icon: Underline, title: "Underline" },
  { command: "justifyLeft", icon: AlignLeft, title: "Align left" },
  { command: "justifyCenter", icon: AlignCenter, title: "Align center" },
  { command: "justifyRight", icon: AlignRight, title: "Align right" },
  { command: "insertUnorderedList", icon: List, title: "Bulleted list" },
  { command: "insertOrderedList", icon: ListOrdered, title: "Numbered list" },
  { command: "createLink", icon: Link, title: "Insert link" },
];

export function RichTextToolbar({ activeCommands, onCommand }: RichTextToolbarProps) {
  return (
    <div className="editor-toolbar-strip" role="toolbar" aria-label="Rich text formatting toolbar">
      {TOOLBAR_ACTIONS.map((action) => {
        const isActive = activeCommands.has(action.command);
        const Icon = action.icon;

        return (
          <button
            key={action.command}
            type="button"
            title={action.title}
            aria-label={action.title}
            aria-pressed={isActive}
            className={`toolbar-command-button${isActive ? " is-active" : ""}`}
            onMouseDown={(event) => {
              event.preventDefault();
            }}
            onClick={() => onCommand(action.command)}
          >
            <Icon size={16} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

export type { RichCommand };
