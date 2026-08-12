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
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen


DEFAULT_BASE_URL = "https://cs.foodchannels-catering.com/api/1.1"
DEFAULT_OUTPUT = Path(".migration-data")
MAX_BUBBLE_CURSOR = 50_000


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
    snapshot_at: str | None,
) -> int:
    def request_page(
        cursor: int,
        limit: int,
        constraints: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        query_values: dict[str, Any] = {"limit": limit, "cursor": cursor}
        if constraints:
            query_values["constraints"] = json.dumps(
                constraints, separators=(",", ":")
            )
        query = urlencode(query_values)
        encoded_path = quote(path, safe="/")
        return request_json(
            f"{base_url.rstrip('/')}{encoded_path}?{query}", token
        ).get("response", {})

    def response_total(response: dict[str, Any]) -> int:
        results = response.get("results", [])
        count = response.get("count")
        if not isinstance(count, int):
            count = len(results) if isinstance(results, list) else 0
        return int(response.get("cursor") or 0) + count + int(
            response.get("remaining") or 0
        )

    def bounded_constraints(start: datetime, end: datetime) -> list[dict[str, Any]]:
        previous_millisecond = start.timestamp() - 0.001
        lower_bound = datetime.fromtimestamp(
            previous_millisecond, timezone.utc
        ).isoformat(timespec="milliseconds").replace("+00:00", "Z")
        upper_bound = end.isoformat(timespec="milliseconds").replace("+00:00", "Z")
        return [
            {
                "key": "Created Date",
                "constraint_type": "greater than",
                "value": lower_bound,
            },
            {
                "key": "Created Date",
                "constraint_type": "less than",
                "value": upper_bound,
            },
        ]

    def partition_count(constraints: list[dict[str, Any]] | None) -> int:
        return response_total(request_page(0, 1, constraints))

    snapshot_datetime = (
        datetime.fromisoformat(snapshot_at.replace("Z", "+00:00"))
        if snapshot_at
        else None
    )
    snapshot_constraints = (
        [
            {
                "key": "Created Date",
                "constraint_type": "less than",
                "value": snapshot_at,
            }
        ]
        if snapshot_at
        else None
    )

    first_response = request_page(0, 1, snapshot_constraints)
    expected_total = response_total(first_response)
    partitions: list[tuple[str, list[dict[str, Any]] | None, int, bool]] = [
        ("all", snapshot_constraints, expected_total, False)
    ]

    if expected_total > MAX_BUBBLE_CURSOR:
        first_results = first_response.get("results", [])
        first_created_at = (
            first_results[0].get("Created Date")
            if first_results and isinstance(first_results[0], dict)
            else None
        )
        if not isinstance(first_created_at, str):
            raise RuntimeError(
                f"{path} exceeds {MAX_BUBBLE_CURSOR} records but has no "
                "Created Date for automatic partitioning"
            )

        first_year = datetime.fromisoformat(
            first_created_at.replace("Z", "+00:00")
        ).year
        current_year = (
            snapshot_datetime.year
            if snapshot_datetime
            else datetime.now(timezone.utc).year
        )
        partitions = []

        for year in range(first_year, current_year + 1):
            year_start = datetime(year, 1, 1, tzinfo=timezone.utc)
            year_end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
            if snapshot_datetime and year_end > snapshot_datetime:
                year_end = snapshot_datetime
            if year_end <= year_start:
                continue
            year_constraints = bounded_constraints(year_start, year_end)
            year_count = partition_count(year_constraints)
            if year_count == 0:
                continue
            if year_count <= MAX_BUBBLE_CURSOR:
                partitions.append((str(year), year_constraints, year_count, False))
                continue

            for month in range(1, 13):
                month_start = datetime(year, month, 1, tzinfo=timezone.utc)
                month_end = (
                    datetime(year + 1, 1, 1, tzinfo=timezone.utc)
                    if month == 12
                    else datetime(year, month + 1, 1, tzinfo=timezone.utc)
                )
                if snapshot_datetime and month_end > snapshot_datetime:
                    month_end = snapshot_datetime
                if month_end <= month_start:
                    continue
                month_constraints = bounded_constraints(month_start, month_end)
                month_count = partition_count(month_constraints)
                if month_count > MAX_BUBBLE_CURSOR:
                    raise RuntimeError(
                        f"{path} partition {year}-{month:02d} still exceeds "
                        f"{MAX_BUBBLE_CURSOR}; a smaller partition is required"
                    )
                if month_count:
                    partitions.append(
                        (
                            f"{year}-{month:02d}",
                            month_constraints,
                            month_count,
                            False,
                        )
                    )

        partition_total = sum(count for _, _, count, _ in partitions)
        if partition_total > expected_total:
            raise RuntimeError(
                f"{path} partition counts total {partition_total}, expected "
                f"{expected_total}"
            )
        if partition_total < expected_total:
            partitions.append(
                (
                    "unpartitioned-fallback",
                    snapshot_constraints,
                    expected_total - partition_total,
                    True,
                )
            )
        print(
            f"  Partitioning {expected_total} records into "
            f"{len(partitions)} ranges."
        )

    total = 0
    seen_ids: set[str] = set()
    temporary = destination.with_suffix(f"{destination.suffix}.tmp")
    temporary.parent.mkdir(parents=True, exist_ok=True)

    with temporary.open("w", encoding="utf-8") as stream:
        for label, constraints, partition_expected, allow_seen in partitions:
            cursor = 0
            partition_exported = 0
            while True:
                response = request_page(cursor, page_size, constraints)
                results = response.get("results", [])
                if not isinstance(results, list):
                    raise RuntimeError(f"{path} returned an invalid results payload")

                for record in results:
                    legacy_id = record.get("_id") if isinstance(record, dict) else None
                    if not isinstance(legacy_id, str):
                        raise RuntimeError(f"{path} returned a record without _id")
                    if legacy_id in seen_ids:
                        if allow_seen:
                            continue
                        raise RuntimeError(
                            f"{path} returned duplicate _id {legacy_id} "
                            f"across partitions"
                        )
                    seen_ids.add(legacy_id)
                    stream.write(
                        json.dumps(
                            record,
                            ensure_ascii=False,
                            separators=(",", ":"),
                        )
                    )
                    stream.write("\n")

                count = len(results)
                total += count
                partition_exported += count
                remaining = int(response.get("remaining") or 0)
                if allow_seen and total == expected_total:
                    break
                if remaining == 0:
                    break
                if count == 0:
                    raise RuntimeError(
                        f"{path} partition {label} stopped at cursor {cursor} "
                        f"with {remaining} records remaining"
                    )
                cursor += count
                time.sleep(delay)

            if partition_exported != partition_expected:
                raise RuntimeError(
                    f"{path} partition {label} exported {partition_exported}, "
                    f"expected {partition_expected}"
                )

    if total != expected_total:
        raise RuntimeError(f"{path} exported {total}, expected {expected_total}")

    temporary.replace(destination)
    return total


def export_all(args: argparse.Namespace) -> int:
    swagger = load_swagger(args.base_url, args.output, args.token)
    available = collection_paths(swagger)
    requested_names = args.type or []
    forced_names = {name.casefold() for name in (args.force or [])}
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
    requested_snapshot = args.snapshot_at
    if args.resume and manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if (
            manifest.get("baseUrl") != args.base_url
            or manifest.get("authenticated") != bool(args.token)
        ):
            raise RuntimeError("Existing manifest does not match this API URL/auth mode")
        existing_snapshot = manifest.get("snapshotAt")
        if requested_snapshot and existing_snapshot != requested_snapshot:
            raise RuntimeError(
                "Existing manifest does not match the requested snapshot time"
            )
        snapshot_at = existing_snapshot or requested_snapshot
    else:
        snapshot_at = requested_snapshot
        manifest = {
            "baseUrl": args.base_url,
            "authenticated": bool(args.token),
            "snapshotAt": snapshot_at,
            "exports": [],
            "errors": [],
        }

    for index, path in enumerate(selected, start=1):
        name = endpoint_name(path)
        filename = output_name(path)
        previous = next(
            (item for item in manifest["exports"] if item.get("path") == path), None
        )
        if (
            args.resume
            and name.casefold() not in forced_names
            and previous
            and (args.output / "objects" / filename).exists()
        ):
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
                snapshot_at,
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
    result.add_argument(
        "--snapshot-at",
        default=os.environ.get("BUBBLE_SNAPSHOT_AT"),
        help=(
            "only export records created before this ISO timestamp; use one "
            "fixed value for a consistent multi-type snapshot"
        ),
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
    export_parser.add_argument(
        "--force",
        action="append",
        help="re-export this API type even when --resume has a completed file",
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
