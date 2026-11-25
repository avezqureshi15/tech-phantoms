"""Reading an uploaded file safely: the bytes decide what it is, not the file's own claim."""

from typing import BinaryIO

from festiveos.core.errors import InvalidInputError

# Magic bytes of the formats the document reader accepts.
SIGNATURES: tuple[tuple[bytes, str], ...] = (
    (b"%PDF-", "application/pdf"),
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"\xff\xd8\xff", "image/jpeg"),
)


def sniff(data: bytes) -> str | None:
    for prefix, content_type in SIGNATURES:
        if data.startswith(prefix):
            return content_type
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def read_limited(file: BinaryIO, max_bytes: int) -> bytes:
    """The file's bytes, refusing anything larger than ``max_bytes`` without reading it all."""
    data = file.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise InvalidInputError(
            f"That file is too large. The limit is {max_bytes // 1_048_576} MB."
        )
    if not data:
        raise InvalidInputError("That file is empty.")
    return data


def checked_document(data: bytes) -> str:
    """The content type of an uploaded document, or a clear refusal."""
    content_type = sniff(data)
    if content_type is None:
        raise InvalidInputError("Please upload a PDF, JPG, PNG or WebP file.")
    return content_type


def sniff_audio(data: bytes) -> str | None:
    """The content type of a short voice recording, judged by its bytes, or None."""
    if data[4:8] == b"ftyp":
        return "audio/mp4"  # m4a / AAC from the phone's recorder
    if data[:4] == b"RIFF" and data[8:12] == b"WAVE":
        return "audio/wav"
    if data[:3] == b"ID3" or data[:2] in (b"\xff\xfb", b"\xff\xf3", b"\xff\xf2"):
        return "audio/mpeg"
    if data[:2] in (b"\xff\xf1", b"\xff\xf9"):
        return "audio/aac"
    if data[:4] == b"OggS":
        return "audio/ogg"
    return None


def checked_audio(data: bytes) -> str:
    content_type = sniff_audio(data)
    if content_type is None:
        raise InvalidInputError("That doesn't look like a voice recording.")
    return content_type
