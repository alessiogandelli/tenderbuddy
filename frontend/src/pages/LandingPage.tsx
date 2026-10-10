import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { BandoSummary } from "../api/types";
import { formatChf, formatDate } from "../lib/format";
import { CLASSIFICATION_LABELS } from "../lib/flags";

export function LandingPage() {
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
      .catch(() => setError("Non riesco a contattare il backend. È avviato su :8000?"));
  }, []);

  const upload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const bando = await api.upload(file);
      navigate(`/bandi/${bando.id}`);
    } catch {
      setError("Caricamento non riuscito. Riprova con un PDF.");
      setUploading(false);
    }
  };

  return (
    <div className="landing">
      <section className="hero">
        <h1 className="hero__title">
          Dal bando al <em>primo prezzo</em>.
        </h1>
        <p className="hero__sub">
          Carica il PDF di gara. Ogni cifra resta agganciata alla pagina da cui è
          stata presa, e ogni posizione incerta è modificabile.
        </p>

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
            {uploading ? "Carico il documento…" : "Trascina qui il PDF del bando"}
          </span>
          <span className="dropzone__hint">
            {uploading ? "Preparo l'elaborazione" : "oppure clicca per scegliere un file"}
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
            <span className="how__n">1</span> Carica il PDF di gara
          </li>
          <li>
            <span className="how__n">2</span> Rivedi ogni voce con la sua fonte
          </li>
          <li>
            <span className="how__n">3</span> Leggi il preventivo, esportalo
          </li>
        </ol>

        {error && <p className="banner banner--error">{error}</p>}
      </section>

      {bandi.length > 0 && (
        <section className="recent">
          <h2 className="recent__title">Bandi recenti</h2>
          <ul className="recent__list">
            {bandi.map((bando) => (
              <li key={bando.id}>
                <button
                  type="button"
                  className="recent__row"
                  onClick={() => navigate(`/bandi/${bando.id}`)}
                >
                  <span className="recent__name">
                    {bando.title ?? "Bando senza titolo"}
                  </span>
                  <span className="chip chip--soft">
                    {CLASSIFICATION_LABELS[bando.classification]}
                  </span>
                  <span className="recent__meta">{bando.page_count} pagine</span>
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
