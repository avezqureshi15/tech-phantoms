#!/usr/bin/env python3
import json
import os
import subprocess
from pathlib import Path


def secret(arn: str) -> dict[str, str]:
    response = subprocess.run(
        [
            "aws",
            "secretsmanager",
            "get-secret-value",
            "--secret-id",
            arn,
            "--query",
            "SecretString",
            "--output",
            "text",
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    value = json.loads(response.stdout)
    if not isinstance(value, dict) or not all(
        isinstance(key, str) and isinstance(item, str) for key, item in value.items()
    ):
        raise ValueError("Each Secrets Manager value must be a JSON object of string values")
    return value


def write_env(path: Path, values: dict[str, str]) -> None:
    path.write_text("".join(f"{key}={json.dumps(value)}\n" for key, value in values.items()))
    path.chmod(0o600)


def write_password(path: Path, value: str) -> None:
    path.write_text(value)
    path.chmod(0o600)


def main() -> None:
    target = Path("/run/secrets")
    target.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(target, 0o700)

    diya = secret(os.environ["DIYA_SERVER_SECRET_ARN"])
    festiveos = secret(os.environ["FESTIVEOS_SECRET_ARN"])
    postgres = secret(os.environ["POSTGRES_SECRET_ARN"])

    required_passwords = ("POSTGRES_PASSWORD", "DIYA_APP_PASSWORD", "FESTIVEOS_APP_PASSWORD")
    for key in required_passwords:
        if not postgres.get(key):
            raise ValueError(f"Postgres secret is missing {key}")

    write_env(target / "diya-server.env", diya)
    write_env(target / "festiveos.env", festiveos)
    write_password(target / "postgres-password", postgres["POSTGRES_PASSWORD"])
    write_password(target / "diya-app-password", postgres["DIYA_APP_PASSWORD"])
    write_password(target / "festiveos-app-password", postgres["FESTIVEOS_APP_PASSWORD"])


if __name__ == "__main__":
    main()
