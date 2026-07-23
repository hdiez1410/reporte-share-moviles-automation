from __future__ import annotations

import json
import math
import argparse
import struct
import sys
import zipfile
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd


SOURCE_XLSB = Path("/Users/hector/Desktop/20260514.xlsb")
CRUCES_XLSX = Path("/Users/hector/Desktop/CRUCES.xlsx")
SHEET_MEMBER = "xl/worksheets/sheet2.bin"  # workbook rId2 -> Base Movs
SHARED_STRINGS_MEMBER = "xl/sharedStrings.bin"

FILTERS = {
    "ESTADO": "Nuevos",
    "GRUPO": "Consumo",
    "FAMILIA": "Moviles",
    "TIPOTRANSACCION": "3.SALIDAS",
    "TIPO": "Celular",
}

DETAIL_FIELDS = [
    "PERIODO",
    "DIA",
    "MARCA",
    "CANAL",
    "PUNTODEVENTA",
    "GAMA",
    "SUBGAMA",
    "MARCAMODELO",
]

CHANNEL_GROUP_MAP = {
    "TPF": "Tiendas",
    "TF": "Tiendas",
    "Tiendas Propias Franquicias": "Tiendas",
    "Empresas": "Empresas",
    "Retail": "Retail&Islas",
    "Islas": "Retail&Islas",
    "OMNIX": "Remotos",
    "Logixtal": "Remotos",
    "Postventa": "Remotos",
    "Brightstar": "Remotos",
    "Brighstar": "Remotos",
    "Televenta": "Remotos",
    "TIENDAS EXPRESS": "Tiendas Express",
    "Tiendas Express": "Tiendas Express",
    "TEX": "Tiendas Express",
    "TEX SATELITE": "Tiendas Express",
    "Central": "Central",
}

MONTH_ABBR = {
    1: "Ene",
    2: "Feb",
    3: "Mar",
    4: "Abr",
    5: "May",
    6: "Jun",
    7: "Jul",
    8: "Ago",
    9: "Sep",
    10: "Oct",
    11: "Nov",
    12: "Dic",
}


def read_record(data: bytes, pos: int):
    if pos >= len(data):
        return None
    first = data[pos]
    pos += 1
    if first & 0x80:
        record_type = (first & 0x7F) | (data[pos] << 7)
        pos += 1
    else:
        record_type = first

    length = 0
    shift = 0
    while True:
        part = data[pos]
        pos += 1
        length |= (part & 0x7F) << shift
        if not (part & 0x80):
            break
        shift += 7

    payload = data[pos : pos + length]
    return record_type, payload, pos + length


def iter_records(data: bytes):
    pos = 0
    while pos < len(data):
        rec = read_record(data, pos)
        if rec is None:
            break
        record_type, payload, pos = rec
        yield record_type, payload


def parse_shared_strings(zf: zipfile.ZipFile) -> list[str]:
    data = zf.read(SHARED_STRINGS_MEMBER)
    strings: list[str] = []
    for record_type, payload in iter_records(data):
        if record_type != 19:
            continue
        if len(payload) < 5:
            strings.append("")
            continue
        length = int.from_bytes(payload[1:5], "little", signed=False)
        strings.append(payload[5 : 5 + length * 2].decode("utf-16le", errors="replace"))
    return strings


def decode_rk(payload: bytes) -> float:
    raw = int.from_bytes(payload, "little", signed=False)
    if raw & 0x02:
        value = raw >> 2
        if value & (1 << 29):
            value -= 1 << 30
        value = float(value)
    else:
        value = struct.unpack("<d", (0).to_bytes(4, "little") + (raw & ~0x03).to_bytes(4, "little"))[0]
    if raw & 0x01:
        value /= 100
    return value


def normalized(value):
    if value is None:
        return ""
    if isinstance(value, float) and math.isnan(value):
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def norm_key(value) -> str:
    return normalized(value).casefold()


def sort_key(value: str):
    text = str(value)
    try:
        return (0, int(text))
    except ValueError:
        return (1, text)


def pct(part: float, total: float) -> float:
    return part / total if total else 0.0


def transaction_date(period_value, day_value):
    period = normalized(period_value)
    day = normalized(day_value)
    if len(period) != 6 or not period.isdigit() or not day.isdigit():
        return None
    year = int(period[:4])
    month = int(period[4:6])
    return datetime(year, month, int(day)).date()


def yyyymmdd(date_value) -> int | None:
    if date_value is None:
        return None
    return date_value.year * 10000 + date_value.month * 100 + date_value.day


def week_from_date(date_value):
    if date_value is None:
        return "Sin fecha", None, None
    week_number = str(date_value.isocalendar().week)
    monday = date_value - timedelta(days=date_value.weekday())
    sunday = monday + timedelta(days=6)
    return week_number, monday, sunday


def date_label(date_value):
    if date_value is None:
        return ""
    return f"{date_value.day:02d}-{MONTH_ABBR[date_value.month]}"


def group_channel(channel: str) -> str:
    return CHANNEL_GROUP_MAP.get(channel, channel or "Sin canal")


def make_table_accumulator() -> dict:
    return {
        "row_sales": defaultdict(float),
        "row_week_sales": defaultdict(float),
        "group_sales": defaultdict(float),
        "group_week_sales": defaultdict(float),
        "primary_sales": defaultdict(float),
        "row_to_group": {},
        "row_to_primary": {},
        "row_price_amount": defaultdict(float),
        "row_price_units": defaultdict(float),
    }


def add_dashboard_sale(acc: dict, channel: str, regional: str, pdv: str, segment: str, brand: str, model: str, week: str, date_value, sales: float):
    date_label_value = date_value.isoformat() if date_value else "Sin fecha"
    key = (channel, regional, pdv, segment, brand, model, week, date_label_value)
    acc["dashboard_sales"][key] += sales
    if date_value:
        acc["dates"].add(date_value)


def add_table_sale(table: dict, row_key: tuple, group_key: tuple, primary_key: tuple, week: str, sales: float, price: float | None):
    table["row_sales"][row_key] += sales
    table["row_week_sales"][(row_key, week)] += sales
    table["group_sales"][group_key] += sales
    table["group_week_sales"][(group_key, week)] += sales
    table["primary_sales"][primary_key] += sales
    table["row_to_group"][row_key] = group_key
    table["row_to_primary"][row_key] = primary_key
    if price is not None:
        table["row_price_amount"][row_key] += sales * price
        table["row_price_units"][row_key] += sales


def build_share_rows(
    table: dict,
    weeks: list[str],
    row_fields: list[str],
    primary_total_field: str,
    group_total_field: str | None = None,
    include_price: bool = False,
) -> list[dict]:
    ranks: dict[tuple, int] = defaultdict(int)

    def row_order(row_key: tuple):
        group = table["row_to_group"][row_key]
        primary = table["row_to_primary"][row_key]
        return (
            -table["primary_sales"][primary],
            -table["group_sales"][group],
            -table["row_sales"][row_key],
            row_key,
        )

    rows: list[dict] = []
    for row_key in sorted(table["row_sales"], key=row_order):
        group = table["row_to_group"][row_key]
        primary = table["row_to_primary"][row_key]
        ranks[group] += 1

        row = {field: row_key[i] for i, field in enumerate(row_fields)}
        row[primary_total_field] = round(table["primary_sales"][primary], 6)
        if group_total_field:
            row[group_total_field] = round(table["group_sales"][group], 6)
        if include_price:
            price_units = table["row_price_units"].get(row_key, 0.0)
            row["PRECIO_PROM"] = table["row_price_amount"][row_key] / price_units if price_units else None

        for week in weeks:
            sales = table["row_week_sales"].get((row_key, week), 0.0)
            group_sales = table["group_week_sales"].get((group, week), 0.0)
            row[f"VENTAS_S{week}"] = round(sales, 6)
            row[f"SHARE_S{week}"] = pct(sales, group_sales)

        total_sales = table["row_sales"][row_key]
        row["VENTAS_MES"] = round(total_sales, 6)
        row["SHARE_MES"] = pct(total_sales, table["group_sales"][group])
        row["RANK"] = ranks[group]
        rows.append(row)

    return rows


def load_crosses(cruces_path: Path):
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

    price_df = pd.read_excel(cruces_path, sheet_name="Precios")
    price_exact: dict[tuple[str, int], float] = {}
    prices_by_model: dict[str, list[tuple[int, float]]] = defaultdict(list)
    min_price_date = None
    max_price_date = None

    for _, row in price_df.iterrows():
        model_key = norm_key(row.get("MARCAMODELO"))
        date_raw = row.get("FECHAFINALCOM")
        price_raw = row.get("PRECIO")
        if not model_key or pd.isna(date_raw) or pd.isna(price_raw):
            continue
        date_key = int(date_raw)
        price = float(price_raw)
        price_exact[(model_key, date_key)] = price
        prices_by_model[model_key].append((date_key, price))
        min_price_date = date_key if min_price_date is None else min(min_price_date, date_key)
        max_price_date = date_key if max_price_date is None else max(max_price_date, date_key)

    for model_prices in prices_by_model.values():
        model_prices.sort()

    return {
        "regional_map": regional_map,
        "segmento_map": segmento_map,
        "price_exact": price_exact,
        "prices_by_model": prices_by_model,
        "min_price_date": min_price_date,
        "max_price_date": max_price_date,
        "source": str(cruces_path),
        "counts": {
            "regional_rows": len(regional_map),
            "segmento_rows": len(segmento_map),
            "price_rows": len(price_exact),
        },
    }


def lookup_price(crosses: dict, model: str, date_key: int | None):
    model_key = norm_key(model)
    if not model_key or date_key is None:
        return None, "missing"
    exact_price = crosses["price_exact"].get((model_key, date_key))
    if exact_price is not None:
        return exact_price, "exact"
    model_prices = crosses["prices_by_model"].get(model_key)
    if not model_prices:
        return None, "missing"
    fallback = None
    for price_date, price in model_prices:
        if price_date <= date_key:
            fallback = price
        else:
            break
    if fallback is None:
        return None, "missing"
    return fallback, "fallback"


def finalize_previous_row(
    row_idx: int | None,
    row_values: dict[int, object],
    header: list[str],
    col_idx: dict[str, int],
    acc: dict,
    crosses: dict,
):
    if row_idx is None:
        return

    if row_idx == 0:
        header[:] = [normalized(row_values.get(i)) for i in range(max(row_values.keys(), default=-1) + 1)]
        col_idx.clear()
        col_idx.update({name: i for i, name in enumerate(header) if name})
        missing = [field for field in [*FILTERS, "ITEMS", *DETAIL_FIELDS] if field not in col_idx]
        if missing:
            raise RuntimeError(f"Columnas no encontradas: {', '.join(missing)}")
        return

    acc["source_rows"] += 1
    if any(normalized(row_values.get(col_idx[field])) != expected for field, expected in FILTERS.items()):
        return

    items = row_values.get(col_idx["ITEMS"])
    if not isinstance(items, (int, float)) or math.isnan(float(items)):
        return

    # In the source, sales movements are stored as negative stock exits.
    sales = -float(items)
    if abs(sales) < 1e-12:
        return

    date_value = transaction_date(row_values.get(col_idx["PERIODO"]), row_values.get(col_idx["DIA"]))
    date_key = yyyymmdd(date_value)
    week, week_start, week_end = week_from_date(date_value)
    brand = normalized(row_values.get(col_idx["MARCA"])) or "Sin marca"
    original_channel = normalized(row_values.get(col_idx["CANAL"])) or "Sin canal"
    channel = group_channel(original_channel)
    pdv = normalized(row_values.get(col_idx["PUNTODEVENTA"])) or "Sin punto de venta"
    gama = normalized(row_values.get(col_idx["GAMA"])) or "Sin gama"
    subgama = normalized(row_values.get(col_idx["SUBGAMA"])) or "Sin subgama"
    model = normalized(row_values.get(col_idx["MARCAMODELO"])) or "Sin modelo"

    regional = crosses["regional_map"].get(norm_key(pdv), "Sin regional")
    segmento_honor = crosses["segmento_map"].get(norm_key(model), "Sin segmento Honor")
    price, price_status = lookup_price(crosses, model, date_key)

    acc["filtered_rows"] += 1
    acc["total_sales"] += sales
    acc["signed_items_total"] += float(items)
    if week_start and week not in acc["week_ranges"]:
        acc["week_ranges"][week] = (week_start, week_end)
    acc["weeks"][week] += sales
    acc["brands"][brand] += sales
    acc["week_brand"][(week, brand)] += sales
    acc["pdv_names"].add(pdv)
    acc["models"].add(model)
    acc["regionals"].add(regional)
    acc["segmentos_honor"].add(segmento_honor)
    acc["value_presence"]["CANAL_ORIGINAL"][original_channel] += 1
    acc["value_presence"]["CANAL_AGRUPADO"][channel] += 1
    acc["value_presence"]["GAMA"][gama] += 1
    acc["value_presence"]["SUBGAMA"][subgama] += 1
    acc["value_presence"]["REGIONAL_HONOR"][regional] += 1
    acc["value_presence"]["SEGMENTO_HONOR"][segmento_honor] += 1
    acc["price_match_counts"][price_status] += 1
    if regional == "Sin regional":
        acc["missing_crosses"]["REGIONAL"] += sales
    if segmento_honor == "Sin segmento Honor":
        acc["missing_crosses"]["SEGMENTO_HONOR"] += sales
    if price is None:
        acc["missing_crosses"]["PRECIO"] += sales

    add_dashboard_sale(acc, channel, regional, pdv, segmento_honor, brand, model, week, date_value, sales)

    add_table_sale(
        acc["tables"]["channel"],
        (channel, regional, brand),
        (channel, regional),
        (channel,),
        week,
        sales,
        None,
    )
    add_table_sale(
        acc["tables"]["pdv"],
        (channel, regional, pdv, brand, model),
        (channel, pdv),
        (channel, pdv),
        week,
        sales,
        price,
    )
    add_table_sale(
        acc["tables"]["segment"],
        (gama, regional, brand, model),
        (gama, regional),
        (gama,),
        week,
        sales,
        price,
    )
    add_table_sale(
        acc["tables"]["subsegment"],
        (subgama, regional, brand, model),
        (subgama, regional),
        (subgama,),
        week,
        sales,
        price,
    )
    add_table_sale(
        acc["tables"]["segmento_honor"],
        (segmento_honor, regional, brand, model),
        (segmento_honor, regional),
        (segmento_honor,),
        week,
        sales,
        price,
    )


def extract(source_xlsb: Path = SOURCE_XLSB, cruces_xlsx: Path = CRUCES_XLSX):
    header: list[str] = []
    col_idx: dict[str, int] = {}
    crosses = load_crosses(cruces_xlsx)
    acc = {
        "source_rows": 0,
        "filtered_rows": 0,
        "total_sales": 0.0,
        "signed_items_total": 0.0,
        "weeks": defaultdict(float),
        "brands": defaultdict(float),
        "week_brand": defaultdict(float),
        "week_ranges": {},
        "pdv_names": set(),
        "models": set(),
        "regionals": set(),
        "segmentos_honor": set(),
        "price_match_counts": Counter(),
        "missing_crosses": Counter(),
        "value_presence": defaultdict(Counter),
        "dashboard_sales": defaultdict(float),
        "dates": set(),
        "tables": {
            "channel": make_table_accumulator(),
            "pdv": make_table_accumulator(),
            "segment": make_table_accumulator(),
            "subsegment": make_table_accumulator(),
            "segmento_honor": make_table_accumulator(),
        },
    }

    with zipfile.ZipFile(source_xlsb) as zf:
        shared = parse_shared_strings(zf)
        data = zf.read(SHEET_MEMBER)

    current_row = None
    row_values: dict[int, object] = {}

    for record_type, payload in iter_records(data):
        if record_type == 0:
            finalize_previous_row(current_row, row_values, header, col_idx, acc, crosses)
            current_row = int.from_bytes(payload[0:4], "little", signed=False)
            row_values = {}
        elif current_row is not None and record_type == 7 and len(payload) >= 12:
            col = int.from_bytes(payload[0:4], "little", signed=False)
            sst_idx = int.from_bytes(payload[8:12], "little", signed=False)
            row_values[col] = shared[sst_idx] if 0 <= sst_idx < len(shared) else ""
        elif current_row is not None and record_type == 5 and len(payload) >= 16:
            col = int.from_bytes(payload[0:4], "little", signed=False)
            row_values[col] = struct.unpack("<d", payload[8:16])[0]
        elif current_row is not None and record_type == 2 and len(payload) >= 12:
            col = int.from_bytes(payload[0:4], "little", signed=False)
            row_values[col] = decode_rk(payload[8:12])

    finalize_previous_row(current_row, row_values, header, col_idx, acc, crosses)

    weeks = sorted(acc["weeks"].keys(), key=sort_key)
    brands = sorted(acc["brands"].keys(), key=lambda b: (-acc["brands"][b], b))
    sales_matrix = []
    share_matrix = []
    for brand in brands:
        sales_row = {"MARCA": brand, "TOTAL": round(acc["brands"][brand], 6), "SHARE_TOTAL": pct(acc["brands"][brand], acc["total_sales"])}
        share_row = {"MARCA": brand, "SHARE_TOTAL": pct(acc["brands"][brand], acc["total_sales"])}
        for week in weeks:
            sales = acc["week_brand"].get((week, brand), 0.0)
            sales_row[week] = round(sales, 6)
            share_row[week] = pct(sales, acc["weeks"][week])
        sales_matrix.append(sales_row)
        share_matrix.append(share_row)

    week_ranges = []
    for w in weeks:
        start, end = acc["week_ranges"].get(w, (None, None))
        week_ranges.append(
            {
                "SEMANA": w,
                "DESDE": start.isoformat() if start else "",
                "HASTA": end.isoformat() if end else "",
                "LABEL": f"S{w} ({date_label(start)} al {date_label(end)})" if start and end else f"S{w}",
            }
        )

    weekly_totals = [{"SEMANA": w, "VENTAS": round(acc["weeks"][w], 6)} for w in weeks]
    brand_totals = [
        {"MARCA": b, "VENTAS": round(acc["brands"][b], 6), "SHARE": pct(acc["brands"][b], acc["total_sales"])}
        for b in brands
    ]

    share_by_channel = build_share_rows(
        acc["tables"]["channel"],
        weeks,
        ["CANAL_AGRUPADO", "REGIONAL_HONOR", "MARCA"],
        "TOTAL_CANAL",
        "TOTAL_CANAL_REGIONAL",
    )
    share_by_pdv = build_share_rows(
        acc["tables"]["pdv"],
        weeks,
        ["CANAL_AGRUPADO", "REGIONAL_HONOR", "PUNTODEVENTA", "MARCA", "MARCAMODELO"],
        "TOTAL_PDV",
        None,
        True,
    )
    channel_totals_for_order = {
        channel: acc["tables"]["channel"]["primary_sales"][(channel,)]
        for channel in {row["CANAL_AGRUPADO"] for row in share_by_channel}
    }
    share_by_pdv.sort(
        key=lambda row: (
            -channel_totals_for_order.get(row["CANAL_AGRUPADO"], 0.0),
            -row["TOTAL_PDV"],
            -row["VENTAS_MES"],
            row["PUNTODEVENTA"],
            row["MARCA"],
            row["MARCAMODELO"],
        )
    )
    share_by_segment = build_share_rows(
        acc["tables"]["segment"],
        weeks,
        ["SEGMENTO_GAMA", "REGIONAL_HONOR", "MARCA", "MARCAMODELO"],
        "TOTAL_SEGMENTO",
        "TOTAL_SEGMENTO_REGIONAL",
        True,
    )
    share_by_subsegment = build_share_rows(
        acc["tables"]["subsegment"],
        weeks,
        ["SUBGAMA", "REGIONAL_HONOR", "MARCA", "MARCAMODELO"],
        "TOTAL_SUBGAMA",
        "TOTAL_SUBGAMA_REGIONAL",
        True,
    )
    share_by_segmento_honor = build_share_rows(
        acc["tables"]["segmento_honor"],
        weeks,
        ["SEGMENTO_HONOR", "REGIONAL_HONOR", "MARCA", "MARCAMODELO"],
        "TOTAL_SEGMENTO_HONOR",
        "TOTAL_SEGMENTO_HONOR_REGIONAL",
        True,
    )

    dates = sorted(acc["dates"])
    dashboard_data = [
        {
            "CANAL_AGRUPADO": channel,
            "REGIONAL_HONOR": regional,
            "PUNTODEVENTA": pdv,
            "SEGMENTO_HONOR": segment,
            "MARCA": brand,
            "MARCAMODELO": model,
            "SEMANA": week,
            "FECHA": date_label_value,
            "DIA": date_label_value[-2:] if date_label_value != "Sin fecha" else "",
            "VENTAS": round(sales, 6),
        }
        for (channel, regional, pdv, segment, brand, model, week, date_label_value), sales in acc["dashboard_sales"].items()
    ]
    dashboard_data.sort(
        key=lambda row: (
            row["CANAL_AGRUPADO"],
            row["REGIONAL_HONOR"],
            row["PUNTODEVENTA"],
            row["SEGMENTO_HONOR"],
            row["MARCA"],
            row["MARCAMODELO"],
            sort_key(row["SEMANA"]),
            row["FECHA"],
        )
    )

    unique_models = sorted(acc["models"])
    unique_pdvs = sorted(acc["pdv_names"])
    unique_regionals = sorted(acc["regionals"])
    unique_segmentos_honor = sorted(acc["segmentos_honor"])

    price_note = (
        "Precio cruzado por MARCAMODELO y fecha PERIODO+DIA contra CRUCES/Precios. "
        "Si no existe precio exacto para el dia, se usa el ultimo precio disponible del modelo a esa fecha."
    )
    if crosses["max_price_date"]:
        price_note += f" Rango de fechas en CRUCES/Precios: {crosses['min_price_date']} a {crosses['max_price_date']}."

    return {
        "source_file": str(source_xlsb),
        "source_sheet": "Base Movs",
        "cruces_file": crosses["source"],
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "filters": FILTERS,
        "metric_note": "VENTAS = -SUM(ITEMS), porque los movimientos de venta figuran como salidas negativas de stock.",
        "week_note": "Semana calculada desde PERIODO + DIA con corte lunes a domingo; no se usa el campo SEMANA de la base.",
        "channel_note": "Canales agrupados: TPF/TF/Tiendas Propias Franquicias=Tiendas; Empresas=Empresas; Retail/Islas=Retail&Islas; OMNIX/Logixtal/Postventa/Brightstar/Brighstar/Televenta=Remotos; TIENDAS EXPRESS/TEX/TEX SATELITE=Tiendas Express; Central=Central.",
        "segment_note": "Se usa GAMA como segmento principal, SUBGAMA como subsegmento y CRUCES/Segmento como Segmento Honor.",
        "crosses_note": "Regional Honor cruza PUNTODEVENTA contra CRUCES/REGIONAL. Segmento Honor cruza MARCAMODELO contra CRUCES/Segmento.",
        "price_note": price_note,
        "headers": header,
        "source_rows": acc["source_rows"],
        "filtered_rows": acc["filtered_rows"],
        "total_sales": round(acc["total_sales"], 6),
        "signed_items_total": round(acc["signed_items_total"], 6),
        "weeks": weeks,
        "week_ranges": week_ranges,
        "brands": brands,
        "weekly_totals": weekly_totals,
        "brand_totals": brand_totals,
        "weekly_sales_matrix": sales_matrix,
        "weekly_share_matrix": share_matrix,
        "dates": [
            {
                "FECHA": date.isoformat(),
                "DIA": f"{date.day:02d}",
                "LABEL": f"{date.day:02d}-{MONTH_ABBR[date.month]}",
            }
            for date in dates
        ],
        "dashboard_data": dashboard_data,
        "lists": {
            "channels": sorted({row["CANAL_AGRUPADO"] for row in share_by_channel}, key=lambda c: -acc["tables"]["channel"]["primary_sales"][(c,)]),
            "regionals": unique_regionals,
            "pdvs": unique_pdvs,
            "segmentos_honor": unique_segmentos_honor,
            "models": unique_models,
            "brands": brands,
        },
        "channel_groups": sorted({row["CANAL_AGRUPADO"] for row in share_by_channel}, key=lambda c: -acc["tables"]["channel"]["primary_sales"][(c,)]),
        "share_by_channel": share_by_channel,
        "share_by_pdv": share_by_pdv,
        "share_by_segment": share_by_segment,
        "share_by_subsegment": share_by_subsegment,
        "share_by_segmento_honor": share_by_segmento_honor,
        "cross_summary": {
            "cruces_counts": crosses["counts"],
            "price_match_counts": dict(acc["price_match_counts"]),
            "missing_sales": {key: round(value, 6) for key, value in acc["missing_crosses"].items()},
        },
        "counts": {
            "weeks": len(weeks),
            "brands": len(brands),
            "channels": len({row["CANAL_AGRUPADO"] for row in share_by_channel}),
            "pdv": len(acc["pdv_names"]),
            "models": len(acc["models"]),
            "regionals": len(acc["regionals"]),
            "segments_gama": len({row["SEGMENTO_GAMA"] for row in share_by_segment}),
            "subsegments": len({row["SUBGAMA"] for row in share_by_subsegment}),
            "segmentos_honor": len(acc["segmentos_honor"]),
        },
    }


def main():
    parser = argparse.ArgumentParser(description="Extrae y agrega Base Movs para el reporte de share.")
    parser.add_argument("output", nargs="?", default="outputs/sales_report_data.json")
    parser.add_argument("--source", default=str(SOURCE_XLSB), help="Ruta del archivo XLSB con Base Movs.")
    parser.add_argument("--cruces", default=str(CRUCES_XLSX), help="Ruta del archivo CRUCES.xlsx final.")
    args = parser.parse_args()

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    data = extract(Path(args.source), Path(args.cruces))
    out_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({k: data[k] for k in ["filtered_rows", "total_sales", "counts", "cross_summary"]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
