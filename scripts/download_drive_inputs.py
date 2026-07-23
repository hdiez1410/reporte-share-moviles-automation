from __future__ import annotations

import argparse
import json
import os
import re
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


def norm(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.casefold())


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
        downloader = MediaIoBaseDownload(handle, request, chunksize=1024 * 1024)
        done = False
        while not done:
            _, done = downloader.next_chunk()


def download_folder(drive, folder: dict, output_dir: Path) -> list[dict]:
    downloaded = []
    output_dir.mkdir(parents=True, exist_ok=True)
    for item in list_children(drive, folder["id"]):
        if item.get("mimeType") == FOLDER_MIME or item["name"].startswith("._"):
            continue
        if not item["name"].lower().endswith((".xlsb", ".xlsx", ".xlsm")):
            continue
        output = output_dir / item["name"]
        download_file(drive, item["id"], output)
        if item.get("modifiedTime"):
            modified = datetime.fromisoformat(item["modifiedTime"].replace("Z", "+00:00")).timestamp()
            os.utime(output, (modified, modified))
        downloaded.append({**item, "local_path": str(output)})
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
        manifest[target] = download_folder(drive, folder, output_dir / target)

    manifest_path = Path(args.manifest)
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({key: len(value) for key, value in manifest.items()}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
