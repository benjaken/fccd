import { useId, useRef, useState, type DragEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Upload } from "lucide-react";

const defaultAccept = ".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf";

type FileDropFieldProps = {
  label: ReactNode;
  file: File | null;
  onFile: (file: File | null) => void;
  accept?: string;
  required?: boolean;
  hint?: ReactNode;
  className?: string;
  maxSize?: number;
};

function isAccepted(file: File, accept: string, maxSize: number) {
  const entries = accept.split(",").map(value => value.trim().toLowerCase()).filter(Boolean);
  const extensions = entries.filter(value => value.startsWith("."));
  const types = entries.filter(value => !value.startsWith("."));
  const name = file.name.toLowerCase();
  const matches = extensions.some(extension => name.endsWith(extension)) || (file.type ? types.includes(file.type.toLowerCase()) : false);
  return matches && file.size <= maxSize;
}

export function FileDropField({ label, file, onFile, accept = defaultAccept, required, hint, className, maxSize = 10 * 1024 * 1024 }: FileDropFieldProps) {
  const { t } = useTranslation();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [rejected, setRejected] = useState(false);

  function commit(next: File | null) {
    const accepted = next && isAccepted(next, accept, maxSize) ? next : null;
    setRejected(Boolean(next) && !accepted);
    const input = inputRef.current;
    if (input && typeof DataTransfer !== "undefined") {
      const transfer = new DataTransfer();
      if (accepted) transfer.items.add(accepted);
      input.files = transfer.files;
    }
    onFile(accepted);
  }

  function allowDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setOver(true);
  }

  return (
    <div className={className ? `portal-file-drop ${className}` : "portal-file-drop"}>
      <label className="portal-file-drop-label" htmlFor={inputId}>{label}</label>
      <div
        className={over ? "portal-file-drop-target is-over" : "portal-file-drop-target"}
        data-rejected={rejected ? "" : undefined}
        onDragEnter={allowDrop}
        onDragOver={allowDrop}
        onDragLeave={(event) => {
          event.preventDefault();
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          setOver(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          commit(event.dataTransfer.files?.[0] ?? null);
        }}
      >
        <span className="portal-file-drop-icon" aria-hidden="true"><Upload size={20} /></span>
        <strong>{file ? file.name : t("portal.fileDropChoose")}</strong>
        <small>{rejected ? t("portal.fileRejected") : hint ?? t("portal.fileDropHint")}</small>
        <input
          id={inputId}
          ref={inputRef}
          className="portal-file-drop-input"
          type="file"
          accept={accept}
          required={required}
          onChange={(event) => commit(event.target.files?.[0] ?? null)}
        />
      </div>
    </div>
  );
}
