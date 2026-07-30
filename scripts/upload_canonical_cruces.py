from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from download_drive_inputs import upload_canonical_cruces


def main() -> int:
    parser = argparse.ArgumentParser(description="Guarda el CRUCES actualizado como archivo canónico en Drive.")
    parser.add_argument("source")
    parser.add_argument("--root-folder-id", default=os.environ.get("DRIVE_ROOT_FOLDER_ID"))
    parser.add_argument("--output", default="outputs/cruces_drive_upload.json")
    args = parser.parse_args()
    if not args.root_folder_id:
        raise RuntimeError("Falta DRIVE_ROOT_FOLDER_ID.")

    result = upload_canonical_cruces(args.root_folder_id, Path(args.source))
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
