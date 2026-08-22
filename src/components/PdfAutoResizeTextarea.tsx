import { useLayoutEffect, useRef, type ComponentProps } from "react";

function fitTextarea(element: HTMLTextAreaElement) {
  element.style.height = "auto";
  element.style.height = `${element.scrollHeight}px`;
}

export function PdfAutoResizeTextarea({ className, onInput, style, ...props }: ComponentProps<"textarea">) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    fitTextarea(element);

    const resize = () => fitTextarea(element);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [props.value]);

  return (
    <textarea
      {...props}
      ref={textareaRef}
      className={["pdf-auto-resize-textarea", className].filter(Boolean).join(" ")}
      rows={props.rows ?? 2}
      style={{ ...style, overflowY: "hidden" }}
      onInput={(event) => {
        fitTextarea(event.currentTarget);
        onInput?.(event);
      }}
    />
  );
}
