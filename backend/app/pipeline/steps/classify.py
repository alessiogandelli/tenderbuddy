"""Step 2 - Classify: guess the title, description and classification of a Bando.

Only the *classification* is a canonical value (English, from the contract enum);
the title and description are left empty when they would only be a language-
specific default, so the UI can render a localized fallback. Categorization stays
English and is translated at presentation time.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional, Tuple

from ...domain.enums import Classification
from ...domain.models import BandoIdentity, LocalizedText
from ..extractors import Document
from ..ai.usage import UsageLedger

_KEYWORDS = {
    Classification.VENTILATION: (
        "lüftung",
        "zuluft",
        "abluft",
        "tellerventil",
        "ventil",
        "kanal",
        "brandschutzklappe",
        "schalldämpfer",
    ),
    Classification.HVAC: ("heizung", "heiz", "wärme", "klima"),
    Classification.PLUMBING: ("sanitär", "wasser", "abwasser", "rohr"),
    Classification.ELECTRICAL: ("elektro", "strom", "beleuchtung", "kabel"),
    Classification.BUILDING: ("mauer", "beton", "gebäude", "rohbau"),
}

_BKP_RE = re.compile(r"BKP\s*(\d+)", re.IGNORECASE)
_PROJECT_RE = re.compile(r"(SH [A-ZÄÖÜ][^\n]*?)(?:\s+\d{3}\.\d{2}\s+LA|$)")


def _score(text: str, words: Tuple[str, ...]) -> int:
    return sum(text.count(word) for word in words)


def _clean_text(document: Document) -> str:
    """Drop page headers/footers (file paths, 'Baukosten', page numbers) that
    would otherwise bias the keyword scoring."""
    lines = []
    for page in document.pages:
        for line in page.text.splitlines():
            low = line.strip().lower()
            if not low:
                continue
            if "h:\\" in low or "baukosten" in low or "submission" in low:
                continue
            if low.startswith("seite") or "/ 20" in low or "/ 40" in low:
                continue
            lines.append(line)
    return "\n".join(lines)


def classify_document(
    document: Document, source_file: str
) -> Tuple[Optional[str], Optional[str], Classification]:
    cleaned = _clean_text(document)
    text = cleaned.lower()

    classification = Classification.OTHER
    best = 0
    for candidate, words in _KEYWORDS.items():
        score = _score(text, words)
        if score > best:
            best = score
            classification = candidate

    project = ""
    match = _PROJECT_RE.search(cleaned)
    if match:
        project = match.group(1).strip()

    bkp = _BKP_RE.search(source_file) or _BKP_RE.search(text)

    # Title and description stay None unless we have real, language-neutral
    # content (a BKP number or the project name); the UI localizes the rest.
    parts = []
    if bkp:
        parts.append("BKP " + bkp.group(1))
    if project:
        parts.append(project)
    description = " — ".join(parts) if parts else None

    return None, description, classification


@dataclass
class ClassificationResult:
    """The Bando's identity: a canonical fallback plus the four-language version."""

    title: Optional[str]
    description: Optional[str]
    classification: Classification
    identity: Optional[BandoIdentity] = None


def _localized(mapping: dict) -> LocalizedText:
    return LocalizedText(
        en=mapping.get("en", ""),
        de=mapping.get("de", ""),
        fr=mapping.get("fr", ""),
        it=mapping.get("it", ""),
    )


def build_classification(
    document: Document,
    source_file: str,
    *,
    use_ai: bool,
    usage: Optional[UsageLedger] = None,
) -> ClassificationResult:
    """Classify the Bando, naming it with a quick AI read of the opening pages.

    The classification itself stays deterministic (a canonical English enum);
    only the title and the one-line description come from Luna, in the four app
    languages (the English slot is the canonical fallback). Any failure falls
    back to the heuristic classifier so a run never breaks on the model.
    """
    _, description, classification = classify_document(document, source_file)

    if use_ai:
        try:
            from ..ai.classify import document_identity

            data = document_identity(document, usage=usage)
            title_i18n = _localized(data.get("title") or {})
            description_i18n = _localized(data.get("description") or {})
            if title_i18n.en or description_i18n.en:
                identity = BandoIdentity(
                    title=title_i18n, description=description_i18n
                )
                return ClassificationResult(
                    title=title_i18n.en or None,
                    description=description_i18n.en or description,
                    classification=classification,
                    identity=identity,
                )
        except Exception:  # noqa: BLE001 - identity must never fail the run
            pass

    return ClassificationResult(
        title=None, description=description, classification=classification
    )
