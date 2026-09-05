import type { Asset, Property } from "./types";
// Render API prose as plain text, never execute embedded HTML/SVG.
export function plainText(value: string = ""): string {
  return value
    .replace(/<svg[\s\S]*?<\/svg>/gi, "")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();
}
export function propertyValue(p: Property) {
  const raw = String(p.value);
  const prefix =
    p.prefix === "{s:sign}"
      ? Number.parseFloat(raw) > 0
        ? "+"
        : ""
      : p.prefix || "";
  const suffix = p.postfix && !raw.endsWith(p.postfix) ? p.postfix : "";
  return `${prefix}${raw}${suffix}`;
}
export function statLines(item: Asset) {
  return Object.entries(item.properties)
    .filter(
      ([, p]) =>
        p.value !== undefined &&
        p.value !== null &&
        p.label &&
        (p.tooltip_section ||
          p.disable_value === undefined ||
          String(p.value) !== p.disable_value) &&
        Number.parseFloat(String(p.value)) !== 0 &&
        Number.parseFloat(String(p.value)) !== -1,
    )
    .map(([key, p]) => ({
      key,
      label: plainText(p.label),
      value: propertyValue(p),
      conditional: p.conditional,
      section: p.tooltip_section,
    }));
}
export function descriptions(item: Asset) {
  const blocks = (item.tooltip_sections || []).flatMap((s) =>
    (s.section_attributes || [])
      .filter((a) => a.loc_string)
      .map((a) => ({ label: s.section_type, text: plainText(a.loc_string) })),
  );
  for (const [key, text] of Object.entries(item.description || {})) {
    const clean = plainText(text);
    if (clean && !blocks.some((b) => b.text === clean))
      blocks.push({
        label:
          key === "desc" ? (item.is_active_item ? "active" : "passive") : key,
        text: clean,
      });
  }
  return blocks;
}
