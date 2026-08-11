#!/usr/bin/env python3
"""Discover and export a Bubble application's exposed Data API."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen


DEFAULT_BASE_URL = "https://cs.foodchannels-catering.com/version-test/api/1.1"
DEFAULT_OUTPUT = Path(".migration-data")


def request_json(url: str, token: str | None, retries: int = 4) -> dict[str, Any]:
    headers = {"Accept": "application/json", "User-Agent": "FCCD-Bubble-Migrator/1.0"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    for attempt in range(retries + 1):
        try:
            with urlopen(Request(url, headers=headers), timeout=60) as response:
                return json.load(response)
        except HTTPError as error:
            retryable = error.code == 429 or error.code >= 500
            if not retryable or attempt == retries:
                detail = error.read().decode("utf-8", errors="replace")
                raise RuntimeError(f"GET {url} failed ({error.code}): {detail}") from error
            retry_after = error.headers.get("Retry-After")
            delay = float(retry_after) if retry_after else 2**attempt
        except (URLError, TimeoutError) as error:
            if attempt == retries:
                raise RuntimeError(f"GET {url} failed: {error}") from error
            delay = 2**attempt
        time.sleep(delay)

    raise AssertionError("retry loop exited unexpectedly")


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(f"{path.suffix}.tmp")
    temporary.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    temporary.replace(path)


def load_swagger(base_url: str, output: Path, token: str | None) -> dict[str, Any]:
    swagger_path = output / "swagger.json"
    swagger = request_json(f"{base_url.rstrip('/')}/meta/swagger.json", token)
    write_json(swagger_path, swagger)
    return swagger


def collection_paths(swagger: dict[str, Any]) -> list[str]:
    return sorted(
        path
        for path, methods in swagger.get("paths", {}).items()
        if path.startswith("/obj/")
        and "{" not in path
        and isinstance(methods, dict)
        and "get" in methods
    )


def endpoint_name(path: str) -> str:
    return path.removeprefix("/obj/")


def output_name(path: str) -> str:
    name = endpoint_name(path)
    slug = re.sub(r"[^A-Za-z0-9._-]+", "_", name).strip("._") or "data"
    digest = hashlib.sha1(path.encode("utf-8")).hexdigest()[:8]
    return f"{slug}-{digest}.ndjson"


def build_inventory(swagger: dict[str, Any], paths: list[str]) -> dict[str, Any]:
    definitions = swagger.get("definitions", {})
    return {
        "app": swagger.get("info", {}).get("title"),
        "version": swagger.get("info", {}).get("version"),
        "basePath": swagger.get("basePath"),
        "dataApiTypes": [endpoint_name(path) for path in paths],
        "definitions": {
            name: {
                "required": definition.get("required", []),
                "properties": definition.get("properties", {}),
            }
            for name, definition in sorted(definitions.items())
            if isinstance(definition, dict) and definition.get("properties")
        },
    }


def discover(args: argparse.Namespace) -> int:
    swagger = load_swagger(args.base_url, args.output, args.token)
    paths = collection_paths(swagger)
    write_json(args.output / "schema-inventory.json", build_inventory(swagger, paths))
    print(f"Discovered {len(paths)} Data API types.")
    print(f"Schema saved under {args.output}/ (ignored by Git).")
    return 0


def export_collection(
    base_url: str,
    path: str,
    destination: Path,
    token: str | None,
    page_size: int,
    delay: float,
) -> int:
    cursor = 0
    total = 0
    temporary = destination.with_suffix(f"{destination.suffix}.tmp")
    temporary.parent.mkdir(parents=True, exist_ok=True)

    with temporary.open("w", encoding="utf-8") as stream:
        while True:
            query = urlencode({"limit": page_size, "cursor": cursor})
            encoded_path = quote(path, safe="/")
            payload = request_json(f"{base_url.rstrip('/')}{encoded_path}?{query}", token)
            response = payload.get("response", {})
            results = response.get("results", [])
            if not isinstance(results, list):
                raise RuntimeError(f"{path} returned an invalid results payload")

            for record in results:
                stream.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")))
                stream.write("\n")

            count = len(results)
            total += count
            remaining = response.get("remaining")
            if count == 0 or remaining == 0:
                break
            cursor += count
            time.sleep(delay)

    temporary.replace(destination)
    return total


def export_all(args: argparse.Namespace) -> int:
    swagger = load_swagger(args.base_url, args.output, args.token)
    available = collection_paths(swagger)
    requested_names = args.type or []
    available_by_name = {endpoint_name(path).casefold(): path for path in available}
    selected = []
    missing = []
    for requested_name in requested_names:
        path = available_by_name.get(requested_name.casefold())
        if path is None:
            missing.append(requested_name)
        elif path not in selected:
            selected.append(path)
    if not requested_names:
        selected = available
    if missing:
        raise RuntimeError(f"Unknown Data API type(s): {', '.join(sorted(missing))}")

    write_json(args.output / "schema-inventory.json", build_inventory(swagger, available))
    manifest_path = args.output / "export-manifest.json"
    if args.resume and manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if (
            manifest.get("baseUrl") != args.base_url
            or manifest.get("authenticated") != bool(args.token)
        ):
            raise RuntimeError("Existing manifest does not match this API URL/auth mode")
    else:
        manifest = {
            "baseUrl": args.base_url,
            "authenticated": bool(args.token),
            "exports": [],
            "errors": [],
        }

    for index, path in enumerate(selected, start=1):
        name = endpoint_name(path)
        filename = output_name(path)
        previous = next(
            (item for item in manifest["exports"] if item.get("path") == path), None
        )
        if args.resume and previous and (args.output / "objects" / filename).exists():
            print(f"[{index}/{len(selected)}] Skipping {name} (already exported).")
            continue
        print(f"[{index}/{len(selected)}] Exporting {name}...", flush=True)
        manifest["exports"] = [
            item for item in manifest["exports"] if item.get("path") != path
        ]
        manifest["errors"] = [
            item for item in manifest["errors"] if item.get("path") != path
        ]
        try:
            count = export_collection(
                args.base_url,
                path,
                args.output / "objects" / filename,
                args.token,
                args.page_size,
                args.delay,
            )
            manifest["exports"].append(
                {"type": name, "path": path, "file": filename, "records": count}
            )
        except RuntimeError as error:
            manifest["errors"].append({"type": name, "path": path, "error": str(error)})
            print(f"  ERROR: {error}", file=sys.stderr)
        write_json(manifest_path, manifest)
        time.sleep(args.delay)

    exported = sum(item["records"] for item in manifest["exports"])
    print(
        f"Exported {exported} records from {len(manifest['exports'])} types; "
        f"{len(manifest['errors'])} types failed."
    )
    return 1 if manifest["errors"] else 0


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument(
        "--base-url",
        default=os.environ.get("BUBBLE_API_BASE_URL", DEFAULT_BASE_URL),
        help="Bubble API root ending in /api/1.1",
    )
    result.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help="Sensitive export directory (default: .migration-data)",
    )
    result.add_argument(
        "--token",
        default=os.environ.get("BUBBLE_API_TOKEN"),
        help="Bubble API token (prefer BUBBLE_API_TOKEN)",
    )
    subparsers = result.add_subparsers(dest="command", required=True)

    discover_parser = subparsers.add_parser("discover", help="download API schema only")
    discover_parser.set_defaults(handler=discover)

    export_parser = subparsers.add_parser("export", help="export exposed records as NDJSON")
    export_parser.add_argument(
        "--type",
        action="append",
        help="export an API type name (case-insensitive); repeat for multiple types",
    )
    export_parser.add_argument("--page-size", type=int, choices=range(1, 101), default=100)
    export_parser.add_argument(
        "--delay", type=float, default=0.15, help="delay between API requests in seconds"
    )
    export_parser.add_argument(
        "--resume",
        action="store_true",
        help="keep completed exports from the existing manifest",
    )
    export_parser.set_defaults(handler=export_all)
    return result


def main() -> int:
    args = parser().parse_args()
    try:
        return args.handler(args)
    except (RuntimeError, ValueError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
