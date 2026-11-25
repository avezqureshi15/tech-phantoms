"""Checking a spoken recitation against the line it should have been.

What the person said arrives as text from speech recognition, which is good but not perfect, so the
comparison is deliberately forgiving about spelling and punctuation and strict about missing or
different words. It reports exactly which words were missed, which were different and which were
added, so a correction can be specific and kind instead of a guess.
"""

import re
import unicodedata
from dataclasses import dataclass, field
from difflib import SequenceMatcher

SAME_WORD = 0.75  # how alike two spellings must be to count as the same word
MAX_WORDS = 80


def _chars(*codes: int | range) -> str:
    return "".join(chr(c) for item in codes for c in (item if isinstance(item, range) else [item]))


# Marks that carry no wording: danda and double danda, Arabic comma and semicolon, quotes, dashes.
_PUNCTUATION = re.compile(
    "["
    + re.escape(
        _chars(
            0x0964, 0x0965, 0x060C, 0x061B, 0x066B, 0x066C, range(0x2018, 0x2020), 0x2013, 0x2014
        )
    )
    + re.escape(".,;:!?()[]{}\"'`~*_-/\\|<>")
    + "]"
)
_INVISIBLE = re.compile(
    "[" + re.escape(_chars(range(0x200B, 0x2010), range(0x202A, 0x202F), 0x2060, 0xFEFF)) + "]"
)
# Arabic/Urdu vowel marks vary freely in transcripts; they do not change the word being said.
_ARABIC_MARKS = re.compile(
    "[" + re.escape(_chars(range(0x064B, 0x0660), 0x0670, range(0x06D6, 0x06EE))) + "]"
)

# Spellings that differ without the word sounding different, folded so they compare equal. Speech
# recognition chooses between them freely, so they must never be reported as the person's mistake.
_FOLD = str.maketrans(
    {
        # Devanagari: nasal marks, nukta, visarga, long/short vowels, similar sibilants and nasals
        "\u0901": "",
        "\u0902": "",
        "\u093c": "",
        "\u0903": "",
        "\u0940": "\u093f",
        "\u0942": "\u0941",
        "\u0908": "\u0907",
        "\u090a": "\u0909",
        "\u0937": "\u0938",
        "\u0936": "\u0938",
        "\u0923": "\u0928",
        "\u0933": "\u0932",
        "\u0919": "",
        "\u091e": "",
        # Arabic script: letter shapes that are used interchangeably
        "\u0649": "\u064a",
        "\u06cc": "\u064a",
        "\u06a9": "\u0643",
        "\u0629": "\u0647",
        "\u06d5": "\u0647",
        "\u0623": "\u0627",
        "\u0625": "\u0627",
        "\u0622": "\u0627",
    }
)
_LATIN_VARIANTS = (
    ("aa", "a"),
    ("ee", "i"),
    ("oo", "u"),
    ("ii", "i"),
    ("uu", "u"),
    ("w", "v"),
    ("ph", "f"),
)


def fold(word: str) -> str:
    """The word with harmless spelling variation removed."""
    word = word.translate(_FOLD)
    if word.isascii():
        for variant, plain in _LATIN_VARIANTS:
            word = word.replace(variant, plain)
        word = re.sub(r"(.)\1+", r"\1", word)  # doubled letters
    return word


@dataclass(frozen=True)
class Difference:
    expected: str
    heard: str


@dataclass
class Result:
    verdict: str  # correct | close | retry | unclear
    score: float  # share of the expected words said correctly, 0 to 1
    missing: list[str] = field(default_factory=list)  # expected words not said
    different: list[Difference] = field(default_factory=list)  # said, but not the word expected
    extra: list[str] = field(default_factory=list)  # said, but not in the line
    note: str | None = None


def words(text: str) -> list[str]:
    """The comparable words of a line: no punctuation, no invisible marks, one case, one form."""
    text = unicodedata.normalize("NFC", text)
    text = _ARABIC_MARKS.sub("", _INVISIBLE.sub("", _PUNCTUATION.sub(" ", text))).lower()
    return text.split()[:MAX_WORDS]


def _alike(a: str, b: str) -> float:
    return 1.0 if a == b else SequenceMatcher(None, a, b).ratio()


def _script(word: str) -> str:
    for char in word:
        if char.isalpha():
            return unicodedata.name(char, "?").split(" ")[0]
    return "?"


def compare(expected: str, heard: str) -> Result:
    want, said = words(expected), words(heard)
    want_f, said_f = [fold(w) for w in want], [fold(w) for w in said]
    if not want:
        return Result("unclear", 0.0, note="There is no line to check against.")
    if not said:
        return Result("unclear", 0.0, missing=want, note="Nothing was heard.")

    # Different scripts (say Roman against Devanagari) cannot be compared word by word.
    if _script(want[0]) != _script(said[0]) and not any(
        _alike(w, s) >= SAME_WORD for w in want_f for s in said_f
    ):
        return Result(
            "unclear",
            0.0,
            note="The line and what was heard are in different scripts, so they can't be compared.",
        )

    # Align the two word lists (a small edit-distance table where near-equal spellings match).
    rows, cols = len(want), len(said)
    best = [[0.0] * (cols + 1) for _ in range(rows + 1)]
    for i in range(1, rows + 1):
        for j in range(1, cols + 1):
            similarity = _alike(want_f[i - 1], said_f[j - 1])
            match = best[i - 1][j - 1] + (similarity if similarity >= SAME_WORD else 0.0)
            best[i][j] = max(match, best[i - 1][j], best[i][j - 1])

    matched = 0.0
    missing: list[str] = []
    different: list[Difference] = []
    extra: list[str] = []
    i, j = rows, cols
    steps: list[tuple[str, str | None, str | None]] = []
    while i > 0 or j > 0:
        if i > 0 and j > 0:
            similarity = _alike(want_f[i - 1], said_f[j - 1])
            if similarity >= SAME_WORD and best[i][j] == best[i - 1][j - 1] + similarity:
                steps.append(("ok", want[i - 1], said[j - 1]))
                matched += 1.0
                i, j = i - 1, j - 1
                continue
        if i > 0 and (j == 0 or best[i][j] == best[i - 1][j]):
            steps.append(("miss", want[i - 1], None))
            i -= 1
        else:
            steps.append(("extra", None, said[j - 1]))
            j -= 1
    steps.reverse()

    # A missed word next to an added one is one substitution (the person said a different word).
    k = 0
    while k < len(steps):
        kind, w, s = steps[k]
        nxt = steps[k + 1] if k + 1 < len(steps) else None
        if kind == "miss" and nxt and nxt[0] == "extra":
            different.append(Difference(w or "", nxt[2] or ""))
            k += 2
            continue
        if kind == "extra" and nxt and nxt[0] == "miss":
            different.append(Difference(nxt[1] or "", s or ""))
            k += 2
            continue
        if kind == "miss":
            missing.append(w or "")
        elif kind == "extra":
            extra.append(s or "")
        k += 1

    score = round(matched / len(want), 3)
    if score >= 0.95 and not extra:
        verdict = "correct"
    elif score >= 0.8:
        verdict = "close"
    elif score >= 0.4:
        verdict = "retry"
    else:
        verdict = "unclear"  # so little matched it may be noise, or something else entirely
    return Result(verdict, score, missing, different, extra)
