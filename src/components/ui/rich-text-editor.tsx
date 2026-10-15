import { useEffect, useState, type ReactNode } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import { AlignCenter, AlignLeft, AlignRight, Bold, Heading2, Heading3, Italic, Link2, List, ListOrdered, Minus, Quote, Redo2, Strikethrough, Underline, Undo2, Unlink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { richTextHtml, safeHref, sanitizeRichHtml } from "@/lib/rich-text";
import "./rich-content.css";
import "@/lib/rich-text-import-i18n";

function storedHtml(value: string) {
  const cleaned = sanitizeRichHtml(value).trim();
  return cleaned === "<p></p>" || cleaned === "<p><br></p>" ? "" : cleaned;
}

export function RichTextEditor({ value, onChange, label, disabled = false }: {
  value: string; onChange: (value: string) => void; label: string; disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [htmlSource, setHtmlSource] = useState("");
  const [, setRevision] = useState(0);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        code: false,
        codeBlock: false,
        link: { openOnClick: false, HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" } },
      }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder: t("richText.placeholder") }),
    ],
    content: richTextHtml(value) || "",
    editable: !disabled,
    editorProps: { attributes: { role: "textbox", "aria-label": label, "aria-multiline": "true" } },
    onTransaction: () => setRevision(revision => revision + 1),
    onUpdate: ({ editor: current }) => onChange(storedHtml(current.getHTML())),
  });
  useEffect(() => { editor?.setEditable(!disabled); }, [disabled, editor]);
  useEffect(() => {
    if (!editor) return;
    const next = richTextHtml(value);
    if (storedHtml(editor.getHTML()) === storedHtml(next)) return;
    editor.commands.setContent(next || "", { emitUpdate: false });
  }, [editor, value]);
  const applyLink = () => {
    if (!editor) return;
    const trimmed = linkUrl.trim();
    const href = safeHref(trimmed);
    if (trimmed && !href) return;
    if (!href) editor.chain().focus().extendMarkRange("link").unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    setLinkOpen(false);
  };
  return <div className="rich-text-editor">
    <div className="rich-text-toolbar" role="toolbar" aria-label={t("richText.formatting")}>
      <Button type="button" variant="ghost" disabled={disabled || !editor} aria-expanded={importOpen} onClick={() => { setHtmlSource(""); setImportOpen(open => !open); }}>{t("richTextImport.open")}</Button>
      <Tool editor={editor} label={t("richText.undo")} disabled={disabled || !editor?.can().undo()} onClick={() => editor?.chain().focus().undo().run()}><Undo2 /></Tool>
      <Tool editor={editor} label={t("richText.redo")} disabled={disabled || !editor?.can().redo()} onClick={() => editor?.chain().focus().redo().run()}><Redo2 /></Tool>
      <span className="rich-text-sep" />
      <Tool editor={editor} label={t("richText.heading")} pressed={editor?.isActive("heading", { level: 2 })} disabled={disabled} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 /></Tool>
      <Tool editor={editor} label={t("richText.subheading")} pressed={editor?.isActive("heading", { level: 3 })} disabled={disabled} onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 /></Tool>
      <span className="rich-text-sep" />
      <Tool editor={editor} label={t("richText.bold")} pressed={editor?.isActive("bold")} disabled={disabled} onClick={() => editor?.chain().focus().toggleBold().run()}><Bold /></Tool>
      <Tool editor={editor} label={t("richText.italic")} pressed={editor?.isActive("italic")} disabled={disabled} onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic /></Tool>
      <Tool editor={editor} label={t("richText.underline")} pressed={editor?.isActive("underline")} disabled={disabled} onClick={() => editor?.chain().focus().toggleUnderline().run()}><Underline /></Tool>
      <Tool editor={editor} label={t("richText.strike")} pressed={editor?.isActive("strike")} disabled={disabled} onClick={() => editor?.chain().focus().toggleStrike().run()}><Strikethrough /></Tool>
      <span className="rich-text-sep" />
      <Tool editor={editor} label={t("richText.bulletList")} pressed={editor?.isActive("bulletList")} disabled={disabled} onClick={() => editor?.chain().focus().toggleBulletList().run()}><List /></Tool>
      <Tool editor={editor} label={t("richText.numberedList")} pressed={editor?.isActive("orderedList")} disabled={disabled} onClick={() => editor?.chain().focus().toggleOrderedList().run()}><ListOrdered /></Tool>
      <Tool editor={editor} label={t("richText.quote")} pressed={editor?.isActive("blockquote")} disabled={disabled} onClick={() => editor?.chain().focus().toggleBlockquote().run()}><Quote /></Tool>
      <Tool editor={editor} label={t("richText.rule")} disabled={disabled} onClick={() => editor?.chain().focus().setHorizontalRule().run()}><Minus /></Tool>
      <span className="rich-text-sep" />
      <Tool editor={editor} label={t("richText.alignLeft")} pressed={editor?.isActive({ textAlign: "left" })} disabled={disabled} onClick={() => editor?.chain().focus().setTextAlign("left").run()}><AlignLeft /></Tool>
      <Tool editor={editor} label={t("richText.alignCenter")} pressed={editor?.isActive({ textAlign: "center" })} disabled={disabled} onClick={() => editor?.chain().focus().setTextAlign("center").run()}><AlignCenter /></Tool>
      <Tool editor={editor} label={t("richText.alignRight")} pressed={editor?.isActive({ textAlign: "right" })} disabled={disabled} onClick={() => editor?.chain().focus().setTextAlign("right").run()}><AlignRight /></Tool>
      <span className="rich-text-sep" />
      <Tool editor={editor} label={t("richText.link")} pressed={linkOpen || editor?.isActive("link")} disabled={disabled} onClick={() => { setLinkUrl(String(editor?.getAttributes("link").href ?? "")); setLinkOpen(open => !open); }}><Link2 /></Tool>
      <Tool editor={editor} label={t("richText.unlink")} disabled={disabled || !editor?.isActive("link")} onClick={() => editor?.chain().focus().unsetLink().run()}><Unlink /></Tool>
    </div>
    {linkOpen ? <form className="rich-text-link-row" onSubmit={event => { event.preventDefault(); applyLink(); }}>
      <input aria-label={t("richText.linkUrl")} value={linkUrl} placeholder="https://" onChange={event => setLinkUrl(event.target.value)} />
      <Button type="submit" size="sm">{t("richText.applyLink")}</Button>
    </form> : null}
    {importOpen ? <div className="rich-text-import">
      <label>{t("richTextImport.source")}<textarea value={htmlSource} onChange={event => setHtmlSource(event.target.value)} placeholder={t("richTextImport.sourcePlaceholder")} disabled={disabled} rows={8} /></label>
      <p>{t("richTextImport.hint")}</p>
      <div><Button type="button" disabled={disabled || !editor || !htmlSource.trim()} onClick={() => {
        if (!editor || disabled) return;
        editor.commands.selectAll();
        editor.commands.insertContent(sanitizeRichHtml(htmlSource));
        setImportOpen(false); setHtmlSource("");
      }}>{t("richTextImport.apply")}</Button><Button type="button" variant="outline" disabled={disabled} onClick={() => setImportOpen(false)}>{t("richTextImport.cancel")}</Button></div>
    </div> : null}
    <EditorContent editor={editor} className="rich-text-content fccd-rich-content" />
  </div>;
}

function Tool({ editor, label, pressed, disabled, onClick, children }: {
  editor: Editor | null; label: string; pressed?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode;
}) {
  return <Button type="button" variant="ghost" size="icon" aria-label={label} title={label} aria-pressed={pressed} disabled={!editor || disabled} className={pressed ? "is-active" : undefined} onMouseDown={event => event.preventDefault()} onClick={onClick}>{children}</Button>;
}
