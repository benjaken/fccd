import { expect, it } from "vitest";
import { richTextHtml } from "@/lib/rich-text";

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
