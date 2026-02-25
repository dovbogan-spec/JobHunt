import { useEffect, useMemo, useRef } from "react";

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
  const localValueRef = useRef<string>(value || "");

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

  const formats = useMemo(
    () => ["bold", "italic", "underline", "list", "align", "link"],
    [],
  );

  const editorConfig = useMemo(
    () => ({
      toolbar,
      modules: {
        history: {
          delay: debounceMs,
          maxStack: 100,
        },
      },
      extensions: {
        formats,
      },
    }),
    [debounceMs, formats, toolbar],
  );

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (document.activeElement === editor) return;
    if (value === localValueRef.current && editor.innerHTML === value) return;
    localValueRef.current = value || "";
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
    if (nextValue === value) return;
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

  function execute(command: RichCommand) {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();

    if (command === "createLink") {
      const url = window.prompt("Enter link URL", "https://");
      if (!url) return;
      document.execCommand("createLink", false, url);
      scheduleCommit(refreshFromDom());
      return;
    }

    document.execCommand(command, false);
    scheduleCommit(refreshFromDom());
  }

  return (
    <>
      <div className="editor-toolbar-strip">
        {editorConfig.toolbar.map((action) => (
          <button key={action.command} type="button" title={action.title} onClick={() => execute(action.command)}>
            {action.label === "B" ? <strong>{action.label}</strong> : action.label === "I" ? <em>{action.label}</em> : action.label === "U" ? <u>{action.label}</u> : action.label}
          </button>
        ))}
      </div>
      <div
        ref={editorRef}
        className="rich-editor-surface"
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={() => {
          scheduleCommit(refreshFromDom());
        }}
        onBlur={() => {
          if (debounceRef.current) {
            window.clearTimeout(debounceRef.current);
          }
          commit(refreshFromDom());
        }}
      />
    </>
  );
}
