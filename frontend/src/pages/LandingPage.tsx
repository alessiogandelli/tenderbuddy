import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { BandoSummary } from "../api/types";
import { formatChf, formatDate } from "../lib/format";
import { useI18n } from "../i18n";

export function LandingPage() {
  const { t } = useI18n();
  const [bandi, setBandi] = useState<BandoSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    api
      .listBandi()
      .then((list) => {
        setBandi(list);
        setError(null);
      })
      .catch(() => setError(t("landing.errorBackend")));
  }, [t]);

  const upload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const bando = await api.upload(file);
      navigate(`/bandi/${bando.id}`);
    } catch {
      setError(t("landing.errorUpload"));
      setUploading(false);
    }
  };

  return (
    <div className="landing">
      <section className="hero">
        <h1 className="hero__title">
          {t("landing.titleLead")} <em>{t("landing.titleAccent")}</em>
        </h1>
        <p className="hero__sub">{t("landing.subtitle")}</p>

        <button
          type="button"
          className={`dropzone ${dragOver ? "is-drag" : ""} ${uploading ? "is-busy" : ""}`}
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            const file = event.dataTransfer.files[0];
            if (file) void upload(file);
          }}
        >
          <span className="dropzone__glyph" aria-hidden>
            {uploading ? "…" : "↑"}
          </span>
          <span className="dropzone__label">
            {uploading ? t("landing.dropzoneBusy") : t("landing.dropzoneIdle")}
          </span>
          <span className="dropzone__hint">
            {uploading ? t("landing.dropzoneBusyHint") : t("landing.dropzoneHint")}
          </span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
        />

        <ol className="how">
          <li>
            <span className="how__n">1</span> {t("landing.how1")}
          </li>
          <li>
            <span className="how__n">2</span> {t("landing.how2")}
          </li>
          <li>
            <span className="how__n">3</span> {t("landing.how3")}
          </li>
        </ol>

        {error && <p className="banner banner--error">{error}</p>}
      </section>

      {bandi.length > 0 && (
        <section className="recent">
          <h2 className="recent__title">{t("landing.recent")}</h2>
          <ul className="recent__list">
            {bandi.map((bando) => (
              <li key={bando.id}>
                <button
                  type="button"
                  className="recent__row"
                  onClick={() => navigate(`/bandi/${bando.id}`)}
                >
                  <span className="recent__name">
                    {bando.title ||
                      (bando.classification !== "other"
                        ? t(`classification.${bando.classification}`)
                        : t("common.untitledTender"))}
                  </span>
                  <span className="chip chip--soft">
                    {t(`classification.${bando.classification}`)}
                  </span>
                  <span className="recent__meta">
                    {t("common.pages", { count: bando.page_count })}
                  </span>
                  <span className="recent__date">{formatDate(bando.created_at)}</span>
                  <span className="recent__price">
                    {formatChf(bando.totals.indicative_price_chf)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
