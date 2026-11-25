"""requirements*.txt are a pip-compatible view of uv.lock. This keeps them from drifting apart."""

import re
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROJECT = "festiveos-backend"


def normalise(name: str) -> str:
    return re.sub(r"[-_.]+", "-", name).lower()


def parse_requirements(path: Path) -> dict[str, str]:
    pins: dict[str, str] = {}
    for raw in path.read_text().splitlines():
        line = raw.split("#")[0].strip()
        if not line or line.startswith("-r "):
            continue
        match = re.match(r"^([A-Za-z0-9._-]+)==([^\s;]+)", line)
        assert match, f"not an exact pin: {raw!r}"
        name = normalise(match.group(1))
        assert name not in pins, f"{name} listed twice in {path.name}"
        pins[name] = match.group(2)
    return pins


def load_lock() -> tuple[dict[str, dict], dict]:
    lock = tomllib.loads((ROOT / "uv.lock").read_text())
    packages = {normalise(p["name"]): p for p in lock["package"]}
    return packages, packages[PROJECT]


def closure(packages: dict[str, dict], roots: list[dict]) -> set[str]:
    """Every package reachable from ``roots`` (lock dependency entries), following extras."""
    seen: set[str] = set()
    stack = list(roots)
    while stack:
        entry = stack.pop()
        name = normalise(entry["name"])
        package = packages[name]
        seen.add(name)
        for extra in entry.get("extra", []):
            stack.extend(package["optional-dependencies"][extra])
        stack.extend(d for d in package.get("dependencies", []) if normalise(d["name"]) not in seen)
    return seen


def test_runtime_requirements_match_the_lockfile() -> None:
    packages, root = load_lock()
    runtime = closure(packages, root["dependencies"])
    pins = parse_requirements(ROOT / "requirements.txt")

    assert set(pins) == runtime
    assert pins == {name: packages[name]["version"] for name in runtime}


def test_dev_requirements_add_exactly_the_dev_group() -> None:
    packages, root = load_lock()
    runtime = closure(packages, root["dependencies"])
    dev = closure(packages, root["dev-dependencies"]["dev"])
    pins = parse_requirements(ROOT / "requirements-dev.txt")

    assert set(pins) == dev - runtime
    assert pins == {name: packages[name]["version"] for name in dev - runtime}
    assert (ROOT / "requirements-dev.txt").read_text().lstrip().startswith("-r requirements.txt")


def test_every_direct_dependency_in_pyproject_is_in_the_lock() -> None:
    pyproject = tomllib.loads((ROOT / "pyproject.toml").read_text())
    declared = {
        normalise(re.split(r"[\[<>=!~ ]", d, maxsplit=1)[0])
        for d in pyproject["project"]["dependencies"]
    }
    _, root = load_lock()

    assert declared == {normalise(d["name"]) for d in root["dependencies"]}
