import { useCallback, useMemo, useRef, useState } from "react";
import { api } from "../api/client";
import { ItemList, type SelectSource } from "../components/ItemList";
import type { ItemPatch } from "../components/ItemDetail";
import { PageRail } from "../components/PageRail";
import { PdfViewer, type PdfViewerHandle } from "../components/PdfViewer";
import { itemState, type ItemState } from "../lib/flags";
import { pageTypeMap } from "../lib/pageTypes";
import { useTender } from "./tenderContext";

/**
 * The review screen: the items read from the tender on the left, the tender
 * itself on the right, and between them the page rail. Selecting an item on
 * either side highlights it on the other.
 */
export function ReviewPage() {
  const { bando, setBando, products, productsById, rules, arriving } = useTender();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageCount, setPageCount] = useState(bando.page_count);
  const pdfRef = useRef<PdfViewerHandle | null>(null);

  const results = useMemo(
    () => new Map(bando.position_results.map((result) => [result.lv_id, result])),
    [bando.position_results],
  );
  const states = useMemo(() => {
    const map = new Map<string, ItemState>();
    for (const item of bando.items) map.set(item.lv_id, itemState(item, results.get(item.lv_id)));
    return map;
  }, [bando.items, results]);
  const types = useMemo(() => pageTypeMap(bando.page_types), [bando.page_types]);
  const itemsPerPage = useMemo(() => {
    const map = new Map<number, number>();
    for (const item of bando.items) {
      if (item.source_page) map.set(item.source_page, (map.get(item.source_page) ?? 0) + 1);
    }
    return map;
  }, [bando.items]);

  const select = useCallback((lvId: string | null, source: SelectSource) => {
    setSelectedId(lvId);
    // Picked in the list: bring it into view in the document. Picked in the
    // document: it is already in view, so the document stays still.
    if (lvId && source === "list") setFocusKey((key) => key + 1);
  }, []);

  const onPdfSelect = useCallback((lvId: string) => select(lvId, "pdf"), [select]);
  const onShowInPdf = useCallback((lvId: string) => select(lvId, "list"), [select]);

  const save = async (lvId: string, patch: ItemPatch) => {
    setBando(await api.patchItem(bando.id, lvId, patch));
  };

  const selected = selectedId ? bando.items.find((item) => item.lv_id === selectedId) : undefined;
  const railCount = bando.page_count || pageCount;

  return (
    <div className="review">
      <section className="review__list">
        <ItemList
          items={bando.items}
          results={results}
          states={states}
          productsById={productsById}
          products={products}
          rules={rules}
          types={types}
          parameters={bando.parameters}
          selectedId={selectedId}
          onSelect={select}
          onShowInPdf={onShowInPdf}
          onSave={save}
        />
      </section>
      <PageRail
        pageCount={railCount}
        pageTypes={bando.page_types}
        types={types}
        itemsPerPage={itemsPerPage}
        current={currentPage}
        selectedPage={selected?.source_page ?? null}
        hidden={arriving}
        onJump={(page, smooth) => pdfRef.current?.scrollToPage(page, smooth)}
      />
      <section className="review__pdf">
        <PdfViewer
          ref={pdfRef}
          url={api.pdfUrl(bando.id)}
          items={bando.items}
          results={results}
          states={states}
          pageTypes={types}
          selectedId={selectedId}
          focusKey={focusKey}
          onSelect={onPdfSelect}
          onPageChange={setCurrentPage}
          onPageCount={setPageCount}
        />
      </section>
    </div>
  );
}
