import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { Bando, Classification, Item, Product } from "../api/types";
import { BidRangeCards } from "../components/BidRangeCards";
import { CoverageBar } from "../components/CoverageBar";
import { ItemEditor } from "../components/ItemEditor";
import { ItemTable } from "../components/ItemTable";
import { PdfViewer } from "../components/PdfViewer";
import { PipelineProgress } from "../components/PipelineProgress";
import { ReviewPanel } from "../components/ReviewPanel";
import { SummaryPanel } from "../components/SummaryPanel";
import { formatChf } from "../lib/format";
import { CLASSIFICATION_LABELS } from "../lib/flags";

const CLASSIFICATIONS: Classification[] = [
  "ventilation",
  "hvac",
  "plumbing",
  "electrical",
  "building",
  "other",
];

export function BandoPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [bando, setBando] = useState<Bando | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [marginPct, setMarginPct] = useState(5.5);
  const [projectCosts, setProjectCosts] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [jumpToPage, setJumpToPage] = useState<number | null>(null);
  const [editing, setEditing] = useState<Item | null | undefined>(undefined);
  const [titleDraft, setTitleDraft] = useState("");
  const [descDraft, setDescDraft] = useState("");
  const pollRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const loaded = await api.getBando(id);
      setBando(loaded);
      setTitleDraft(loaded.title ?? "");
      setDescDraft(loaded.description ?? "");
      setError(null);
      return loaded;
    } catch {
      setError("Bando non trovato.");
      return null;
    }
  }, [id]);

  useEffect(() => {
    void load();
    void api.catalog().then(setProducts).catch(() => setProducts([]));
    void api
      .parameters()
      .then((params) => {
        const commercial = params.commercial as { target_margin_pct?: number } | undefined;
        if (commercial?.target_margin_pct !== undefined) {
          setMarginPct(commercial.target_margin_pct);
        }
        const costs = params.project_costs as Record<string, number> | undefined;
        if (costs) setProjectCosts(costs);
      })
      .catch(() => undefined);
  }, [load]);

  const pipelineStatus = bando?.pipeline.status;

  // Poll the pipeline while it runs, so the step-by-step state is visible.
  useEffect(() => {
    if (pipelineStatus !== "running" && pipelineStatus !== "pending") return;
    pollRef.current = window.setInterval(async () => {
      const state = await api.getPipeline(id);
      setBando((current) => (current ? { ...current, pipeline: state } : current));
      if (state.status === "done" || state.status === "failed") {
        await load();
      }
    }, 700);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [pipelineStatus, id, load]);

  const totals = useMemo(() => {
    if (!bando) return 0;
    return Object.values(bando.coverage).reduce((a, b) => a + b, 0);
  }, [bando]);

  const saveItems = async (nextItems: Item[]) => {
    const updated = await api.replaceItems(id, nextItems);
    setBando(updated);
  };

  const onSaveItem = async (partial: Partial<Item>) => {
    if (!bando) return;
    const exists = partial.lv_id && bando.items.some((item) => item.lv_id === partial.lv_id);
    let next: Item[];
    if (exists) {
      next = bando.items.map((item) =>
        item.lv_id === partial.lv_id ? ({ ...item, ...partial } as Item) : item,
      );
    } else {
      const lvId = partial.lv_id || `MAN${String(bando.items.length + 1).padStart(4, "0")}`;
      next = [
        ...bando.items,
        {
          system: null,
          source_page: null,
          source_bbox: null,
          description_normalized: null,
          attributes: {},
          flags: [],
          ...partial,
          lv_id: lvId,
        } as Item,
      ];
    }
    await saveItems(next);
    setEditing(undefined);
  };

  const selectedItem = bando?.items.find((item) => item.lv_id === selectedId) ?? null;

  if (error) {
    return (
      <div className="page">
        <p className="banner banner--error">{error}</p>
        <button type="button" className="btn" onClick={() => navigate("/")}>
          Torna all'archivio
        </button>
      </div>
    );
  }
  if (!bando) return <p className="muted">Carico il bando…</p>;

  return (
    <div className="page">
      <header className="bando-head">
        <button type="button" className="btn btn--ghost" onClick={() => navigate("/")}>
          ← Archivio
        </button>
        <div className="bando-head__title">
          <input
            className="title-input"
            value={titleDraft}
            onChange={(event) => setTitleDraft(event.target.value)}
            onBlur={async () => {
              if (titleDraft !== bando.title) {
                setBando(await api.patchBando(id, { title: titleDraft }));
              }
            }}
            aria-label="Titolo del bando"
          />
          <input
            className="desc-input"
            value={descDraft}
            onChange={(event) => setDescDraft(event.target.value)}
            onBlur={async () => {
              if (descDraft !== bando.description) {
                setBando(await api.patchBando(id, { description: descDraft }));
              }
            }}
            aria-label="Descrizione del bando"
          />
          <div className="bando-head__meta">
            <select
              className="chip chip--select"
              value={bando.classification}
              onChange={async (event) =>
                setBando(
                  await api.patchBando(id, {
                    classification: event.target.value,
                  }),
                )
              }
              aria-label="Classificazione del bando"
            >
              {CLASSIFICATIONS.map((value) => (
                <option key={value} value={value}>
                  {CLASSIFICATION_LABELS[value]}
                </option>
              ))}
            </select>
            <span>{bando.source_file}</span>
            <span>{bando.page_count} pagine</span>
            <span>{bando.items.length} posizioni</span>
          </div>
        </div>
        <div className="bando-head__actions">
          <button
            type="button"
            className="btn"
            onClick={async () => setBando(await api.runPipeline(id))}
          >
            Rilancia estrazione
          </button>
          <a className="btn" href={api.exportUrl(id, "csv")}>
            Esporta CSV
          </a>
          <a className="btn" href={api.exportUrl(id, "json")}>
            Esporta JSON
          </a>
          <button
            type="button"
            className="btn btn--danger"
            onClick={async () => {
              await api.deleteBando(id);
              navigate("/");
            }}
          >
            Elimina
          </button>
        </div>
      </header>

      {(bando.pipeline.status === "running" || bando.pipeline.status === "failed") && (
        <PipelineProgress pipeline={bando.pipeline} />
      )}

      <section className="card coverage-card">
        <h3>Copertura del preventivo</h3>
        <CoverageBar coverage={bando.coverage} total={totals} />
      </section>

      <div className="detail-grid">
        <div className="detail-grid__col">
          <ReviewPanel
            items={bando.items}
            selectedId={selectedId}
            onSelect={(lvId) => setSelectedId(lvId)}
          />
          <SummaryPanel
            summary={bando.summary}
            marginPct={marginPct}
            projectCosts={projectCosts}
          />
          <BidRangeCards range={bando.recommended_bid_range} />
        </div>
        <div className="detail-grid__col detail-grid__col--pdf">
          <PdfViewer
            url={api.pdfUrl(id)}
            items={bando.items}
            selectedId={selectedId}
            onSelect={(lvId) => setSelectedId(lvId)}
            jumpToPage={jumpToPage}
          />
        </div>
      </div>

      <div className="toolbar">
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => setEditing(null)}
        >
          + Nuova posizione
        </button>
        <button
          type="button"
          className="btn"
          disabled={!selectedItem}
          onClick={() => selectedItem && setEditing(selectedItem)}
        >
          Modifica selezionata
        </button>
        <button
          type="button"
          className="btn btn--danger"
          disabled={!selectedItem}
          onClick={async () => {
            if (!selectedItem) return;
            const next = bando.items.filter((item) => item.lv_id !== selectedItem.lv_id);
            await saveItems(next);
            setSelectedId(null);
          }}
        >
          Elimina selezionata
        </button>
        {selectedItem && (
          <span className="toolbar__hint">
            {selectedItem.lv_id} · {formatChf(
              bando.position_results.find((r) => r.lv_id === selectedItem.lv_id)
                ?.direct_position_cost_chf ?? null,
              true,
            )}
          </span>
        )}
      </div>

      <ItemTable
        items={bando.items}
        positions={bando.position_results}
        selectedId={selectedId}
        onSelect={(lvId) => setSelectedId(lvId)}
        onOpenPage={(page) => setJumpToPage(page)}
      />

      {editing !== undefined && (
        <ItemEditor
          item={editing}
          products={products}
          onSave={onSaveItem}
          onClose={() => setEditing(undefined)}
        />
      )}
    </div>
  );
}
