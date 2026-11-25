"""Preparing text to be spoken aloud, and knowing which language it is in.

Spoken text must not contain what a screen shows but a voice cannot say: Markdown marks, links,
emoji.
The language is read from the script the text is written in, so nobody ever has to choose one.
"""

import re
import unicodedata

# (first, last, language) of each Indian script's Unicode block. Latin text is Indian English.
SCRIPTS: tuple[tuple[int, int, str], ...] = (
    (0x0900, 0x097F, "hi-IN"),  # Devanagari: Hindi (also Marathi, Nepali, Sanskrit)
    (0x0980, 0x09FF, "bn-IN"),
    (0x0A00, 0x0A7F, "pa-IN"),
    (0x0A80, 0x0AFF, "gu-IN"),
    (0x0B00, 0x0B7F, "od-IN"),
    (0x0B80, 0x0BFF, "ta-IN"),
    (0x0C00, 0x0C7F, "te-IN"),
    (0x0C80, 0x0CFF, "kn-IN"),
    (0x0D00, 0x0D7F, "ml-IN"),
)
SPEECH_LANGUAGES = frozenset({"en-IN", *(language for _, _, language in SCRIPTS)})
DEFAULT_LANGUAGE = "en-IN"
LANGUAGE_NAMES = {
    "en-IN": "English",
    "hi-IN": "Hindi",
    "bn-IN": "Bengali",
    "pa-IN": "Punjabi",
    "gu-IN": "Gujarati",
    "od-IN": "Odia",
    "ta-IN": "Tamil",
    "te-IN": "Telugu",
    "kn-IN": "Kannada",
    "ml-IN": "Malayalam",
    "mr-IN": "Marathi",
    "ur-IN": "Urdu",
}
MAX_SPOKEN_CHARS = 2_400  # the service takes 2,500; leave room


def detect_language(text: str) -> str:
    """The language of the script most of the letters are written in."""
    counts: dict[str, int] = {}
    letters = 0
    for char in text:
        if not char.isalpha():
            continue
        letters += 1
        code = ord(char)
        for first, last, language in SCRIPTS:
            if first <= code <= last:
                counts[language] = counts.get(language, 0) + 1
                break
    if not letters or not counts:
        return DEFAULT_LANGUAGE
    language, count = max(counts.items(), key=lambda item: item[1])
    return language if count / letters >= 0.3 else DEFAULT_LANGUAGE


def speakable(text: str) -> str:
    """The words only: no Markdown, links, HTML or emoji, ready for a voice."""
    text = re.sub(r"```.*?```", " ", text, flags=re.DOTALL)
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", text)  # images
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)  # a link is read as its words
    text = re.sub(r"https?://\S+", " ", text)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"[*`~]+|__+", "", text)  # emphasis marks vanish without leaving a gap
    text = re.sub(r"[|#>]+", " ", text)
    text = "".join(c for c in text if unicodedata.category(c) not in ("So", "Sk", "Cs", "Cf"))
    return re.sub(r"\s+", " ", text).strip()


def first_chunk(text: str, limit: int = MAX_SPOKEN_CHARS) -> str:
    """At most ``limit`` characters, ending at a sentence boundary where there is one."""
    if len(text) <= limit:
        return text
    cut = text[:limit]
    boundary = max(cut.rfind(mark) for mark in ("।", ". ", "! ", "? ", "\n"))
    return cut[: boundary + 1].strip() if boundary > limit // 2 else cut.strip()
