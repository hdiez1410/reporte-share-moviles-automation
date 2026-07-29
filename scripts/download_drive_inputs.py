from __future__ import annotations

import argparse
import json
import os
import re
import time
from datetime import datetime
from pathlib import Path

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload


SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]
FOLDER_MIME = "application/vnd.google-apps.folder"
TARGET_FOLDERS = {
    "bdoracle": "BD_Oracle",
    "bdoracle2": "BD_Oracle",
    "bd": "BD_Oracle",
    "cruces": "CRUCES",
    "listadeprecios": "Lista_de_Precios",
    "precios": "Lista_de_Precios",
}
SPANISH_MONTHS = {
    "enero": "01",
    "febrero": "02",
    "marzo": "03",
    "abril": "04",
    "mayo": "05",
    "junio": "06",
    "julio": "07",
    "agosto": "08",
    "setiembre": "09",
    "septiembre": "09",
    "octubre": "10",
    "noviembre": "11",
    "diciembre": "12",
}
DOWNLOAD_CHUNK_SIZE = 32 * 1024 * 1024
MAX_CHUNK_ATTEMPTS = 10


def norm(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.casefold())


def period_from_name(value: str) -> str | None:
    name = value.casefold()
    numeric = re.search(r"(20\d{2})(0[1-9]|1[0-2])(?:\d{2})?", name)
    if numeric:
        return f"{numeric.group(1)}{numeric.group(2)}"
    year = re.search(r"(20\d{2})", name)
    if not year:
        return None
    for month_name, month_number in SPANISH_MONTHS.items():
        if month_name in name:
            return f"{year.group(1)}{month_number}"
    return None


def oracle_choice_key(item: dict) -> tuple[int, int, int, str, str]:
    name = item["name"].casefold()
    period = period_from_name(name) or "000000"
    exact_date = re.search(r"(20\d{6})", name)
    date_score = int(exact_date.group(1)) if exact_date else int(f"{period}00")
    corrected_april = int("base movs" in name and "abril" in name and "2026" in name)
    if corrected_april:
        date_score = 20260499
    cierre = int("cierre" in name)
    return (date_score, corrected_april, cierre, item.get("modifiedTime", ""), item["name"])


def select_oracle_items(items: list[dict]) -> list[dict]:
    selected = {}
    for item in items:
        period = period_from_name(item["name"])
        if not period:
            print(json.dumps({"warning": "sin_periodo", "file": item["name"]}, ensure_ascii=False), flush=True)
            continue
        previous = selected.get(period)
        if previous is None or oracle_choice_key(item) >= oracle_choice_key(previous):
            selected[period] = item
    return [selected[period] for period in sorted(selected)]


def service():
    raw = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON")
    if not raw:
        raise RuntimeError("Falta el secret GOOGLE_SERVICE_ACCOUNT_JSON.")
    info = json.loads(raw)
    credentials = service_account.Credentials.from_service_account_info(info, scopes=SCOPES)
    return build("drive", "v3", credentials=credentials, cache_discovery=False)


def list_children(drive, folder_id: str) -> list[dict]:
    query = f"'{folder_id}' in parents and trashed = false"
    fields = "nextPageToken, files(id, name, mimeType, modifiedTime, size)"
    items = []
    page_token = None
    while True:
        result = (
            drive.files()
            .list(
                q=query,
                fields=fields,
                pageToken=page_token,
                pageSize=1000,
                includeItemsFromAllDrives=True,
                supportsAllDrives=True,
            )
            .execute()
        )
        items.extend(result.get("files", []))
        page_token = result.get("nextPageToken")
        if not page_token:
            return items


def find_source_folders(drive, root_id: str) -> dict[str, dict]:
    found = {}
    for item in list_children(drive, root_id):
        if item.get("mimeType") != FOLDER_MIME:
            continue
        target = TARGET_FOLDERS.get(norm(item["name"]))
        if target:
            found[target] = item
    missing = sorted(set(TARGET_FOLDERS.values()) - set(found))
    if missing:
        raise RuntimeError(f"No encontré estas carpetas dentro del root de Drive: {', '.join(missing)}")
    return found


def download_file(drive, file_id: str, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    request = drive.files().get_media(fileId=file_id, supportsAllDrives=True)
    with output.open("wb") as handle:
        downloader = MediaIoBaseDownload(handle, request, chunksize=DOWNLOAD_CHUNK_SIZE)
        done = False
        while not done:
            for attempt in range(1, MAX_CHUNK_ATTEMPTS + 1):
                try:
                    _, done = downloader.next_chunk(num_retries=3)
                    break
                except Exception as error:
                    if attempt == MAX_CHUNK_ATTEMPTS:
                        raise
                    delay = min(60, 2 ** min(attempt, 5))
                    print(
                        json.dumps(
                            {
                                "warning": "download_retry",
                                "file": output.name,
                                "attempt": attempt,
                                "delay_seconds": delay,
                                "error": f"{type(error).__name__}: {error}",
                            },
                            ensure_ascii=False,
                        ),
                        flush=True,
                    )
                    time.sleep(delay)


def download_folder(drive, folder: dict, output_dir: Path, target: str) -> list[dict]:
    downloaded = []
    output_dir.mkdir(parents=True, exist_ok=True)
    items = [
        item
        for item in list_children(drive, folder["id"])
        if item.get("mimeType") != FOLDER_MIME
        and not item["name"].startswith("._")
        and item["name"].lower().endswith((".xlsb", ".xlsx", ".xlsm"))
    ]
    if target == "BD_Oracle":
        items = select_oracle_items(items)
    for item in sorted(items, key=lambda current: current["name"].casefold()):
        if item.get("mimeType") == FOLDER_MIME or item["name"].startswith("._"):
            continue
        if not item["name"].lower().endswith((".xlsb", ".xlsx", ".xlsm")):
            continue
        output = output_dir / item["name"]
        expected_size = int(item.get("size") or 0)
        if output.exists() and expected_size and output.stat().st_size == expected_size:
            print(json.dumps({"cached": item["name"], "bytes": expected_size}, ensure_ascii=False), flush=True)
            downloaded.append({**item, "local_path": str(output)})
            continue
        print(json.dumps({"downloading": item["name"], "bytes": expected_size}, ensure_ascii=False), flush=True)
        download_file(drive, item["id"], output)
        if item.get("modifiedTime"):
            modified = datetime.fromisoformat(item["modifiedTime"].replace("Z", "+00:00")).timestamp()
            os.utime(output, (modified, modified))
        downloaded.append({**item, "local_path": str(output)})
        print(json.dumps({"downloaded": item["name"], "bytes": output.stat().st_size}, ensure_ascii=False), flush=True)
    return downloaded


def main() -> int:
    parser = argparse.ArgumentParser(description="Descarga las fuentes del reporte desde Google Drive.")
    parser.add_argument("--root-folder-id", default=os.environ.get("DRIVE_ROOT_FOLDER_ID"))
    parser.add_argument("--output-dir", default="inputs")
    parser.add_argument("--manifest", default="inputs/drive_manifest.json")
    args = parser.parse_args()
    if not args.root_folder_id:
        raise RuntimeError("Falta DRIVE_ROOT_FOLDER_ID.")

    drive = service()
    output_dir = Path(args.output_dir)
    folders = find_source_folders(drive, args.root_folder_id)
    manifest = {}
    for target, folder in sorted(folders.items()):
        manifest[target] = download_folder(drive, folder, output_dir / target, target)

    manifest_path = Path(args.manifest)
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({key: len(value) for key, value in manifest.items()}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
