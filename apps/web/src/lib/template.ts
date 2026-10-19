import Handlebars from "handlebars";

const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

export function validateTemplateVariables(value: unknown): Record<string, string | number | boolean | null> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("variables must be a JSON object");
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > 100) throw new Error("too many template variables");
  const result: Record<string, string | number | boolean | null> = {};
  for (const [key, item] of entries) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(key) || FORBIDDEN_KEYS.has(key)) throw new Error("invalid template variable name");
    if (item !== null && !["string", "number", "boolean"].includes(typeof item)) throw new Error("template variables must be primitive values");
    if (typeof item === "string" && item.length > 10000) throw new Error("template variable is too long");
    result[key] = item as string | number | boolean | null;
  }
  return result;
}

export function renderTemplate(source: string, variables: unknown): string {
  if (source.length > 200_000) throw new Error("template exceeds maximum size");
  const safeVariables = validateTemplateVariables(variables);
  // Handlebars escapes interpolated values by default. Do not register unsafe helpers or enable prototype access.
  return Handlebars.compile(source, { strict: true, noEscape: false, allowProtoPropertiesByDefault: false, allowProtoMethodsByDefault: false })(safeVariables);
}
