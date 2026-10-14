import { useEffect, useRef } from "react";
import { Bold, Italic, Underline, List, ListOrdered } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { richTextHtml, sanitizeRichHtml } from "@/lib/rich-text";

export function RichTextEditor({ value, onChange, label, disabled = false }: {
  value: string; onChange: (value: string) => void; label: string; disabled?: boolean;
}) {
  const { t } = useTranslation();
  const editor = useRef<HTMLDivElement>(null);
  const emitted = useRef<string | null>(null);
  useEffect(() => {
    if (editor.current && value !== emitted.current) editor.current.innerHTML = richTextHtml(value);
  }, [value]);
  const publish = () => {
    if (!editor.current) return;
    const cleaned = sanitizeRichHtml(editor.current.innerHTML);
    const next = /^\s*</.test(cleaned) ? cleaned : `<div>${cleaned}</div>`;
    emitted.current = next;
    onChange(next);
  };
  const controls = [
    { command: "bold", key: "bold", Icon: Bold },
    { command: "italic", key: "italic", Icon: Italic },
    { command: "underline", key: "underline", Icon: Underline },
    { command: "insertUnorderedList", key: "bulletList", Icon: List },
    { command: "insertOrderedList", key: "numberedList", Icon: ListOrdered },
  ];
  return <div className="rich-text-editor">
    <div className="rich-text-toolbar" role="toolbar" aria-label={t("richText.formatting")}>
      {controls.map(({ command, key, Icon }) => <Button key={command} type="button" variant="ghost" size="icon" disabled={disabled} aria-label={t(`richText.${key}`)} title={t(`richText.${key}`)} onMouseDown={event => event.preventDefault()} onClick={() => {
        editor.current?.focus();
        document.execCommand(command);
        publish();
      }}><Icon /></Button>)}
    </div>
    <div ref={editor} className="rich-text-content" role="textbox" aria-label={label} aria-multiline="true" aria-disabled={disabled} contentEditable={!disabled} suppressContentEditableWarning onInput={publish}
      onPaste={event => {
        event.preventDefault();
        document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
        publish();
      }} />
  </div>;
}
