// Typed API client. The frontend never computes prices: it renders what the
// backend returns. See docs/contract/README.md section 6.
//
// Every call goes through `withFallback`: when the backend is unreachable the
// preloaded example answers instead (see `demo.ts`), so the app is demoable with
// no laptop on the other end of the tunnel.
import type {
  Bando,
  OfferFormValues,
  BandoSummary,
  Item,
  PipelineState,
  Product,
  ProductivityRule,
} from "./types";
import { API_BASE } from "./config";
import { getConnectionMode, markUnreachable, whenProbed } from "./connection";
import { demoApi } from "./demo";

const BASE = API_BASE;

export interface ApiError {
  code: string;
  message: string;
}

/**
 * Cloudflare's "origin down" family: the edge answers with a real HTTP error
 * (not a network failure) while the tunnel to the laptop is offline. These mean
 * "backend unreachable", so they fall back to the example like a dead fetch.
 */
const UPSTREAM_DOWN = new Set([502, 503, 504, 521, 522, 523, 524, 525, 526, 527]);

class UpstreamUnavailable extends Error {
  constructor(status: number) {
    super(`Backend unreachable (HTTP ${status})`);
    this.name = "UpstreamUnavailable";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // Only JSON bodies get a JSON Content-Type. FormData must keep the browser's
  // own multipart boundary, so it is left untouched.
  const isForm = init?.body instanceof FormData;
  const headers =
    init?.body && !isForm ? { "Content-Type": "application/json" } : undefined;
  const response = await fetch(`${BASE}/api${path}`, { ...init, headers });
  if (!response.ok) {
    if (UPSTREAM_DOWN.has(response.status)) throw new UpstreamUnavailable(response.status);
    let error: ApiError = { code: "unknown", message: response.statusText };
    try {
      const body = await response.json();
      if (body?.error) error = body.error;
    } catch {
      /* keep the fallback */
    }
    throw error;
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** A request that never reached the backend, as opposed to an HTTP error. */
function isNetworkError(error: unknown): boolean {
  return (
    error instanceof TypeError ||
    error instanceof UpstreamUnavailable ||
    (error as { name?: string } | null)?.name === "AbortError"
  );
}

/**
 * Try the live backend; if it is unreachable, switch to the preloaded example
 * and answer from there. HTTP errors (404, 422, …) still surface to the caller.
 */
async function withFallback<T>(live: () => Promise<T>, demo: () => Promise<T>): Promise<T> {
  // On a static host the backend answers with an HTTP 404, not a network error,
  // so the boot probe must settle before the first call picks its source.
  await whenProbed();
  if (getConnectionMode() === "demo") return demo();
  try {
    return await live();
  } catch (error) {
    if (isNetworkError(error)) {
      markUnreachable();
      return demo();
    }
    throw error;
  }
}

export const api = {
  health: () =>
    request<{ status: string; contract_version: string }>("/health"),

  listBandi: () =>
    withFallback<BandoSummary[]>(() => request<BandoSummary[]>("/bandi"), demoApi.listBandi),

  getBando: (id: string) =>
    withFallback<Bando>(() => request<Bando>(`/bandi/${id}`), () => demoApi.getBando(id)),

  getPipeline: (id: string) =>
    withFallback<PipelineState>(
      () => request<PipelineState>(`/bandi/${id}/pipeline`),
      () => demoApi.getPipeline(id),
    ),

  upload: (file: File, title?: string, description?: string) =>
    withFallback<Bando>(
      () => {
        const form = new FormData();
        form.append("file", file);
        if (title) form.append("title", title);
        if (description) form.append("description", description);
        return request<Bando>("/bandi", { method: "POST", body: form });
      },
      () => demoApi.upload(file),
    ),

  /**
   * Offline only: replay the pipeline on the bundled example, as if a PDF had
   * been uploaded. The UI offers this only while the example is showing.
   */
  simulateUpload: () =>
    getConnectionMode() === "demo"
      ? demoApi.simulateUpload()
      : Promise.reject<Bando>({ code: "live", message: "Simulate is for the offline example." }),

  patchBando: (
    id: string,
    patch: { title?: string; description?: string; classification?: string },
  ) =>
    withFallback<Bando>(
      () => request<Bando>(`/bandi/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
      () => demoApi.patchBando(id, patch),
    ),

  patchParameters: (id: string, parameters: Record<string, unknown>) =>
    withFallback<Bando>(
      () =>
        request<Bando>(`/bandi/${id}/parameters`, {
          method: "PATCH",
          body: JSON.stringify({ parameters }),
        }),
      () => demoApi.patchParameters(id, parameters),
    ),

  deleteBando: (id: string) =>
    withFallback<{ ok: boolean }>(
      () => request<{ ok: boolean }>(`/bandi/${id}`, { method: "DELETE" }),
      () => demoApi.deleteBando(id),
    ),

  runPipeline: (id: string, deep = false) =>
    withFallback<Bando>(
      () => request<Bando>(`/bandi/${id}/run${deep ? "?deep=true" : ""}`, { method: "POST" }),
      () => demoApi.runPipeline(id, deep),
    ),

  addItem: (id: string, item: Partial<Item>) =>
    withFallback<Bando>(
      () => request<Bando>(`/bandi/${id}/items`, { method: "POST", body: JSON.stringify(item) }),
      () => demoApi.addItem(id, item),
    ),

  patchItem: (
    id: string,
    lvId: string,
    patch: {
      description_raw?: string;
      quantity?: number;
      unit?: string;
      // null clears the catalogue match / the hand-typed price.
      product_id?: string | null;
      install_code?: string;
      confidence?: number;
      manual_unit_price_chf?: number | null;
      offer_price_chf?: number | null;
      price_confirmed?: boolean;
    },
  ) =>
    withFallback<Bando>(
      () =>
        request<Bando>(`/bandi/${id}/items/${lvId}`, {
          method: "PATCH",
          body: JSON.stringify(patch),
        }),
      () => demoApi.patchItem(id, lvId, patch),
    ),

  replaceItems: (id: string, items: Item[]) =>
    withFallback<Bando>(
      () =>
        request<Bando>(`/bandi/${id}/items`, { method: "PUT", body: JSON.stringify(items) }),
      () => demoApi.replaceItems(id, items),
    ),

  catalog: () =>
    withFallback<Product[]>(() => request<Product[]>("/catalog"), demoApi.catalog),

  productivity: () =>
    withFallback<ProductivityRule[]>(
      () => request<ProductivityRule[]>("/productivity"),
      demoApi.productivity,
    ),

  parameters: () =>
    withFallback<Record<string, unknown>>(
      () => request<Record<string, unknown>>("/parameters"),
      demoApi.parameters,
    ),

  /** The offer form filled for these positions and this scenario (as the export writes it). */
  offerFormValues: (id: string, body: { lv_ids: string[]; scenario: string | null }) =>
    withFallback<OfferFormValues>(
      () =>
        request<OfferFormValues>(`/bandi/${id}/offer-form/values`, {
          method: "POST",
          body: JSON.stringify(body),
        }),
      () => demoApi.offerFormValues(id, body),
    ),

  /** Type a value into an offer-form field; null goes back to the computed value. */
  patchFormField: (id: string, fieldId: string, value: number | null) =>
    withFallback<Bando>(
      () =>
        request<Bando>(`/bandi/${id}/offer-form/fields/${encodeURIComponent(fieldId)}`, {
          method: "PATCH",
          body: JSON.stringify({ value }),
        }),
      () => demoApi.patchFormField(id, fieldId, value),
    ),

  /** The tender PDF with the selling price of the chosen positions written in. */
  exportOfferPdf: (id: string, body: { lv_ids: string[]; scenario: string | null }) =>
    withFallback(
      async () => {
        const response = await fetch(`${BASE}/api/bandi/${id}/export/pdf`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!response.ok) throw { code: "export_failed", message: response.statusText } as ApiError;
        const disposition = response.headers.get("Content-Disposition") ?? "";
        const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `${id}_offer.pdf`;
        return {
          blob: await response.blob(),
          filename,
          written: Number(response.headers.get("X-Offer-Written") ?? 0),
          formWritten: Number(response.headers.get("X-Offer-Form-Written") ?? 0),
          skipped: Number(response.headers.get("X-Offer-Skipped") ?? 0),
        };
      },
      () => demoApi.exportOfferPdf(),
    ),

  exportUrl: (id: string, format: "json" | "csv" = "json") =>
    getConnectionMode() === "demo"
      ? ""
      : `${BASE}/api/bandi/${id}/export?format=${format}`,

  pdfUrl: (id: string) =>
    getConnectionMode() === "demo" ? demoApi.pdfUrl() : `${BASE}/api/bandi/${id}/pdf`,
};
