import type { PipelineState } from "../api/types";
import { PIPELINE_ORDER } from "../lib/flags";
import { useI18n } from "../i18n";

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function ProcessingOverlay({
  pipeline,
  title,
}: {
  pipeline: PipelineState;
  title?: string | null;
}) {
  const { t } = useI18n();
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

        <h2 className="processing__title">{title || t("processing.title")}</h2>
        <p className="processing__msg">
          {failed
            ? pipeline.error ?? t("processing.stopped")
            : t(`step.${pipeline.step}`)}
        </p>
        {pipeline.item_count > 0 && !failed && (
          <p className="processing__count">
            {t("processing.extracted", { count: pipeline.item_count })}
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
                {t(`step.${step}`)}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
