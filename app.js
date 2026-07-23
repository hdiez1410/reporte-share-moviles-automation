const DATA = window.REPORT_DATA;
const ALL = "Todos";
const STORE_CHANNELS = ["Tiendas", "Retail&Islas", "Tiendas Express"];
function availableYears() {
  return DATA.lists.years?.length ? DATA.lists.years : DATA.meta.years || [];
}
const MONTHS = [
  ["01", "Enero"],
  ["02", "Febrero"],
  ["03", "Marzo"],
  ["04", "Abril"],
  ["05", "Mayo"],
  ["06", "Junio"],
  ["07", "Julio"],
  ["08", "Agosto"],
  ["09", "Septiembre"],
  ["10", "Octubre"],
  ["11", "Noviembre"],
  ["12", "Diciembre"],
];
const WEEKDAYS = [
  ["1", "Lunes"],
  ["2", "Martes"],
  ["3", "Miércoles"],
  ["4", "Jueves"],
  ["5", "Viernes"],
  ["6", "Sábado"],
  ["0", "Domingo"],
];
const state = {
  view: "mensual",
  year: [availableYears()[availableYears().length - 1] || ALL],
  month: [ALL],
  week: [ALL],
  day: [ALL],
  weekday: [ALL],
  channel: [ALL],
  regional: [ALL],
  supervisor: [ALL],
  pdv: [ALL],
  segment: [ALL],
  brand: [ALL],
  model: [ALL],
  insightPdvRegional: [ALL],
  insightPdvPdv: [ALL],
  pages: {},
};

const els = {
  year: document.getElementById("filter-year"),
  month: document.getElementById("filter-month"),
  week: document.getElementById("filter-week"),
  day: document.getElementById("filter-day"),
  weekday: document.getElementById("filter-weekday"),
  channel: document.getElementById("filter-channel"),
  regional: document.getElementById("filter-regional"),
  supervisor: document.getElementById("filter-supervisor"),
  pdv: document.getElementById("filter-pdv"),
  segment: document.getElementById("filter-segment"),
  brand: document.getElementById("filter-brand"),
  model: document.getElementById("filter-model"),
  reset: document.getElementById("reset-filters"),
  source: document.getElementById("source-label"),
  kpiSales: document.getElementById("kpi-sales"),
  kpiShare: document.getElementById("kpi-share"),
  kpiBrand: document.getElementById("kpi-brand"),
  kpiPdv: document.getElementById("kpi-pdv"),
  modelCount: document.getElementById("model-count"),
  insightPdvRegional: document.getElementById("filter-insight-pdv-regional"),
  insightPdvPdv: document.getElementById("filter-insight-pdv"),
};

const tableIds = {
  brandWeek: "table-brand-week",
  segmentWeek: "table-segment-week",
  modelWeek: "table-model-week",
  brandDay: "table-brand-day",
  modelDay: "table-model-day",
  regionalSegment: "table-regional-segment",
  regionalBrand: "table-regional-brand",
  storeBrand: "table-store-brand",
  storeModel: "table-store-model",
  priceChannel: "table-price-channel",
  priceRegional: "table-price-regional",
  priceSegment: "table-price-segment",
  priceChannelModel: "table-price-channel-model",
  pricePdvModel: "table-price-pdv-model",
  priceChangeSegment: "table-price-change-segment",
  priceChangeDetail: "table-price-change-detail",
  priceHistory: "table-price-history",
  stockSegment: "table-stock-segment",
  stockChannel: "table-stock-channel",
  stockChannelModel: "table-stock-channel-model",
  stockBrand: "table-stock-brand",
  stockModel: "table-stock-model",
  stockPdv: "table-stock-pdv",
  wosMain: "table-wos-main",
  wosStockAlert: "table-wos-stock-alert",
  wosSalesAlert: "table-wos-sales-alert",
  insightActions: "table-insight-actions",
  insightPriceStock: "table-insight-price-stock",
  insightBrandSales: "table-insight-brand-sales",
  insightChannelSales: "table-insight-channel-sales",
  insightSegmentSales: "table-insight-segment-sales",
  insightPdvSales: "table-insight-pdv-sales",
  insightModelSales: "table-insight-model-sales",
  insightPdvShare: "table-insight-pdv-share",
  insightSegmentShare: "table-insight-segment-share",
  insightHonorStock: "table-insight-honor-stock",
  insightModelStock: "table-insight-model-stock",
  monthlyBrand: "table-monthly-brand",
  monthlyBrandDay: "table-monthly-brand-day",
  monthlySegment: "table-monthly-segment",
  monthlyModel: "table-monthly-model",
  monthlyPdvBrand: "table-monthly-pdv-brand",
};

function fmtInt(value) {
  return Math.round(value || 0).toLocaleString("es-PE");
}

function fmtDecimal(value) {
  return Number(value || 0).toLocaleString("es-PE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function fmtPct(value) {
  return `${((value || 0) * 100).toFixed(1)}%`;
}

function fmtPrice(value) {
  if (value == null || Number.isNaN(Number(value))) return "";
  return `S/ ${Number(value).toLocaleString("es-PE", { maximumFractionDigits: 1 })}`;
}

function fmtCorr(value) {
  if (value == null || Number.isNaN(Number(value))) return "";
  return Number(value).toFixed(2);
}

function fmtWeeks(value) {
  if (value == null || Number.isNaN(Number(value))) return "Sin venta";
  if (value > 99) return ">99";
  return Number(value).toFixed(1);
}

function fmtSignedPrice(value) {
  if (value == null || Number.isNaN(Number(value))) return "";
  const number = Number(value);
  const sign = number > 0 ? "+" : "";
  return `${sign}S/ ${number.toLocaleString("es-PE", { maximumFractionDigits: 1 })}`;
}

function fmtSignedInt(value) {
  if (value == null || Number.isNaN(Number(value))) return "";
  const number = Math.round(Number(value));
  const sign = number > 0 ? "+" : "";
  return `${sign}${number.toLocaleString("es-PE")}`;
}

function fmtSignedPct(value) {
  if (value == null || Number.isNaN(Number(value))) return "";
  const number = Number(value);
  const sign = number > 0 ? "+" : "";
  return `${sign}${(number * 100).toFixed(1)}%`;
}

function sum(rows) {
  return rows.reduce((total, row) => total + row.v, 0);
}

function sumStock(rows) {
  return rows.reduce((total, row) => total + row.q, 0);
}

function makeKey(row, fields) {
  return fields.map((field) => row[field]).join("||");
}

function group(rows, fields) {
  const grouped = new Map();
  for (const row of rows) {
    const key = makeKey(row, fields);
    grouped.set(key, (grouped.get(key) || 0) + row.v);
  }
  return grouped;
}

function groupStock(rows, fields) {
  const grouped = new Map();
  for (const row of rows) {
    const key = makeKey(row, fields);
    grouped.set(key, (grouped.get(key) || 0) + row.q);
  }
  return grouped;
}

function withTotalRow(rows, labelKey, label = "Total Entel") {
  if (!rows.length) return rows;
  const total = { [labelKey]: label, __total: true };
  const numericKeys = new Set();
  for (const row of rows) {
    for (const [key, value] of Object.entries(row)) {
      if (typeof value === "number" && Number.isFinite(value)) numericKeys.add(key);
    }
  }
  for (const key of numericKeys) {
    if (key === "share" || /^s(?!ales)/.test(key)) {
      total[key] = 1;
    } else if (key === "price" || key.startsWith("price:")) {
      total[key] = null;
    } else {
      total[key] = rows.reduce((acc, row) => acc + (Number(row[key]) || 0), 0);
    }
  }
  return [...rows, total];
}

function unique(rows, field) {
  return [...new Set(rows.map((row) => row[field]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
}

function normalizeSelection(values, selected) {
  const allowed = new Set([ALL, ...values]);
  const input = Array.isArray(selected) ? selected : [selected];
  const items = input.filter((item) => item !== ALL && allowed.has(item));
  return items.length ? items : [ALL];
}

function selectedValues(select) {
  const raw = Array.from(select.selectedOptions || []).map((option) => option.value);
  if (!raw.length && select.value) raw.push(select.value);
  const items = raw.filter((item) => item !== ALL);
  return items.length ? items : [ALL];
}

function matchesSelection(value, selected) {
  return selected.includes(ALL) || selected.includes(value);
}

function setOptions(select, values, value) {
  const options = [ALL, ...values.filter((item) => item !== ALL)];
  const selected = normalizeSelection(values, value);
  select.innerHTML = options
    .map((item) => {
      const isSelected = selected.includes(item) ? " selected" : "";
      return `<option value="${escapeAttr(item)}"${isSelected}>${escapeHtml(optionLabel(select.id, item))}</option>`;
    })
    .join("");
  if (select.options && select.options.length) {
    Array.from(select.options).forEach((option) => {
      option.selected = selected.includes(option.value);
    });
  } else {
    select.value = selected[0] || ALL;
  }
  return selected;
}

function optionLabel(selectId, value) {
  if (value === ALL) return value;
  if (selectId === "filter-month") return Object.fromEntries(MONTHS)[value] || value;
  if (selectId === "filter-week") return `Semana ${Number(value)}`;
  if (selectId === "filter-weekday") return Object.fromEntries(WEEKDAYS)[value] || value;
  return value;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("'", "&#39;");
}

function rowsForCurrentView() {
  if (state.view !== "tiendas") return DATA.rows;
  return DATA.rows.filter((row) => STORE_CHANNELS.includes(row.c));
}

function monthValue(row) {
  return String(row.pe || "").slice(4, 6);
}

function weekValue(row) {
  const match = String(row.w || "").match(/W(\d{1,2})$/);
  if (match) return String(Number(match[1]));
  if (!row.f || row.f === "Sin fecha") return "";
  const date = new Date(`${row.f}T00:00:00Z`);
  const target = new Date(date);
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return String(Math.ceil((((target - yearStart) / 86400000) + 1) / 7));
}

function dayValue(row) {
  return String(Number(row.d || String(row.f || "").slice(-2)) || "");
}

function weekdayValue(row) {
  if (!row.f || row.f === "Sin fecha") return "";
  return String(new Date(`${row.f}T00:00:00Z`).getUTCDay());
}

const filterDefinitions = [
  ["year", "y"],
  ["month", monthValue],
  ["week", weekValue],
  ["day", dayValue],
  ["weekday", weekdayValue],
  ["channel", "c"],
  ["regional", "rg"],
  ["supervisor", "sup"],
  ["pdv", "p"],
  ["segment", "s"],
  ["brand", "b"],
  ["model", "m"],
];

function filterValue(row, getter) {
  return typeof getter === "function" ? getter(row) : String(row[getter] ?? "");
}

function matchesFilters(row, options = {}) {
  const ignored = new Set(options.ignore || []);
  for (const [name, getter] of filterDefinitions) {
    if (ignored.has(name)) continue;
    if (!matchesSelection(filterValue(row, getter), state[name])) return false;
  }
  return true;
}

function filteredRows(options = {}) {
  const forceStoreScope = options.forceTiendas || state.view === "tiendas";
  return DATA.rows.filter((row) => {
    if (forceStoreScope && !STORE_CHANNELS.includes(row.c)) return false;
    if (options.targetPeriod && row.pe !== options.targetPeriod) return false;
    const ignore = [];
    if (options.ignoreYear || options.ignoreTime) ignore.push("year");
    if (options.ignorePeriod || options.targetPeriod || options.ignoreTime) ignore.push("month");
    if (options.ignoreTime) ignore.push("week", "day", "weekday");
    if (options.ignoreBrand) ignore.push("brand");
    return matchesFilters(row, { ignore });
  });
}

function filteredStockRows(options = {}) {
  const forceStoreScope = options.forceTiendas || state.view === "tiendas";
  return (DATA.stockRows || []).filter((row) => {
    if (forceStoreScope && !STORE_CHANNELS.includes(row.c)) return false;
    if (options.targetPeriod && row.pe !== options.targetPeriod) return false;
    const ignore = [];
    if (options.ignoreYear || options.ignoreTime) ignore.push("year");
    if (options.ignorePeriod || options.targetPeriod || options.ignoreTime) ignore.push("month");
    if (options.ignoreTime) ignore.push("week", "day", "weekday");
    if (options.ignoreBrand) ignore.push("brand");
    return matchesFilters(row, { ignore });
  });
}

function valuesFor(rows, getter) {
  return [...new Set(rows.map((row) => filterValue(row, getter)).filter(Boolean))].sort((a, b) => {
    if (/^\d+$/.test(a) && /^\d+$/.test(b)) return Number(a) - Number(b);
    return a.localeCompare(b, "es");
  });
}

function refreshFilterOptions() {
  const salesRows = rowsForCurrentView();
  const stockRows = ["stock", "wos"].includes(state.view)
    ? (DATA.stockRows || []).filter((row) => state.view !== "tiendas" || STORE_CHANNELS.includes(row.c))
    : [];
  const optionRows = [...salesRows, ...stockRows];

  state.year = setOptions(els.year, availableYears(), state.year);
  for (const [name, getter] of filterDefinitions.slice(1)) {
    const candidates = optionRows.filter((row) => matchesFilters(row, { ignore: [name] }));
    let values = valuesFor(candidates, getter);
    if (name === "month") values = MONTHS.map(([value]) => value).filter((value) => values.includes(value));
    if (name === "weekday") values = WEEKDAYS.map(([value]) => value).filter((value) => values.includes(value));
    if (name === "channel" && state.view === "tiendas") values = STORE_CHANNELS.filter((value) => values.includes(value));
    state[name] = setOptions(els[name], values, state[name]);
  }
  els.channel.disabled = false;
}

function renderTable(id, columns, rows, options = {}) {
  const table = document.getElementById(id);
  const limit = options.limit || 80;
  const limited = [...rows.filter((row) => !row.__total).slice(0, limit), ...rows.filter((row) => row.__total)];
  const sticky = stickyColumns(columns, options.stickyColumns ?? 1);
  const head = `<thead><tr>${columns
    .map((col, index) => `<th${cellAttrs(col, sticky[index])}>${escapeHtml(col.label)}</th>`)
    .join("")}</tr></thead>`;
  const body = limited
    .map((row) => {
      const classes = [];
      if (row.__total) classes.push("total-row");
      if (row.__class) classes.push(row.__class);
      const klass = classes.length ? ` class="${classes.join(" ")}"` : "";
      return `<tr${klass}>${columns
        .map((col, index) => {
          const raw = row[col.key];
          const value = col.format ? col.format(raw, row) : raw;
          return `<td${cellAttrs(col, sticky[index])}>${escapeHtml(value)}</td>`;
        })
        .join("")}</tr>`;
    })
    .join("");
  table.innerHTML = `${head}<tbody>${body}</tbody>`;
}

function renderPagedTable(id, columns, rows, options = {}) {
  const pageSize = options.pageSize || 300;
  const pageKey = options.pageKey || id;
  const detailRows = rows.filter((row) => !row.__total);
  const totalRows = rows.filter((row) => row.__total);
  const pageCount = Math.max(1, Math.ceil(detailRows.length / pageSize));
  const currentPage = Math.min(state.pages[pageKey] || 0, pageCount - 1);
  state.pages[pageKey] = currentPage;
  const start = currentPage * pageSize;
  const pageRows = [...detailRows.slice(start, start + pageSize), ...totalRows];
  renderTable(id, columns, pageRows, { ...options, limit: pageSize, pageKey: undefined, pagerId: undefined, pageSize: undefined });
  renderPager(options.pagerId, pageKey, currentPage, pageCount, detailRows.length, pageSize);
}

function renderPager(pagerId, pageKey, currentPage, pageCount, rowCount, pageSize) {
  if (!pagerId) return;
  const pager = document.getElementById(pagerId);
  if (!pager) return;
  if (!rowCount) {
    pager.textContent = "0 filas";
    return;
  }
  const start = currentPage * pageSize + 1;
  const end = Math.min((currentPage + 1) * pageSize, rowCount);
  pager.innerHTML = `
    <button type="button" data-page-step="-1"${currentPage <= 0 ? " disabled" : ""}>Ant</button>
    <span>${fmtInt(start)}-${fmtInt(end)} de ${fmtInt(rowCount)}</span>
    <button type="button" data-page-step="1"${currentPage >= pageCount - 1 ? " disabled" : ""}>Sig</button>
  `;
  pager.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      state.pages[pageKey] = Math.max(0, Math.min(pageCount - 1, currentPage + Number(button.dataset.pageStep)));
      render();
    });
  });
}

function stickyWidth(col) {
  const label = String(col.label || "").toLowerCase();
  if (label.includes("modelo")) return 280;
  if (label.includes("punto")) return 260;
  if (label.includes("regional")) return 160;
  if (label.includes("segmento")) return 160;
  if (label.includes("marca")) return 130;
  if (label.includes("canal")) return 110;
  return 150;
}

function stickyColumns(columns, count) {
  let left = 0;
  return columns.map((col, index) => {
    if (index >= count) return { sticky: false };
    const width = stickyWidth(col);
    const meta = { sticky: true, left, width };
    left += width;
    return meta;
  });
}

function cellAttrs(col, meta) {
  const classes = [];
  if (col.num) classes.push("num");
  if (meta.sticky) classes.push("is-sticky-col");
  const classAttr = classes.length ? ` class="${classes.join(" ")}"` : "";
  if (!meta.sticky) return classAttr;
  const style = `left:${meta.left}px;min-width:${meta.width}px;width:${meta.width}px;max-width:${meta.width}px`;
  return `${classAttr} style="${style}"`;
}

function weekLabel(week) {
  const multiYear = state.year.includes(ALL) || state.year.length > 1;
  return multiYear ? week.LABEL : week.SHORT || `S${week.NUMERO || week.SEMANA}`;
}

function activeWeeks(rows) {
  const keys = new Set(rows.map((row) => row.w));
  return DATA.meta.weeks.filter((week) => keys.has(week.SEMANA));
}

function dateKey(date) {
  return String(date.FECHA).replaceAll("-", "");
}

function rawDateKey(date) {
  return String(date).replaceAll("-", "");
}

function shortDateLabel(date) {
  const item = DATA.meta.dates.find((candidate) => candidate.FECHA === date);
  if (item) return item.LABEL;
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("es-PE", { day: "2-digit", month: "short" }).replace(".", "");
}

function activeDates(rows) {
  const keys = new Set(rows.map((row) => row.f));
  return DATA.meta.dates.filter((date) => keys.has(date.FECHA));
}

function activePeriods(rows) {
  const keys = new Set(rows.map((row) => row.pe));
  return DATA.meta.periods.filter((period) => keys.has(period.PERIODO));
}

function weeklyRows(rows, dimensionField, label) {
  const weeks = activeWeeks(rows);
  const totalByWeek = group(rows, ["w"]);
  const totalAll = sum(rows);
  const totalByDimension = group(rows, [dimensionField]);
  const byDimensionWeek = group(rows, [dimensionField, "w"]);
  const output = [...totalByDimension.entries()]
    .map(([name, total]) => {
      const row = { [label]: name, total, share: total / (totalAll || 1) };
      for (const week of weeks) {
        const sales = byDimensionWeek.get(`${name}||${week.SEMANA}`) || 0;
        row[`v${week.SEMANA}`] = sales;
        row[`s${week.SEMANA}`] = sales / (totalByWeek.get(week.SEMANA) || 1);
      }
      return row;
    })
    .sort((a, b) => b.total - a.total);
  return withTotalRow(output, label);
}

function weeklyColumns(labelKey, label) {
  const weeks = activeWeeks(filteredRows());
  return [
    { key: labelKey, label },
    ...weeks.flatMap((week) => [
      { key: `v${week.SEMANA}`, label: `Venta ${weekLabel(week)}`, num: true, format: fmtInt },
      { key: `s${week.SEMANA}`, label: `Share ${weekLabel(week)}`, num: true, format: fmtPct },
    ]),
    { key: "total", label: "Venta mes", num: true, format: fmtInt },
    { key: "share", label: "Share mes", num: true, format: fmtPct },
  ];
}

function groupedWeightedPrices(rows, fields) {
  const groups = new Map();
  for (const row of rows) {
    if (row.pr == null || Number.isNaN(Number(row.pr))) continue;
    const key = makeKey(row, fields);
    if (!groups.has(key)) groups.set(key, { amount: 0, units: 0 });
    const item = groups.get(key);
    item.amount += Number(row.pr) * Number(row.v || 0);
    item.units += Number(row.v || 0);
  }
  return new Map([...groups].map(([key, item]) => [key, item.units ? item.amount / item.units : null]));
}

function dailyRows(rows, dimensionField, label, denominatorField = null, includePrice = false) {
  const dates = activeDates(rows);
  const totalAll = sum(rows);
  const totalByDay = group(rows, ["f"]);
  const totalByDimension = group(rows, [dimensionField]);
  const byDimensionDay = group(rows, [dimensionField, "f"]);
  const priceByDimensionDay = includePrice ? groupedWeightedPrices(rows, [dimensionField, "f"]) : null;
  const segmentDay = denominatorField ? group(rows, [denominatorField, "f"]) : null;
  const segmentTotal = denominatorField ? group(rows, [denominatorField]) : null;
  const output = [...totalByDimension.entries()]
    .map(([name, total]) => {
      const row = { [label]: name, total, share: total / (totalAll || 1) };
      for (const date of dates) {
        const sales = byDimensionDay.get(`${name}||${date.FECHA}`) || 0;
        row[`v${dateKey(date)}`] = sales;
        row[`s${dateKey(date)}`] = sales / (totalByDay.get(date.FECHA) || 1);
        if (includePrice) row[`price:${date.FECHA}`] = priceByDimensionDay.get(`${name}||${date.FECHA}`) ?? null;
      }
      if (denominatorField === "s") {
        const segmentName = rows.find((item) => item[dimensionField] === name)?.s;
        row.share = total / (segmentTotal.get(segmentName) || 1);
        for (const date of dates) {
          const sales = row[`v${dateKey(date)}`] || 0;
          row[`s${dateKey(date)}`] = sales / (segmentDay.get(`${segmentName}||${date.FECHA}`) || 1);
        }
      }
      return row;
    })
    .sort((a, b) => b.total - a.total);
  return withTotalRow(output, label);
}

function dailyColumns(labelKey, label, includePrice = false) {
  const dates = activeDates(filteredRows());
  return [
    { key: labelKey, label },
    ...dates.flatMap((date) => [
      { key: `v${dateKey(date)}`, label: `Venta ${date.LABEL}`, num: true, format: fmtInt },
      { key: `s${dateKey(date)}`, label: `Share ${date.LABEL}`, num: true, format: fmtPct },
      ...(includePrice
        ? [{ key: `price:${date.FECHA}`, label: `Precio prom ${date.LABEL}`, num: true, format: fmtPrice }]
        : []),
    ]),
    { key: "total", label: "Venta mes", num: true, format: fmtInt },
    { key: "share", label: "Share mes", num: true, format: fmtPct },
  ];
}

function modelDailyRows(rows) {
  const prepared = dailyRows(rows, "m", "model", "s", true).map((row) => {
    const sample = rows.find((item) => item.m === row.model);
    return {
      segment: sample?.s || "",
      model: row.model,
      ...row,
    };
  });
  return prepared;
}

function modelWeeklyRows(rows) {
  const weeks = activeWeeks(rows);
  const totalByWeek = group(rows, ["w"]);
  const segmentWeek = group(rows, ["s", "w"]);
  const segmentTotal = group(rows, ["s"]);
  const totalByModel = group(rows, ["m"]);
  const byModelWeek = group(rows, ["m", "w"]);
  const priceByModelWeek = groupedWeightedPrices(rows, ["m", "w"]);
  const priceByWeek = groupedWeightedPrices(rows, ["w"]);
  const output = [...totalByModel.entries()]
    .map(([model, total]) => {
      const sample = rows.find((item) => item.m === model);
      const segment = sample?.s || "";
      const row = {
        segment,
        model,
        total,
        share: total / (segmentTotal.get(segment) || 1),
      };
      for (const week of weeks) {
        const sales = byModelWeek.get(`${model}||${week.SEMANA}`) || 0;
        row[`v${week.SEMANA}`] = sales;
        row[`s${week.SEMANA}`] = sales / (segmentWeek.get(`${segment}||${week.SEMANA}`) || 1);
        row[`price:${week.SEMANA}`] = priceByModelWeek.get(`${model}||${week.SEMANA}`) ?? null;
      }
      return row;
    })
    .sort((a, b) => a.segment.localeCompare(b.segment, "es") || b.total - a.total || a.model.localeCompare(b.model, "es"));

  if (!output.length) return output;
  const total = { segment: "Total Entel", model: "", total: sum(rows), share: 1, __total: true };
  for (const week of weeks) {
    const sales = totalByWeek.get(week.SEMANA) || 0;
    total[`v${week.SEMANA}`] = sales;
    total[`s${week.SEMANA}`] = sales ? 1 : 0;
    total[`price:${week.SEMANA}`] = priceByWeek.get(week.SEMANA) ?? null;
  }
  return [...output, total];
}

function modelWeeklyColumns() {
  return [
    { key: "segment", label: "Segmento Honor" },
    { key: "model", label: "Modelo" },
    ...weeklySalesSharePriceColumns(),
    { key: "total", label: "Venta mes", num: true, format: fmtInt },
    { key: "share", label: "Share mes", num: true, format: fmtPct },
  ];
}

function monthlyRows(rows, dimensionField, label, denominatorField = null, includePrice = false) {
  const periods = activePeriods(rows);
  const totalByPeriod = group(rows, ["pe"]);
  const totalAll = sum(rows);
  const totalByDimension = group(rows, [dimensionField]);
  const byDimensionPeriod = group(rows, [dimensionField, "pe"]);
  const priceByDimensionPeriod = includePrice ? groupedWeightedPrices(rows, [dimensionField, "pe"]) : null;
  const segmentPeriod = denominatorField ? group(rows, [denominatorField, "pe"]) : null;
  const segmentTotal = denominatorField ? group(rows, [denominatorField]) : null;
  const output = [...totalByDimension.entries()]
    .map(([name, total]) => {
      const row = { [label]: name, total, share: total / (totalAll || 1) };
      for (const period of periods) {
        const sales = byDimensionPeriod.get(`${name}||${period.PERIODO}`) || 0;
        row[`v${period.PERIODO}`] = sales;
        row[`s${period.PERIODO}`] = sales / (totalByPeriod.get(period.PERIODO) || 1);
        if (includePrice) row[`price:${period.PERIODO}`] = priceByDimensionPeriod.get(`${name}||${period.PERIODO}`) ?? null;
      }
      if (denominatorField === "s") {
        const segmentName = rows.find((item) => item[dimensionField] === name)?.s;
        row.share = total / (segmentTotal.get(segmentName) || 1);
        for (const period of periods) {
          const sales = row[`v${period.PERIODO}`] || 0;
          row[`s${period.PERIODO}`] = sales / (segmentPeriod.get(`${segmentName}||${period.PERIODO}`) || 1);
        }
      }
      return row;
    })
    .sort((a, b) => b.total - a.total);
  return withTotalRow(output, label);
}

function monthlyColumns(labelKey, label, includePrice = false) {
  const periods = activePeriods(filteredRows());
  return [
    { key: labelKey, label },
    ...periods.flatMap((period) => [
      { key: `v${period.PERIODO}`, label: `Venta ${period.LABEL}`, num: true, format: fmtInt },
      { key: `s${period.PERIODO}`, label: `Share ${period.LABEL}`, num: true, format: fmtPct },
      ...(includePrice
        ? [{ key: `price:${period.PERIODO}`, label: `Precio prom ${period.LABEL}`, num: true, format: fmtPrice }]
        : []),
    ]),
    { key: "total", label: "Venta total", num: true, format: fmtInt },
    { key: "share", label: "Share total", num: true, format: fmtPct },
  ];
}

function monthlyBreakdownRows(rows, fields, parentFields, labels, limit = 360) {
  const periods = activePeriods(rows);
  const totals = group(rows, fields);
  const parentTotals = group(rows, parentFields);
  const periodTotals = group(rows, [...fields, "pe"]);
  const parentPeriodTotals = group(rows, [...parentFields, "pe"]);
  const parentLabelKeys = labels.slice(0, parentFields.length).map((label) => label.key);
  let detail = [...totals.entries()].map(([key, value]) => {
    const parts = key.split("||");
    const parentKey = parts.slice(0, parentFields.length).join("||");
    const item = { total: value, share: value / (parentTotals.get(parentKey) || value || 1) };
    labels.forEach((label, index) => {
      item[label.key] = parts[index] || "";
    });
    for (const period of periods) {
      const sales = periodTotals.get(`${key}||${period.PERIODO}`) || 0;
      item[`v${period.PERIODO}`] = sales;
      item[`s${period.PERIODO}`] = sales / (parentPeriodTotals.get(`${parentKey}||${period.PERIODO}`) || 1);
    }
    return item;
  });
  detail = sortWithPdvGroups(detail, parentLabelKeys, "total").slice(0, limit);
  if (!detail.length) return [];
  const total = { __total: true, total: sum(rows), share: 1 };
  labels.forEach((label, index) => {
    total[label.key] = index === 0 ? "Total Entel" : "";
  });
  for (const period of periods) {
    const periodRows = rows.filter((row) => row.pe === period.PERIODO);
    total[`v${period.PERIODO}`] = sum(periodRows);
    total[`s${period.PERIODO}`] = periodRows.length ? 1 : 0;
  }
  return [...detail, total];
}

function monthlyBreakdownColumns(labels) {
  const periods = activePeriods(filteredRows());
  return [
    ...labels.map((label) => ({ key: label.key, label: label.label })),
    ...periods.flatMap((period) => [
      { key: `v${period.PERIODO}`, label: `Venta ${period.LABEL}`, num: true, format: fmtInt },
      { key: `s${period.PERIODO}`, label: `Share ${period.LABEL}`, num: true, format: fmtPct },
    ]),
    { key: "total", label: "Venta total", num: true, format: fmtInt },
    { key: "share", label: "Share total", num: true, format: fmtPct },
  ];
}

function modelMonthlyRows(rows) {
  return monthlyRows(rows, "m", "model", "s", true).map((row) => {
    const sample = rows.find((item) => item.m === row.model);
    return {
      segment: sample?.s || "",
      model: row.model,
      ...row,
    };
  });
}

function weightedPrice(rows) {
  let amount = 0;
  let units = 0;
  for (const row of rows) {
    if (row.pr == null || Number.isNaN(Number(row.pr))) continue;
    amount += row.v * Number(row.pr);
    units += row.v;
  }
  return units ? amount / units : null;
}

function pearson(points) {
  if (points.length < 2) return null;
  const meanX = points.reduce((sum, point) => sum + point[0], 0) / points.length;
  const meanY = points.reduce((sum, point) => sum + point[1], 0) / points.length;
  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (const [x, y] of points) {
    cov += (x - meanX) * (y - meanY);
    varX += (x - meanX) ** 2;
    varY += (y - meanY) ** 2;
  }
  return varX && varY ? cov / Math.sqrt(varX * varY) : null;
}

function rowsBy(rows, field) {
  const out = new Map();
  for (const row of rows) {
    const key = row[field] || "";
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(row);
  }
  return out;
}

function correlationStats(rows) {
  const modelGroups = rowsBy(rows, "m");
  const points = [...modelGroups.values()]
    .map((modelRows) => [weightedPrice(modelRows), sum(modelRows)])
    .filter(([price, sales]) => price != null && sales);
  return {
    sales: sum(rows),
    price: weightedPrice(rows),
    models: points.length,
    corr: pearson(points),
  };
}

function correlationTable(rows, field, labelKey) {
  const weeks = activeWeeks(rows);
  return [...rowsBy(rows, field).entries()]
    .map(([name, groupRows]) => {
      const output = {
        [labelKey]: name,
        ...correlationStats(groupRows),
      };
      for (const week of weeks) {
        const weekRows = groupRows.filter((row) => row.w === week.SEMANA);
        const stats = correlationStats(weekRows);
        output[`sales${week.SEMANA}`] = stats.sales;
        output[`price${week.SEMANA}`] = stats.price;
        output[`corr${week.SEMANA}`] = stats.corr;
      }
      return output;
    })
    .sort((a, b) => b.sales - a.sales);
}

function priceDetailRows(rows, fields, parentFields, limit = 500) {
  const weeks = activeWeeks(rows);
  const groups = new Map();
  const parentTotals = new Map();
  const parentWeekTotals = new Map();
  for (const row of rows) {
    const key = makeKey(row, fields);
    const parent = makeKey(row, parentFields);
    if (!groups.has(key)) groups.set(key, { rows: [], sales: 0, value: 0, pricedUnits: 0, weeks: new Map() });
    const item = groups.get(key);
    item.rows.push(row);
    item.sales += row.v;
    if (row.pr != null && !Number.isNaN(Number(row.pr))) {
      item.value += row.v * Number(row.pr);
      item.pricedUnits += row.v;
    }
    if (!item.weeks.has(row.w)) item.weeks.set(row.w, { sales: 0, value: 0, pricedUnits: 0 });
    const weekItem = item.weeks.get(row.w);
    weekItem.sales += row.v;
    if (row.pr != null && !Number.isNaN(Number(row.pr))) {
      weekItem.value += row.v * Number(row.pr);
      weekItem.pricedUnits += row.v;
    }
    parentTotals.set(parent, (parentTotals.get(parent) || 0) + row.v);
    parentWeekTotals.set(`${parent}||${row.w}`, (parentWeekTotals.get(`${parent}||${row.w}`) || 0) + row.v);
  }
  const totalValue = [...groups.values()].reduce((acc, item) => acc + item.value, 0);
  return [...groups.entries()]
    .map(([key, item]) => {
      const parts = key.split("||");
      const parent = parts.slice(0, parentFields.length).join("||");
      const out = {};
      fields.forEach((field, index) => {
        out[field] = parts[index] || "";
      });
      out.sales = item.sales;
      out.price = item.pricedUnits ? item.value / item.pricedUnits : null;
      out.value = item.value;
      out.shareSales = item.sales / (parentTotals.get(parent) || 1);
      out.shareValue = item.value / (totalValue || 1);
      out.missingPrice = item.sales - item.pricedUnits;
      for (const week of weeks) {
        const weekItem = item.weeks.get(week.SEMANA) || { sales: 0, value: 0, pricedUnits: 0 };
        out[`sales${week.SEMANA}`] = weekItem.sales;
        out[`price${week.SEMANA}`] = weekItem.pricedUnits ? weekItem.value / weekItem.pricedUnits : null;
        out[`shareSales${week.SEMANA}`] = weekItem.sales / (parentWeekTotals.get(`${parent}||${week.SEMANA}`) || 1);
      }
      return out;
    })
    .sort((a, b) => b.sales - a.sales)
    .slice(0, limit);
}

function filteredPriceChanges() {
  const changes = DATA.priceChanges || {};
  const summary = changes.segment_summary || [];
  const detail = changes.changes || [];
  return {
    summary: summary.filter((row) => matchesSelection(row.SEGMENTO_HONOR, state.segment)),
    detail: detail.filter((row) => matchesSelection(row.SEGMENTO_HONOR, state.segment)),
  };
}

function priceHistoryYear() {
  const years = availableYears();
  return DATA.priceHistory?.year || years[years.length - 1] || "";
}

function priceAtDate(points, date) {
  let price = null;
  for (const point of points || []) {
    if (point.d > date) break;
    price = point.p;
  }
  return price;
}

function priceHistoryTableRows(rows) {
  const history = DATA.priceHistory || {};
  const models = history.models || {};
  const year = priceHistoryYear();
  const yearRows = rows.filter((row) => row.y === year);
  const salesByModel = group(yearRows, ["s", "m"]);
  const salesBySegment = group(yearRows, ["s"]);
  const brandByModel = new Map();
  for (const row of yearRows) {
    if (!brandByModel.has(row.m)) brandByModel.set(row.m, row.b);
  }

  const bySegment = new Map();
  for (const [key, sales] of salesByModel.entries()) {
    const [segment, model] = key.split("||");
    if (!bySegment.has(segment)) bySegment.set(segment, []);
    bySegment.get(segment).push({
      segment,
      brand: brandByModel.get(model) || "",
      model,
      sales,
      points: models[model]?.points || [],
    });
  }

  const modelFiltered = !state.model.includes(ALL);
  const selected = [...bySegment.entries()]
    .sort((a, b) => (salesBySegment.get(b[0]) || 0) - (salesBySegment.get(a[0]) || 0) || a[0].localeCompare(b[0], "es"))
    .flatMap(([, items]) => {
      const sorted = items.sort((a, b) => b.sales - a.sales || a.model.localeCompare(b.model, "es"));
      return modelFiltered ? sorted : sorted.slice(0, 5);
    });

  const selectedMonths = state.month.includes(ALL) ? null : new Set(state.month);
  const dates = (history.dates || [])
    .filter((date) => date && date.startsWith(year))
    .filter((date) => !selectedMonths || selectedMonths.has(date.slice(5, 7)))
    .sort();

  return {
    year,
    dates,
    rows: selected.map((item) => {
      const output = {
        segment: item.segment,
        brand: item.brand,
        model: item.model,
        sales: item.sales,
      };
      for (const date of dates) {
        output[`p${rawDateKey(date)}`] = priceAtDate(item.points, date);
      }
      return output;
    }),
  };
}

function priceHistoryColumns(dates) {
  return [
    { key: "segment", label: "Segmento Honor" },
    { key: "brand", label: "Marca" },
    { key: "model", label: "Modelo" },
    { key: "sales", label: "Ventas filtros", num: true, format: fmtInt },
    ...dates.map((date) => ({ key: `p${rawDateKey(date)}`, label: shortDateLabel(date), num: true, format: fmtPrice })),
  ];
}

function resolveTargetPeriod(rows) {
  const periods = activePeriods(rows);
  return periods.length ? periods[periods.length - 1].PERIODO : null;
}

function previousPeriod(period) {
  const periods = (DATA.meta.periods || []).map((item) => item.PERIODO).filter(Boolean);
  const index = periods.indexOf(period);
  return index > 0 ? periods[index - 1] : null;
}

function periodLabel(period) {
  return DATA.lists.period_labels?.[period] || period || "-";
}

function latestStockSnapshot() {
  let candidates = filteredStockRows({ ignoreYear: true, ignorePeriod: true, ignoreBrand: true });
  if (!candidates.length) candidates = filteredStockRows({ ignoreYear: true, ignorePeriod: true, ignoreBrand: true });
  const latestDate = candidates.reduce((max, row) => (row.f > max ? row.f : max), "");
  return {
    date: latestDate,
    rows: latestDate ? candidates.filter((row) => row.f === latestDate) : [],
  };
}

function pdvSetBy(rows, field) {
  const out = new Map();
  for (const row of rows) {
    const key = row[field] || "";
    if (!out.has(key)) out.set(key, new Set());
    if (row.q > 0) out.get(key).add(row.p);
  }
  return out;
}

function weeklyAverageForPeriod(rows, period) {
  const periodRows = rows.filter((row) => row.pe === period);
  const weeks = new Set(periodRows.map((row) => row.w)).size || 1;
  return { rows: periodRows, weeks };
}

function insightPriceStockRows(targetPeriod, stockRows) {
  const salesScope = filteredRows({ targetPeriod, ignorePeriod: true, ignoreBrand: true });
  const { rows: periodRows, weeks } = weeklyAverageForPeriod(salesScope, targetPeriod);
  const stockByModel = groupStock(stockRows, ["m"]);
  const salesByModel = group(periodRows, ["m"]);
  const pdvsByModel = pdvSetBy(stockRows, "m");
  return (DATA.priceChanges?.changes || [])
    .filter((row) => Number(row.VARIACION) < 0)
    .filter((row) => matchesSelection(row.SEGMENTO_HONOR, state.segment))
    .map((row) => {
      const model = row.MARCAMODELO;
      const stock = stockByModel.get(model) || 0;
      const sales = salesByModel.get(model) || 0;
      const avgWeek = sales / weeks;
      const stockWeeks = avgWeek ? stock / avgWeek : stock > 0 ? 999 : 0;
      let read = "Baja sin stock relevante";
      if (stock > 0 && stockWeeks >= 8) read = "Baja con stock alto: revisar liquidacion";
      else if (stock > 0 && stockWeeks >= 3) read = "Baja con stock util para empujar venta";
      else if (stock > 0) read = "Baja con stock ajustado";
      return {
        segment: row.SEGMENTO_HONOR,
        model,
        currentPrice: row.PRECIO_NUEVO,
        variation: row.VARIACION,
        variationPct: row.VARIACION_PCT,
        stock,
        pdvs: pdvsByModel.get(model)?.size || 0,
        avgWeek,
        stockWeeks,
        read,
      };
    })
    .sort((a, b) => Math.abs(b.variation) * b.stock - Math.abs(a.variation) * a.stock)
    .slice(0, 80);
}

function honorShareMovementByPdv(targetPeriod, previous, stockRows) {
  if (!targetPeriod || !previous) return [];
  const current = filteredRows({ targetPeriod, ignorePeriod: true, ignoreBrand: true });
  const prior = filteredRows({ targetPeriod: previous, ignorePeriod: true, ignoreBrand: true });
  const fields = ["c", "rg", "p"];
  const currentTotal = group(current, fields);
  const priorTotal = group(prior, fields);
  const currentHonor = group(current.filter((row) => row.b === "Honor"), fields);
  const priorHonor = group(prior.filter((row) => row.b === "Honor"), fields);
  const stockHonor = groupStock(stockRows.filter((row) => row.b === "Honor"), fields);
  const keys = new Set([...currentTotal.keys(), ...priorTotal.keys(), ...stockHonor.keys()]);
  return [...keys]
    .map((key) => {
      const parts = key.split("||");
      const currentShare = (currentHonor.get(key) || 0) / (currentTotal.get(key) || 1);
      const priorShare = (priorHonor.get(key) || 0) / (priorTotal.get(key) || 1);
      const delta = currentShare - priorShare;
      const stock = stockHonor.get(key) || 0;
      let read = "Sin alerta";
      if (delta <= -0.05 && stock > 0) read = "Cae share con stock: revisar ejecucion";
      else if (delta <= -0.05) read = "Cae share sin stock";
      else if (delta >= 0.05) read = "Crece share";
      return {
        channel: parts[0] || "",
        regional: parts[1] || "",
        pdv: parts[2] || "",
        priorShare,
        currentShare,
        delta,
        priorHonor: priorHonor.get(key) || 0,
        currentHonor: currentHonor.get(key) || 0,
        currentTotal: currentTotal.get(key) || 0,
        stock,
        read,
      };
    })
    .filter((row) => row.priorHonor || row.currentHonor || row.stock)
    .sort((a, b) => a.delta - b.delta || b.stock - a.stock)
    .slice(0, 120);
}

function honorShareMovementBySegment(targetPeriod, previous, stockRows) {
  if (!targetPeriod || !previous) return [];
  const current = filteredRows({ targetPeriod, ignorePeriod: true, ignoreBrand: true });
  const prior = filteredRows({ targetPeriod: previous, ignorePeriod: true, ignoreBrand: true });
  const currentTotal = group(current, ["s"]);
  const priorTotal = group(prior, ["s"]);
  const currentHonor = group(current.filter((row) => row.b === "Honor"), ["s"]);
  const priorHonor = group(prior.filter((row) => row.b === "Honor"), ["s"]);
  const stockHonor = groupStock(stockRows.filter((row) => row.b === "Honor"), ["s"]);
  const stockTotal = groupStock(stockRows, ["s"]);
  const keys = new Set([...currentTotal.keys(), ...priorTotal.keys(), ...stockTotal.keys()]);
  return [...keys]
    .map((segment) => {
      const currentShare = (currentHonor.get(segment) || 0) / (currentTotal.get(segment) || 1);
      const priorShare = (priorHonor.get(segment) || 0) / (priorTotal.get(segment) || 1);
      const delta = currentShare - priorShare;
      let read = "Estable";
      if (delta <= -0.03) read = "Caida de share";
      else if (delta >= 0.03) read = "Crecimiento de share";
      return {
        segment,
        priorShare,
        currentShare,
        delta,
        priorHonor: priorHonor.get(segment) || 0,
        currentHonor: currentHonor.get(segment) || 0,
        stockHonor: stockHonor.get(segment) || 0,
        stockTotal: stockTotal.get(segment) || 0,
        read,
      };
    })
    .filter((row) => row.priorHonor || row.currentHonor || row.stockHonor)
    .sort((a, b) => a.delta - b.delta || b.stockHonor - a.stockHonor)
    .slice(0, 80);
}

function honorStockByPdv(stockRows) {
  const honorRows = stockRows.filter((row) => row.b === "Honor");
  const groups = new Map();
  for (const row of honorRows) {
    const key = makeKey(row, ["c", "rg", "p"]);
    if (!groups.has(key)) groups.set(key, { rows: [], stock: 0, models: new Map() });
    const item = groups.get(key);
    item.rows.push(row);
    item.stock += row.q;
    item.models.set(row.m, (item.models.get(row.m) || 0) + row.q);
  }
  return [...groups.entries()]
    .map(([key, item]) => {
      const [channel, regional, pdv] = key.split("||");
      const topModel = [...item.models.entries()].sort((a, b) => b[1] - a[1])[0];
      return {
        channel,
        regional,
        pdv,
        stock: item.stock,
        models: item.models.size,
        topModel: topModel ? `${topModel[0]} (${fmtInt(topModel[1])})` : "",
      };
    })
    .sort((a, b) => b.stock - a.stock)
    .slice(0, 120);
}

function modelStockRows(targetPeriod, stockRows) {
  const salesScope = filteredRows({ targetPeriod, ignorePeriod: true, ignoreBrand: true });
  const { rows: periodRows, weeks } = weeklyAverageForPeriod(salesScope, targetPeriod);
  const salesByModel = group(periodRows, ["m"]);
  const groups = new Map();
  for (const row of stockRows) {
    const key = makeKey(row, ["b", "s", "m"]);
    if (!groups.has(key)) groups.set(key, { stock: 0, pdvs: new Set(), channels: new Set() });
    const item = groups.get(key);
    item.stock += row.q;
    if (row.q > 0) item.pdvs.add(row.p);
    if (row.q > 0) item.channels.add(row.c);
  }
  return [...groups.entries()]
    .map(([key, item]) => {
      const [brand, segment, model] = key.split("||");
      const sales = salesByModel.get(model) || 0;
      const avgWeek = sales / weeks;
      return {
        brand,
        segment,
        model,
        stock: item.stock,
        pdvs: item.pdvs.size,
        channels: item.channels.size,
        avgWeek,
        stockWeeks: avgWeek ? item.stock / avgWeek : item.stock > 0 ? 999 : 0,
      };
    })
    .sort((a, b) => b.stock - a.stock)
    .slice(0, 160);
}

function salesMovementRows(targetPeriod, previous, fields, labels, stockRows, stockFields = fields, limit = 120) {
  if (!targetPeriod || !previous) return [];
  const current = filteredRows({ targetPeriod, ignoreYear: true, ignorePeriod: true, ignoreBrand: true });
  const prior = filteredRows({ targetPeriod: previous, ignoreYear: true, ignorePeriod: true, ignoreBrand: true });
  const currentTotal = sum(current) || 1;
  const priorTotal = sum(prior) || 1;
  const currentSales = group(current, fields);
  const priorSales = group(prior, fields);
  const currentHonor = group(current.filter((row) => row.b === "Honor"), fields);
  const priorHonor = group(prior.filter((row) => row.b === "Honor"), fields);
  const stock = groupStock(stockRows, stockFields);
  const keys = new Set([...currentSales.keys(), ...priorSales.keys()]);
  return [...keys]
    .map((key) => {
      const parts = key.split("||");
      const output = {};
      labels.forEach((label, index) => {
        output[label] = parts[index] || "";
      });
      const stockKey = stockFields.length === fields.length ? key : parts.slice(-stockFields.length).join("||");
      const currentValue = currentSales.get(key) || 0;
      const priorValue = priorSales.get(key) || 0;
      const delta = currentValue - priorValue;
      const deltaPct = priorValue ? delta / priorValue : currentValue ? 1 : 0;
      const currentShare = currentValue / currentTotal;
      const priorShare = priorValue / priorTotal;
      const honorDelta = (currentHonor.get(key) || 0) - (priorHonor.get(key) || 0);
      const stockValue = stock.get(stockKey) || 0;
      let read = "Estable";
      if (!currentValue && priorValue && stockValue > 0) read = "Se apaga venta con stock actual";
      else if (delta <= -200 && stockValue > 0) read = "Cae venta con stock: revisar ejecucion";
      else if (delta <= -200) read = "Cae venta";
      else if (delta >= 200) read = "Crece venta";
      else if (currentValue && !priorValue) read = "Aparece o recupera venta";
      output.current = currentValue;
      output.prior = priorValue;
      output.delta = delta;
      output.deltaPct = deltaPct;
      output.priorShare = priorShare;
      output.currentShare = currentShare;
      output.shareDelta = currentShare - priorShare;
      output.honorDelta = honorDelta;
      output.stock = stockValue;
      output.read = read;
      return output;
    })
    .filter((row) => row.current || row.prior || row.stock)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || b.stock - a.stock)
    .slice(0, limit);
}

function honorMovementRows(targetPeriod, previous, fields, labels, stockRows, stockFields = fields, limit = 120) {
  if (!targetPeriod || !previous) return [];
  const current = filteredRows({ targetPeriod, ignoreYear: true, ignorePeriod: true, ignoreBrand: true });
  const prior = filteredRows({ targetPeriod: previous, ignoreYear: true, ignorePeriod: true, ignoreBrand: true });
  const currentTotal = group(current, fields);
  const priorTotal = group(prior, fields);
  const currentHonor = group(current.filter((row) => row.b === "Honor"), fields);
  const priorHonor = group(prior.filter((row) => row.b === "Honor"), fields);
  const stockHonor = groupStock(stockRows.filter((row) => row.b === "Honor"), stockFields);
  const keys = new Set([...currentTotal.keys(), ...priorTotal.keys(), ...currentHonor.keys(), ...priorHonor.keys(), ...stockHonor.keys()]);
  return [...keys]
    .map((key) => {
      const parts = key.split("||");
      const output = {};
      labels.forEach((label, index) => {
        output[label] = parts[index] || "";
      });
      const stockKey = stockFields.length === fields.length ? key : parts.slice(-stockFields.length).join("||");
      const currentValue = currentHonor.get(key) || 0;
      const priorValue = priorHonor.get(key) || 0;
      const delta = currentValue - priorValue;
      const deltaPct = priorValue ? delta / priorValue : currentValue ? 1 : 0;
      const currentShare = currentValue / (currentTotal.get(key) || 1);
      const priorShare = priorValue / (priorTotal.get(key) || 1);
      const stockValue = stockHonor.get(stockKey) || 0;
      let read = "Estable";
      if (!currentValue && priorValue && stockValue > 0) read = "Honor se apaga con stock actual";
      else if (delta <= -50 && stockValue > 0) read = "Cae Honor con stock: revisar ejecucion";
      else if (delta <= -50) read = "Cae Honor";
      else if (delta >= 50) read = "Crece Honor";
      else if (currentValue && !priorValue) read = "Honor aparece o recupera venta";
      output.current = currentValue;
      output.prior = priorValue;
      output.delta = delta;
      output.deltaPct = deltaPct;
      output.priorShare = priorShare;
      output.currentShare = currentShare;
      output.shareDelta = currentShare - priorShare;
      output.stock = stockValue;
      output.read = read;
      return output;
    })
    .filter((row) => row.current || row.prior || row.stock)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || b.stock - a.stock)
    .slice(0, limit);
}

function salesMovementPriority(row) {
  const stockWeight = row.stock ? 1.25 : 1;
  return Math.abs(row.delta || 0) * stockWeight;
}

function topBy(rows, predicate, compare) {
  const filtered = rows.filter(predicate);
  return filtered.sort(compare)[0] || null;
}

function actionRows(targetPeriod, previous, stockRows) {
  const priceStock = insightPriceStockRows(targetPeriod, stockRows);
  const brandSales = salesMovementRows(targetPeriod, previous, ["b"], ["brand"], stockRows, ["b"], 80);
  const channelSales = honorMovementRows(targetPeriod, previous, ["c"], ["channel"], stockRows, ["c"], 30);
  const segmentSales = honorMovementRows(targetPeriod, previous, ["s"], ["segment"], stockRows, ["s"], 80);
  const pdvSales = honorMovementRows(targetPeriod, previous, ["c", "rg", "p"], ["channel", "regional", "pdv"], stockRows, ["c", "rg", "p"], 160);
  const modelSales = salesMovementRows(targetPeriod, previous, ["b", "s", "m"], ["brand", "segment", "model"], stockRows, ["b", "s", "m"], 200);
  const honorPdv = honorShareMovementByPdv(targetPeriod, previous, stockRows);

  const rows = [];
  const push = (type, item, metric, action) => {
    if (!item) return;
    rows.push({ type, insight: item, metric, action });
  };

  const biggestPriceDrop = priceStock[0];
  push(
    "Precio + stock",
    biggestPriceDrop ? `${biggestPriceDrop.model} bajo ${fmtSignedPrice(biggestPriceDrop.variation)} y tiene ${fmtInt(biggestPriceDrop.stock)} unidades` : null,
    biggestPriceDrop ? `${fmtWeeks(biggestPriceDrop.stockWeeks)} semanas de stock` : "",
    "Priorizar empuje comercial si la cobertura supera la venta promedio semanal",
  );

  const brandDrop = topBy(brandSales, (row) => row.delta < 0, (a, b) => a.delta - b.delta);
  push(
    "Marca",
    brandDrop ? `${brandDrop.brand} es la marca que mas cae contra ${periodLabel(previous)}` : null,
    brandDrop ? `${fmtSignedInt(brandDrop.delta)} ventas, share ${fmtSignedPct(brandDrop.shareDelta)}` : "",
    brandDrop?.stock ? "Validar ejecucion porque aun tiene stock actual" : "Revisar si la caida responde a falta de stock",
  );

  const brandGrowth = topBy(brandSales, (row) => row.delta > 0, (a, b) => b.delta - a.delta);
  push(
    "Marca",
    brandGrowth ? `${brandGrowth.brand} es la marca que mas crece` : null,
    brandGrowth ? `${fmtSignedInt(brandGrowth.delta)} ventas` : "",
    "Replicar mix, precios y PDV donde esta ganando participacion",
  );

  const channelDrop = topBy(channelSales, (row) => row.delta < 0, (a, b) => a.delta - b.delta);
  push(
    "Canal",
    channelDrop ? `${channelDrop.channel} concentra la mayor caida de ventas Honor` : null,
    channelDrop ? `${fmtSignedInt(channelDrop.delta)} ventas Honor, share ${fmtSignedPct(channelDrop.shareDelta)}` : "",
    channelDrop?.stock ? "Cruzar PDV con stock para activar recuperacion" : "Revisar cobertura de stock y trafico del canal",
  );

  const segmentDrop = topBy(segmentSales, (row) => row.delta < 0, (a, b) => a.delta - b.delta);
  push(
    "Segmento Honor",
    segmentDrop ? `${segmentDrop.segment} es el segmento con mayor contraccion de Honor` : null,
    segmentDrop ? `${fmtSignedInt(segmentDrop.delta)} ventas Honor, share ${fmtSignedPct(segmentDrop.shareDelta)}, stock ${fmtInt(segmentDrop.stock)}` : "",
    "Comparar contra cambios de precio y revisar modelos con stock en ese segmento",
  );

  const pdvDropWithStock = topBy(pdvSales, (row) => row.delta < 0 && row.stock > 0, (a, b) => a.delta - b.delta);
  push(
    "PDV",
    pdvDropWithStock ? `${pdvDropWithStock.pdv} cae en venta Honor y mantiene stock` : null,
    pdvDropWithStock ? `${fmtSignedInt(pdvDropWithStock.delta)} ventas Honor, share ${fmtSignedPct(pdvDropWithStock.shareDelta)}, stock ${fmtInt(pdvDropWithStock.stock)}` : "",
    "Revisar exhibicion, precio visible y foco de fuerza de venta",
  );

  const honorShareDrop = honorPdv.find((row) => row.delta < 0 && row.stock > 0);
  push(
    "Share Honor",
    honorShareDrop ? `${honorShareDrop.pdv} cae en share Honor con stock disponible` : null,
    honorShareDrop ? `${fmtSignedPct(honorShareDrop.delta)} share, stock Honor ${fmtInt(honorShareDrop.stock)}` : "",
    "Priorizar gestion PDV porque hay inventario para recuperar share",
  );

  const modelDropWithStock = topBy(modelSales, (row) => row.delta < 0 && row.stock > 0, (a, b) => salesMovementPriority(b) - salesMovementPriority(a));
  push(
    "Modelo",
    modelDropWithStock ? `${modelDropWithStock.model} cae con stock actual` : null,
    modelDropWithStock ? `${fmtSignedInt(modelDropWithStock.delta)} ventas, stock ${fmtInt(modelDropWithStock.stock)}` : "",
    "Validar si necesita precio, bundle o comunicacion por canal",
  );

  const modelGrowth = topBy(modelSales, (row) => row.delta > 0, (a, b) => b.delta - a.delta);
  push(
    "Modelo",
    modelGrowth ? `${modelGrowth.model} es el modelo que mas crece` : null,
    modelGrowth ? `${fmtSignedInt(modelGrowth.delta)} ventas` : "",
    "Asegurar reposicion y continuidad de stock en los PDV que aceleran",
  );

  return rows;
}

function refreshInsightPdvFilters(pdvRows) {
  if (!els.insightPdvRegional || !els.insightPdvPdv) return pdvRows;
  state.insightPdvRegional = setOptions(els.insightPdvRegional, unique(pdvRows, "regional"), state.insightPdvRegional);
  const regionalRows = pdvRows.filter((row) => matchesSelection(row.regional, state.insightPdvRegional));
  state.insightPdvPdv = setOptions(els.insightPdvPdv, unique(regionalRows, "pdv"), state.insightPdvPdv);
  return regionalRows.filter((row) => matchesSelection(row.pdv, state.insightPdvPdv));
}

function parentKeyFromRow(row, parentKeys) {
  return parentKeys.map((key) => row[key] || "").join("||");
}

function sortWithPdvGroups(rows, parentKeys, salesKey = "sales") {
  if (!parentKeys.includes("pdv")) return rows.sort((a, b) => (b[salesKey] || 0) - (a[salesKey] || 0));
  const parentTotals = new Map();
  for (const row of rows) {
    const key = parentKeyFromRow(row, parentKeys);
    parentTotals.set(key, (parentTotals.get(key) || 0) + (Number(row[salesKey]) || 0));
  }
  return rows.sort((a, b) => {
    const parentA = parentKeyFromRow(a, parentKeys);
    const parentB = parentKeyFromRow(b, parentKeys);
    if (parentA !== parentB) {
      return (parentTotals.get(parentB) || 0) - (parentTotals.get(parentA) || 0) || parentA.localeCompare(parentB, "es");
    }
    return (b[salesKey] || 0) - (a[salesKey] || 0) || String(a.model || a.brand || "").localeCompare(String(b.model || b.brand || ""), "es");
  });
}

function aggregateTable(rows, fields, parentFields, labels, limit = 120) {
  const weeks = activeWeeks(rows);
  const totals = group(rows, fields);
  const parentTotals = group(rows, parentFields);
  const weekTotals = group(rows, [...fields, "w"]);
  const parentWeekTotals = group(rows, [...parentFields, "w"]);
  const prices = groupedWeightedPrices(rows, fields);
  const weekPrices = groupedWeightedPrices(rows, [...fields, "w"]);
  let detail = [...totals.entries()]
    .map(([key, value]) => {
      const parts = key.split("||");
      const parentKey = parts.slice(0, parentFields.length).join("||");
      const item = {};
      labels.forEach((label, index) => {
        item[label.key] = parts[index] || "";
      });
      item.sales = value;
      item.share = value / (parentTotals.get(parentKey) || value || 1);
      item.price = prices.get(key) ?? null;
      for (const week of weeks) {
        const weekSales = weekTotals.get(`${key}||${week.SEMANA}`) || 0;
        item[`v${week.SEMANA}`] = weekSales;
        item[`s${week.SEMANA}`] = weekSales / (parentWeekTotals.get(`${parentKey}||${week.SEMANA}`) || 1);
        item[`price:${week.SEMANA}`] = weekPrices.get(`${key}||${week.SEMANA}`) ?? null;
      }
      return item;
    });
  const parentLabelKeys = labels.slice(0, parentFields.length).map((label) => label.key);
  detail = sortWithPdvGroups(detail, parentLabelKeys, "sales").slice(0, limit);
  if (!detail.length) return [];
  const total = { __total: true, sales: sum(rows), share: 1, price: weightedPrice(rows) };
  labels.forEach((label, index) => {
    total[label.key] = index === 0 ? "Total Entel" : "";
  });
  for (const week of weeks) {
    const weekRows = rows.filter((row) => row.w === week.SEMANA);
    total[`v${week.SEMANA}`] = sum(weekRows);
    total[`s${week.SEMANA}`] = weekRows.length ? 1 : 0;
    total[`price:${week.SEMANA}`] = weightedPrice(weekRows);
  }
  return [...detail, total];
}

function currentStockRows() {
  const candidates = filteredStockRows({ ignoreTime: true });
  const latestDate = candidates.reduce((max, row) => (row.f > max ? row.f : max), "");
  return latestDate ? candidates.filter((row) => row.f === latestDate) : [];
}

function stockDimensionRows(stockRows, fields, labels, limit = 120) {
  const totalStock = sumStock(stockRows);
  const groups = groupStock(stockRows, fields);
  const detail = [...groups.entries()]
    .map(([key, stock]) => {
      const parts = key.split("||");
      const row = {};
      labels.forEach((label, index) => {
        row[label.key] = parts[index] || "";
      });
      row.stock = stock;
      row.stockShare = totalStock ? stock / totalStock : 0;
      return row;
    })
    .sort((a, b) => b.stock - a.stock)
    .slice(0, limit);
  if (!detail.length) return [];
  const total = { __total: true, stock: totalStock, stockShare: totalStock ? 1 : 0 };
  labels.forEach((label, index) => {
    total[label.key] = index === 0 ? "Total Entel" : "";
  });
  return [...detail, total];
}

function stockDimensionColumns(labels) {
  return [
    ...labels.map((label) => ({ key: label.key, label: label.label })),
    { key: "stock", label: "Stock", num: true, format: fmtInt },
    { key: "stockShare", label: "Share stock", num: true, format: fmtPct },
  ];
}

function stockCoverageRows(rows, stockRows, limit = 240) {
  const stockByModel = new Map();
  const pdvsByModel = new Map();
  const channelsByModel = new Map();
  for (const row of stockRows) {
    const key = makeKey(row, ["b", "s", "m"]);
    stockByModel.set(key, (stockByModel.get(key) || 0) + row.q);
    if (!pdvsByModel.has(key)) pdvsByModel.set(key, new Set());
    if (!channelsByModel.has(key)) channelsByModel.set(key, new Set());
    if (row.q > 0) {
      pdvsByModel.get(key).add(row.p);
      channelsByModel.get(key).add(row.c);
    }
  }
  const salesByModel = group(rows, ["b", "s", "m"]);
  const keys = new Set([...stockByModel.keys(), ...salesByModel.keys()]);
  const totalStock = [...stockByModel.values()].reduce((acc, value) => acc + value, 0);
  const totalSales = sum(rows);
  const weeks = Math.max(1, new Set(rows.map((row) => row.w).filter(Boolean)).size);
  const detail = [...keys]
    .map((key) => {
      const [brand, segment, model] = key.split("||");
      const stock = stockByModel.get(key) || 0;
      const sales = salesByModel.get(key) || 0;
      const weekly = sales / weeks;
      return {
        brand,
        segment,
        model,
        stock,
        stockShare: totalStock ? stock / totalStock : 0,
        sales,
        salesShare: totalSales ? sales / totalSales : 0,
        weekly,
        coverage: weekly ? stock / weekly : stock > 0 ? 999 : null,
        pdvs: pdvsByModel.get(key)?.size || 0,
        channels: channelsByModel.get(key)?.size || 0,
      };
    })
    .filter((row) => row.stock || row.sales)
    .sort((a, b) => b.stock - a.stock || b.sales - a.sales)
    .slice(0, limit);
  if (!detail.length) return [];
  const weekly = totalSales / weeks;
  return [
    ...detail,
    {
      __total: true,
      brand: "Total Entel",
      segment: "",
      model: "",
      stock: totalStock,
      stockShare: totalStock ? 1 : 0,
      sales: totalSales,
      salesShare: totalSales ? 1 : 0,
      weekly,
      coverage: weekly ? totalStock / weekly : totalStock > 0 ? 999 : null,
      pdvs: new Set(stockRows.filter((row) => row.q > 0).map((row) => row.p)).size,
      channels: new Set(stockRows.filter((row) => row.q > 0).map((row) => row.c)).size,
    },
  ];
}

function renderStock(rows) {
  const stockRows = currentStockRows();
  const segmentLabels = [{ key: "segment", label: "Segmento Honor" }];
  const channelLabels = [
    { key: "channel", label: "Canal" },
    { key: "segment", label: "Segmento Honor" },
  ];
  const channelModelLabels = [
    { key: "channel", label: "Canal" },
    { key: "model", label: "Modelo" },
  ];
  const brandLabels = [{ key: "brand", label: "Marca" }];
  const pdvLabels = [
    { key: "channel", label: "Canal" },
    { key: "regional", label: "Regional Honor" },
    { key: "pdv", label: "Punto de venta" },
    { key: "model", label: "Modelo" },
  ];
  renderTable(
    tableIds.stockSegment,
    stockDimensionColumns(segmentLabels),
    stockDimensionRows(stockRows, ["s"], segmentLabels, 100),
    { limit: 100, stickyColumns: 1 },
  );
  renderTable(
    tableIds.stockChannel,
    stockDimensionColumns(channelLabels),
    stockDimensionRows(stockRows, ["c", "s"], channelLabels, 120),
    { limit: 120, stickyColumns: 2 },
  );
  renderTable(
    tableIds.stockChannelModel,
    stockDimensionColumns(channelModelLabels),
    stockDimensionRows(stockRows, ["c", "m"], channelModelLabels, 220),
    { limit: 220, stickyColumns: 2 },
  );
  renderTable(
    tableIds.stockBrand,
    stockDimensionColumns(brandLabels),
    stockDimensionRows(stockRows, ["b"], brandLabels, 100),
    { limit: 100, stickyColumns: 1 },
  );
  renderTable(
    tableIds.stockPdv,
    stockDimensionColumns(pdvLabels),
    stockDimensionRows(stockRows, ["c", "rg", "p", "m"], pdvLabels, 260),
    { limit: 260, stickyColumns: 4 },
  );
  renderTable(
    tableIds.stockModel,
    [
      { key: "brand", label: "Marca" },
      { key: "segment", label: "Segmento Honor" },
      { key: "model", label: "Modelo" },
      { key: "stock", label: "Stock", num: true, format: fmtInt },
      { key: "stockShare", label: "Share stock", num: true, format: fmtPct },
      { key: "sales", label: "Venta seleccionada", num: true, format: fmtInt },
      { key: "salesShare", label: "Share venta", num: true, format: fmtPct },
      { key: "weekly", label: "Prom. semanal", num: true, format: fmtInt },
      { key: "coverage", label: "Sem. cobertura", num: true, format: fmtWeeks },
      { key: "pdvs", label: "PDV stock", num: true, format: fmtInt },
      { key: "channels", label: "Canales", num: true, format: fmtInt },
    ],
    stockCoverageRows(rows, stockRows, 260),
    { limit: 260, stickyColumns: 3 },
  );
}

function latestStockDate() {
  return (DATA.stockRows || [])
    .map((row) => row.f)
    .filter((value) => value && value !== "Sin fecha")
    .sort()
    .at(-1) || "";
}

function lastCompleteWeeks(count = 3) {
  const latest = latestStockDate();
  const weeks = (DATA.meta.weeks || [])
    .filter((week) => week.SEMANA && week.HASTA && (!latest || week.HASTA <= latest))
    .sort((a, b) => String(a.HASTA).localeCompare(String(b.HASTA)));
  return weeks.slice(-count);
}

function wosValue(stock, average) {
  if (average > 0) return stock / average;
  return stock > 0 ? 999 : null;
}

function fmtWos(value) {
  if (value == null || Number.isNaN(Number(value))) return "Sin venta";
  if (value > 99) return ">99";
  return Number(value).toFixed(1);
}

function wosRowClass(wos) {
  if (wos == null) return "";
  if (wos < 1.5) return "alert-stock";
  if (wos > 5) return "alert-sale";
  return "";
}

function wosRows(rows, stockRows, weeks, dimensions, labels, limit = 50000) {
  const weekIds = new Set(weeks.map((week) => week.SEMANA));
  const lastWeekId = weeks.at(-1)?.SEMANA;
  const salesRows = rows.filter((row) => weekIds.has(row.w));
  const salesByKey = group(salesRows, dimensions);
  const lastSalesByKey = group(rows.filter((row) => row.w === lastWeekId), dimensions);
  const stockByKey = groupStock(stockRows, dimensions);
  const keys = new Set([...salesByKey.keys(), ...stockByKey.keys()]);
  const detail = [...keys]
    .map((key) => {
      const parts = key.split("||");
      const sales = salesByKey.get(key) || 0;
      const lastSales = lastSalesByKey.get(key) || 0;
      const average = weeks.length ? sales / weeks.length : 0;
      const stock = stockByKey.get(key) || 0;
      const wos = wosValue(stock, average);
      const row = { sales, lastSales, average, stock, wos, __class: wosRowClass(wos) };
      labels.forEach((label, index) => {
        row[label.key] = parts[index] || "";
      });
      return row;
    })
    .filter((row) => row.sales || row.stock)
    .sort((a, b) => b.stock - a.stock || b.average - a.average || String(a.model || "").localeCompare(String(b.model || ""), "es"))
    .slice(0, limit);
  return addWosTotal(detail, labels);
}

function addWosTotal(rows, labels) {
  if (!rows.length) return [];
  const totalLastSales = rows.reduce((acc, row) => acc + (Number(row.lastSales) || 0), 0);
  const totalAverage = rows.reduce((acc, row) => acc + (Number(row.average) || 0), 0);
  const totalStock = rows.reduce((acc, row) => acc + (Number(row.stock) || 0), 0);
  const totalSales = rows.reduce((acc, row) => acc + (Number(row.sales) || 0), 0);
  const total = { __total: true, sales: totalSales, lastSales: totalLastSales, average: totalAverage, stock: totalStock, wos: wosValue(totalStock, totalAverage) };
  labels.forEach((label, index) => {
    total[label.key] = index === 0 ? "Total Entel" : "";
  });
  return [...rows, total];
}

function renderWos() {
  const weeks = lastCompleteWeeks(3);
  const rows = filteredRows({ ignoreTime: true });
  const stockRows = currentStockRows();
  const labels = [
    { key: "channel", label: "Canal" },
    { key: "regional", label: "Regional Honor" },
    { key: "pdv", label: "Punto de venta" },
    { key: "segment", label: "Segmento Honor" },
    { key: "brand", label: "Marca" },
    { key: "model", label: "Modelo" },
  ];
  const dimensions = ["c", "rg", "p", "s", "b", "m"];
  const mainRows = wosRows(rows, stockRows, weeks, dimensions, labels, 50000);
  const stockAlerts = addWosTotal(mainRows.filter((row) => !row.__total && row.wos != null && row.wos < 1.5), labels);
  const salesAlerts = addWosTotal(mainRows.filter((row) => !row.__total && row.wos != null && row.wos > 5), labels);
  const columns = [
    ...labels.map((label) => ({ key: label.key, label: label.label })),
    { key: "average", label: "Prom. 3 sem", num: true, format: fmtDecimal },
    { key: "lastSales", label: "Venta últ. sem.", num: true, format: fmtInt },
    { key: "stock", label: "Stock", num: true, format: fmtInt },
    { key: "wos", label: "WOS", num: true, format: fmtWos },
  ];
  renderPagedTable(tableIds.wosMain, columns, mainRows, {
    pageKey: "wosMain",
    pagerId: "wos-main-pager",
    pageSize: 300,
    stickyColumns: 6,
  });
  renderPagedTable(tableIds.wosStockAlert, columns, stockAlerts, {
    pageKey: "wosStock",
    pagerId: "wos-stock-pager",
    pageSize: 300,
    stickyColumns: 3,
  });
  renderPagedTable(tableIds.wosSalesAlert, columns, salesAlerts, {
    pageKey: "wosSales",
    pagerId: "wos-sales-pager",
    pageSize: 300,
    stickyColumns: 3,
  });

  const first = weeks[0];
  const last = weeks.at(-1);
  const scope = weeks.length && first && last ? `${weekLabel(first)} a ${weekLabel(last)} · Stock ${latestStockDate()}` : "Sin semanas completas";
  const mainScope = document.getElementById("wos-main-scope");
  const stockScope = document.getElementById("wos-stock-scope");
  const salesScope = document.getElementById("wos-sales-scope");
  if (mainScope) mainScope.textContent = scope;
  if (stockScope) stockScope.textContent = `${fmtInt(stockAlerts.filter((row) => !row.__total).length)} alertas`;
  if (salesScope) salesScope.textContent = `${fmtInt(salesAlerts.filter((row) => !row.__total).length)} alertas`;
}

function weeklySalesShareColumns() {
  return activeWeeks(filteredRows()).flatMap((week) => [
    { key: `v${week.SEMANA}`, label: `Venta ${weekLabel(week)}`, num: true, format: fmtInt },
    { key: `s${week.SEMANA}`, label: `Share ${weekLabel(week)}`, num: true, format: fmtPct },
  ]);
}

function weeklySalesSharePriceColumns() {
  return activeWeeks(filteredRows()).flatMap((week) => [
    { key: `v${week.SEMANA}`, label: `Venta ${weekLabel(week)}`, num: true, format: fmtInt },
    { key: `s${week.SEMANA}`, label: `Share ${weekLabel(week)}`, num: true, format: fmtPct },
    { key: `price:${week.SEMANA}`, label: `Precio prom ${weekLabel(week)}`, num: true, format: fmtPrice },
  ]);
}

function weeklyPriceDetailColumns() {
  return activeWeeks(filteredRows()).flatMap((week) => [
    { key: `sales${week.SEMANA}`, label: `Venta ${weekLabel(week)}`, num: true, format: fmtInt },
    { key: `price${week.SEMANA}`, label: `Precio ${weekLabel(week)}`, num: true, format: fmtPrice },
    { key: `shareSales${week.SEMANA}`, label: `Share ${weekLabel(week)}`, num: true, format: fmtPct },
  ]);
}

function weeklyCorrelationColumns() {
  return activeWeeks(filteredRows()).flatMap((week) => [
    { key: `sales${week.SEMANA}`, label: `Venta ${weekLabel(week)}`, num: true, format: fmtInt },
    { key: `price${week.SEMANA}`, label: `Precio ${weekLabel(week)}`, num: true, format: fmtPrice },
    { key: `corr${week.SEMANA}`, label: `Corr ${weekLabel(week)}`, num: true, format: fmtCorr },
  ]);
}

function renderAvances(rows) {
  const brandWeek = weeklyRows(rows, "b", "brand");
  const segmentWeek = weeklyRows(rows, "s", "segment");
  const modelWeek = modelWeeklyRows(rows);
  const brandDay = dailyRows(rows, "b", "brand");
  const modelDay = modelDailyRows(rows);
  els.modelCount.textContent = `${fmtInt(modelDay.length)} modelos`;

  renderTable(tableIds.brandWeek, weeklyColumns("brand", "Marca"), brandWeek, { limit: 12 });
  renderTable(tableIds.segmentWeek, weeklyColumns("segment", "Segmento Honor"), segmentWeek, { limit: 18 });
  renderTable(tableIds.modelWeek, modelWeeklyColumns(), modelWeek, { limit: 90, stickyColumns: 2 });
  renderTable(tableIds.brandDay, dailyColumns("brand", "Marca"), brandDay, { limit: 12 });
  renderTable(
    tableIds.modelDay,
    [{ key: "segment", label: "Segmento Honor" }, ...dailyColumns("model", "Modelo", true)],
    modelDay,
    { limit: 70, stickyColumns: 2 },
  );
}

function renderMensual(rows) {
  const brandMonth = monthlyRows(rows, "b", "brand");
  const segmentMonth = monthlyRows(rows, "s", "segment");
  const brandDay = dailyRows(rows, "b", "brand");
  const modelMonth = modelMonthlyRows(rows);
  const pdvBrandLabels = [
    { key: "channel", label: "Canal" },
    { key: "regional", label: "Regional Honor" },
    { key: "pdv", label: "Punto de venta" },
    { key: "brand", label: "Marca" },
  ];
  const pdvBrandMonth = monthlyBreakdownRows(rows, ["c", "rg", "p", "b"], ["c", "rg", "p"], pdvBrandLabels, 360);
  els.modelCount.textContent = `${fmtInt(modelMonth.length)} modelos`;

  renderTable(tableIds.monthlyBrand, monthlyColumns("brand", "Marca"), brandMonth, { limit: 12 });
  renderTable(tableIds.monthlySegment, monthlyColumns("segment", "Segmento Honor"), segmentMonth, { limit: 18 });
  renderTable(tableIds.monthlyBrandDay, dailyColumns("brand", "Marca"), brandDay, { limit: 12 });
  renderTable(
    tableIds.monthlyModel,
    [{ key: "segment", label: "Segmento Honor" }, ...monthlyColumns("model", "Modelo", true)],
    modelMonth,
    { limit: 90, stickyColumns: 2 },
  );
  renderTable(tableIds.monthlyPdvBrand, monthlyBreakdownColumns(pdvBrandLabels), pdvBrandMonth, { limit: 360, stickyColumns: 4 });
}

function renderTiendas(rows) {
  const regionalSegment = aggregateTable(
    rows,
    ["c", "rg", "s"],
    ["c", "rg"],
    [
      { key: "channel" },
      { key: "regional" },
      { key: "segment" },
    ],
    140,
  );
  const regionalBrand = aggregateTable(
    rows,
    ["c", "rg", "b"],
    ["c", "rg"],
    [
      { key: "channel" },
      { key: "regional" },
      { key: "brand" },
    ],
    100,
  );
  const storeBrand = aggregateTable(
    rows,
    ["c", "rg", "p", "b"],
    ["c", "rg", "p"],
    [
      { key: "channel" },
      { key: "regional" },
      { key: "pdv" },
      { key: "brand" },
    ],
    180,
  );
  const storeModel = aggregateTable(
    rows,
    ["c", "rg", "p", "s", "m"],
    ["c", "rg", "p"],
    [
      { key: "channel" },
      { key: "regional" },
      { key: "pdv" },
      { key: "segment" },
      { key: "model" },
    ],
    220,
  );

  const cols = {
    regionalSegment: [
      { key: "channel", label: "Canal" },
      { key: "regional", label: "Regional Honor" },
      { key: "segment", label: "Segmento Honor" },
      { key: "sales", label: "Ventas", num: true, format: fmtInt },
      { key: "share", label: "Share", num: true, format: fmtPct },
      ...weeklySalesShareColumns(),
    ],
    regionalBrand: [
      { key: "channel", label: "Canal" },
      { key: "regional", label: "Regional Honor" },
      { key: "brand", label: "Marca" },
      { key: "sales", label: "Ventas", num: true, format: fmtInt },
      { key: "share", label: "Share", num: true, format: fmtPct },
      ...weeklySalesShareColumns(),
    ],
    storeBrand: [
      { key: "channel", label: "Canal" },
      { key: "regional", label: "Regional Honor" },
      { key: "pdv", label: "Punto de venta" },
      { key: "brand", label: "Marca" },
      { key: "sales", label: "Ventas", num: true, format: fmtInt },
      { key: "share", label: "Share", num: true, format: fmtPct },
      ...weeklySalesShareColumns(),
    ],
    storeModel: [
      { key: "channel", label: "Canal" },
      { key: "regional", label: "Regional Honor" },
      { key: "pdv", label: "Punto de venta" },
      { key: "segment", label: "Segmento Honor" },
      { key: "model", label: "Modelo" },
      { key: "sales", label: "Ventas", num: true, format: fmtInt },
      { key: "share", label: "Share", num: true, format: fmtPct },
      ...weeklySalesSharePriceColumns(),
    ],
  };

  renderTable(tableIds.regionalSegment, cols.regionalSegment, regionalSegment, { limit: 140, stickyColumns: 3 });
  renderTable(tableIds.regionalBrand, cols.regionalBrand, regionalBrand, { limit: 100, stickyColumns: 3 });
  renderTable(tableIds.storeBrand, cols.storeBrand, storeBrand, { limit: 180, stickyColumns: 4 });
  renderTable(tableIds.storeModel, cols.storeModel, storeModel, { limit: 220, stickyColumns: 5 });
}

function renderPrecio(rows) {
  const priceChanges = filteredPriceChanges();
  renderTable(
    tableIds.priceChangeSegment,
    [
      { key: "SEGMENTO_HONOR", label: "Segmento Honor" },
      { key: "MODELOS_CAMBIARON", label: "Modelos", num: true, format: fmtInt },
      { key: "MODELOS_BAJARON", label: "Bajaron", num: true, format: fmtInt },
      { key: "MODELO_MAYOR_BAJA", label: "Modelo que mas bajo" },
      { key: "PRECIO_ACTUAL_MAYOR_BAJA", label: "Precio actual", num: true, format: fmtPrice },
      { key: "VARIACION_MAYOR_BAJA", label: "Variacion", num: true, format: fmtSignedPrice },
      { key: "VARIACION_PCT_MAYOR_BAJA", label: "Var %", num: true, format: fmtSignedPct },
      { key: "MODELOS_SUBIERON", label: "Subieron", num: true, format: fmtInt },
    ],
    priceChanges.summary,
    { limit: 60 },
  );
  renderTable(
    tableIds.priceChangeDetail,
    [
      { key: "SEGMENTO_HONOR", label: "Segmento Honor" },
      { key: "MARCAMODELO", label: "Modelo" },
      { key: "PRECIO_ANTERIOR", label: "Precio anterior", num: true, format: fmtPrice },
      { key: "PRECIO_NUEVO", label: "Precio actual", num: true, format: fmtPrice },
      { key: "VARIACION", label: "Variacion", num: true, format: fmtSignedPrice },
      { key: "VARIACION_PCT", label: "Var %", num: true, format: fmtSignedPct },
    ],
    priceChanges.detail,
    { limit: 200, stickyColumns: 2 },
  );

  const corrCols = (key, label) => [
    { key, label },
    { key: "sales", label: "Ventas", num: true, format: fmtInt },
    { key: "price", label: "Precio prom", num: true, format: fmtPrice },
    { key: "models", label: "Modelos", num: true, format: fmtInt },
    { key: "corr", label: "Corr precio-venta", num: true, format: fmtCorr },
    ...weeklyCorrelationColumns(),
  ];
  const detailCols = [
    { key: "c", label: "Canal" },
    { key: "rg", label: "Regional Honor" },
    { key: "p", label: "Punto de venta" },
    { key: "b", label: "Marca" },
    { key: "m", label: "Modelo" },
    { key: "sales", label: "Ventas", num: true, format: fmtInt },
    { key: "price", label: "Precio prom", num: true, format: fmtPrice },
    { key: "value", label: "Venta valorizada", num: true, format: fmtPrice },
    { key: "shareSales", label: "Share ventas", num: true, format: fmtPct },
    { key: "shareValue", label: "Share valor", num: true, format: fmtPct },
    { key: "missingPrice", label: "Ventas sin precio", num: true, format: fmtInt },
    ...weeklyPriceDetailColumns(),
  ];
  renderTable(tableIds.priceChannel, corrCols("c", "Canal"), correlationTable(rows, "c", "c"), { limit: 20 });
  renderTable(tableIds.priceRegional, corrCols("rg", "Regional Honor"), correlationTable(rows, "rg", "rg"), { limit: 30 });
  renderTable(tableIds.priceSegment, corrCols("s", "Segmento Honor"), correlationTable(rows, "s", "s"), { limit: 40 });
  renderTable(
    tableIds.priceChannelModel,
    detailCols.filter((col) => col.key !== "rg" && col.key !== "p"),
    priceDetailRows(rows, ["c", "b", "m"], ["c"], 250),
    { limit: 250, stickyColumns: 3 },
  );
  renderTable(tableIds.pricePdvModel, detailCols, priceDetailRows(rows, ["c", "rg", "p", "b", "m"], ["c", "rg", "p"], 400), {
    limit: 400,
    stickyColumns: 5,
  });
}

function renderHistoricoPrecios(rows) {
  const history = priceHistoryTableRows(rows);
  renderTable(tableIds.priceHistory, priceHistoryColumns(history.dates), history.rows, {
    limit: 220,
    stickyColumns: 4,
  });
  const scope = document.getElementById("price-history-scope");
  if (scope) {
    scope.textContent = `${fmtInt(history.rows.length)} modelos. ${fmtInt(history.dates.length)} fechas de precio en ${history.year}.`;
  }
}

function renderInsights(rows) {
  const targetPeriod = resolveTargetPeriod(rows);
  const priorPeriod = previousPeriod(targetPeriod);
  const stockSnapshot = latestStockSnapshot();
  const periodText = `${periodLabel(targetPeriod)} vs ${periodLabel(priorPeriod)}`;
  const stockSource = DATA.meta.stock_source_file ? DATA.meta.stock_source_file.split(/[\\/]/).pop() : "";
  const stockText = stockSnapshot.date ? `Stock actual ${stockSnapshot.date}${stockSource ? ` (${stockSource})` : ""}` : "Sin stock actual";

  renderTable(
    tableIds.insightActions,
    [
      { key: "type", label: "Tipo" },
      { key: "insight", label: "Insight" },
      { key: "metric", label: "Impacto" },
      { key: "action", label: "Accion sugerida" },
    ],
    actionRows(targetPeriod, priorPeriod, stockSnapshot.rows),
    { limit: 20, stickyColumns: 1 },
  );

  renderTable(
    tableIds.insightPriceStock,
    [
      { key: "segment", label: "Segmento Honor" },
      { key: "model", label: "Modelo" },
      { key: "currentPrice", label: "Precio actual", num: true, format: fmtPrice },
      { key: "variation", label: "Baja precio", num: true, format: fmtSignedPrice },
      { key: "variationPct", label: "Var %", num: true, format: fmtSignedPct },
      { key: "stock", label: "Stock", num: true, format: fmtInt },
      { key: "pdvs", label: "PDV stock", num: true, format: fmtInt },
      { key: "avgWeek", label: "Venta sem prom", num: true, format: fmtInt },
      { key: "stockWeeks", label: "Sem stock", num: true, format: fmtWeeks },
      { key: "read", label: "Lectura" },
    ],
    insightPriceStockRows(targetPeriod, stockSnapshot.rows),
    { limit: 80, stickyColumns: 2 },
  );

  const brandSales = salesMovementRows(targetPeriod, priorPeriod, ["b"], ["brand"], stockSnapshot.rows, ["b"], 80);
  const channelSales = honorMovementRows(targetPeriod, priorPeriod, ["c"], ["channel"], stockSnapshot.rows, ["c"], 30);
  const segmentSales = honorMovementRows(targetPeriod, priorPeriod, ["s"], ["segment"], stockSnapshot.rows, ["s"], 80);
  const pdvSales = honorMovementRows(targetPeriod, priorPeriod, ["c", "rg", "p"], ["channel", "regional", "pdv"], stockSnapshot.rows, ["c", "rg", "p"], 180);
  const filteredPdvSales = refreshInsightPdvFilters(pdvSales);
  const modelSales = salesMovementRows(targetPeriod, priorPeriod, ["b", "s", "m"], ["brand", "segment", "model"], stockSnapshot.rows, ["b", "s", "m"], 220);
  const brandSalesCols = (labelKey, label) => [
    { key: labelKey, label },
    { key: "current", label: `Ventas ${periodLabel(targetPeriod)}`, num: true, format: fmtInt },
    { key: "currentShare", label: `Share ${periodLabel(targetPeriod)}`, num: true, format: fmtPct },
    { key: "prior", label: `Ventas ${periodLabel(priorPeriod)}`, num: true, format: fmtInt },
    { key: "priorShare", label: `Share ${periodLabel(priorPeriod)}`, num: true, format: fmtPct },
    { key: "delta", label: "Var ventas", num: true, format: fmtSignedInt },
    { key: "deltaPct", label: "Var %", num: true, format: fmtSignedPct },
    { key: "shareDelta", label: "Var share", num: true, format: fmtSignedPct },
    { key: "stock", label: "Stock actual", num: true, format: fmtInt },
    { key: "read", label: "Lectura" },
  ];
  const honorSalesCols = (labelKey, label) => [
    { key: labelKey, label },
    { key: "current", label: `Ventas Honor ${periodLabel(targetPeriod)}`, num: true, format: fmtInt },
    { key: "currentShare", label: `Share Honor ${periodLabel(targetPeriod)}`, num: true, format: fmtPct },
    { key: "prior", label: `Ventas Honor ${periodLabel(priorPeriod)}`, num: true, format: fmtInt },
    { key: "priorShare", label: `Share Honor ${periodLabel(priorPeriod)}`, num: true, format: fmtPct },
    { key: "delta", label: "Var ventas Honor", num: true, format: fmtSignedInt },
    { key: "deltaPct", label: "Var %", num: true, format: fmtSignedPct },
    { key: "shareDelta", label: "Var share Honor", num: true, format: fmtSignedPct },
    { key: "stock", label: "Stock Honor actual", num: true, format: fmtInt },
    { key: "read", label: "Lectura" },
  ];

  renderTable(tableIds.insightBrandSales, brandSalesCols("brand", "Marca"), brandSales, { limit: 40, stickyColumns: 1 });
  renderTable(tableIds.insightChannelSales, honorSalesCols("channel", "Canal"), channelSales, { limit: 20, stickyColumns: 1 });
  renderTable(tableIds.insightSegmentSales, honorSalesCols("segment", "Segmento Honor"), segmentSales, { limit: 60, stickyColumns: 1 });

  renderTable(
    tableIds.insightPdvSales,
    [
      { key: "channel", label: "Canal" },
      { key: "regional", label: "Regional Honor" },
      { key: "pdv", label: "Punto de venta" },
      ...honorSalesCols("pdv", "Punto de venta").slice(1),
    ],
    filteredPdvSales,
    { limit: 140, stickyColumns: 3 },
  );

  renderTable(
    tableIds.insightModelSales,
    [
      { key: "brand", label: "Marca" },
      { key: "segment", label: "Segmento Honor" },
      { key: "model", label: "Modelo" },
      ...brandSalesCols("model", "Modelo").slice(1),
    ],
    modelSales,
    { limit: 180, stickyColumns: 3 },
  );

  renderTable(
    tableIds.insightPdvShare,
    [
      { key: "channel", label: "Canal" },
      { key: "regional", label: "Regional Honor" },
      { key: "pdv", label: "Punto de venta" },
      { key: "priorShare", label: `Share Honor ${periodLabel(priorPeriod)}`, num: true, format: fmtPct },
      { key: "currentShare", label: `Share Honor ${periodLabel(targetPeriod)}`, num: true, format: fmtPct },
      { key: "delta", label: "Var share", num: true, format: fmtSignedPct },
      { key: "currentHonor", label: "Venta Honor", num: true, format: fmtInt },
      { key: "currentTotal", label: "Venta total", num: true, format: fmtInt },
      { key: "stock", label: "Stock Honor", num: true, format: fmtInt },
      { key: "read", label: "Lectura" },
    ],
    honorShareMovementByPdv(targetPeriod, priorPeriod, stockSnapshot.rows),
    { limit: 120, stickyColumns: 3 },
  );

  renderTable(
    tableIds.insightSegmentShare,
    [
      { key: "segment", label: "Segmento Honor" },
      { key: "priorShare", label: `Share Honor ${periodLabel(priorPeriod)}`, num: true, format: fmtPct },
      { key: "currentShare", label: `Share Honor ${periodLabel(targetPeriod)}`, num: true, format: fmtPct },
      { key: "delta", label: "Var share", num: true, format: fmtSignedPct },
      { key: "currentHonor", label: "Venta Honor", num: true, format: fmtInt },
      { key: "stockHonor", label: "Stock Honor", num: true, format: fmtInt },
      { key: "stockTotal", label: "Stock total", num: true, format: fmtInt },
      { key: "read", label: "Lectura" },
    ],
    honorShareMovementBySegment(targetPeriod, priorPeriod, stockSnapshot.rows),
    { limit: 80, stickyColumns: 1 },
  );

  renderTable(
    tableIds.insightHonorStock,
    [
      { key: "channel", label: "Canal" },
      { key: "regional", label: "Regional Honor" },
      { key: "pdv", label: "Punto de venta" },
      { key: "stock", label: "Stock Honor", num: true, format: fmtInt },
      { key: "models", label: "Modelos Honor", num: true, format: fmtInt },
      { key: "topModel", label: "Modelo con mas stock" },
    ],
    honorStockByPdv(stockSnapshot.rows),
    { limit: 120, stickyColumns: 3 },
  );

  renderTable(
    tableIds.insightModelStock,
    [
      { key: "brand", label: "Marca" },
      { key: "segment", label: "Segmento Honor" },
      { key: "model", label: "Modelo" },
      { key: "stock", label: "Stock", num: true, format: fmtInt },
      { key: "pdvs", label: "PDV stock", num: true, format: fmtInt },
      { key: "channels", label: "Canales", num: true, format: fmtInt },
      { key: "avgWeek", label: "Venta sem prom", num: true, format: fmtInt },
      { key: "stockWeeks", label: "Sem stock", num: true, format: fmtWeeks },
    ],
    modelStockRows(targetPeriod, stockSnapshot.rows),
    { limit: 160, stickyColumns: 3 },
  );

  const scope = document.getElementById("insight-scope");
  if (scope) scope.textContent = `${periodText}. ${stockText}.`;
}

function renderKpis(rows) {
  const sales = sum(rows);
  const brands = group(rows, ["b"]);
  const sortedBrands = [...brands.entries()].sort((a, b) => b[1] - a[1]);
  els.kpiSales.textContent = fmtInt(sales);
  els.kpiShare.textContent = fmtPct(sales / DATA.meta.total_sales);
  els.kpiBrand.textContent = sortedBrands[0] ? `${sortedBrands[0][0]} (${fmtPct(sortedBrands[0][1] / (sales || 1))})` : "-";
  els.kpiPdv.textContent = fmtInt(new Set(rows.map((row) => row.p)).size);
}

function selectedYearsForLoad(selection) {
  if (selection.includes(ALL)) return (DATA.lists.years || []).map(String);
  return selection.map(String);
}

function updateSourceLabel() {
  const loaded = DATA.rows.length;
  const selected = selectedYearsForLoad(state.year).join(", ");
  els.source.textContent = `${fmtInt(loaded)} registros cargados (${selected}). Total base: ${fmtInt(DATA.meta.total_sales)} ventas.`;
}

function render() {
  refreshFilterOptions();
  const rows = filteredRows();
  updateSourceLabel();
  renderKpis(rows);
  if (state.view === "avances") renderAvances(rows);
  if (state.view === "mensual") renderMensual(rows);
  if (state.view === "tiendas") renderTiendas(rows);
  if (state.view === "precio") renderPrecio(rows);
  if (state.view === "historico") renderHistoricoPrecios(rows);
  if (state.view === "stock") renderStock(rows);
  if (state.view === "wos") renderWos();
  if (state.view === "insights") renderInsights(rows);
}

function bindSelect(select, key) {
  select.addEventListener("change", async () => {
    state[key] = selectedValues(select);
    state.pages = {};
    if (key === "year" && window.ensureReportYears) {
      select.disabled = true;
      els.source.textContent = "Cargando el año seleccionado...";
      try {
        await window.ensureReportYears(selectedYearsForLoad(state.year));
      } catch (error) {
        console.error(error);
        els.source.textContent = "No se pudo cargar el año seleccionado. Revisa tu conexión e inténtalo nuevamente.";
        return;
      } finally {
        select.disabled = false;
      }
    }
    render();
  });
}

function setup() {
  bindSelect(els.year, "year");
  bindSelect(els.month, "month");
  bindSelect(els.week, "week");
  bindSelect(els.day, "day");
  bindSelect(els.weekday, "weekday");
  bindSelect(els.channel, "channel");
  bindSelect(els.regional, "regional");
  bindSelect(els.supervisor, "supervisor");
  bindSelect(els.pdv, "pdv");
  bindSelect(els.segment, "segment");
  bindSelect(els.brand, "brand");
  bindSelect(els.model, "model");
  if (els.insightPdvRegional) bindSelect(els.insightPdvRegional, "insightPdvRegional");
  if (els.insightPdvPdv) bindSelect(els.insightPdvPdv, "insightPdvPdv");
  els.reset.addEventListener("click", async () => {
    const latestYear = DATA.lists.years?.[DATA.lists.years.length - 1] || ALL;
    Object.assign(state, {
      year: [latestYear],
      month: [ALL],
      week: [ALL],
      day: [ALL],
      weekday: [ALL],
      channel: [ALL],
      regional: [ALL],
      supervisor: [ALL],
      pdv: [ALL],
      segment: [ALL],
      brand: [ALL],
      model: [ALL],
      insightPdvRegional: [ALL],
      insightPdvPdv: [ALL],
      pages: {},
    });
    if (window.ensureReportYears && latestYear !== ALL) {
      els.reset.disabled = true;
      els.source.textContent = "Restableciendo el reporte...";
      try {
        await window.ensureReportYears([latestYear]);
      } catch (error) {
        console.error(error);
        els.source.textContent = "No se pudo restablecer el reporte. Actualiza la página para intentar nuevamente.";
        return;
      } finally {
        els.reset.disabled = false;
      }
    }
    render();
  });

  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      state.pages = {};
      document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("is-active", tab === button));
      document.querySelectorAll(".view").forEach((view) => view.classList.toggle("is-active", view.id === `view-${state.view}`));
      render();
    });
  });

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
  render();
}

setup();
