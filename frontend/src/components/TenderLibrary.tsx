import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FileWarning, Loader2 } from "lucide-react";
import { api } from "../api/client";
import type { BandoSummary, PageTypeEntry, PipelineStatus } from "../api/types";
import { PAGE_TYPE_COLORS } from "../lib/pageTypes";
import { pickLocalized } from "../lib/localized";
import { useI18n } from "../i18n";

const POLL_MS = 3000;
// Like the loading screen's tape, one tick per page; a cap keeps the initial
// render light when a single tender has hundreds of pages.
const MAX_TICKS = 400;

const isRunning = (bando: BandoSummary) =>
  bando.pipeline.status === "running" || bando.pipeline.status === "pending";

function progressOf(bando: BandoSummary): { read: number; total: number } {
  const total = bando.pipeline.pages_total || bando.page_count || 0;
  const read =
    bando.pipeline.status === "done"
      ? total
      : Math.min(bando.pipeline.pages_read ?? 0, total);
  return { read, total };
}

/** One tick per page, coloured by page type, filled up to the pages read. */
function MiniTape({
  total,
  read,
  pageTypes,
  label,
}: {
  total: number;
  read: number;
  pageTypes: PageTypeEntry[];
  label: string;
}) {
  const types = useMemo(
    () => new Map(pageTypes.map((entry) => [entry.page, entry.type])),
    [pageTypes],
  );
  const ticks = useMemo(() => {
    if (total <= 0) return [];
    const count = Math.min(total, MAX_TICKS);
    return Array.from({ length: count }, (_, index) => {
      const page = Math.floor((index * total) / count) + 1;
      const type = types.get(page);
      const isRead = page <= read;
      return { page, type, isRead };
    });
  }, [total, read, types]);

  return (
    <div className="library__tape" role="img" aria-label={label}>
      {ticks.map(({ page, type, isRead }) => (
        <span
          key={page}
          className={`library__tick ${isRead ? "is-read" : ""} ${
            type === "lv_table" ? "is-lv" : ""
          }`}
          style={{
            background: isRead && type ? PAGE_TYPE_COLORS[type] : undefined,
          }}
        />
      ))}
    </div>
  );
}

function statusClass(status: PipelineStatus): string {
  if (status === "failed") return "is-failed";
  if (status === "running" || status === "pending") return "is-running";
  return "is-done";
}

function LibraryCard({ bando }: { bando: BandoSummary }) {
  const { t, locale } = useI18n();
  const { read, total } = progressOf(bando);
  const pct = total > 0 ? Math.round((read / total) * 100) : 0;
  const title =
    pickLocalized(bando.identity?.title, locale) ||
    bando.title ||
    t("common.untitledTender");
  const oneLiner =
    pickLocalized(bando.identity?.description, locale) ||
    bando.overview_summary ||
    bando.description ||
    "";

  return (
    <li className={`library__item ${statusClass(bando.pipeline.status)}`}>
      <Link to={`/bandi/${bando.id}`} className="library__row">
        <div className="library__info">
          <div className="library__cardhead">
            <h3 className="library__name" title={title}>
              {title}
            </h3>
            {isRunning(bando) && (
              <Loader2 size={14} className="spin library__spin" aria-hidden />
            )}
            {bando.pipeline.status === "failed" && (
              <FileWarning size={14} className="library__warn" aria-hidden />
            )}
          </div>
          <p className="library__oneliner">{oneLiner}</p>
        </div>
        <div className="library__progress">
          <MiniTape
            total={total}
            read={read}
            pageTypes={bando.page_types ?? []}
            label={t("library.progress", { read, total })}
          />
          <div className="library__meta">
            <span className="library__pages">
              {t("common.pages", { count: total })}
            </span>
            <span className="library__pct">
              {bando.pipeline.status === "failed"
                ? t("library.failed")
                : t("library.progress", { read, total })}
              {" · "}
              {pct}%
            </span>
          </div>
        </div>
      </Link>
    </li>
  );
}

/**
 * The archive under the upload drop zone: every tender we have read, with its
 * AI one-liner and a page tape. Polls while a run is still in flight so the
 * tape fills live.
 */
export function TenderLibrary() {
  const { t } = useI18n();
  const [bandi, setBandi] = useState<BandoSummary[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .listBandi()
      .then((list) => {
        if (!cancelled) setBandi(list);
      })
      .catch(() => {
        if (!cancelled) setBandi([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const hasRunning = Boolean(bandi?.some(isRunning));
  useEffect(() => {
    if (!hasRunning) return;
    const timer = window.setInterval(() => {
      api
        .listBandi()
        .then(setBandi)
        .catch(() => {
          /* a missed poll is retried on the next tick */
        });
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [hasRunning]);

  if (bandi == null || bandi.length === 0) return null;

  return (
    <section className="library" aria-label={t("library.title")}>
      <div className="library__head">
        <h2 className="library__title">{t("library.title")}</h2>
        <p className="library__sub">{t("library.subtitle")}</p>
      </div>
      <ul className="library__list">
        {bandi.map((bando) => (
          <LibraryCard key={bando.id} bando={bando} />
        ))}
      </ul>
    </section>
  );
}
