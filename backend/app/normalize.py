"""Normalize webhook fields before persisting call records."""
import re

VALID_OUTCOMES = frozenset({
    "load_booked", "price_rejected", "no_interest",
    "carrier_ineligible", "transferred", "other",
})
VALID_SENTIMENTS = frozenset({"positive", "neutral", "negative"})


def normalize_outcome(raw: str | bool | None, *, agreed_rate: float = 0, carrier_eligible: bool = True) -> str:
    """Map classifier output to a known outcome label."""
    if isinstance(raw, bool):
        return "load_booked" if raw else "other"

    text = str(raw or "").strip().lower()
    # Unresolved HappyRobot template placeholders
    if text.startswith("@") or not text:
        text = ""

    if text in VALID_OUTCOMES:
        # "other" is often the default when the classifier didn't resolve
        if text == "other":
            if agreed_rate > 0:
                return "load_booked"
            if not carrier_eligible:
                return "carrier_ineligible"
        return text

    # Common aliases from classifiers
    aliases = {
        "booked": "load_booked",
        "load booked": "load_booked",
        "accepted": "load_booked",
        "rejected": "price_rejected",
        "price rejected": "price_rejected",
        "no interest": "no_interest",
        "not interested": "no_interest",
        "ineligible": "carrier_ineligible",
        "transfer": "transferred",
        "transferred": "transferred",
    }
    if text in aliases:
        return aliases[text]

    # Infer from commercial signals when classifier didn't resolve
    if agreed_rate > 0:
        return "load_booked"
    if not carrier_eligible:
        return "carrier_ineligible"

    return "other"


def normalize_sentiment(raw: str | bool | None) -> str:
    """Map sentiment classifier output to positive | neutral | negative."""
    if raw is True:
        return "positive"
    if raw is False:
        return "negative"

    text = str(raw or "").strip().lower()
    if text.startswith("@"):
        text = ""

    if text in VALID_SENTIMENTS:
        return text

    if text in ("true", "yes", "good", "happy"):
        return "positive"
    if text in ("false", "no", "bad", "angry", "upset"):
        return "negative"

    # Strip trailing booleans accidentally concatenated (e.g. "neutraltrue")
    text = re.sub(r"(true|false)$", "", text).strip()
    if text in VALID_SENTIMENTS:
        return text

    # Pick the first valid token embedded in the string
    for token in VALID_SENTIMENTS:
        if token in text:
            return token

    return "neutral"
