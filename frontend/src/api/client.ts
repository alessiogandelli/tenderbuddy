// Typed API client. The frontend never computes prices: it renders what the
// backend returns. See docs/contract/README.md section 6.
import type {
  Bando,
  BandoSummary,
  Item,
  PipelineState,
  Product,
  ProductivityRule,
} from "./types";

const BASE = import.meta.env.VITE_API_BASE ?? "";

export interface ApiError {
  code: string;
  message: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // Only JSON bodies get a JSON Content-Type. FormData must keep the browser's
  // own multipart boundary, so it is left untouched.
  const isForm = init?.body instanceof FormData;
  const headers =
    init?.body && !isForm ? { "Content-Type": "application/json" } : undefined;
  const response = await fetch(`${BASE}/api${path}`, { ...init, headers });
  if (!response.ok) {
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

export const api = {
  health: () =>
    request<{ status: string; contract_version: string }>("/health"),

  listBandi: () => request<BandoSummary[]>("/bandi"),

  getBando: (id: string) => request<Bando>(`/bandi/${id}`),

  getPipeline: (id: string) =>
    request<PipelineState>(`/bandi/${id}/pipeline`),

  upload: (file: File, title?: string, description?: string) => {
    const form = new FormData();
    form.append("file", file);
    if (title) form.append("title", title);
    if (description) form.append("description", description);
    return request<Bando>("/bandi", { method: "POST", body: form });
  },

  patchBando: (
    id: string,
    patch: { title?: string; description?: string; classification?: string },
  ) => request<Bando>(`/bandi/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  deleteBando: (id: string) =>
    request<{ ok: boolean }>(`/bandi/${id}`, { method: "DELETE" }),

  runPipeline: (id: string) =>
    request<Bando>(`/bandi/${id}/run`, { method: "POST" }),

  addItem: (id: string, item: Partial<Item>) =>
    request<Bando>(`/bandi/${id}/items`, {
      method: "POST",
      body: JSON.stringify(item),
    }),

  replaceItems: (id: string, items: Item[]) =>
    request<Bando>(`/bandi/${id}/items`, {
      method: "PUT",
      body: JSON.stringify(items),
    }),

  catalog: () => request<Product[]>("/catalog"),

  productivity: () => request<ProductivityRule[]>("/productivity"),

  parameters: () => request<Record<string, unknown>>("/parameters"),

  exportUrl: (id: string, format: "json" | "csv" = "json") =>
    `${BASE}/api/bandi/${id}/export?format=${format}`,

  pdfUrl: (id: string) => `${BASE}/api/bandi/${id}/pdf`,
};
