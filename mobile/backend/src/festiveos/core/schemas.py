from pydantic import BaseModel, ConfigDict


class InputModel(BaseModel):
    """Base for request bodies: trims strings (so "   " fails min_length) and rejects typos."""

    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
