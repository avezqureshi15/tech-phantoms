class NotFoundError(Exception):
    pass


class ConflictError(Exception):
    pass


class UnauthorizedError(Exception):
    pass


class ForbiddenError(Exception):
    pass


class InvalidInputError(Exception):
    pass


class ServiceUnavailableError(Exception):
    """A dependency we do not control (the AI provider) is down or not configured."""


# The HTTP status each of these means. One map, so a plain response and a streamed error event can
# never disagree about it.
ERROR_STATUS: dict[type[Exception], int] = {
    NotFoundError: 404,
    ConflictError: 409,
    ForbiddenError: 403,
    InvalidInputError: 422,
    UnauthorizedError: 401,
    ServiceUnavailableError: 503,
}


class RateLimitedError(Exception):
    """A client exceeded a rate limit. Carries what the 429 response needs."""

    def __init__(
        self, policy: str, scope: str, retry_after: int, limit: int, key_hint: str
    ) -> None:
        super().__init__(f"Too many requests. Please try again in {retry_after} seconds.")
        self.policy = policy
        self.scope = scope
        self.retry_after = retry_after
        self.limit = limit
        self.key_hint = key_hint
