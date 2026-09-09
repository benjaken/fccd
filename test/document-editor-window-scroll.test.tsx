import { act, render } from "@testing-library/react";
import { useRef, type ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { useDocumentEditorWindowScroll } from "@/lib/document-editor-window-scroll";

function markScrollable(node: HTMLElement | null, scrollHeight = 3000, clientHeight = 800) {
  if (!node) return;
  Object.defineProperties(node, {
    scrollHeight: { configurable: true, get: () => scrollHeight },
    clientHeight: { configurable: true, get: () => clientHeight },
    scrollWidth: { configurable: true, get: () => 800 },
    clientWidth: { configurable: true, get: () => 800 },
  });
}

function ScrollUnlockProbe({ children }: { children?: ReactNode }) {
  const ref = useRef<HTMLElement | null>(null);
  useDocumentEditorWindowScroll(ref);
  return (
    <section
      ref={(node) => {
        ref.current = node;
        markScrollable(node);
      }}
      className="quote-pdf-editor"
    >
      {children ?? "probe"}
    </section>
  );
}

describe("document editor window scroll", () => {
  it("does not lock html overflow so print can still emit a full A4 page", () => {
    const root = document.createElement("div");
    root.id = "root";
    document.body.append(root);

    const { unmount } = render(<ScrollUnlockProbe />, { container: root });

    expect(document.documentElement.style.getPropertyValue("overflow")).toBe("");
    expect(document.documentElement.style.getPropertyValue("height")).toBe("");
    expect(document.body.style.getPropertyValue("overflow")).toBe("");
    expect(root.style.getPropertyValue("overflow")).toBe("");
    expect((root.querySelector(".quote-pdf-editor") as HTMLElement).style.getPropertyValue("position")).toBe("");

    unmount();
    root.remove();
  });

  it("scrolls the editor on wheel without a prior click", async () => {
    const root = document.createElement("div");
    root.id = "root";
    document.body.append(root);

    const { unmount } = render(<ScrollUnlockProbe />, { container: root });
    const editor = root.querySelector(".quote-pdf-editor") as HTMLElement;
    const event = new WheelEvent("wheel", { deltaY: 80, bubbles: true, cancelable: true });

    await act(async () => {
      editor.dispatchEvent(event);
    });

    expect(editor.scrollTop).toBe(80);
    expect(event.defaultPrevented).toBe(true);

    unmount();
    root.remove();
  });

  it("scrolls the editor when wheel targets an A4 sheet", async () => {
    const root = document.createElement("div");
    root.id = "root";
    document.body.append(root);

    const { unmount } = render(
      <ScrollUnlockProbe>
        <main className="quote-pdf-sheet">sheet</main>
      </ScrollUnlockProbe>,
      { container: root },
    );
    const editor = root.querySelector(".quote-pdf-editor") as HTMLElement;
    const sheet = root.querySelector(".quote-pdf-sheet") as HTMLElement;
    const event = new WheelEvent("wheel", { deltaY: 120, bubbles: true, cancelable: true });

    await act(async () => {
      sheet.dispatchEvent(event);
    });

    expect(editor.scrollTop).toBe(120);
    expect(event.defaultPrevented).toBe(true);

    unmount();
    root.remove();
  });
});
