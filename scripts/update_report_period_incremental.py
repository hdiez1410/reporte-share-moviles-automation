from __future__ import annotations

import argparse
import json
import re
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

from extract_sales_report_data import MONTH_ABBR, load_crosses, pct
from extract_sales_report_data_multi import (
    build_output,
    make_accumulator,
    month_label,
    process_xlsb,
    process_xlsx,
    week_from_date_unique,
)


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


def period_from_filename(path_text: str) -> str | None:
    name = Path(path_text).name.casefold()
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


def process_source_file(source_file: Path, cruces_path: Path) -> dict:
    crosses = load_crosses(cruces_path)
    acc = make_accumulator()
    acc["source_files"].append(str(source_file))
    suffix = source_file.suffix.lower()
    if suffix == ".xlsx":
        summary = process_xlsx(source_file, acc, crosses)
    elif suffix == ".xlsb":
        summary = process_xlsb(source_file, acc, crosses)
    else:
        raise RuntimeError(f"Tipo de archivo no soportado: {source_file.name}")
    acc["source_file_summaries"].append(summary)
    if summary.get("stock_sheet_found"):
        acc["stock_source_file"] = str(source_file)
        acc["stock_file_summary"] = summary
    output = build_output(acc, crosses, source_file.parent)
    return {"data": output, "summary": summary}


def period_sort_key(value: str) -> tuple[int, str]:
    return (int(value), value) if value and value.isdigit() else (0, value or "")


def date_from_row(row: dict):
    value = row.get("FECHA")
    if not value or value == "Sin fecha":
        return None
    return datetime.strptime(value, "%Y-%m-%d").date()


def recompute_metadata(data: dict) -> None:
    rows = data["dashboard_data"]
    total_sales = sum(float(row["VENTAS"]) for row in rows)

    weeks = defaultdict(float)
    week_meta = {}
    week_brand = defaultdict(float)
    period_sales = defaultdict(float)
    period_meta = {}
    brand_sales = defaultdict(float)
    dates = set()

    channel_sales = defaultdict(float)
    for row in rows:
        sales = float(row["VENTAS"])
        week = row["SEMANA"]
        brand = row["MARCA"]
        period = row.get("PERIODO") or "Sin periodo"
        year = row.get("ANIO") or (period[:4] if period[:4].isdigit() else "Sin año")
        row["ANIO"] = year
        row["MES_LABEL"] = month_label(period)
        if row.get("FECHA") and row["FECHA"] != "Sin fecha":
            row["DIA"] = row["FECHA"][-2:]

        weeks[week] += sales
        week_brand[(week, brand)] += sales
        period_sales[period] += sales
        brand_sales[brand] += sales
        channel_sales[row["CANAL_AGRUPADO"]] += sales

        if period != "Sin periodo":
            period_meta[period] = {"PERIODO": period, "ANIO": year, "LABEL": month_label(period)}
        date_value = date_from_row(row)
        if date_value:
            dates.add(date_value)
            computed_week, week_number, start, end = week_from_date_unique(date_value)
            if computed_week == week and week not in week_meta:
                week_meta[week] = (week_number, start, end)

    sorted_weeks = sorted(
        weeks,
        key=lambda value: week_meta.get(value, ("", datetime.max.date(), None))[1],
    )
    brands = sorted(brand_sales, key=lambda key: (-brand_sales[key], key.casefold()))

    weekly_sales_matrix = []
    weekly_share_matrix = []
    for brand in brands:
        sales_row = {"MARCA": brand, "TOTAL": round(brand_sales[brand], 6), "SHARE_TOTAL": pct(brand_sales[brand], total_sales)}
        share_row = {"MARCA": brand, "SHARE_TOTAL": pct(brand_sales[brand], total_sales)}
        for week in sorted_weeks:
            sales = week_brand.get((week, brand), 0.0)
            sales_row[week] = round(sales, 6)
            share_row[week] = pct(sales, weeks[week])
        weekly_sales_matrix.append(sales_row)
        weekly_share_matrix.append(share_row)

    week_ranges = []
    for week in sorted_weeks:
        week_number, start, end = week_meta.get(week, ("", None, None))
        year = str(start.isocalendar().year) if start else ""
        week_ranges.append(
            {
                "SEMANA": week,
                "NUMERO": week_number,
                "ANIO": year,
                "DESDE": start.isoformat() if start else "",
                "HASTA": end.isoformat() if end else "",
                "LABEL": f"{year} S{week_number} ({start.day:02d}-{MONTH_ABBR[start.month]} al {end.day:02d}-{MONTH_ABBR[end.month]})"
                if start and end
                else week,
                "SHORT": f"S{week_number}" if week_number else week,
            }
        )

    periods = [
        {
            "PERIODO": period,
            "ANIO": period_meta[period]["ANIO"],
            "LABEL": period_meta[period]["LABEL"],
            "VENTAS": round(period_sales[period], 6),
        }
        for period in sorted(period_meta, key=period_sort_key)
    ]
    years = sorted({row.get("ANIO") or "Sin año" for row in rows})
    channels = sorted(channel_sales, key=lambda key: (-channel_sales[key], key.casefold()))

    data["generated_at"] = datetime.now().isoformat(timespec="seconds")
    data["source_rows"] = sum(int(item.get("source_rows", 0)) for item in data.get("source_file_summaries", []))
    data["filtered_rows"] = sum(int(item.get("filtered_rows", 0)) for item in data.get("source_file_summaries", []))
    data["total_sales"] = round(total_sales, 6)
    data["signed_items_total"] = round(-total_sales, 6)
    data["weeks"] = sorted_weeks
    data["week_ranges"] = week_ranges
    data["periods"] = periods
    data["years"] = years
    data["brands"] = brands
    data["weekly_totals"] = [{"SEMANA": week, "VENTAS": round(weeks[week], 6)} for week in sorted_weeks]
    data["brand_totals"] = [
        {"MARCA": brand, "VENTAS": round(brand_sales[brand], 6), "SHARE": pct(brand_sales[brand], total_sales)}
        for brand in brands
    ]
    data["weekly_sales_matrix"] = weekly_sales_matrix
    data["weekly_share_matrix"] = weekly_share_matrix
    data["dates"] = [
        {
            "FECHA": date.isoformat(),
            "DIA": f"{date.day:02d}",
            "PERIODO": f"{date.year}{date.month:02d}",
            "ANIO": str(date.year),
            "LABEL": f"{date.day:02d}-{MONTH_ABBR[date.month]}",
        }
        for date in sorted(dates)
    ]
    data["lists"] = {
        "years": years,
        "periods": [item["PERIODO"] for item in periods],
        "period_labels": {item["PERIODO"]: item["LABEL"] for item in periods},
        "channels": channels,
        "regionals": sorted({row["REGIONAL_HONOR"] for row in rows}),
        "pdvs": sorted({row["PUNTODEVENTA"] for row in rows}),
        "segmentos_honor": sorted({row["SEGMENTO_HONOR"] for row in rows}),
        "models": sorted({row["MARCAMODELO"] for row in rows}),
        "brands": brands,
    }
    data["channel_groups"] = channels
    data["counts"] = {
        **data.get("counts", {}),
        "weeks": len(sorted_weeks),
        "periods": len(periods),
        "years": len(years),
        "brands": len(brands),
        "channels": len(channels),
        "pdv": len(data["lists"]["pdvs"]),
        "models": len(data["lists"]["models"]),
        "regionals": len(data["lists"]["regionals"]),
        "segmentos_honor": len(data["lists"]["segmentos_honor"]),
    }

    missing_sales = Counter()
    missing_regional = Counter()
    missing_segment = Counter()
    missing_price = Counter()
    for row in rows:
        sales = float(row["VENTAS"])
        if row["REGIONAL_HONOR"] == "Sin regional":
            missing_sales["REGIONAL"] += sales
            missing_regional[row["PUNTODEVENTA"]] += sales
        if row["SEGMENTO_HONOR"] == "Sin segmento Honor":
            missing_sales["SEGMENTO_HONOR"] += sales
            missing_segment[row["MARCAMODELO"]] += sales
        if row.get("PRECIO") is None:
            missing_sales["PRECIO"] += sales
            missing_price[row["MARCAMODELO"]] += sales

    summary = data.setdefault("cross_summary", {})
    summary["missing_sales"] = {key: round(value, 6) for key, value in missing_sales.items()}
    summary["missing_regional_pdvs"] = [
        {"PUNTODEVENTA": key, "VENTAS": round(value, 6)} for key, value in missing_regional.most_common(50)
    ]
    summary["missing_segment_models"] = [
        {"MARCAMODELO": key, "VENTAS": round(value, 6)} for key, value in missing_segment.most_common(50)
    ]
    summary["missing_price_models"] = [
        {"MARCAMODELO": key, "VENTAS": round(value, 6)} for key, value in missing_price.most_common(50)
    ]
    recompute_stock_metadata(data)


def recompute_stock_metadata(data: dict) -> None:
    stock_rows = data.get("stock_data", [])
    stock_total = sum(float(row.get("STOCK", 0) or 0) for row in stock_rows)
    stock_dates = set()
    for row in stock_rows:
        value = row.get("FECHA")
        if value and value != "Sin fecha":
            stock_dates.add(datetime.strptime(value, "%Y-%m-%d").date())
            row["DIA"] = value[-2:]
        period = row.get("PERIODO") or "Sin periodo"
        row["ANIO"] = row.get("ANIO") or (period[:4] if period[:4].isdigit() else "Sin año")
        row["MES_LABEL"] = month_label(period)

    data["stock_total"] = round(stock_total, 6)
    stock_summary = data.get("stock_file_summary", {})
    data["stock_source_rows"] = int(stock_summary.get("stock_source_rows", 0) or 0)
    data["stock_filtered_rows"] = int(stock_summary.get("stock_filtered_rows", 0) or len(stock_rows))
    data["stock_dates"] = [
        {
            "FECHA": date.isoformat(),
            "DIA": f"{date.day:02d}",
            "PERIODO": f"{date.year}{date.month:02d}",
            "ANIO": str(date.year),
            "LABEL": f"{date.day:02d}-{MONTH_ABBR[date.month]}",
        }
        for date in sorted(stock_dates)
    ]
    data["stock_note"] = (
        "STOCK actual = SUM(ITEMS) desde Base Stocks de la última base Oracle disponible, "
        "con ESTADO=Nuevos, USO en Normal/Pack y equipos moviles (FAMILIA=Moviles, TIPO=Celular). "
        "No se acumulan fotos historicas de stock."
    )
    data.setdefault("counts", {})
    data["counts"]["stock_rows"] = len(stock_rows)
    data["counts"]["stock_dates"] = len(stock_dates)


def update_period(base_json: Path, source_file: Path, cruces_path: Path, output_json: Path, replace_periods: set[str]) -> dict:
    base_data = json.loads(base_json.read_text(encoding="utf-8"))
    processed = process_source_file(source_file, cruces_path)
    new_rows = [row for row in processed["data"]["dashboard_data"] if row.get("PERIODO") in replace_periods]
    new_stock_rows = processed["data"].get("stock_data", [])
    if not new_rows:
        raise RuntimeError(f"No se encontraron ventas para {', '.join(sorted(replace_periods))} en {source_file.name}")

    old_rows = base_data["dashboard_data"]
    kept_rows = [row for row in old_rows if row.get("PERIODO") not in replace_periods]
    old_stock_rows = base_data.get("stock_data", [])
    removed_rows = len(old_rows) - len(kept_rows)
    removed_stock_rows = len(old_stock_rows)
    removed_sales = sum(float(row["VENTAS"]) for row in old_rows if row.get("PERIODO") in replace_periods)

    kept_summaries = [
        item
        for item in base_data.get("source_file_summaries", [])
        if period_from_filename(item.get("file", "")) not in replace_periods
    ]
    removed_summaries = [
        item
        for item in base_data.get("source_file_summaries", [])
        if period_from_filename(item.get("file", "")) in replace_periods
    ]

    summaries = [*kept_summaries, processed["summary"]]
    summaries.sort(key=lambda item: (period_sort_key(period_from_filename(item.get("file", "")) or ""), item.get("file", "")))

    base_data["dashboard_data"] = sorted(
        [*kept_rows, *new_rows],
        key=lambda row: (
            row.get("ANIO", ""),
            row.get("PERIODO", ""),
            row.get("CANAL_AGRUPADO", ""),
            row.get("REGIONAL_HONOR", ""),
            row.get("PUNTODEVENTA", ""),
            row.get("SEGMENTO_HONOR", ""),
            row.get("MARCA", ""),
            row.get("MARCAMODELO", ""),
            row.get("SEMANA", ""),
            row.get("FECHA", ""),
        ),
    )
    base_data["stock_data"] = sorted(
        new_stock_rows,
        key=lambda row: (
            row.get("ANIO", ""),
            row.get("PERIODO", ""),
            row.get("CANAL_AGRUPADO", ""),
            row.get("REGIONAL_HONOR", ""),
            row.get("PUNTODEVENTA", ""),
            row.get("SEGMENTO_HONOR", ""),
            row.get("MARCA", ""),
            row.get("MARCAMODELO", ""),
            row.get("FECHA", ""),
        ),
    )
    base_data["source_file_summaries"] = summaries
    base_data["source_files"] = [item["file"] for item in summaries]
    base_data["stock_source_file"] = processed["data"].get("stock_source_file") or str(source_file)
    base_data["stock_file_summary"] = processed["data"].get("stock_file_summary") or processed["summary"]
    base_data["cruces_file"] = str(cruces_path)
    recompute_metadata(base_data)

    output_json.parent.mkdir(parents=True, exist_ok=True)
    output_json.write_text(json.dumps(base_data, ensure_ascii=False, indent=2), encoding="utf-8")
    return {
        "output": str(output_json),
        "replace_periods": sorted(replace_periods),
        "removed_grouped_rows": removed_rows,
        "added_grouped_rows": len(new_rows),
        "removed_stock_grouped_rows": removed_stock_rows,
        "added_stock_grouped_rows": len(new_stock_rows),
        "removed_sales": round(removed_sales, 6),
        "added_sales": round(sum(float(row["VENTAS"]) for row in new_rows), 6),
        "removed_source_files": [item.get("file") for item in removed_summaries],
        "added_source_file": processed["summary"],
        "total_sales": base_data["total_sales"],
        "filtered_rows": base_data["filtered_rows"],
        "cross_summary": base_data.get("cross_summary", {}).get("missing_sales", {}),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Reemplaza uno o mas periodos del JSON historico usando una sola base nueva.")
    parser.add_argument("base_json")
    parser.add_argument("source_file")
    parser.add_argument("cruces")
    parser.add_argument("output_json")
    parser.add_argument("--period", action="append", required=True, help="Periodo a reemplazar, por ejemplo 202604.")
    args = parser.parse_args()

    result = update_period(
        Path(args.base_json),
        Path(args.source_file),
        Path(args.cruces),
        Path(args.output_json),
        set(args.period),
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
