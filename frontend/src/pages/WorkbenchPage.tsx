import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { Bando, Item, Product } from "../api/types";
import { AnimatedChf } from "../components/AnimatedChf";
import { ItemDetailPanel } from "../components/ItemDetailPanel";
import { PdfViewer } from "../components/PdfViewer";
import { ProcessingOverlay } from "../components/ProcessingOverlay";
import { QuoteList, type RowSavePatch } from "../components/QuoteTable";
import { formatChf } from "../lib/format";
import { itemNeedsAttention } from "../lib/flags";
import { useI18n } from "../i18n";

interface QuoteFilter {
  key: string;
  labelKey: string;
  test: (item: Item) => boolean;
}

const FILTERS: QuoteFilter[] = [
  { key: "all", labelKey: "workbench.filterAll", test: () => true },
  { key: "missing", labelKey: "workbench.filterMissing", test: (item) => !item.match },
  {
    key: "no_quantity",
    labelKey: "workbench.filterMissingQty",
    test: (item) => item.flags.includes("missing_quantity"),
  },
  {
    key: "supplier",
    labelKey: "workbench.filterSupplier",
    test: (item) => item.status === "supplier_quote_required",
  },
  {
    key: "attention",
    labelKey: "workbench.filterAttention",
    test: (item) => itemNeedsAttention(item.status, item.flags),
  },
];

export function WorkbenchPage() {
  const { id = "" } = useParams();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [bando, setBando] = useState<Bando | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterKey, setFilterKey] = useState("all");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const pollRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const loaded = await api.getBando(id);
      setBando(loaded);
      setTitleDraft(loaded.title ?? "");
      setError(null);
    } catch {
      setError(t("workbench.notFound"));
    }
  }, [id, t]);

  useEffect(() => {
    void load();
    void api.catalog().then(setProducts).catch(() => setProducts([]));
  }, [load]);

  const pipelineStatus = bando?.pipeline.status;

  useEffect(() => {
    if (pipelineStatus !== "running" && pipelineStatus !== "pending") return;
    pollRef.current = window.setInterval(async () => {
      const state = await api.getPipeline(id);
      setBando((current) => (current ? { ...current, pipeline: state } : current));
      if (state.status === "done" || state.status === "failed") {
        await load();
      }
    }, 600);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [pipelineStatus, id, load]);

  const counts = useMemo(() => {
    const items = bando?.items ?? [];
    return Object.fromEntries(
      FILTERS.map((filter) => [filter.key, items.filter(filter.test).length]),
    ) as Record<string, number>;
  }, [bando]);

  const rows = useMemo(() => {
    const items = bando?.items ?? [];
    const needle = query.trim().toLowerCase();
    const filter = FILTERS.find((item) => item.key === filterKey) ?? FILTERS[0];
    return items.filter((item) => {
      if (!filter.test(item)) return false;
      if (needle) {
        const haystack = `${item.lv_id} ${item.description_raw ?? ""} ${
          item.match?.product_id ?? ""
        } ${item.system ?? ""}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [bando, filterKey, query]);

  const positionsById = useMemo(
    () => new Map((bando?.position_results ?? []).map((result) => [result.lv_id, result])),
    [bando],
  );

  const selectedItem = useMemo(
    () => (bando?.items ?? []).find((item) => item.lv_id === selectedId) ?? null,
    [bando, selectedId],
  );
  const selectedProduct = selectedItem?.match
    ? products.find((product) => product.product_id === selectedItem.match?.product_id)
    : undefined;

  const saveItem = async (lvId: string, patch: RowSavePatch) => {
    setBando(await api.patchItem(id, lvId, patch));
  };

  if (error) {
    return (
      <div className="center">
        <p className="banner banner--error">{error}</p>
        <button type="button" className="btn" onClick={() => navigate("/")}>
          {t("workbench.backHome")}
        </button>
      </div>
    );
  }
  if (!bando) return <div className="center muted">{t("workbench.loading")}</div>;

  if (bando.pipeline.status === "running" || bando.pipeline.status === "pending") {
    return <ProcessingOverlay pipeline={bando.pipeline} title={bando.title} />;
  }

  const summary = bando.summary;

  return (
    <div className="workbench">
      <header className="wb-head">
        <button
          type="button"
          className="btn btn--icon"
          aria-label={t("workbench.backAria")}
          onClick={() => navigate("/")}
        >
          ←
        </button>
        <div className="wb-head__titles">
          <input
            className="wb-title"
            value={titleDraft}
            placeholder={t("workbench.titlePlaceholder")}
            aria-label={t("workbench.titleAria")}
            onChange={(event) => setTitleDraft(event.target.value)}
            onBlur={async () => {
              if (titleDraft !== bando.title) {
                setBando(await api.patchBando(id, { title: titleDraft }));
              }
            }}
          />
          <div className="wb-head__meta">
            <span className="chip chip--soft">
              {t(`classification.${bando.classification}`)}
            </span>
            <span>{bando.source_file}</span>
            <span>{t("common.pages", { count: bando.page_count })}</span>
            <span>{t("common.positions", { count: counts.all })}</span>
          </div>
        </div>
        <div className="wb-head__actions">
          <a className="btn" href={api.exportUrl(id, "csv")}>
            {t("workbench.exportCsv")}
          </a>
          <button
            type="button"
            className="btn"
            onClick={async () => setBando(await api.runPipeline(id))}
          >
            {t("workbench.rerun")}
          </button>
          <button
            type="button"
            className="btn"
            title={t("workbench.rerunDeepTitle")}
            onClick={async () => setBando(await api.runPipeline(id, true))}
          >
            {t("workbench.rerunDeep")}
          </button>
          <button
            type="button"
            className="btn btn--danger"
            onClick={async () => {
              await api.deleteBando(id);
              navigate("/");
            }}
          >
            {t("workbench.delete")}
          </button>
        </div>
      </header>

      {bando.pipeline.status === "failed" && (
        <p className="banner banner--error">
          {t("workbench.failed", { error: bando.pipeline.error ?? "" })}
        </p>
      )}

      <div className="wb-summary">
        <div className="stat">
          <span className="stat__label">{t("workbench.statMaterials")}</span>
          <span className="stat__value">{formatChf(summary.material_cost_chf)}</span>
        </div>
        <div className="stat">
          <span className="stat__label">{t("workbench.statLabour")}</span>
          <span className="stat__value">{formatChf(summary.labour_cost_chf)}</span>
        </div>
        <div className="stat">
          <span className="stat__label">{t("workbench.statDirectCost")}</span>
          <span className="stat__value">{formatChf(summary.direct_cost_chf)}</span>
        </div>
        <div className="stat stat--price">
          <span className="stat__label">{t("workbench.statIndicative")}</span>
          <span className="stat__value">
            <AnimatedChf value={summary.indicative_selling_price_chf} />
          </span>
          <span className="stat__sub">
            {t("workbench.statCostBaseline", {
              value: formatChf(summary.cost_baseline_chf),
            })}
          </span>
        </div>
        {bando.usage && (
          <span className="usage">
            <span className="usage__spark" />
            {t("common.calls", { count: bando.usage.calls })} · $
            {bando.usage.cost_usd.toFixed(2)}
          </span>
        )}
      </div>

      <div className="wb-toolbar">
        <div className="todos">
          {FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              className={`todo-chip ${filterKey === filter.key ? "is-active" : ""} ${
                filter.key === "all" ? "todo-chip--all" : ""
              }`}
              onClick={() => setFilterKey(filter.key)}
            >
              {t(filter.labelKey)}
              <span className="todo-chip__count">{counts[filter.key] ?? 0}</span>
            </button>
          ))}
        </div>
        <input
          className="search"
          placeholder={t("workbench.searchPlaceholder")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <div
        className={`wb-split ${expanded ? "wb-split--expanded" : ""} ${
          selectedItem && !expanded ? "wb-split--detail" : ""
        }`}
      >
        {!expanded && (
          <div className="wb-doc">
            <QuoteList
              items={rows}
              positionsById={positionsById}
              products={products}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onSave={saveItem}
            />
          </div>
        )}
        <div className="wb-pdf">
          <PdfViewer
            url={api.pdfUrl(id)}
            items={bando.items}
            detections={bando.detections}
            pageTypes={bando.page_types}
            pricesById={positionsById}
            selectedId={selectedId}
            expanded={expanded}
            onToggleExpanded={() => setExpanded((value) => !value)}
            onSelect={(lvId) => setSelectedId(lvId)}
          />
        </div>
        {selectedItem && !expanded && (
          <ItemDetailPanel
            item={selectedItem}
            result={selectedId ? positionsById.get(selectedId) : undefined}
            product={selectedProduct}
            parameters={bando.parameters}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    </div>
  );
}
