import type { ItemStatus, PipelineStatus } from "../api/types";
import { PIPELINE_STATUS_LABELS, STATUS_LABELS } from "../lib/flags";

export function StatusPill({ status }: { status: ItemStatus }) {
  return <span className={`pill pill--${status}`}>{STATUS_LABELS[status]}</span>;
}

export function PipelinePill({ status }: { status: PipelineStatus }) {
  return (
    <span className={`pill pill--pipe-${status}`}>
      {status === "running" && <span className="spinner" aria-hidden />}
      {PIPELINE_STATUS_LABELS[status]}
    </span>
  );
}
