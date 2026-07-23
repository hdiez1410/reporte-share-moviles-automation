from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

from extract_accessories_dashboard_data import build
from extract_sales_report_data import MONTH_ABBR
from extract_sales_report_data_multi import month_label, week_from_date_unique
from update_report_period_incremental import period_from_filename, period_sort_key


def refresh_metadata(data: dict) -> None:
    rows = data["dashboard_data"]
    stocks = data.get("stock_data", [])
    period_totals = defaultdict(float)
    brand_totals = defaultdict(float)
    channel_totals = defaultdict(float)
    weeks = {}
    dates = set()
    missing_regional = Counter()

    for row in rows:
        sales = float(row.get("VENTAS", 0) or 0)
        period_totals[row["PERIODO"]] += sales
        brand_totals[row["MARCA"]] += sales
        channel_totals[row["CANAL_AGRUPADO"]] += sales
        if row["REGIONAL_HONOR"] == "Sin regional":
            missing_regional[row["PUNTODEVENTA"]] += sales
        if row.get("FECHA") and row["FECHA"] != "Sin fecha":
            date_value = datetime.strptime(row["FECHA"], "%Y-%m-%d").date()
            dates.add(date_value)
            if row["SEMANA"] not in weeks:
                _, number, start, end = week_from_date_unique(date_value)
                weeks[row["SEMANA"]] = (number, start, end)

    stock_dates = sorted(
        {
            datetime.strptime(row["FECHA"], "%Y-%m-%d").date()
            for row in stocks
            if row.get("FECHA") and row["FECHA"] != "Sin fecha"
        }
    )
    latest_stock_date = stock_dates[-1].isoformat() if stock_dates else "Sin fecha"
    latest_stock = [row for row in stocks if row.get("FECHA") == latest_stock_date]
    periods = sorted(period_totals, key=period_sort_key)
    years = sorted({row["ANIO"] for row in rows})
    brands = sorted(brand_totals, key=lambda value: (-brand_totals[value], value))
    channels = sorted(channel_totals, key=lambda value: (-channel_totals[value], value))

    data["generated_at"] = datetime.now().isoformat(timespec="seconds")
    data["total_sales"] = round(sum(period_totals.values()), 6)
    data["filtered_rows"] = sum(
        int(item.get("filtered_rows", 0) or 0)
        for item in data.get("source_file_summaries", [])
        if item.get("kind") == "sales"
    )
    data["stock_filtered_rows"] = len(latest_stock)
    data["stock_total"] = round(sum(float(row.get("STOCK", 0) or 0) for row in latest_stock), 6)
    data["metric_note"] = "VENTAS = -SUM(ITEMS). Stock = SUM(ITEMS) con ESTADO=Nuevos y USO Normal/Pack."
    data["stock_note"] = f"Los indicadores de stock actual usan la foto más reciente ({latest_stock_date})."
    data["dates"] = [
        {
            "FECHA": value.isoformat(),
            "DIA": f"{value.day:02d}",
            "PERIODO": f"{value.year}{value.month:02d}",
            "ANIO": str(value.year),
            "LABEL": f"{value.day:02d}-{MONTH_ABBR[value.month]}",
        }
        for value in sorted(dates)
    ]
    data["stock_dates"] = [
        {
            "FECHA": value.isoformat(),
            "DIA": f"{value.day:02d}",
            "PERIODO": f"{value.year}{value.month:02d}",
            "ANIO": str(value.year),
            "LABEL": f"{value.day:02d}-{MONTH_ABBR[value.month]}",
        }
        for value in stock_dates
    ]
    data["week_ranges"] = [
        {
            "SEMANA": week,
            "NUMERO": number,
            "ANIO": str(start.isocalendar().year),
            "DESDE": start.isoformat(),
            "HASTA": end.isoformat(),
            "LABEL": f"{start.isocalendar().year} S{number} ({start.isoformat()} al {end.isoformat()})",
            "SHORT": f"S{number}",
        }
        for week, (number, start, end) in sorted(weeks.items(), key=lambda item: item[1][1])
    ]
    data["periods"] = [
        {
            "PERIODO": period,
            "ANIO": period[:4],
            "LABEL": month_label(period),
            "VENTAS": round(period_totals[period], 6),
        }
        for period in periods
    ]
    data["years"] = years
    data["lists"] = {
        "years": years,
        "periods": periods,
        "period_labels": {period: month_label(period) for period in periods},
        "channels": channels,
        "regionals": sorted({row["REGIONAL_HONOR"] for row in rows}),
        "pdvs": sorted({row["PUNTODEVENTA"] for row in rows}),
        "segmentos_honor": sorted({row["SUBTIPO"] for row in rows}),
        "types": sorted({row["TIPO"] for row in rows}),
        "subtypes": sorted({row["SUBTIPO"] for row in rows}),
        "models": sorted({row["MARCAMODELO"] for row in rows}),
        "brands": brands,
    }
    data["cross_summary"] = {
        "missing_sales": {"REGIONAL": round(sum(missing_regional.values()), 6)} if missing_regional else {},
        "missing_regional_pdvs": [
            {"PUNTODEVENTA": pdv, "VENTAS": round(units, 6)}
            for pdv, units in missing_regional.most_common(50)
        ],
    }


def update_period(base_json: Path, source: Path, cruces: Path, output: Path, period: str) -> dict:
    base = json.loads(base_json.read_text(encoding="utf-8"))
    current = build([(period, source)], [(period, source)], cruces)
    new_rows = current["dashboard_data"]
    if not new_rows:
        raise RuntimeError(f"No se encontraron ventas de accesorios para {period} en {source.name}.")

    old_rows = base["dashboard_data"]
    kept_rows = [row for row in old_rows if row.get("PERIODO") != period]
    base["dashboard_data"] = sorted(
        [*kept_rows, *new_rows],
        key=lambda row: (
            row["PERIODO"],
            row["CANAL_AGRUPADO"],
            row["REGIONAL_HONOR"],
            row["PUNTODEVENTA"],
            row["TIPO"],
            row["SUBTIPO"],
            row["MARCA"],
            row["MARCAMODELO"],
            row["FECHA"],
        ),
    )
    base["stock_data"] = current["stock_data"]
    kept_summaries = [
        item
        for item in base.get("source_file_summaries", [])
        if period_from_filename(item.get("file", "")) != period
    ]
    base["source_file_summaries"] = [*kept_summaries, *current["source_file_summaries"]]
    base["source_files"] = [
        item["file"]
        for item in base["source_file_summaries"]
        if item.get("kind") == "sales"
    ]
    base["stock_source_file"] = str(source)
    base["stock_file_summary"] = current["stock_file_summary"]
    base["cruces_file"] = str(cruces)
    refresh_metadata(base)

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(base, ensure_ascii=False, indent=2), encoding="utf-8")
    return {
        "output": str(output),
        "period": period,
        "removed_grouped_rows": len(old_rows) - len(kept_rows),
        "added_grouped_rows": len(new_rows),
        "total_sales": base["total_sales"],
        "stock_total": base["stock_total"],
        "missing_crosses": base["cross_summary"]["missing_sales"],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Reemplaza un periodo del reporte histórico de accesorios.")
    parser.add_argument("base_json")
    parser.add_argument("source")
    parser.add_argument("cruces")
    parser.add_argument("output")
    parser.add_argument("--period", required=True)
    args = parser.parse_args()
    result = update_period(
        Path(args.base_json),
        Path(args.source),
        Path(args.cruces),
        Path(args.output),
        args.period,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
