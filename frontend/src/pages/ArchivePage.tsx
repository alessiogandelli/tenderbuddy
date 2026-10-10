import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { BandoSummary } from "../api/types";
import { CoverageBar } from "../components/CoverageBar";
import { formatChf, formatDate } from "../lib/format";
import { CLASSIFICATION_LABELS } from "../lib/flags";

export function ArchivePage() {
  const [bandi, setBandi] = useState<BandoSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const navigate = useNavigate();

  const load = async () => {
    try {
      setBandi(await api.listBandi());
      setError(null);
    } catch {
      setError("Non riesco a contattare il backend. È avviato su :8000?");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const bando = await api.upload(file);
      navigate(`/bandi/${bando.id}`);
    } catch {
      setError("Caricamento non riuscito. Riprova con un PDF.");
      setUploading(false);
    }
  };

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <h2>Archivio bandi</h2>
          <p className="page__sub">
            Ogni bando caricato diventa un preventivo. I bandi precedenti restano qui.
          </p>
        </div>
      </header>

      <section
        className={`uploader ${dragOver ? "is-drag" : ""}`}
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
        <div className="uploader__icon" aria-hidden>
          ⬆️
        </div>
        <div>
          <h3>Carica un bando</h3>
          <p>Trascina qui il PDF del bando, oppure scegli un file.</p>
        </div>
        <button
          type="button"
          className="btn btn--primary"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? "Carico…" : "Scegli PDF"}
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
      </section>

      {error && <p className="banner banner--error">{error}</p>}

      {loading ? (
        <p className="muted">Carico l'archivio…</p>
      ) : bandi.length === 0 ? (
        <p className="empty">Nessun bando ancora. Caricane uno per iniziare.</p>
      ) : (
        <div className="cards">
          {bandi.map((bando) => {
            const total = Object.values(bando.coverage).reduce((a, b) => a + b, 0);
            return (
              <article
                key={bando.id}
                className="bando-card"
                onClick={() => navigate(`/bandi/${bando.id}`)}
              >
                <header className="bando-card__head">
                  <h3>{bando.title ?? "Bando senza titolo"}</h3>
                  <span className="chip">{CLASSIFICATION_LABELS[bando.classification]}</span>
                </header>
                <p className="bando-card__desc">{bando.description ?? "—"}</p>
                <CoverageBar coverage={bando.coverage} total={total} />
                <footer className="bando-card__foot">
                  <span>{formatDate(bando.created_at)}</span>
                  <span className="strong">
                    {formatChf(bando.totals.indicative_price_chf)}
                  </span>
                </footer>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
