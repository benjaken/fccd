import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

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
});
