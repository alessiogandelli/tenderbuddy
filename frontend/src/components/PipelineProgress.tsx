import type { PipelineState } from "../api/types";
import { PIPELINE_ORDER, STEP_LABELS } from "../lib/flags";
import { PipelinePill } from "./StatusPill";

export function PipelineProgress({ pipeline }: { pipeline: PipelineState }) {
  const currentIndex = PIPELINE_ORDER.indexOf(pipeline.step);
  return (
    <div className="pipeline">
      <div className="pipeline__head">
        <h3>Pipeline di estrazione</h3>
        <PipelinePill status={pipeline.status} />
      </div>
      <ol className="pipeline__steps">
        {PIPELINE_ORDER.map((step, index) => {
          const state =
            pipeline.status === "done"
              ? "done"
              : index < currentIndex
                ? "done"
                : index === currentIndex
                  ? pipeline.status === "failed"
                    ? "failed"
                    : "active"
                  : "todo";
          return (
            <li key={step} className={`step step--${state}`}>
              <span className="step__dot" aria-hidden />
              {STEP_LABELS[step]}
            </li>
          );
        })}
      </ol>
      {pipeline.status === "failed" && pipeline.error && (
        <p className="pipeline__error">Errore: {pipeline.error}</p>
      )}
    </div>
  );
}
