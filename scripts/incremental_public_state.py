from __future__ import annotations

import base64
import gzip
import json
import re
import time
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

import pandas as pd

from build_web_dashboard_data import load_supervisor_mapping, supervisor_for_pdv
from extract_sales_report_data import MONTH_ABBR, norm_key, normalized
from extract_sales_report_data_multi import month_label, week_from_date_unique


PUBLIC_REPORT_URL = "https://reporte-share-moviles.pages.dev"


def decode_assignment(text: str) -> object:
    match = re.search(r'("[A-Za-z0-9+/=]+")\s*;\s*$', text)
    if not match:
        raise RuntimeError("No encontré el payload comprimido en el archivo JavaScript.")
    encoded = json.loads(match.group(1))
    return json.loads(gzip.decompress(base64.b64decode(encoded)).decode("utf-8"))


def read_text(source: str | Path, attempts: int = 5) -> str:
    if isinstance(source, Path):
        return source.read_text(encoding="utf-8")
    last_error = None
    for attempt in range(1, attempts + 1):
        try:
            request = urllib.request.Request(
                source,
                headers={
                    "User-Agent": "ReporteShareMovilesUpdater/1.0",
                    "Cache-Control": "no-cache",
                },
            )
            with urllib.request.urlopen(request, timeout=90) as response:
                return response.read().decode("utf-8")
        except Exception as error:
            last_error = error
            if attempt < attempts:
                time.sleep(min(30, 2**attempt))
    raise RuntimeError(f"No pude descargar {source}: {last_error}")


def load_public_payload(base_url: str = PUBLIC_REPORT_URL, local_dir: Path | None = None) -> dict:
    if local_dir:
        core_text = read_text(local_dir / "data_core_compressed.js")
    else:
        cache = int(time.time())
        core_text = read_text(f"{base_url.rstrip('/')}/data_core_compressed.js?cb={cache}")
    payload = decode_assignment(core_text)
    rows = []
    for year in [str(value) for value in payload.get("lists", {}).get("years", [])]:
        if local_dir:
            year_text = read_text(local_dir / f"data_rows_{year}.js")
        else:
            year_text = read_text(f"{base_url.rstrip('/')}/data_rows_{year}.js?cb={int(time.time())}")
        rows.extend(decode_assignment(year_text))
    payload["rows"] = rows
    return payload


def date_meta(values: set[str]) -> list[dict]:
    output = []
    for value in sorted(values):
        if not value or value == "Sin fecha":
            continue
        current = datetime.strptime(value, "%Y-%m-%d").date()
        output.append(
            {
                "FECHA": value,
                "DIA": f"{current.day:02d}",
                "PERIODO": f"{current.year}{current.month:02d}",
                "ANIO": str(current.year),
                "LABEL": f"{current.day:02d}-{MONTH_ABBR[current.month]}",
            }
        )
    return output


def week_meta(rows: list[dict]) -> list[dict]:
    weeks = {}
    for row in rows:
        week = row.get("w")
        value = row.get("f")
        if not week or not value or value == "Sin fecha" or week in weeks:
            continue
        current = datetime.strptime(value, "%Y-%m-%d").date()
        _, number, start, end = week_from_date_unique(current)
        weeks[week] = {
            "SEMANA": week,
            "NUMERO": number,
            "ANIO": str(start.isocalendar().year),
            "DESDE": start.isoformat(),
            "HASTA": end.isoformat(),
            "LABEL": (
                f"{start.isocalendar().year} S{number} "
                f"({start.day:02d}-{MONTH_ABBR[start.month]} al {end.day:02d}-{MONTH_ABBR[end.month]})"
            ),
            "SHORT": f"S{number}",
        }
    return sorted(weeks.values(), key=lambda item: item["DESDE"])


def weighted_model_prices(rows: list[dict]) -> dict[str, float]:
    amounts = defaultdict(float)
    units = defaultdict(float)
    for row in rows:
        price = row.get("pr")
        sales = float(row.get("v", 0) or 0)
        if price is None or sales == 0:
            continue
        model = row.get("m", "Sin modelo")
        amounts[model] += float(price) * sales
        units[model] += sales
    return {model: amounts[model] / units[model] for model in sorted(units) if units[model]}


def load_dimension_maps(cruces_path: Path) -> dict:
    regional_df = pd.read_excel(cruces_path, sheet_name="REGIONAL")
    regional_map = {
        norm_key(row["PDV"]): normalized(row["Regional Honor"]) or "Sin regional"
        for _, row in regional_df.iterrows()
        if normalized(row.get("PDV"))
    }
    try:
        from add_regional_overrides import REGIONAL_OVERRIDES

        for pdv, regional in REGIONAL_OVERRIDES.items():
            regional_map[norm_key(pdv)] = regional
    except ImportError:
        pass
    segmento_df = pd.read_excel(cruces_path, sheet_name="Segmento")
    segmento_map = {
        norm_key(row["MARCAMODELO"]): normalized(row["Segmento"]) or "Sin segmento Honor"
        for _, row in segmento_df.iterrows()
        if normalized(row.get("MARCAMODELO"))
    }
    return {"regional_map": regional_map, "segmento_map": segmento_map}


def refresh_dimensions(
    payload: dict,
    dimension_maps: dict,
    supervisors: dict[str, str],
) -> None:
    accessories = payload.get("meta", {}).get("report_kind") == "accessories"
    for row in [*payload.get("rows", []), *payload.get("stockRows", [])]:
        pdv = str(row.get("p") or "Sin punto de venta")
        model = str(row.get("m") or "Sin modelo")
        row["rg"] = dimension_maps["regional_map"].get(norm_key(pdv), "Sin regional")
        row["sup"] = supervisor_for_pdv(pdv, supervisors)
        if not accessories:
            row["s"] = dimension_maps["segmento_map"].get(norm_key(model), "Sin segmento Honor")


def cross_summary(rows: list[dict], accessories: bool) -> dict:
    missing_regional = Counter()
    missing_segment = Counter()
    missing_price = Counter()
    for row in rows:
        sales = float(row.get("v", 0) or 0)
        if row.get("rg") == "Sin regional":
            missing_regional[row.get("p", "Sin punto de venta")] += sales
        if not accessories and row.get("s") == "Sin segmento Honor":
            missing_segment[row.get("m", "Sin modelo")] += sales
        if row.get("pr") is None:
            missing_price[row.get("m", "Sin modelo")] += sales
    missing_sales = {}
    if missing_regional:
        missing_sales["REGIONAL"] = round(sum(missing_regional.values()), 6)
    if missing_segment:
        missing_sales["SEGMENTO_HONOR"] = round(sum(missing_segment.values()), 6)
    if missing_price:
        missing_sales["PRECIO"] = round(sum(missing_price.values()), 6)
    return {
        "missing_sales": missing_sales,
        "missing_regional_pdvs": [
            {"PUNTODEVENTA": value, "VENTAS": round(sales, 6)}
            for value, sales in missing_regional.most_common(80)
        ],
        "missing_segment_models": [
            {"MARCAMODELO": value, "VENTAS": round(sales, 6)}
            for value, sales in missing_segment.most_common(80)
        ],
        "missing_price_models": [
            {"MARCAMODELO": value, "VENTAS": round(sales, 6)}
            for value, sales in missing_price.most_common(80)
        ],
    }


def combine_payload(previous: dict, current: dict, period: str, generated_at: str) -> tuple[dict, dict]:
    previous_kind = previous.get("meta", {}).get("report_kind", "mobiles")
    current_kind = current.get("meta", {}).get("report_kind", "mobiles")
    if previous_kind != current_kind:
        raise RuntimeError(f"Tipo de reporte incompatible: {previous_kind} vs {current_kind}")

    kept = [row for row in previous.get("rows", []) if str(row.get("pe")) != period]
    replacement = [row for row in current.get("rows", []) if str(row.get("pe")) == period]
    if not replacement:
        raise RuntimeError(f"La BD más reciente no produjo ventas para {period}.")
    rows = [*kept, *replacement]
    rows.sort(
        key=lambda row: (
            str(row.get("y", "")),
            str(row.get("pe", "")),
            str(row.get("p", "")).casefold(),
            str(row.get("b", "")).casefold(),
            str(row.get("m", "")).casefold(),
            str(row.get("f", "")),
        )
    )
    stocks = list(current.get("stockRows", []))
    latest_stock_date = max(
        (str(row.get("f")) for row in stocks if row.get("f") and row.get("f") != "Sin fecha"),
        default="",
    )
    latest_stocks = [row for row in stocks if str(row.get("f")) == latest_stock_date] if latest_stock_date else stocks
    accessories = current_kind == "accessories"

    period_totals = defaultdict(float)
    brand_totals = defaultdict(float)
    channel_totals = defaultdict(float)
    for row in rows:
        sales = float(row.get("v", 0) or 0)
        period_totals[str(row.get("pe"))] += sales
        brand_totals[str(row.get("b"))] += sales
        channel_totals[str(row.get("c"))] += sales
    periods = sorted(period_totals)
    years = sorted({str(row.get("y")) for row in rows if row.get("y")})
    brands = sorted(brand_totals, key=lambda value: (-brand_totals[value], value.casefold()))
    channels = sorted(channel_totals, key=lambda value: (-channel_totals[value], value.casefold()))

    lists = {
        "years": years,
        "periods": periods,
        "period_labels": {value: month_label(value) for value in periods},
        "channels": channels,
        "regionals": sorted({str(row.get("rg")) for row in [*rows, *stocks] if row.get("rg")}),
        "pdvs": sorted({str(row.get("p")) for row in [*rows, *stocks] if row.get("p")}),
        "segmentos_honor": sorted({str(row.get("s")) for row in [*rows, *stocks] if row.get("s")}),
        "models": sorted({str(row.get("m")) for row in [*rows, *stocks] if row.get("m")}),
        "brands": brands,
        "supervisors": sorted({str(row.get("sup")) for row in [*rows, *stocks] if row.get("sup")}),
    }
    if accessories:
        lists["types"] = sorted({str(row.get("t")) for row in [*rows, *stocks] if row.get("t")})
        lists["subtypes"] = sorted({str(row.get("st")) for row in [*rows, *stocks] if row.get("st")})

    meta = dict(current.get("meta", {}))
    meta.update(
        {
            "generated_at": generated_at,
            "total_sales": round(sum(float(row.get("v", 0) or 0) for row in rows), 6),
            "filtered_rows": len(rows),
            "stock_total": round(sum(float(row.get("q", 0) or 0) for row in latest_stocks), 6),
            "stock_filtered_rows": len(latest_stocks),
            "weeks": week_meta(rows),
            "periods": [
                {
                    "PERIODO": value,
                    "ANIO": value[:4],
                    "LABEL": month_label(value),
                    "VENTAS": round(period_totals[value], 6),
                }
                for value in periods
            ],
            "years": years,
            "dates": date_meta({str(row.get("f")) for row in rows if row.get("f")}),
            "stock_dates": date_meta({str(row.get("f")) for row in stocks if row.get("f")}),
            "cross_summary": cross_summary(rows, accessories),
        }
    )
    payload = {
        "meta": meta,
        "lists": lists,
        "rows": rows,
        "stockRows": stocks,
        "modelPrices": weighted_model_prices(rows),
        "priceChanges": current.get("priceChanges", {}),
        "priceHistory": current.get("priceHistory", {}),
    }
    audit = {
        "report_kind": current_kind,
        "period_replaced": period,
        "previous_rows": len(previous.get("rows", [])),
        "removed_rows": len(previous.get("rows", [])) - len(kept),
        "added_rows": len(replacement),
        "final_rows": len(rows),
        "total_sales": meta["total_sales"],
        "stock_total": meta["stock_total"],
        "max_sales_date": max((row.get("f", "") for row in replacement), default=""),
    }
    return payload, audit
