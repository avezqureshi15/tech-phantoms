"""The shape of the database: no foreign-key cycles, and every cascade diamond accounted for."""

from collections import defaultdict

from sqlalchemy.sql.ddl import sort_tables_and_constraints

from festiveos.db import registry  # noqa: F401
from festiveos.db.base import Base

# A table reachable from a deleted row by two CASCADE paths is deleted in an order Postgres
# chooses, so concurrent writers that lock those rows in another order can deadlock. Each one
# below has an explicit lock order protecting it (docs/concurrency.md). A new diamond must be
# reviewed the same way before it is added here.
KNOWN_CASCADE_DIAMONDS = {
    ("users", "refresh_tokens"),  # directly, and through auth_sessions
    ("households", "tradition_occurrences"),  # through festivals, and through traditions
}


def test_foreign_keys_have_no_cycles() -> None:
    ordered = sort_tables_and_constraints(list(Base.metadata.tables.values()))

    cyclic = [fks for table, fks in ordered if table is None and fks]
    assert not cyclic, "tables reference each other in a loop"


def test_cascade_diamonds_are_the_known_ones() -> None:
    cascades = defaultdict(list)  # parent -> children it cascades to
    for table in Base.metadata.tables.values():
        for fk in table.foreign_keys:
            if fk.ondelete == "CASCADE":
                cascades[fk.column.table.name].append(table.name)

    def paths_to(root: str) -> dict[str, int]:
        counts: dict[str, int] = defaultdict(int)
        stack = [root]
        while stack:
            for child in cascades[stack.pop()]:
                counts[child] += 1
                stack.append(child)
        return counts

    diamonds = {
        (root, child)
        for root in ("users", "households", "festivals", "traditions", "auth_sessions")
        for child, count in paths_to(root).items()
        if count > 1
    }
    assert diamonds == KNOWN_CASCADE_DIAMONDS
