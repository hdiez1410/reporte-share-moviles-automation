from __future__ import annotations

import argparse
import gc
import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

from build_compressed_web_dashboard import write_compressed_payload
from build_web_dashboard_data import build as build_compact_payload, load_supervisor_mapping
from enrich_accessories_report_data import enrich as enrich_accessories
from extract_accessories_dashboard_data import build as build_accessories
from incremental_public_state import (
    PUBLIC_REPORT_URL,
    combine_payload,
    load_dimension_maps,
    load_public_payload,
    refresh_dimensions,
)
from update_all_reports import (
    apply_segmento_overrides,
    clean_dir,
    date_from_filename,
    refresh_cruces_prices,
    source_choice_key,
)
from update_report_period_incremental import period_from_filename, process_source_file


ROOT = Path(__file__).resolve().parents[1]


def run(args: list[str]) -> None:
    print(json.dumps({"run": args}, ensure_ascii=False), flush=True)
    subprocess.run(args, cwd=ROOT, check=True)


def latest_oracle(folder: Path) -> Path:
    files = [
        path
        for path in folder.iterdir()
        if path.is_file() and path.suffix.lower() in {".xlsb", ".xlsx"} and not path.name.startswith("._")
    ]
    if not files:
        raise RuntimeError(f"No encontré una BD Oracle en {folder}.")
    return max(files, key=source_choice_key)


def cruces_source(folder: Path) -> Path:
    files = [path for path in folder.glob("*.xlsx") if path.is_file() and not path.name.startswith("._")]
    if not files:
        raise RuntimeError(f"No encontré CRUCES en {folder}.")
    return max(
        files,
        key=lambda path: (
            path.stat().st_mtime,
            int(path.name.casefold() == "cruces_ultimo.xlsx"),
            path.name.casefold(),
        ),
    )


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def public_baseline(report: str, baseline_dir: Path | None) -> dict:
    if baseline_dir:
        source = baseline_dir if report == "mobiles" else baseline_dir / "accesorios"
        return load_public_payload(local_dir=source)
    url = PUBLIC_REPORT_URL if report == "mobiles" else f"{PUBLIC_REPORT_URL}/accesorios"
    return load_public_payload(url)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Actualiza solo el periodo abierto y conserva la historia cerrada del reporte publicado."
    )
    parser.add_argument("--inputs", default="inputs")
    parser.add_argument("--outputs", default="outputs")
    parser.add_argument("--dist", default="dist")
    parser.add_argument("--baseline-dir", help="Dashboard local para pruebas; por defecto usa Cloudflare Pages.")
    parser.add_argument("--skip-drive-upload", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()

    inputs = ROOT / args.inputs
    outputs = ROOT / args.outputs
    dist = ROOT / args.dist
    baseline_dir = ROOT / args.baseline_dir if args.baseline_dir else None
    bd_dir = inputs / "BD_Oracle"
    prices_dir = inputs / "Lista_de_Precios"
    oracle = latest_oracle(bd_dir)
    period = period_from_filename(oracle.name)
    if not period:
        raise RuntimeError(f"No pude inferir el periodo de {oracle.name}.")

    clean_dir(outputs)
    clean_dir(dist)

    cruces = refresh_cruces_prices(cruces_source(inputs / "CRUCES"), prices_dir, outputs, oracle)
    cruces = apply_segmento_overrides(cruces, outputs)
    price_changes = outputs / "price_changes_segment.json"
    run(
        [
            sys.executable,
            "scripts/compare_latest_price_lists_by_segment.py",
            "--prices-dir",
            str(prices_dir),
            "--cruces",
            str(cruces),
            "--output",
            str(price_changes),
        ]
    )

    mobile_raw = outputs / "current_mobile.json"
    mobile_data = process_source_file(oracle, cruces)["data"]
    write_json(mobile_raw, mobile_data)
    del mobile_data
    previous_mobile = public_baseline("mobiles", baseline_dir)
    current_mobile = build_compact_payload(mobile_raw, price_changes)
    dimension_maps = load_dimension_maps(cruces)
    supervisors = load_supervisor_mapping()
    refresh_dimensions(previous_mobile, dimension_maps, supervisors)
    refresh_dimensions(current_mobile, dimension_maps, supervisors)

    generated_at = datetime.now().isoformat(timespec="seconds")
    mobile_payload, mobile_audit = combine_payload(previous_mobile, current_mobile, period, generated_at)
    mobile_build = write_compressed_payload(mobile_payload, ROOT, dist)
    del previous_mobile, current_mobile, mobile_payload
    gc.collect()

    accessories_raw = outputs / "current_accessories_raw.json"
    accessories_enriched = outputs / "current_accessories.json"
    write_json(accessories_raw, build_accessories([(period, oracle)], [(period, oracle)], cruces))
    enrich_accessories(accessories_raw, accessories_enriched, [prices_dir], str(cruces))
    previous_accessories = public_baseline("accessories", baseline_dir)
    current_accessories = build_compact_payload(accessories_enriched, price_changes)
    refresh_dimensions(previous_accessories, dimension_maps, supervisors)
    refresh_dimensions(current_accessories, dimension_maps, supervisors)
    accessories_payload, accessories_audit = combine_payload(
        previous_accessories,
        current_accessories,
        period,
        generated_at,
    )
    accessories_build = write_compressed_payload(accessories_payload, ROOT / "accesorios", dist / "accesorios")
    del previous_accessories, current_accessories, accessories_payload
    gc.collect()

    upload_path = outputs / "cruces_drive_upload.json"
    if args.skip_drive_upload:
        cruces_upload = {"name": "CRUCES_ULTIMO.xlsx", "id": "local-validation"}
        upload_path.write_text(json.dumps(cruces_upload), encoding="utf-8")
    else:
        run(
            [
                sys.executable,
                "scripts/upload_canonical_cruces.py",
                str(cruces),
                "--output",
                str(upload_path),
            ]
        )
        cruces_upload = json.loads(upload_path.read_text(encoding="utf-8"))
    prices = json.loads(price_changes.read_text(encoding="utf-8"))
    request_id = os.environ.get("REPORT_REQUEST_ID") or os.environ.get("GITHUB_RUN_ID") or generated_at
    status = {
        "request_id": str(request_id),
        "mode": "incremental_current_period",
        "generated_at": generated_at,
        "latest_oracle": oracle.name,
        "latest_oracle_period": period,
        "latest_oracle_date": date_from_filename(oracle),
        "max_sales_date_mobile": mobile_audit["max_sales_date"],
        "max_sales_date_accessories": accessories_audit["max_sales_date"],
        "mobile_total_sales": mobile_audit["total_sales"],
        "accessories_total_sales": accessories_audit["total_sales"],
        "mobile_stock_total": mobile_audit["stock_total"],
        "accessories_stock_total": accessories_audit["stock_total"],
        "latest_price_list": prices.get("latest_file"),
        "latest_price_date": prices.get("latest_date"),
        "cruces_name": cruces_upload.get("name"),
        "cruces_file_id": cruces_upload.get("id"),
    }
    for target in [dist / "status.json", dist / "accesorios" / "status.json"]:
        target.write_text(json.dumps(status, ensure_ascii=False, indent=2), encoding="utf-8")
    (outputs / "status.json").write_text(json.dumps(status, ensure_ascii=False, indent=2), encoding="utf-8")
    (outputs / "incremental_audit.json").write_text(
        json.dumps(
            {
                "mobile": mobile_audit,
                "accessories": accessories_audit,
                "mobile_build": mobile_build,
                "accessories_build": accessories_build,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(json.dumps(status, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
