import type { PipelineState } from "../api/types";
import { PIPELINE_ORDER, STEP_LABELS } from "../lib/flags";

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function ProcessingOverlay({
  pipeline,
  title,
}: {
  pipeline: PipelineState;
  title?: string | null;
}) {
  const steps = PIPELINE_ORDER;
  const activeIndex = steps.indexOf(pipeline.step);
  const progress =
    pipeline.status === "done"
      ? 1
      : pipeline.status === "failed"
        ? 0
        : (activeIndex + 0.5) / steps.length;
  const failed = pipeline.status === "failed";

  return (
    <div className="processing">
      <div className="processing__panel">
        <div className={`processing__ring ${failed ? "is-failed" : ""}`}>
          <svg viewBox="0 0 120 120" aria-hidden>
            <circle className="processing__track" cx="60" cy="60" r={RADIUS} />
            <circle
              className="processing__arc"
              cx="60"
              cy="60"
              r={RADIUS}
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
            />
          </svg>
          <span className="processing__pct">
            {failed ? "!" : `${Math.round(progress * 100)}%`}
          </span>
        </div>

        <h2 className="processing__title">
          {title ?? "Analisi del documento"}
        </h2>
        <p className="processing__msg">
          {failed
            ? pipeline.error ?? "Elaborazione interrotta."
            : pipeline.message ?? "Avvio dell'elaborazione…"}
        </p>
        {pipeline.item_count > 0 && !failed && (
          <p className="processing__count">
            {pipeline.item_count} posizioni estratte finora
          </p>
        )}

        <ol className="processing__steps">
          {steps.map((step, index) => {
            const state =
              index < activeIndex || pipeline.status === "done"
                ? "done"
                : index === activeIndex
                  ? failed
                    ? "failed"
                    : "active"
                  : "todo";
            return (
              <li key={step} className={`proc-step proc-step--${state}`}>
                <span className="proc-step__dot" aria-hidden />
                {STEP_LABELS[step]}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
