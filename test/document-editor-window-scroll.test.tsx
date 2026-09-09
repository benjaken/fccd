import { act, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useDocumentEditorWindowScroll } from "@/lib/document-editor-window-scroll";

function ScrollUnlockProbe() {
  useDocumentEditorWindowScroll();
  return (
    <section className="quote-pdf-editor">
      <main className="quote-pdf-sheet">sheet</main>
    </section>
  );
}

describe("document editor window scroll", () => {
  it("does not lock html overflow so print can emit every A4 page", () => {
    const root = document.createElement("div");
    root.id = "root";
    document.body.append(root);

    const { unmount } = render(<ScrollUnlockProbe />, { container: root });

    expect(document.documentElement.style.getPropertyValue("overflow")).toBe("");
    expect(document.documentElement.style.getPropertyValue("height")).toBe("");
    expect(document.body.style.getPropertyValue("overflow")).toBe("");
    expect(root.style.getPropertyValue("overflow")).toBe("");

    unmount();
    root.remove();
  });

  it("scrolls the window when wheel targets an A4 sheet", async () => {
    const root = document.createElement("div");
    root.id = "root";
    document.body.append(root);
    const scroller = { scrollTop: 0, scrollLeft: 0, scrollHeight: 3000, clientHeight: 800, scrollWidth: 800, clientWidth: 800 };
    Object.defineProperty(document, "scrollingElement", {
      configurable: true,
      get: () => scroller,
    });

    const { unmount } = render(<ScrollUnlockProbe />, { container: root });
    const sheet = root.querySelector(".quote-pdf-sheet") as HTMLElement;
    const event = new WheelEvent("wheel", { deltaY: 120, bubbles: true, cancelable: true });

    await act(async () => {
      sheet.dispatchEvent(event);
    });

    expect(scroller.scrollTop).toBe(120);
    expect(event.defaultPrevented).toBe(true);

    unmount();
    root.remove();
    Object.defineProperty(document, "scrollingElement", {
      configurable: true,
      value: document.documentElement,
    });
  });
});
