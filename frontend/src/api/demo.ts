// The preloaded example: what the app shows when the backend (the Cloudflare
// tunnel to the demo laptop) is unreachable. It serves the real processed
// tender bundled under `public/demo/` and replays the pipeline loading from a
// scripted timeline, so the whole flow — including the reading animation — runs
// with no backend at all.
import type {
  Bando,
  BandoSummary,
  Item,
  OfferFormValues,
  PipelineState,
  Product,
  ProductivityRule,
  ProjectParameters,
  Unit,
} from "./types";
import { DEMO_BASE } from "./config";

interface DemoFixtures {
  bando: Bando;
  summary: BandoSummary;
  catalog: Product[];
  productivity: ProductivityRule[];
  parameters: Record<string, unknown>;
}

interface ItemPatch {
  description_raw?: string;
  quantity?: number;
  unit?: string;
  product_id?: string | null;
  install_code?: string;
  confidence?: number;
  manual_unit_price_chf?: number | null;
  offer_price_chf?: number | null;
  price_confirmed?: boolean;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

async function getJson<T>(name: string): Promise<T> {
  const response = await fetch(`${DEMO_BASE}${name}`);
  if (!response.ok) throw { code: "not_found", message: `demo fixture ${name}` };
  return (await response.json()) as T;
}

let fixturesPromise: Promise<DemoFixtures> | null = null;

function loadFixtures(): Promise<DemoFixtures> {
  if (!fixturesPromise) {
    fixturesPromise = (async () => {
      const [bando, summary, catalog, productivity, parameters] = await Promise.all([
        getJson<Bando>("bando.json"),
        getJson<BandoSummary>("summary.json"),
        getJson<Product[]>("catalog.json"),
        getJson<ProductivityRule[]>("productivity.json"),
        getJson<Record<string, unknown>>("parameters.json"),
      ]);
      return { bando, summary, catalog, productivity, parameters };
    })();
  }
  return fixturesPromise;
}

// --- mutable example state ------------------------------------------------

let fixtures: DemoFixtures | null = null;
let bando: Bando | null = null;

async function ensure(): Promise<DemoFixtures> {
  if (!fixtures) fixtures = await loadFixtures();
  if (!bando) bando = clone(fixtures.bando);
  return fixtures;
}

function currentBando(): Bando {
  if (!bando) throw { code: "not_found", message: "The example is not ready yet." };
  return bando;
}

// --- pipeline replay ------------------------------------------------------

// Beat durations tuned so the page tape, the colour wave and the vision bar each
// get their moment; the run lands on the example's recorded totals.
const BEATS: { step: PipelineState["step"]; ms: number }[] = [
  { step: "read", ms: 7000 },
  { step: "classify_pages", ms: 3200 },
  { step: "parse", ms: 6000 },
  { step: "overview", ms: 1100 },
  { step: "classify", ms: 1100 },
  { step: "canonicalize", ms: 1100 },
  { step: "match", ms: 3000 },
  { step: "price", ms: 1700 },
  { step: "aggregate", ms: 1700 },
];

let timer: number | null = null;
let startedAt = 0;
let pagesTotal = 0;
let lvTotal = 0;
let itemTotal = 0;

function stopReplay() {
  if (timer != null) {
    window.clearInterval(timer);
    timer = null;
  }
}

function stateFor(step: PipelineState["step"], progress: number): PipelineState {
  const state: PipelineState = {
    step,
    status: "running",
    updated_at: new Date().toISOString(),
    error: null,
    item_count: 0,
    message: null,
    pages_total: pagesTotal,
    pages_read: 0,
    lv_pages_total: lvTotal,
    lv_pages_done: 0,
  };
  switch (step) {
    case "read":
      state.pages_read = Math.round(pagesTotal * progress);
      state.message = "Reading PDF";
      break;
    case "classify_pages":
      state.pages_read = pagesTotal;
      state.message = "Classifying pages";
      break;
    case "parse":
      state.pages_read = pagesTotal;
      state.lv_pages_done = Math.round(lvTotal * progress);
      state.item_count = Math.round(itemTotal * progress);
      state.message = "Reading quantity tables";
      break;
    case "match":
      state.pages_read = pagesTotal;
      state.lv_pages_done = lvTotal;
      state.item_count = itemTotal;
      state.message = "Catalogue match";
      break;
    default:
      state.pages_read = pagesTotal;
      state.lv_pages_done = lvTotal;
      state.item_count = itemTotal;
      state.message = "Computing price";
      break;
  }
  return state;
}

function tick() {
  const base = currentBando();
  const elapsed = performance.now() - startedAt;
  let offset = 0;
  for (const beat of BEATS) {
    if (elapsed < offset + beat.ms) {
      base.pipeline = stateFor(beat.step, (elapsed - offset) / beat.ms);
      return;
    }
    offset += beat.ms;
  }
  stopReplay();
  base.pipeline = {
    step: "aggregate",
    status: "done",
    updated_at: new Date().toISOString(),
    error: null,
    item_count: itemTotal,
    message: "Completed",
    pages_total: pagesTotal,
    pages_read: pagesTotal,
    lv_pages_total: lvTotal,
    lv_pages_done: lvTotal,
  };
}

function startReplay() {
  stopReplay();
  const base = currentBando();
  pagesTotal = base.pipeline.pages_total ?? base.page_count ?? 0;
  lvTotal =
    base.pipeline.lv_pages_total ??
    base.page_types.filter((entry) => entry.type === "lv_table").length;
  itemTotal = base.pipeline.item_count || base.items.length;
  base.pipeline = stateFor("read", 0);
  startedAt = performance.now();
  timer = window.setInterval(tick, 120);
}

// --- patch helpers --------------------------------------------------------

function applyItemPatch(item: Item, patch: ItemPatch) {
  if (patch.quantity !== undefined) item.quantity = patch.quantity;
  if (patch.unit !== undefined) item.unit = patch.unit as Unit;
  if (patch.description_raw !== undefined) item.description_raw = patch.description_raw;
  if (patch.manual_unit_price_chf !== undefined) item.manual_unit_price_chf = patch.manual_unit_price_chf;
  if (patch.offer_price_chf !== undefined) item.offer_price_chf = patch.offer_price_chf;
  if (patch.price_confirmed !== undefined) item.price_confirmed = patch.price_confirmed;
  const touchesMatch =
    patch.product_id !== undefined ||
    patch.install_code !== undefined ||
    patch.confidence !== undefined;
  if (touchesMatch) {
    if (patch.product_id === null && patch.install_code === undefined) {
      item.match = null;
    } else {
      const match =
        item.match ?? { product_id: "", install_code: null, confidence: 0, price_source: "catalog" as const };
      item.match = {
        product_id: patch.product_id ?? match.product_id,
        install_code: patch.install_code ?? match.install_code,
        confidence: patch.confidence ?? match.confidence,
        price_source: match.price_source,
      };
    }
  }
}

function deepMerge(
  target: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...target };
  for (const [key, value] of Object.entries(patch)) {
    const current = result[key];
    const bothObjects =
      value != null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      current != null &&
      typeof current === "object" &&
      !Array.isArray(current);
    result[key] = bothObjects
      ? deepMerge(current as Record<string, unknown>, value as Record<string, unknown>)
      : value;
  }
  return result;
}

// --- the demo API ---------------------------------------------------------

/** Same surface as `api`, backed by the bundled example. */
export const demoApi = {
  health: async () => ({ status: "demo", contract_version: "2.0" }),

  listBandi: async (): Promise<BandoSummary[]> => {
    const loaded = await ensure();
    const summary = clone(loaded.summary);
    summary.pipeline = clone(currentBando().pipeline);
    summary.updated_at = currentBando().updated_at;
    return [summary];
  },

  getBando: async (_id: string): Promise<Bando> => {
    await ensure();
    return clone(currentBando());
  },

  getPipeline: async (_id: string): Promise<PipelineState> => {
    await ensure();
    return clone(currentBando().pipeline);
  },

  upload: async (file: File): Promise<Bando> => {
    const loaded = await ensure();
    bando = clone(loaded.bando);
    bando.source_file = file.name;
    bando.created_at = new Date().toISOString();
    startReplay();
    return clone(currentBando());
  },

  runPipeline: async (_id: string, _deep = false): Promise<Bando> => {
    await ensure();
    startReplay();
    return clone(currentBando());
  },

  patchBando: async (
    _id: string,
    patch: { title?: string; description?: string; classification?: string },
  ): Promise<Bando> => {
    await ensure();
    const base = currentBando();
    if (patch.title !== undefined) base.title = patch.title;
    if (patch.description !== undefined) base.description = patch.description;
    return clone(base);
  },

  patchParameters: async (
    _id: string,
    parameters: Record<string, unknown>,
  ): Promise<Bando> => {
    await ensure();
    const base = currentBando();
    base.parameters = deepMerge(
      (base.parameters ?? {}) as Record<string, unknown>,
      parameters,
    ) as unknown as ProjectParameters;
    return clone(base);
  },

  deleteBando: async (_id: string) => {
    await ensure();
    return { ok: true };
  },

  addItem: async (_id: string, item: Partial<Item>): Promise<Bando> => {
    await ensure();
    const base = currentBando();
    base.items = [...base.items, item as Item];
    return clone(base);
  },

  patchItem: async (_id: string, lvId: string, patch: ItemPatch): Promise<Bando> => {
    await ensure();
    const item = currentBando().items.find((entry) => entry.lv_id === lvId);
    if (item) applyItemPatch(item, patch);
    return clone(currentBando());
  },

  replaceItems: async (_id: string, items: Item[]): Promise<Bando> => {
    await ensure();
    currentBando().items = items;
    return clone(currentBando());
  },

  catalog: async (): Promise<Product[]> => (await ensure()).catalog,

  productivity: async (): Promise<ProductivityRule[]> => (await ensure()).productivity,

  parameters: async (): Promise<Record<string, unknown>> => (await ensure()).parameters,

  offerFormValues: async (
    _id: string,
    body: { lv_ids: string[]; scenario: string | null },
  ): Promise<OfferFormValues> => {
    await ensure();
    const base = currentBando();
    const scenarios = base.recommended_bid_range?.scenarios ?? [];
    const chosen =
      scenarios.find((entry) => entry.scenario === body.scenario) ??
      scenarios.find((entry) => entry.scenario === "Target") ??
      scenarios[0];
    const values: Record<string, number | null> = {};
    for (const field of base.offer_form?.fields ?? []) values[field.id] = field.override;
    return {
      page: base.offer_form?.page ?? null,
      brutto_chf: chosen?.bid_price_chf ?? base.summary.indicative_selling_price_chf,
      values,
      cover: base.offer_cover ? { page: base.offer_cover.page, values: {} } : null,
    };
  },

  patchFormField: async (_id: string, fieldId: string, value: number | null): Promise<Bando> => {
    await ensure();
    const field = currentBando().offer_form?.fields.find((entry) => entry.id === fieldId);
    if (field) field.override = value;
    return clone(currentBando());
  },

  // Export needs the backend (it writes the prices into the tender PDF).
  exportOfferPdf: async (): Promise<never> => {
    throw { code: "demo_mode", message: "Export is disabled in the preloaded example." };
  },

  exportUrl: () => "",

  pdfUrl: () => `${DEMO_BASE}source.pdf`,
};
