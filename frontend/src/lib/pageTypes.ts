// Page-type colours, shared by the processing tape, the page rail and the PDF
// page labels, so one colour always means one kind of page. Related kinds share
// a hue family: greens are the quantity tables, warm tones are forms and price
// lists, cool tones are text, greys are front matter.
import type { PageClassification, PageType } from "../api/types";

export const PAGE_TYPE_ORDER: PageType[] = [
  "lv_table",
  "lv_other",
  "preziario",
  "modulo_offerta",
  "specifications",
  "legal",
  "cover",
  "index",
  "captions",
  "other",
];

export const PAGE_TYPE_COLORS: Record<PageType, string> = {
  lv_table: "#1b7350",
  lv_other: "#70bd95",
  preziario: "#e7a73a",
  modulo_offerta: "#c7702f",
  specifications: "#3f6fd1",
  legal: "#cf4f68",
  cover: "#7a5bc6",
  index: "#7f8d9c",
  captions: "#a9b4c0",
  other: "#c9d0d8",
};

export function pageTypeMap(pageTypes: PageClassification[]): Map<number, PageType> {
  return new Map(pageTypes.map((entry) => [entry.page, entry.type]));
}

/** The page types present in the document, in legend order, with their counts. */
export function pageTypeCounts(pageTypes: PageClassification[]): { type: PageType; count: number }[] {
  const counts = new Map<PageType, number>();
  for (const entry of pageTypes) counts.set(entry.type, (counts.get(entry.type) ?? 0) + 1);
  return PAGE_TYPE_ORDER.filter((type) => counts.has(type)).map((type) => ({
    type,
    count: counts.get(type) ?? 0,
  }));
}
