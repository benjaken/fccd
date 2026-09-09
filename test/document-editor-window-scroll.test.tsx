import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useDocumentEditorWindowScroll } from "@/lib/document-editor-window-scroll";

function ScrollUnlockProbe() {
  useDocumentEditorWindowScroll();
  return <section className="quote-pdf-editor">probe</section>;
}

describe("document editor window scroll", () => {
  it("unlocks html/body so extra PDF sheets can use window scroll", () => {
    const root = document.createElement("div");
    root.id = "root";
    document.body.append(root);

    const { unmount } = render(<ScrollUnlockProbe />, { container: root });

    expect(document.documentElement.style.getPropertyValue("overflow-y")).toBe("scroll");
    expect(document.documentElement.style.getPropertyPriority("overflow-y")).toBe("important");
    expect(document.body.style.getPropertyValue("overflow-y")).toBe("auto");
    expect(root.style.getPropertyValue("overflow")).toBe("");
    expect(root.style.getPropertyValue("overflow-y")).toBe("auto");
    expect(root.style.getPropertyValue("height")).toBe("auto");

    unmount();
    root.remove();

    expect(document.documentElement.style.getPropertyValue("overflow-y")).toBe("");
    expect(document.body.style.getPropertyValue("overflow-y")).toBe("");
  });

  it("scrolls the window when a wheel event is swallowed before click", async () => {
    const root = document.createElement("div");
    root.id = "root";
    document.body.append(root);
    const scroller = { scrollTop: 0, scrollHeight: 3000, clientHeight: 800 };
    Object.defineProperty(document, "scrollingElement", {
      configurable: true,
      get: () => scroller,
    });
    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });

    const { unmount } = render(<ScrollUnlockProbe />, { container: root });
    await act(async () => {
      window.dispatchEvent(new WheelEvent("wheel", { deltaY: 180, bubbles: true }));
    });

    expect(scroller.scrollTop).toBe(180);

    unmount();
    raf.mockRestore();
    root.remove();
  });
});
