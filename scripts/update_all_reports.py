from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

from update_report_period_incremental import period_from_filename


ROOT = Path(__file__).resolve().parents[1]


def run(args: list[str]) -> None:
    print(json.dumps({"run": args}, ensure_ascii=False), flush=True)
    subprocess.run(args, cwd=ROOT, check=True)


def latest_file(folder: Path, suffixes: tuple[str, ...]) -> Path:
    files = [
        path
        for path in folder.iterdir()
        if path.is_file() and path.suffix.lower() in suffixes and not path.name.startswith("._")
    ]
    if not files:
        raise RuntimeError(f"No encontré archivos {suffixes} en {folder}.")
    def key(path: Path) -> tuple[int, float, str]:
        match = re.search(r"(20\d{6})", path.name)
        dated = int(match.group(1)) if match else 0
        return (dated, path.stat().st_mtime, path.name)

    return max(files, key=key)


def oracle_files(folder: Path) -> list[Path]:
    files = [
        path
        for path in folder.iterdir()
        if path.is_file() and path.suffix.lower() in {".xlsb", ".xlsx"} and not path.name.startswith("._")
    ]
    if not files:
        raise RuntimeError(f"No encontré bases Oracle en {folder}.")
    return sorted(files, key=lambda path: (period_from_filename(path.name) or "000000", path.name))


def source_choice_key(path: Path) -> tuple[int, int, int, float, str]:
    """Prefer one canonical sales file per period instead of adding partial cuts."""
    name = path.name.casefold()
    period = period_from_filename(path.name) or "000000"
    exact_date = re.search(r"(20\d{6})", name)
    date_score = int(exact_date.group(1)) if exact_date else int(f"{period}00")
    # Abril 2026 fue corregido por el usuario en este archivo y debe ganar al Oracle original.
    corrected_april = 1 if "base movs" in name and "abril" in name and "2026" in name else 0
    if corrected_april:
        date_score = 20260499
    cierre = 1 if "cierre" in name else 0
    return (date_score, corrected_april, cierre, path.stat().st_mtime, path.name)


def sources_by_period(files: list[Path]) -> dict[str, Path]:
    selected = {}
    for path in files:
        period = period_from_filename(path.name)
        if not period:
            print(json.dumps({"warning": "sin_periodo", "file": path.name}, ensure_ascii=False), flush=True)
            continue
        previous = selected.get(period)
        if previous is None or source_choice_key(path) >= source_choice_key(previous):
            selected[period] = path
    if not selected:
        raise RuntimeError("No pude inferir periodos desde los nombres de BD Oracle.")
    return dict(sorted(selected.items()))


def date_from_filename(path: Path) -> str | None:
    match = re.search(r"(20\d{6})", path.name)
    if not match:
        return None
    try:
        return datetime.strptime(match.group(1), "%Y%m%d").date().isoformat()
    except ValueError:
        return None


def clean_dir(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)


def copy_dist(dist: Path) -> None:
    protected = {
        ".env",
        ".dev.vars",
        ".git",
        ".github",
        ".wrangler",
        "scripts",
        "inputs",
        "outputs",
        "dist",
        "requirements.txt",
        ".gitignore",
        "README.md",
    }
    for item in ROOT.iterdir():
        if item.name in protected:
            continue
        if item.is_dir():
            shutil.rmtree(item)
        else:
            item.unlink()
    for item in dist.iterdir():
        destination = ROOT / item.name
        if item.is_dir():
            shutil.copytree(item, destination)
        else:
            shutil.copy2(item, destination)


def refresh_cruces_prices(cruces: Path, prices_dir: Path, outputs: Path, latest_oracle: Path) -> Path:
    updated = outputs / f"{cruces.stem}_autoprecios.xlsx"
    audit = outputs / "cruces_price_audit.json"
    command = [
        sys.executable,
        "scripts/update_cruces_prices_from_lists.py",
        "--cruces",
        str(cruces),
        "--prices-dir",
        str(prices_dir),
        "--output",
        str(updated),
        "--audit",
        str(audit),
    ]
    latest_end = date_from_filename(latest_oracle)
    if latest_end:
        command.extend(["--latest-end", latest_end])
    run(command)
    return updated


def apply_segmento_overrides(cruces: Path, outputs: Path) -> Path:
    overrides = ROOT / "scripts" / "segmento_honor_override.csv"
    if not overrides.exists():
        return cruces
    updated = outputs / f"{cruces.stem}_segmentos.xlsx"
    audit = outputs / "segmento_honor_override_audit.json"
    run(
        [
            sys.executable,
            "scripts/apply_segmento_honor_overrides.py",
            "--cruces",
            str(cruces),
            "--overrides",
            str(overrides),
            "--output",
            str(updated),
            "--audit",
            str(audit),
        ]
    )
    return updated


def main() -> int:
    parser = argparse.ArgumentParser(description="Actualiza Móviles y Accesorios desde inputs descargados de Drive.")
    parser.add_argument("--inputs", default="inputs")
    parser.add_argument("--outputs", default="outputs")
    parser.add_argument("--dist", default="dist")
    args = parser.parse_args()

    inputs = ROOT / args.inputs
    outputs = ROOT / args.outputs
    dist = ROOT / args.dist
    bd_dir = inputs / "BD_Oracle"
    cruces = latest_file(inputs / "CRUCES", (".xlsx",))
    prices_dir = inputs / "Lista_de_Precios"
    files = oracle_files(bd_dir)
    period_sources = sources_by_period(files)
    clean_dir(outputs)
    clean_dir(dist)

    latest_period = max(period_sources)
    latest_oracle = period_sources[latest_period]
    cruces = refresh_cruces_prices(cruces, prices_dir, outputs, latest_oracle)
    cruces = apply_segmento_overrides(cruces, outputs)

    mobile_json = outputs / "sales_report_data.json"
    accessories_raw = outputs / "accessories_report_data_raw.json"
    accessories_json = outputs / "accessories_report_data.json"
    price_changes = outputs / "price_changes_segment.json"

    run(
        [
            sys.executable,
            "scripts/extract_sales_report_data_multi.py",
            str(mobile_json),
            "--source-dir",
            str(bd_dir),
            "--cruces",
            str(cruces),
        ]
    )
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

    accessory_args = [
        sys.executable,
        "scripts/extract_accessories_dashboard_data.py",
        str(accessories_raw),
        "--cruces",
        str(cruces),
    ]
    for period, path in period_sources.items():
        accessory_args.extend(["--sales", f"{period}={path}", "--stock", f"{period}={path}"])
    run(accessory_args)
    run(
        [
            sys.executable,
            "scripts/enrich_accessories_report_data.py",
            str(accessories_raw),
            str(accessories_json),
            "--price-path",
            str(prices_dir),
            "--cruces",
            str(cruces),
        ]
    )

    run(
        [
            sys.executable,
            "scripts/build_compressed_web_dashboard.py",
            str(mobile_json),
            str(price_changes),
            ".",
            str(dist),
        ]
    )
    run(
        [
            sys.executable,
            "scripts/build_compressed_web_dashboard.py",
            str(accessories_json),
            str(price_changes),
            "accesorios",
            str(dist / "accesorios"),
        ]
    )
    copy_dist(dist)

    summary = {
        "cruces_source": cruces.name,
        "oracle_periods": list(period_sources),
        "latest_oracle": latest_oracle.name,
        "latest_oracle_period": latest_period,
        "dist": str(dist),
    }
    (outputs / "automation_summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
