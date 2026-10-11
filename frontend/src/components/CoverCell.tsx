import type { CSSProperties } from "react";
import type { CoverField } from "../api/types";
import { useI18n } from "../i18n";

/**
 * One blank of the cover page, on the page where the PDF prints it: the value
 * covers the dotted leader and sits on its baseline, as the export writes it.
 * The bidder identity and the Netto are read-only here (they come from the
 * company parameters and the computed chain), so the cell is not editable.
 */
export function CoverCell({
  field,
  value,
  style,
  outlined,
}: {
  field: CoverField;
  value: string | null;
  style: CSSProperties;
  outlined: boolean;
}) {
  const { t } = useI18n();
  const height = field.bbox[3] - field.bbox[1];
  const baseline = height > 0 ? (field.baseline - field.bbox[1]) / height : 0.8;
  // The offer total is right-aligned in its box; names and addresses left.
  const left = field.row !== "eingabesumme";

  return (
    <div className={`fc fc--static ${outlined ? "is-outlined" : ""}`} style={style}>
      <span
        className="fc__cell fc__cell--static"
        aria-label={`${field.label} ${value ?? t("formCell.empty")}`}
      >
        {value != null && (
          <span
            className={`fc__value ${left ? "fc__value--left" : ""}`}
            style={{ top: `${baseline * 100}%` }}
          >
            {value}
          </span>
        )}
      </span>
    </div>
  );
}
