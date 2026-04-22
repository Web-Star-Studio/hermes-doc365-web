"""Per-request S3 → local-temp materializer for Hermes tools.

Hermes' built-in tools expect local file paths. Presigned-URL-aware tooling
is future work (plan §Phase 3+), so for the MVP we download referenced objects
into a scratch directory at the start of each chat turn, let Hermes read them,
and delete the directory in `finally`.

Size policy (locked in plan):
    50 MB / file, 200 MB / request total
Oversize → raise `FileTooLargeError` / `RequestTooLargeError` with a pt-BR message the
`/chat` handler relays to the client as 413.
"""

from __future__ import annotations

import logging
import os
import re
import shutil
import tempfile
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass

import boto3
from botocore.client import Config as BotoConfig

from .config import Settings
from .envelope import FileRef

logger = logging.getLogger(__name__)


class FileTooLargeError(Exception):
    """A single attachment exceeds the per-file cap."""


class RequestTooLargeError(Exception):
    """The sum of attachments in one request exceeds the aggregate cap."""


class FileFetchError(Exception):
    """S3 object couldn't be fetched for a reason the caller should surface."""


@dataclass
class MaterializedFile:
    """A file that has been copied from S3 into the local temp dir."""

    attachment_id: str
    original_name: str
    mime_type: str
    local_path: str
    size_bytes: int


# ── S3 client ───────────────────────────────────────────────────────────


_s3_client = None


def _s3():
    """Lazy-initialised boto3 S3 client. Adapter runs in one process so caching
    the client across requests is safe and avoids the repeated handshake cost.
    """
    global _s3_client
    if _s3_client is None:
        s = Settings()  # type: ignore[call-arg]
        _s3_client = boto3.client(
            "s3",
            endpoint_url=s.s3_endpoint,
            aws_access_key_id=s.s3_access_key,
            aws_secret_access_key=s.s3_secret_key,
            region_name=s.s3_region,
            config=BotoConfig(
                s3={"addressing_style": "path" if s.s3_force_path_style else "auto"},
                signature_version="s3v4",
            ),
        )
    return _s3_client


# ── Safe filename ───────────────────────────────────────────────────────

_SAFE_NAME = re.compile(r"[^\w.\-]+")


def _safe_basename(name: str) -> str:
    """Strip any path components and unsafe chars; preserve the extension so
    Hermes' file-type detection still works.
    """
    base = os.path.basename(name) or "file"
    cleaned = _SAFE_NAME.sub("_", base).strip("._") or "file"
    return cleaned[:120]


# ── Public API ──────────────────────────────────────────────────────────


@contextmanager
def materialize_files(
    files: list[FileRef],
    settings: Settings,
) -> Iterator[list[MaterializedFile]]:
    """Download all `files` to a fresh temp directory and yield the list.

    Guarantees cleanup of the temp dir on every exit path (success or error).
    The aggregate size check happens up front using sizes the web app already
    validated on upload — we re-check after the download as a belt-and-braces
    defence against tampering.
    """
    if not files:
        with tempfile.TemporaryDirectory(prefix="doc365-hermes-") as empty:
            yield []
            # empty dir gets cleaned automatically
            _ = empty
        return

    total_claimed = sum(f.size_bytes for f in files)
    if total_claimed > settings.max_request_bytes:
        raise RequestTooLargeError(
            f"total={total_claimed} exceeds cap={settings.max_request_bytes}"
        )
    for f in files:
        if f.size_bytes > settings.max_file_bytes:
            raise FileTooLargeError(
                f"{f.original_name!r} size={f.size_bytes} exceeds cap="
                f"{settings.max_file_bytes}"
            )

    work = tempfile.mkdtemp(prefix="doc365-hermes-")
    materialized: list[MaterializedFile] = []
    running_total = 0
    try:
        client = _s3()
        for ref in files:
            safe = _safe_basename(ref.original_name)
            local_path = os.path.join(work, f"{ref.attachment_id}-{safe}")

            try:
                client.download_file(settings.s3_bucket, ref.storage_key, local_path)
            except Exception as e:
                raise FileFetchError(
                    f"could not fetch {ref.storage_key!r}: {e}"
                ) from e

            real_size = os.path.getsize(local_path)
            running_total += real_size
            if real_size > settings.max_file_bytes:
                raise FileTooLargeError(
                    f"{ref.original_name!r} real-size={real_size} exceeds cap="
                    f"{settings.max_file_bytes}"
                )
            if running_total > settings.max_request_bytes:
                raise RequestTooLargeError(
                    f"running-total={running_total} exceeds cap="
                    f"{settings.max_request_bytes}"
                )

            materialized.append(
                MaterializedFile(
                    attachment_id=ref.attachment_id,
                    original_name=ref.original_name,
                    mime_type=ref.mime_type,
                    local_path=local_path,
                    size_bytes=real_size,
                )
            )

        logger.info(
            "materialized %d files totalling %d bytes into %s",
            len(materialized),
            running_total,
            work,
        )
        yield materialized
    finally:
        shutil.rmtree(work, ignore_errors=True)
