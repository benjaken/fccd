import {
  useLayoutEffect,
  useState,
  type ComponentProps,
  type FocusEvent,
} from "react";

import { PdfAutoResizeTextarea } from "@/components/PdfAutoResizeTextarea";

type BlurCommitProps = {
  value: string;
  onCommit: (value: string) => void;
  onDirty?: () => void;
};

type PdfBlurCommitInputProps = Omit<ComponentProps<"input">, "onChange" | "value"> & BlurCommitProps;

export function PdfBlurCommitInput({
  value,
  onCommit,
  onDirty,
  onBlur,
  onInput,
  size,
  ...props
}: PdfBlurCommitInputProps) {
  const [editingValue, setEditingValue] = useState(value);

  useLayoutEffect(() => {
    setEditingValue(value);
  }, [value]);

  const commit = (event: FocusEvent<HTMLInputElement>) => {
    // Pagination can remount a focused field and restore its live DOM value
    // before React's local editing state catches up. Always commit what the
    // user can currently see in the field.
    if (event.currentTarget.value !== value) onCommit(event.currentTarget.value);
    onBlur?.(event);
  };

  return (
    <input
      {...props}
      value={editingValue}
      size={size == null ? undefined : Math.max(editingValue.length, 1)}
      onChange={(event) => {
        setEditingValue(event.target.value);
        onDirty?.();
      }}
      onInput={(event) => {
        setEditingValue(event.currentTarget.value);
        onInput?.(event);
      }}
      onBlur={commit}
    />
  );
}

type PdfBlurCommitTextareaProps = Omit<ComponentProps<"textarea">, "onChange" | "value"> & BlurCommitProps;

export function PdfBlurCommitTextarea({
  value,
  onCommit,
  onDirty,
  onBlur,
  onInput,
  ...props
}: PdfBlurCommitTextareaProps) {
  const [editingValue, setEditingValue] = useState(value);

  useLayoutEffect(() => {
    setEditingValue(value);
  }, [value]);

  return (
    <PdfAutoResizeTextarea
      {...props}
      value={editingValue}
      onChange={(event) => {
        setEditingValue(event.target.value);
        onDirty?.();
      }}
      onInput={(event) => {
        setEditingValue(event.currentTarget.value);
        onInput?.(event);
      }}
      onBlur={(event) => {
        if (event.currentTarget.value !== value) onCommit(event.currentTarget.value);
        onBlur?.(event);
      }}
    />
  );
}
