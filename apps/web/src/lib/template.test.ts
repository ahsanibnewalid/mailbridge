import { describe, expect, it } from "vitest";
import { renderTemplate, validateTemplateVariables } from "./template";

describe("template rendering", () => {
  it("renders values and HTML-escapes untrusted variables", () => {
    expect(renderTemplate("Hello {{name}}", { name: "<script>alert(1)</script>" })).toBe("Hello &lt;script&gt;alert(1)&lt;/script&gt;");
  });
  it("rejects nested values and invalid variable names", () => {
    expect(() => validateTemplateVariables({ user: { role: "admin" } })).toThrow();
    expect(() => validateTemplateVariables(Object.fromEntries([["__proto__", "bad"]]))).toThrow();
  });
  it("rejects oversized template input", () => {
    expect(() => renderTemplate("x".repeat(200001), {})).toThrow(/maximum size/);
  });
});
