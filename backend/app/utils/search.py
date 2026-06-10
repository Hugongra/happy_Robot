"""Normalize load-search query params from voice/STT/HappyRobot."""
import re

# Common STT mishears and aliases → canonical equipment in seed data
_EQUIPMENT_ALIASES: dict[str, str] = {
    "dry van": "Dry Van",
    "dryvan": "Dry Van",
    "dry-van": "Dry Van",
    "drive van": "Dry Van",   # frequent STT error
    "dry ban": "Dry Van",
    "van": "Dry Van",
    "reefer": "Reefer",
    "refrigerated": "Reefer",
    "refeer": "Reefer",
    "flatbed": "Flatbed",
    "flat bed": "Flatbed",
    "flat-bed": "Flatbed",
}

_STATE_TO_ABBR: dict[str, str] = {
    "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR",
    "california": "CA", "colorado": "CO", "connecticut": "CT", "delaware": "DE",
    "florida": "FL", "georgia": "GA", "hawaii": "HI", "idaho": "ID",
    "illinois": "IL", "indiana": "IN", "iowa": "IA", "kansas": "KS",
    "kentucky": "KY", "louisiana": "LA", "maine": "ME", "maryland": "MD",
    "massachusetts": "MA", "michigan": "MI", "minnesota": "MN", "mississippi": "MS",
    "missouri": "MO", "montana": "MT", "nebraska": "NE", "nevada": "NV",
    "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
    "north carolina": "NC", "north dakota": "ND", "ohio": "OH", "oklahoma": "OK",
    "oregon": "OR", "pennsylvania": "PA", "rhode island": "RI", "south carolina": "SC",
    "south dakota": "SD", "tennessee": "TN", "texas": "TX", "utah": "UT",
    "vermont": "VT", "virginia": "VA", "washington": "WA", "west virginia": "WV",
    "wisconsin": "WI", "wyoming": "WY",
}


def sanitize_query_param(raw: str | None) -> str | None:
    """Drop empty values and unresolved HappyRobot placeholders like @origin."""
    if raw is None:
        return None
    text = str(raw).strip()
    if not text or text.startswith("@"):
        return None
    return text


def normalize_equipment(raw: str | None) -> str | None:
    text = sanitize_query_param(raw)
    if not text:
        return None
    key = re.sub(r"[\s_-]+", " ", text.lower()).strip()
    if key in _EQUIPMENT_ALIASES:
        return _EQUIPMENT_ALIASES[key]
    # Title-case fallback for exact seed values ("Dry Van", "Reefer", "Flatbed")
    titled = text.strip().title().replace("Van", "Van")
    if titled in ("Dry Van", "Reefer", "Flatbed"):
        return titled
    return text.strip()


def normalize_location(raw: str | None) -> str | None:
    """Extract searchable city token; map full state names to abbreviations."""
    text = sanitize_query_param(raw)
    if not text:
        return None

    # "Dallas, Texas" → search token "Dallas" (matches "Dallas, TX" in DB)
    city = text.split(",")[0].strip()
    if not city:
        return None

    # If caller gave "Atlanta Georgia" without comma, keep the whole phrase minus trailing state
    lower = text.lower()
    for state_name, abbr in _STATE_TO_ABBR.items():
        if lower.endswith(f", {state_name}"):
            city = text[: -(len(state_name) + 2)].split(",")[0].strip()
            break
        if lower.endswith(f" {state_name}"):
            city = text[: -(len(state_name))].strip().split(",")[0].strip()
            break

    return city
