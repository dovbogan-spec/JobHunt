import { useEffect, useRef, useState } from "react";
import { ensureRichHtml } from "../utils/richText";
import { RichTextToolbar, type RichCommand } from "./RichTextToolbar";

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
    const commandStates: RichCommand[] = [
      "bold",
      "italic",
      "underline",
      "justifyLeft",
      "justifyCenter",
      "justifyRight",
      "insertOrderedList",
      "insertUnorderedList",
    ];

    commandStates.forEach((command) => {
      if (document.queryCommandState(command)) {
        nextActive.add(command);
      }
    });

    const targetElement = anchorNode.nodeType === Node.ELEMENT_NODE ? (anchorNode as Element) : anchorNode.parentElement;
    if (targetElement?.closest("a")) {
      nextActive.add("createLink");
    }

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
      <RichTextToolbar activeCommands={activeCommands} onCommand={dispatchCommand} />
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
