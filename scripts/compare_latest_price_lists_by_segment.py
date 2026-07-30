from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path

import pandas as pd

from update_cruces_prices_from_lists import canonical_price_files, extract_prices, norm_key, parse_date_from_name


def normalized(value) -> str:
    if value is None or pd.isna(value):
        return ""
    return str(value).strip()


def load_segment_map(cruces_path: Path) -> dict[str, str]:
    df = pd.read_excel(cruces_path, sheet_name="Segmento")
    return {
        norm_key(row["MARCAMODELO"]): normalized(row["Segmento"]) or "Sin segmento Honor"
        for _, row in df.iterrows()
        if normalized(row.get("MARCAMODELO"))
    }


def segment_summary(rows: list[dict]) -> list[dict]:
    groups: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        groups[row["SEGMENTO_HONOR"]].append(row)

    output = []
    for segment, items in groups.items():
        decreases = [item for item in items if item["VARIACION"] < 0]
        increases = [item for item in items if item["VARIACION"] > 0]
        biggest_drop = min(decreases, key=lambda item: item["VARIACION"], default=None)
        biggest_increase = max(increases, key=lambda item: item["VARIACION"], default=None)
        output.append(
            {
                "SEGMENTO_HONOR": segment,
                "MODELOS_CAMBIARON": len(items),
                "MODELOS_BAJARON": len(decreases),
                "MODELOS_SUBIERON": len(increases),
                "MODELO_MAYOR_BAJA": biggest_drop["MARCAMODELO"] if biggest_drop else "",
                "PRECIO_ACTUAL_MAYOR_BAJA": biggest_drop["PRECIO_NUEVO"] if biggest_drop else None,
                "VARIACION_MAYOR_BAJA": biggest_drop["VARIACION"] if biggest_drop else None,
                "VARIACION_PCT_MAYOR_BAJA": biggest_drop["VARIACION_PCT"] if biggest_drop else None,
                "MODELO_MAYOR_SUBIDA": biggest_increase["MARCAMODELO"] if biggest_increase else "",
                "PRECIO_ACTUAL_MAYOR_SUBIDA": biggest_increase["PRECIO_NUEVO"] if biggest_increase else None,
                "VARIACION_MAYOR_SUBIDA": biggest_increase["VARIACION"] if biggest_increase else None,
                "VARIACION_PCT_MAYOR_SUBIDA": biggest_increase["VARIACION_PCT"] if biggest_increase else None,
            }
        )

    return sorted(
        output,
        key=lambda row: (
            row["VARIACION_MAYOR_BAJA"] is None,
            row["VARIACION_MAYOR_BAJA"] if row["VARIACION_MAYOR_BAJA"] is not None else 0,
            row["SEGMENTO_HONOR"].casefold(),
        ),
    )


def build(prices_dir: Path, cruces_path: Path, top: int) -> dict:
    price_files = canonical_price_files(prices_dir)
    if len(price_files) < 2:
        raise RuntimeError("Necesito por lo menos dos listas de precios para comparar.")

    previous_path = price_files[-2]
    latest_path = price_files[-1]
    previous = extract_prices(previous_path)
    latest = extract_prices(latest_path)
    segment_map = load_segment_map(cruces_path)

    previous_map = {norm_key(row["MARCAMODELO"]): row for row in previous["models"]}
    latest_map = {norm_key(row["MARCAMODELO"]): row for row in latest["models"]}

    changes = []
    for key in sorted(latest_map.keys() & previous_map.keys()):
        before = float(previous_map[key]["PRECIO"])
        after = float(latest_map[key]["PRECIO"])
        diff = after - before
        if abs(diff) < 1e-9:
            continue
        changes.append(
            {
                "SEGMENTO_HONOR": segment_map.get(key, "Sin segmento Honor"),
                "MARCAMODELO": latest_map[key]["MARCAMODELO"],
                "PRECIO_ANTERIOR": round(before, 2),
                "PRECIO_NUEVO": round(after, 2),
                "VARIACION": round(diff, 2),
                "VARIACION_PCT": round(diff / before, 6) if before else None,
            }
        )

    new_models = sorted(
        [
            {
                **latest_map[key],
                "SEGMENTO_HONOR": segment_map.get(key, "Sin segmento Honor"),
            }
            for key in latest_map.keys() - previous_map.keys()
        ],
        key=lambda row: (row["SEGMENTO_HONOR"].casefold(), row["MARCAMODELO"].casefold()),
    )

    return {
        "previous_file": previous_path.name,
        "latest_file": latest_path.name,
        "previous_date": parse_date_from_name(previous_path).isoformat(),
        "latest_date": parse_date_from_name(latest_path).isoformat(),
        "previous_models": len(previous_map),
        "latest_models": len(latest_map),
        "new_models_count": len(new_models),
        "changed_models_count": len(changes),
        "new_models": new_models,
        "segment_summary": segment_summary(changes),
        "changes": sorted(
            changes,
            key=lambda row: (
                row["SEGMENTO_HONOR"].casefold(),
                row["VARIACION"],
                row["MARCAMODELO"].casefold(),
            ),
        )[:top],
        "top_decreases_by_segment": [
            row for row in segment_summary(changes) if row["VARIACION_MAYOR_BAJA"] is not None
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Compara listas de precios y agrupa variaciones por Segmento Honor.")
    parser.add_argument("--prices-dir", required=True)
    parser.add_argument("--cruces", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--top", type=int, default=200)
    args = parser.parse_args()

    payload = build(Path(args.prices_dir), Path(args.cruces), args.top)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(
        json.dumps(
            {
                "previous_date": payload["previous_date"],
                "latest_date": payload["latest_date"],
                "new_models_count": payload["new_models_count"],
                "changed_models_count": payload["changed_models_count"],
                "segment_summary": payload["segment_summary"],
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
