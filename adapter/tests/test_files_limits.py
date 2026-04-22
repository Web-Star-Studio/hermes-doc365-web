"""Size-cap behaviour for files.materialize_files.

We stub boto3 so the tests run without MinIO. The goal is to prove that
the per-file and aggregate caps raise the expected exceptions *before*
any network call happens, because once we've started a large download
the damage is partly done.
"""

from __future__ import annotations

import os

import pytest

from adapter.config import Settings
from adapter.envelope import FileRef
from adapter.files import (
    FileTooLargeError,
    RequestTooLargeError,
    materialize_files,
)


def _settings(tmp_path, *, max_file: int = 50, max_request: int = 100) -> Settings:
    """Build Settings without touching the real env — all overrides go in."""
    # pydantic-settings expects alias-keyed env vars; the easiest way to
    # deterministically build one for tests is via os.environ overrides
    # inside a monkeypatch scope and then plain Settings() which reads them.
    os.environ["ADAPTER_HMAC_SECRET"] = "test-secret"
    os.environ["ADAPTER_MAX_FILE_BYTES"] = str(max_file)
    os.environ["ADAPTER_MAX_REQUEST_BYTES"] = str(max_request)
    return Settings()  # type: ignore[call-arg]


def test_per_file_cap_trips_before_download(tmp_path) -> None:
    # Aggregate cap must allow the declared total so the per-file check runs first.
    s = _settings(tmp_path, max_file=10, max_request=10_000)
    files = [
        FileRef(
            attachment_id="1",
            storage_key="k",
            original_name="big.pdf",
            mime_type="application/pdf",
            size_bytes=1_000,
        )
    ]
    with pytest.raises(FileTooLargeError), materialize_files(files, s):
        pytest.fail("should not have entered body")


def test_aggregate_cap_trips_before_download(tmp_path) -> None:
    s = _settings(tmp_path, max_file=1_000, max_request=1_500)
    files = [
        FileRef(
            attachment_id=str(i),
            storage_key=f"k{i}",
            original_name=f"f{i}.pdf",
            mime_type="application/pdf",
            size_bytes=800,
        )
        for i in range(3)
    ]
    with pytest.raises(RequestTooLargeError), materialize_files(files, s):
        pytest.fail("should not have entered body")


def test_empty_list_yields_empty(tmp_path) -> None:
    s = _settings(tmp_path)
    with materialize_files([], s) as mats:
        assert mats == []
