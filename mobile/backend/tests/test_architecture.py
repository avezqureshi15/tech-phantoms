"""Enforces the module boundaries described in AGENTS.md.

Two rules keep the codebase from sliding back into a tangle:

1. Feature modules form a one-way graph (no cycles, no sideways reach-ins).
2. Inside a feature, each file only talks to the layers beneath it:
   router -> dependencies -> service -> repository -> models
"""

import ast
from pathlib import Path

import pytest

SRC = Path(__file__).resolve().parents[1] / "src" / "festiveos"

# Shared kernel: anything may import these; they may import no feature.
KERNEL = {"core", "db", "config", "integrations"}

# feature -> the other features it may depend on
FEATURE_DEPENDENCIES: dict[str, set[str]] = {
    "users": set(),
    "auth": {"users"},
    "households": {"users", "auth"},
    "festivals": {"users", "auth", "households"},
    "inventory": {"users", "auth", "households"},
    "expenses": {"users", "auth", "households", "festivals"},
    "traditions": {"users", "auth", "households", "festivals"},
    "accounts": {"users", "auth", "households"},
    "ai": {"users", "auth", "households", "festivals", "inventory"},
    "panchang": {"users", "auth"},
    "audio": {"users", "auth"},
    "search": {"users", "auth", "households", "festivals", "traditions", "expenses"},
}

# file in a feature -> the sibling layers it may import (from any feature)
LAYER_IMPORTS: dict[str, set[str]] = {
    "models": {"models"},
    "schemas": {"schemas", "cards", "kinds"},
    "repository": {"models", "kinds"},
    "access": {"repository", "models"},
    "service": {
        "repository",
        "models",
        "schemas",
        "access",
        # ai: the service drives the orchestrator, which drives the tools
        "orchestrator",
        "tools",
        "agents",
        "cards",
        "llm",
        # panchang: the service composes the engine modules
        "astro",
        "balances",
        "kinds",
        "splits",
        "receipts",
        "speech",
        "catalog",
        "daily",
        "festivals",
        "locations",
        "lunar",
    },
    "dependencies": {"service", "models", "repository", "llm"},
    "tools": {
        "service",
        "schemas",
        "models",
        "actions",
        "agents",
        "cards",
        "hosting",
        "jugaad",
        "events",
        "music",
    },
    "actions": {"service", "schemas", "models", "cards"},
    "orchestrator": {"agents", "cards", "llm", "prompts", "tools"},
    "router": {"dependencies", "schemas", "kinds"},
}


def festiveos_imports(path: Path) -> list[list[str]]:
    """Each festiveos import in a file, as its dotted parts without the package name."""
    imports = []
    for node in ast.walk(ast.parse(path.read_text())):
        if isinstance(node, ast.ImportFrom) and node.module and node.module.startswith("festiveos"):
            imports.append(node.module.split(".")[1:])
        elif isinstance(node, ast.Import):
            imports.extend(
                a.name.split(".")[1:] for a in node.names if a.name.startswith("festiveos")
            )
    return imports


def source_files() -> list[Path]:
    return sorted(p for p in SRC.rglob("*.py") if p.name != "__init__.py")


@pytest.mark.parametrize("path", source_files(), ids=lambda p: str(p.relative_to(SRC)))
def test_imports_respect_the_module_boundaries(path: Path) -> None:
    relative = path.relative_to(SRC)
    top = relative.parts[0]
    problems = []

    for parts in festiveos_imports(path):
        target = parts[0] if parts else ""

        if top in KERNEL or relative.name == "main.py":
            # The kernel is imported by everyone and must not reach into any feature.
            # (main.py is the composition root, and db/registry.py registers every model.)
            if (
                top in KERNEL
                and target in FEATURE_DEPENDENCIES
                and relative != Path("db/registry.py")
            ):
                problems.append(f"kernel module imports feature '{target}'")
            continue

        if target in KERNEL or target == top:
            if target == top and len(parts) > 1:
                allowed = LAYER_IMPORTS.get(path.stem)
                if allowed is not None and parts[1] not in allowed | {path.stem}:
                    problems.append(f"{path.stem}.py must not import {top}.{parts[1]}")
            continue

        if target not in FEATURE_DEPENDENCIES.get(top, set()):
            problems.append(f"feature '{top}' must not depend on '{target}'")
            continue

        allowed = LAYER_IMPORTS.get(path.stem)
        if allowed is not None and len(parts) > 1 and parts[1] not in allowed:
            problems.append(f"{path.stem}.py must not import {target}.{parts[1]}")

    assert not problems, "; ".join(problems)


def test_feature_graph_has_no_cycles() -> None:
    def reachable(feature: str, seen: frozenset[str] = frozenset()) -> set[str]:
        out: set[str] = set()
        for dep in FEATURE_DEPENDENCIES[feature]:
            assert dep != feature
            assert dep not in seen, f"cycle through {dep}"
            out |= {dep} | reachable(dep, seen | {feature})
        return out

    for feature in FEATURE_DEPENDENCIES:
        assert feature not in reachable(feature), f"{feature} depends on itself"


def test_every_feature_package_is_declared() -> None:
    packages = {p.name for p in SRC.iterdir() if p.is_dir() and p.name != "__pycache__"}
    assert packages == KERNEL - {"config"} | set(FEATURE_DEPENDENCIES)


def test_no_module_imports_form_a_cycle() -> None:
    """Stricter than the feature graph: no two files may import each other, even indirectly."""
    graph: dict[str, set[str]] = {}
    for path in source_files():
        name = ".".join(path.relative_to(SRC).with_suffix("").parts)
        graph[name] = {".".join(parts) for parts in festiveos_imports(path)}
    known = set(graph)
    graph = {m: {t for t in targets if t in known} for m, targets in graph.items()}

    visiting: set[str] = set()
    done: set[str] = set()

    def visit(module: str, trail: list[str]) -> None:
        if module in done:
            return
        assert module not in visiting, "import cycle: " + " -> ".join([*trail, module])
        visiting.add(module)
        for target in graph[module]:
            visit(target, [*trail, module])
        visiting.discard(module)
        done.add(module)

    for module in graph:
        visit(module, [])
