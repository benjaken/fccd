import { expect, it } from "vitest";
import { richTextHtml, safeHref } from "@/lib/rich-text";

it("preserves plain text and line breaks without interpreting executable markup", () => {
  expect(richTextHtml("Hello\n<script>alert(1)</script>")).toBe("Hello<br>&lt;script&gt;alert(1)&lt;/script&gt;");
});
it("keeps formatting while stripping executable tags and attributes", () => {
  expect(richTextHtml('<p onclick="alert(1)"><strong>Welcome</strong><img src=x onerror=alert(1)><script>alert(1)</script></p>')).toBe("<p><strong>Welcome</strong></p>");
});
it("keeps headings, alignment, and http links", () => {
  expect(richTextHtml('<h2 style="text-align: center">Title</h2><p><a href="https://example.com" target="_blank" rel="noopener noreferrer">site</a></p>')).toBe('<h2 style="text-align: center">Title</h2><p><a href="https://example.com" target="_blank" rel="noopener noreferrer">site</a></p>');
});
it("drops javascript links and unsafe styles", () => {
  expect(richTextHtml('<p style="color:red"><a href="javascript:alert(1)">x</a></p>')).toBe("<p>x</p>");
});
it("keeps phone links while rejecting invalid telephone payloads", () => {
  expect(richTextHtml('<p><a href="tel:+85221857373">電話</a></p>')).toBe('<p><a href="tel:+85221857373">電話</a></p>');
  expect(safeHref("tel:javascript:alert(1)")).toBe("");
  expect(safeHref("tel:+85221857373?body=unsafe")).toBe("");
});
