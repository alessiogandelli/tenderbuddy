import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Bando } from "../api/types";
import { useI18n } from "../i18n";
import { TOPBAR_SLOT } from "./Layout";

/** The tender's title and classification, shown next to the logo in the top bar. */
export function TenderTitle({ bando }: { bando: Bando }) {
  const { t } = useI18n();
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => setSlot(document.getElementById(TOPBAR_SLOT)), []);
  if (!slot) return null;
  const title = bando.title || bando.description || bando.source_file || t("common.untitledTender");
  return createPortal(
    <>
      <span className="topbar__title" title={bando.source_file ?? title}>
        {title}
      </span>
      {bando.classification !== "other" && (
        <span className="topbar__chip">{t(`classification.${bando.classification}`)}</span>
      )}
    </>,
    slot,
  );
}
