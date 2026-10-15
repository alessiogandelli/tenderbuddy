import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileSearch, ListChecks, Loader2, Play, Scale, Upload } from "lucide-react";
import { api } from "../api/client";
import { useConnection } from "../api/connection";
import { TenderLibrary } from "../components/TenderLibrary";
import { useI18n } from "../i18n";

/** The entry page: the only thing to do is upload a tender PDF. */
export function UploadPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const offline = useConnection() === "demo";
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError(t("upload.notPdf"));
      return;
    }
    setUploading(file.name);
    setError(null);
    try {
      const bando = await api.upload(file);
      // `fresh`: show the reading screen even if the run is already over.
      navigate(`/bandi/${bando.id}`, { state: { fresh: true } });
    } catch {
      setError(t("upload.error"));
      setUploading(null);
    }
  };

  // Offline: run the bundled example through the pipeline, no PDF needed.
  const simulate = async () => {
    setUploading(t("upload.simulating"));
    setError(null);
    try {
      const bando = await api.simulateUpload();
      navigate(`/bandi/${bando.id}`, { state: { fresh: true } });
    } catch {
      setError(t("upload.error"));
      setUploading(null);
    }
  };

  const steps = [
    { Icon: FileSearch, key: "1" },
    { Icon: Scale, key: "2" },
    { Icon: ListChecks, key: "3" },
  ];

  return (
    <div className="upload">
      <div className="upload__inner">
        <h1 className="upload__title">{t("upload.title")}</h1>
        <p className="upload__sub">{t("upload.subtitle")}</p>

        <div
          className={`drop ${dragOver ? "is-over" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            if (!uploading) void upload(event.dataTransfer.files[0]);
          }}
        >
          <span className="drop__icon">
            {uploading ? <Loader2 size={30} className="spin" /> : <Upload size={30} />}
          </span>
          {uploading ? (
            <p className="drop__title">{t("upload.uploading", { name: uploading })}</p>
          ) : (
            <>
              <p className="drop__title">{t("upload.drop")}</p>
              <p className="drop__or">{t("upload.or")}</p>
              <button
                type="button"
                className="btn btn--primary btn--lg"
                onClick={() => inputRef.current?.click()}
              >
                {t("upload.choose")}
              </button>
              {offline && (
                <button
                  type="button"
                  className="btn btn--lg drop__simulate"
                  onClick={() => void simulate()}
                >
                  <Play size={18} aria-hidden /> {t("upload.simulate")}
                </button>
              )}
              <p className="drop__hint">{offline ? t("upload.simulateHint") : t("upload.hint")}</p>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            hidden
            onChange={(event) => void upload(event.target.files?.[0])}
          />
          {error && (
            <p className="banner banner--error" role="alert">
              {error}
            </p>
          )}
        </div>

        <ol className="how">
          {steps.map(({ Icon, key }) => (
            <li key={key} className="how__step">
              <span className="how__icon">
                <Icon size={20} aria-hidden />
              </span>
              <span>
                <span className="how__n">{t("upload.step", { n: key })}</span>
                <span className="how__title">{t(`upload.how${key}.title`)}</span>
                <span className="how__body">{t(`upload.how${key}.body`)}</span>
              </span>
            </li>
          ))}
        </ol>

        <TenderLibrary />
      </div>
    </div>
  );
}
