import { renderMarkdownToHtml } from "@/lib/markdown";

describe("renderMarkdownToHtml", () => {
  it("renders bold text", () => {
    expect(renderMarkdownToHtml("hello **world**")).toBe(
      "<p>hello <strong>world</strong></p>"
    );
  });

  it("renders inline code", () => {
    expect(renderMarkdownToHtml("use `npm test` now")).toBe(
      "<p>use <code>npm test</code> now</p>"
    );
  });

  it("renders an unordered list", () => {
    const html = renderMarkdownToHtml("- one\n- two");
    expect(html).toBe("<ul><li>one</li><li>two</li></ul>");
  });

  it("renders an ordered list", () => {
    const html = renderMarkdownToHtml("1. first\n2. second");
    expect(html).toBe("<ol><li>first</li><li>second</li></ol>");
  });

  it("renders a fenced code block verbatim", () => {
    const html = renderMarkdownToHtml("```\nconst x = 1;\n```");
    expect(html).toBe("<pre><code>const x = 1;</code></pre>");
  });

  it("escapes HTML to prevent injection", () => {
    const html = renderMarkdownToHtml("<script>alert(1)</script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("does not apply bold transforms inside inline code", () => {
    expect(renderMarkdownToHtml("`**not bold**`")).toBe(
      "<p><code>**not bold**</code></p>"
    );
  });
});
