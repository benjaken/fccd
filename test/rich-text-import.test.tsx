import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it } from "vitest";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import "@/lib/customer-portal-i18n";

function Harness({ disabled = false }: { disabled?: boolean }) {
  const [value, setValue] = useState("<p>原有內容</p>");
  return <><RichTextEditor value={value} onChange={setValue} label="正文" disabled={disabled} /><output data-testid="html">{value}</output></>;
}
it("imports sanitized HTML as editable rich text, replacing the previous content", async () => {
  render(<Harness />);
  fireEvent.click(await screen.findByRole("button", { name: "匯入 HTML" }));
  fireEvent.change(screen.getByLabelText("HTML 原始碼"), { target: { value: '<h2 style="color:red">付款安排</h2><p><strong>轉數快</strong><a href="tel:+85221857373">致電</a></p><script>alert(1)</script>' } });
  fireEvent.click(screen.getByRole("button", { name: "取代內容並預覽" }));
  await waitFor(() => expect(screen.getByTestId("html").textContent).toContain("<h2>付款安排</h2>"));
  expect(screen.getByTestId("html").textContent).toContain('href="tel:+85221857373"');
  expect(screen.getByTestId("html").textContent).not.toMatch(/script|color:red|原有內容/);
  expect(screen.queryByLabelText("HTML 原始碼")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "復原", exact: true }));
  await waitFor(() => expect(screen.getByTestId("html").textContent).toBe("<p>原有內容</p>"));
});
it("cancels without changing the existing content", async () => {
  render(<Harness />);
  fireEvent.click(await screen.findByRole("button", { name: "匯入 HTML" }));
  fireEvent.change(screen.getByLabelText("HTML 原始碼"), { target: { value: "<p>新內容</p>" } });
  fireEvent.click(screen.getByRole("button", { name: "取消" }));
  expect(screen.getByTestId("html").textContent).toBe("<p>原有內容</p>");
});
it("disables HTML import when the editor is read only", async () => {
  render(<Harness disabled />);
  expect(await screen.findByRole("button", { name: "匯入 HTML" })).toBeDisabled();
});
