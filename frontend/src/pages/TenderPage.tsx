import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { Bando, Product, ProductivityRule } from "../api/types";
import { ProcessingStage } from "../components/ProcessingStage";
import { StepBar } from "../components/StepBar";
import { TapeMorph, type MorphStart } from "../components/TapeMorph";
import { PIPELINE_ORDER } from "../lib/flags";
import { useI18n } from "../i18n";
import { readScenario, saveScenario } from "../lib/scenario";
import type { TenderContext } from "./tenderContext";

const POLL_MS = 450;

type Phase = "loading" | "processing" | "morph" | "ready";

const isRunning = (bando: Bando) =>
  bando.pipeline.status === "running" || bando.pipeline.status === "pending";

/**
 * One tender. While the pipeline runs it shows only the reading screen; when
 * the run is done the page tape flies into the review screen and the three
 * tabs (review, parameters, price) take over.
 */
export function TenderPage() {
  const { id = "" } = useParams();
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [bando, setBando] = useState<Bando | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [morph, setMorph] = useState<MorphStart | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [rules, setRules] = useState<ProductivityRule[]>([]);
  const [defaults, setDefaults] = useState<Record<string, unknown> | null>(null);
  const typesLoaded = useRef(false);
  const [scenario, setScenarioState] = useState(() => readScenario(id));
  const setScenario = useCallback(
    (next: string) => {
      setScenarioState(next);
      saveScenario(id, next);
    },
    [id],
  );
  useEffect(() => setScenarioState(readScenario(id)), [id]);

  const load = useCallback(async () => {
    try {
      const loaded = await api.getBando(id);
      typesLoaded.current = loaded.page_types.length > 0;
      setBando(loaded);
      setError(null);
      return loaded;
    } catch {
      setError(t("tender.notFound"));
      return null;
    }
  }, [id, t]);

  // Just uploaded: always play the reading screen, even for a run that is
  // already over by the time the page loads.
  const fresh = Boolean((location.state as { fresh?: boolean } | null)?.fresh);
  useEffect(() => {
    setPhase("loading");
    void load().then((loaded) => {
      if (loaded) setPhase(isRunning(loaded) || fresh ? "processing" : "ready");
    });
    // Only on a new tender id; `fresh` is read once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  useEffect(() => {
    void api.catalog().then(setProducts).catch(() => setProducts([]));
    void api.productivity().then(setRules).catch(() => setRules([]));
    void api.parameters().then(setDefaults).catch(() => setDefaults(null));
  }, []);

  // Poll the light pipeline state; fetch the whole tender only when the page
  // types are ready (to colour the tape) and when the run ends.
  const running = bando ? isRunning(bando) : false;
  useEffect(() => {
    if (phase !== "processing" || !running) return;
    let cancelled = false;
    const timer = window.setInterval(async () => {
      try {
        const state = await api.getPipeline(id);
        if (cancelled) return;
        const finished = state.status === "done" || state.status === "failed";
        const classified =
          PIPELINE_ORDER.indexOf(state.step) > PIPELINE_ORDER.indexOf("classify_pages");
        if (finished || (classified && !typesLoaded.current)) {
          await load();
        } else {
          setBando((current) => (current ? { ...current, pipeline: state } : current));
        }
      } catch {
        /* a missed poll is retried on the next tick */
      }
    }, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [phase, running, id, load]);

  const productsById = useMemo(
    () => new Map(products.map((product) => [product.product_id, product])),
    [products],
  );
  const rulesByCode = useMemo(
    () => new Map(rules.map((rule) => [rule.install_code, rule])),
    [rules],
  );

  const onProcessed = useCallback(
    (start: MorphStart) => {
      setMorph(start);
      setPhase("morph");
      // Land on the review tab and drop `fresh`, so a reload does not replay this.
      navigate(`/bandi/${id}`, { replace: true, state: null });
    },
    [id, navigate],
  );

  const retry = async () => {
    try {
      const restarted = await api.runPipeline(id);
      typesLoaded.current = false;
      setBando(restarted);
      setPhase("processing");
    } catch {
      setError(t("tender.retryFailed"));
    }
  };

  if (error && !bando) {
    return (
      <div className="center">
        <p className="banner banner--error">{error}</p>
        <button type="button" className="btn" onClick={() => navigate("/")}>
          {t("tender.backHome")}
        </button>
      </div>
    );
  }
  if (!bando || phase === "loading") {
    return <div className="center muted">{t("common.loading")}</div>;
  }

  if (phase === "processing") {
    return (
      <ProcessingStage
        bando={bando}
        onDone={onProcessed}
        onRetry={() => void retry()}
        onUploadAnother={() => navigate("/")}
      />
    );
  }

  const context: TenderContext = {
    bando,
    setBando,
    products,
    productsById,
    rules: rulesByCode,
    defaults,
    arriving: phase === "morph",
    scenario,
    setScenario,
  };

  return (
    <div className={`tender ${phase === "morph" ? "is-arriving" : ""}`}>
      <div className="tender__body">
        <Outlet context={context} />
      </div>
      <StepBar bando={bando} scenario={scenario} setScenario={setScenario} />
      {phase === "morph" && morph && (
        <TapeMorph start={morph} onEnd={() => setPhase("ready")} />
      )}
    </div>
  );
}
