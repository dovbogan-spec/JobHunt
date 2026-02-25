import { useEffect, useMemo, useRef, useState } from "react";
import { ensureRichHtml } from "../utils/richText";

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
  label: string;
  title: string;
};

type ToolbarProps = {
  actions: ToolbarAction[];
  activeCommands: Set<RichCommand>;
  onCommand: (command: RichCommand) => void;
};

function EditorToolbar({ actions, activeCommands, onCommand }: ToolbarProps) {
  return (
    <div className="editor-toolbar-strip">
      {actions.map((action) => {
        const isActive = activeCommands.has(action.command);
        return (
          <button
            key={action.command}
            type="button"
            title={action.title}
            className={isActive ? "is-active" : ""}
            aria-pressed={isActive}
            onMouseDown={(event) => {
              event.preventDefault();
            }}
            onClick={() => onCommand(action.command)}
          >
            {action.label === "B" ? <strong>{action.label}</strong> : action.label === "I" ? <em>{action.label}</em> : action.label === "U" ? <u>{action.label}</u> : action.label}
          </button>
        );
      })}
    </div>
  );
}

type RichTextEditorProps = {
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
};

export function RichTextEditor({
  value,
  onCommit,
  placeholder = "Write your profile…",
  debounceMs = 350,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const debounceRef = useRef<number | null>(null);
  const localValueRef = useRef<string>(ensureRichHtml(value || ""));
  const selectionRangeRef = useRef<Range | null>(null);
  const [activeCommands, setActiveCommands] = useState<Set<RichCommand>>(new Set());

  const toolbar = useMemo<ToolbarAction[]>(
    () => [
      { command: "bold", label: "B", title: "Bold" },
      { command: "italic", label: "I", title: "Italic" },
      { command: "underline", label: "U", title: "Underline" },
      { command: "justifyLeft", label: "⬛", title: "Align left" },
      { command: "justifyCenter", label: "≡", title: "Align center" },
      { command: "justifyRight", label: "⬜", title: "Align right" },
      { command: "insertUnorderedList", label: "• List", title: "Bulleted list" },
      { command: "insertOrderedList", label: "1. List", title: "Numbered list" },
      { command: "createLink", label: "🔗", title: "Insert link" },
    ],
    [],
  );

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const nextValue = ensureRichHtml(value || "");
    if (document.activeElement === editor) return;
    if (nextValue === localValueRef.current && editor.innerHTML === nextValue) return;
    localValueRef.current = nextValue;
    editor.innerHTML = localValueRef.current;
  }, [value]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, []);

  function commit(nextValue: string) {
    if (nextValue === ensureRichHtml(value || "")) return;
    onCommit(nextValue);
  }

  function scheduleCommit(nextValue: string) {
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }
    debounceRef.current = window.setTimeout(() => commit(nextValue), debounceMs);
  }

  function refreshFromDom() {
    const editor = editorRef.current;
    if (!editor) return "";
    const html = editor.innerHTML;
    localValueRef.current = html;
    return html;
  }

  function syncActiveCommands() {
    const selection = document.getSelection();
    const editor = editorRef.current;
    if (!selection || !editor || !selection.rangeCount) {
      setActiveCommands(new Set());
      return;
    }

    const anchorNode = selection.anchorNode;
    if (!anchorNode || !editor.contains(anchorNode)) {
      setActiveCommands(new Set());
      return;
    }

    selectionRangeRef.current = selection.getRangeAt(0).cloneRange();
    const nextActive = new Set<RichCommand>();
    const commandStates: RichCommand[] = ["bold", "italic", "underline", "insertOrderedList", "insertUnorderedList"];
    commandStates.forEach((command) => {
      if (document.queryCommandState(command)) {
        nextActive.add(command);
      }
    });
    setActiveCommands(nextActive);
  }

  function focusActiveEditor() {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const selection = document.getSelection();
    if (!selection) return;
    if (selectionRangeRef.current) {
      selection.removeAllRanges();
      selection.addRange(selectionRangeRef.current);
    }
  }

  function dispatchCommand(command: RichCommand) {
    focusActiveEditor();

    if (command === "createLink") {
      const url = window.prompt("Enter link URL", "https://");
      if (!url) return;
      document.execCommand("createLink", false, url);
      scheduleCommit(refreshFromDom());
      syncActiveCommands();
      return;
    }

    document.execCommand(command, false);
    scheduleCommit(refreshFromDom());
    syncActiveCommands();
  }

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const handleSelectionChange = () => syncActiveCommands();
    const handleEditorInput = () => syncActiveCommands();

    document.addEventListener("selectionchange", handleSelectionChange);
    editor.addEventListener("keyup", handleEditorInput);
    editor.addEventListener("mouseup", handleEditorInput);
    editor.addEventListener("focus", handleEditorInput);

    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
      editor.removeEventListener("keyup", handleEditorInput);
      editor.removeEventListener("mouseup", handleEditorInput);
      editor.removeEventListener("focus", handleEditorInput);
    };
  }, []);

  return (
    <>
      <EditorToolbar actions={toolbar} activeCommands={activeCommands} onCommand={dispatchCommand} />
      <div
        ref={editorRef}
        className="rich-editor-surface"
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={() => {
          scheduleCommit(refreshFromDom());
          syncActiveCommands();
        }}
        onBlur={() => {
          if (debounceRef.current) {
            window.clearTimeout(debounceRef.current);
          }
          commit(refreshFromDom());
          syncActiveCommands();
        }}
      />
    </>
  );
}
