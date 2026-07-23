(() => {
  const DATA = window.REPORT_DATA;
  const ALL = "Todos";
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
  const monthLabels = Object.fromEntries(MONTHS);
  const weekdayLabels = Object.fromEntries(WEEKDAYS);
  const periodLabels = DATA.lists?.period_labels || {};
  const weekLabels = Object.fromEntries((DATA.meta.weeks || []).map((item) => [item.SEMANA, item.SHORT || item.SEMANA]));
  const dateLabels = Object.fromEntries((DATA.meta.dates || []).map((item) => [item.FECHA, item.LABEL || item.FECHA]));
  const state = {
    view: "mensual",
    year: new Set([String((DATA.lists?.years || []).at(-1) || "")]),
    month: new Set(),
    week: new Set(),
    day: new Set(),
    weekday: new Set(),
    channel: new Set(),
    regional: new Set(),
    supervisor: new Set(),
    pdv: new Set(),
    type: new Set(),
    subtype: new Set(),
    brand: new Set(),
    model: new Set(),
    pages: {},
  };

  const escapeHtml = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  const number = (value) => new Intl.NumberFormat("es-PE", { maximumFractionDigits: 0 }).format(value || 0);
  const decimal = (value) =>
    new Intl.NumberFormat("es-PE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value || 0);
  const percent = (value) => `${((value || 0) * 100).toFixed(1)}%`;
  const currency = (value) =>
    value == null || Number.isNaN(Number(value))
      ? ""
      : `S/ ${Number(value).toLocaleString("es-PE", { maximumFractionDigits: 1 })}`;
  const sum = (rows, field = "v") => rows.reduce((total, row) => total + Number(row[field] || 0), 0);

  function normalizeType(value) {
    const text = String(value || "").trim().toUpperCase();
    if (text === "PROTECCION" || text === "PROTECCIÓN") return "PROTECCIÓN";
    if (text === "WEAREABLES" || text === "WEARABLES") return "WEAREABLES";
    return text;
  }

  function normalizeSubtype(value) {
    const text = String(value || "").trim().toUpperCase();
    if (text === "LAMINA" || text === "LAMINAS") return "LAMINAS";
    if (text === "PARLANTE" || text === "PARLANTES") return "PARLANTES";
    if (text === "SELFIE STICK" || text === "SELFIE STICKS") return "SELFIE STICK";
    return text;
  }

  function normalizeRows(rows) {
    for (const row of rows || []) {
      row.t = normalizeType(row.t);
      row.st = normalizeSubtype(row.st);
    }
  }

  normalizeRows(DATA.rows);
  normalizeRows(DATA.stockRows);

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

  const filterConfig = [
    ["year", (row) => String(row.y || "")],
    ["month", monthValue],
    ["week", weekValue],
    ["day", dayValue],
    ["weekday", weekdayValue],
    ["channel", (row) => row.c || ""],
    ["regional", (row) => row.rg || ""],
    ["supervisor", (row) => row.sup || ""],
    ["pdv", (row) => row.p || ""],
    ["type", (row) => row.t || ""],
    ["subtype", (row) => row.st || ""],
    ["brand", (row) => row.b || ""],
    ["model", (row) => row.m || ""],
  ];

  function selectedValues(select) {
    return new Set([...select.selectedOptions].map((option) => option.value).filter((value) => value !== ALL));
  }

  function optionLabel(name, value) {
    if (value === ALL) return value;
    if (name === "month") return monthLabels[value] || value;
    if (name === "week") return `Semana ${Number(value)}`;
    if (name === "weekday") return weekdayLabels[value] || value;
    return value;
  }

  function sortValues(values) {
    return [...new Set(values.filter(Boolean))].sort((a, b) => {
      if (/^\d+$/.test(a) && /^\d+$/.test(b)) return Number(a) - Number(b);
      return a.localeCompare(b, "es");
    });
  }

  function setOptions(name, values, fixed = false) {
    const select = document.getElementById(`filter-${name}`);
    const current = state[name];
    const ordered = fixed ? values : sortValues(values);
    select.innerHTML = [ALL, ...ordered]
      .map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(optionLabel(name, value))}</option>`)
      .join("");
    const valid = new Set(ordered);
    const selected = [...current].filter((value) => valid.has(value));
    state[name] = new Set(selected);
    for (const option of select.options) option.selected = selected.length ? state[name].has(option.value) : option.value === ALL;
  }

  function matches(row, ignore = new Set(), ignoreTime = false) {
    for (const [name, getter] of filterConfig) {
      if (ignore.has(name) || (ignoreTime && ["year", "month", "week", "day", "weekday"].includes(name))) continue;
      if (state[name].size && !state[name].has(String(getter(row)))) return false;
    }
    return true;
  }

  function filteredRows(ignore = []) {
    const ignored = new Set(ignore);
    return (DATA.rows || []).filter((row) => matches(row, ignored));
  }

  function latestStockRows() {
    const filtered = (DATA.stockRows || []).filter((row) => matches(row, new Set(), true));
    const latest = filtered.map((row) => row.f).filter((value) => value && value !== "Sin fecha").sort().at(-1);
    return latest ? filtered.filter((row) => row.f === latest) : filtered;
  }

  function refreshFilters() {
    setOptions("year", (DATA.lists?.years || []).map(String), true);
    const rows = [...(DATA.rows || []), ...(["stock", "wos"].includes(state.view) ? DATA.stockRows || [] : [])];
    for (const [name, getter] of filterConfig.slice(1)) {
      const candidates = rows.filter((row) => matches(row, new Set([name])));
      let values = sortValues(candidates.map(getter).map(String));
      if (name === "month") values = MONTHS.map(([value]) => value).filter((value) => values.includes(value));
      if (name === "weekday") values = WEEKDAYS.map(([value]) => value).filter((value) => values.includes(value));
      setOptions(name, values, true);
    }
  }

  function weightedPrice(rows) {
    let amount = 0;
    let units = 0;
    for (const row of rows) {
      if (row.pr == null || Number.isNaN(Number(row.pr))) continue;
      amount += Number(row.pr) * Number(row.v || 0);
      units += Number(row.v || 0);
    }
    return units ? amount / units : null;
  }

  function weightedPriceGroups(rows, dimensions) {
    const grouped = new Map();
    for (const row of rows) {
      if (row.pr == null || Number.isNaN(Number(row.pr))) continue;
      const key = JSON.stringify(dimensions.map((field) => row[field] || "-"));
      if (!grouped.has(key)) grouped.set(key, { amount: 0, units: 0 });
      const item = grouped.get(key);
      item.amount += Number(row.pr) * Number(row.v || 0);
      item.units += Number(row.v || 0);
    }
    return new Map([...grouped].map(([key, item]) => [key, item.units ? item.amount / item.units : null]));
  }

  function aggregate(rows, dimensions, valueField = "v", options = {}) {
    const grouped = new Map();
    for (const row of rows) {
      const values = dimensions.map((field) => row[field] || "-");
      const key = JSON.stringify(values);
      if (!grouped.has(key)) grouped.set(key, { values, total: 0, rows: [] });
      const item = grouped.get(key);
      item.total += Number(row[valueField] || 0);
      item.rows.push(row);
    }
    const output = [...grouped.values()];
    const parentLength = options.parentDimensions?.length || 0;
    if (parentLength && options.parentDimensions.includes("p")) {
      const parentTotals = new Map();
      for (const item of output) {
        const parentKey = JSON.stringify(item.values.slice(0, parentLength));
        parentTotals.set(parentKey, (parentTotals.get(parentKey) || 0) + item.total);
      }
      return output.sort((a, b) => {
        const parentA = JSON.stringify(a.values.slice(0, parentLength));
        const parentB = JSON.stringify(b.values.slice(0, parentLength));
        if (parentA !== parentB) {
          return (parentTotals.get(parentB) || 0) - (parentTotals.get(parentA) || 0) || parentA.localeCompare(parentB, "es");
        }
        return b.total - a.total || String(a.values).localeCompare(String(b.values), "es");
      });
    }
    return output.sort((a, b) => b.total - a.total || String(a.values).localeCompare(String(b.values), "es"));
  }

  function orderedColumns(rows, field) {
    const values = [...new Set(rows.map((row) => row[field]).filter(Boolean))];
    if (field === "pe") {
      const order = new Map((DATA.meta.periods || []).map((item, index) => [item.PERIODO, index]));
      return values.sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999));
    }
    return values.sort();
  }

  function pivot(rows, dimensions, columnField, labels, options = {}) {
    const columns = orderedColumns(rows, columnField);
    const columnTotals = Object.fromEntries(columns.map((column) => [column, sum(rows.filter((row) => row[columnField] === column))]));
    const grouped = aggregate(rows, dimensions, "v", { parentDimensions: options.parentDimensions });
    const total = sum(rows);
    const detailRows = grouped.slice(0, options.limit || 200).map((item) => {
      const output = {
        ...Object.fromEntries(dimensions.map((field, index) => [field, item.values[index]])),
        total: item.total,
        share: total ? item.total / total : 0,
      };
      for (const column of columns) {
        const cellRows = item.rows.filter((row) => row[columnField] === column);
        output[column] = sum(cellRows);
        output[`share:${column}`] = columnTotals[column] ? output[column] / columnTotals[column] : 0;
        if (options.includePrice) output[`price:${column}`] = weightedPrice(cellRows);
      }
      return output;
    });
    const totalRow = {
      ...Object.fromEntries(dimensions.map((field, index) => [field, index === 0 ? "TOTAL" : ""])),
      total,
      share: total ? 1 : 0,
      __total: true,
    };
    for (const column of columns) {
      const cellRows = rows.filter((row) => row[columnField] === column);
      totalRow[column] = columnTotals[column];
      totalRow[`share:${column}`] = columnTotals[column] ? 1 : 0;
      if (options.includePrice) totalRow[`price:${column}`] = weightedPrice(cellRows);
    }
    return {
      columns: [
        ...dimensions.map((field) => ({ key: field, label: labels[field] || field })),
        ...columns.flatMap((column) => {
          const label = columnField === "pe" ? periodLabels[column] || column : weekLabels[column] || column;
          return [
            { key: column, label: `Venta ${label}`, numeric: true },
            { key: `share:${column}`, label: `Share ${label}`, percent: true },
            ...(options.includePrice ? [{ key: `price:${column}`, label: `Precio prom ${label}`, numeric: true, format: currency }] : []),
          ];
        }),
        { key: "total", label: "Venta total", numeric: true },
        { key: "share", label: "Share total", percent: true },
      ],
      rows: [...detailRows, totalRow],
    };
  }

  function dailyPivot(rows, dimensions, labels, options = {}) {
    const dates = [...new Set(rows.map((row) => row.f).filter((value) => value && value !== "Sin fecha"))].sort();
    const dateTotals = Object.fromEntries(dates.map((date) => [date, sum(rows.filter((row) => row.f === date))]));
    const grouped = aggregate(rows, dimensions);
    const total = sum(rows);
    const detailRows = grouped.slice(0, options.limit || 180).map((item) => {
      const output = {
        ...Object.fromEntries(dimensions.map((field, index) => [field, item.values[index]])),
        total: item.total,
        share: total ? item.total / total : 0,
      };
      for (const date of dates) {
        const cellRows = item.rows.filter((row) => row.f === date);
        output[date] = sum(cellRows);
        output[`share:${date}`] = dateTotals[date] ? output[date] / dateTotals[date] : 0;
        if (options.includePrice) output[`price:${date}`] = weightedPrice(cellRows);
      }
      return output;
    });
    const totalRow = {
      ...Object.fromEntries(dimensions.map((field, index) => [field, index === 0 ? "TOTAL" : ""])),
      total,
      share: total ? 1 : 0,
      __total: true,
    };
    for (const date of dates) {
      const cellRows = rows.filter((row) => row.f === date);
      totalRow[date] = dateTotals[date];
      totalRow[`share:${date}`] = dateTotals[date] ? 1 : 0;
      if (options.includePrice) totalRow[`price:${date}`] = weightedPrice(cellRows);
    }
    return {
      columns: [
        ...dimensions.map((field) => ({ key: field, label: labels[field] || field })),
        ...dates.flatMap((date) => [
          { key: date, label: `Venta ${dateLabels[date] || date}`, numeric: true },
          { key: `share:${date}`, label: `Share ${dateLabels[date] || date}`, percent: true },
          ...(options.includePrice ? [{ key: `price:${date}`, label: `Precio prom ${dateLabels[date] || date}`, numeric: true, format: currency }] : []),
        ]),
        { key: "total", label: "Venta total", numeric: true },
        { key: "share", label: "Share total", percent: true },
      ],
      rows: [...detailRows, totalRow],
    };
  }

  function stickyMeta(columns, count) {
    let left = 0;
    return columns.map((column, index) => {
      if (index >= count) return null;
      const label = String(column.label || "").toLowerCase();
      const width = label.includes("modelo") ? 260 : label.includes("punto") ? 240 : Math.max(110, Math.min(180, Number(column.width || 145)));
      const result = { left, width };
      left += width;
      return result;
    });
  }

  function renderTable(id, columns, rows, options = {}) {
    const table = document.getElementById(id);
    if (!table) return;
    const sticky = stickyMeta(columns, options.stickyColumns ?? 1);
    const attrs = (column, index) => {
      const classes = [];
      if (column.numeric || column.percent) classes.push("num");
      if (sticky[index]) classes.push("is-sticky-col");
      const style = sticky[index] ? ` style="left:${sticky[index].left}px;min-width:${sticky[index].width}px;max-width:${sticky[index].width}px"` : "";
      return `${classes.length ? ` class="${classes.join(" ")}"` : ""}${style}`;
    };
    const limit = options.limit || rows.length;
    const shown = [...rows.filter((row) => !row.__total).slice(0, limit), ...rows.filter((row) => row.__total)];
    const head = `<thead><tr>${columns.map((column, index) => `<th${attrs(column, index)}>${escapeHtml(column.label)}</th>`).join("")}</tr></thead>`;
    const body = shown.length
      ? shown
          .map(
            (row) => {
              const classes = [];
              if (row.__total) classes.push("total-row");
              if (row.__class) classes.push(row.__class);
              return `<tr${classes.length ? ` class="${classes.join(" ")}"` : ""}>${columns
                .map((column, index) => {
                  const raw = row[column.key];
                  const value = column.format ? column.format(raw) : column.percent ? percent(raw) : column.numeric ? number(raw) : raw ?? "-";
                  return `<td${attrs(column, index)}>${escapeHtml(value)}</td>`;
                })
                .join("")}</tr>`;
            },
          )
          .join("")
      : `<tr><td colspan="${columns.length}">Sin datos para los filtros seleccionados.</td></tr>`;
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
      <span>${number(start)}-${number(end)} de ${number(rowCount)}</span>
      <button type="button" data-page-step="1"${currentPage >= pageCount - 1 ? " disabled" : ""}>Sig</button>
    `;
    pager.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => {
        state.pages[pageKey] = Math.max(0, Math.min(pageCount - 1, currentPage + Number(button.dataset.pageStep)));
        render();
      });
    });
  }

  function simpleRows(rows, dimensions, parentDimensions) {
    const weeks = orderedColumns(rows, "w");
    const parentTotals = new Map(aggregate(rows, parentDimensions).map((item) => [JSON.stringify(item.values), item.total]));
    const parentWeekTotals = new Map(
      aggregate(rows, [...parentDimensions, "w"]).map((item) => [JSON.stringify(item.values), item.total]),
    );
    const weekTotals = new Map(aggregate(rows, [...dimensions, "w"]).map((item) => [JSON.stringify(item.values), item.total]));
    const weekPrices = weightedPriceGroups(rows, [...dimensions, "w"]);
    const totalByWeek = new Map(aggregate(rows, ["w"]).map((item) => [item.values[0], item.total]));
    const totalPriceByWeek = weightedPriceGroups(rows, ["w"]);
    const detail = aggregate(rows, dimensions, "v", { parentDimensions }).map((item) => {
      const parentValues = item.values.slice(0, parentDimensions.length);
      const parentKey = JSON.stringify(parentValues);
      const output = {
        ...Object.fromEntries(dimensions.map((field, index) => [field, item.values[index]])),
        sales: item.total,
        share: item.total / (parentTotals.get(parentKey) || item.total || 1),
      };
      for (const week of weeks) {
        const itemWeekKey = JSON.stringify([...item.values, week]);
        const parentWeekKey = JSON.stringify([...parentValues, week]);
        const sales = weekTotals.get(itemWeekKey) || 0;
        output[`sales:${week}`] = sales;
        output[`share:${week}`] = sales / (parentWeekTotals.get(parentWeekKey) || 1);
        output[`price:${week}`] = weekPrices.get(itemWeekKey) ?? null;
      }
      return output;
    });
    if (!detail.length) return [];
    const total = {
      ...Object.fromEntries(dimensions.map((field, index) => [field, index === 0 ? "TOTAL" : ""])),
      sales: sum(rows),
      share: 1,
      __total: true,
    };
    for (const week of weeks) {
      total[`sales:${week}`] = totalByWeek.get(week) || 0;
      total[`share:${week}`] = totalByWeek.get(week) ? 1 : 0;
      total[`price:${week}`] = totalPriceByWeek.get(JSON.stringify([week])) ?? null;
    }
    return [...detail, total];
  }

  function simpleColumns(rows, dimensions, labels, includePrice = false) {
    return [
      ...dimensions.map((field) => ({ key: field, label: labels[field] || field })),
      ...orderedColumns(rows, "w").flatMap((week) => [
        { key: `sales:${week}`, label: `Venta ${weekLabels[week] || week}`, numeric: true },
        { key: `share:${week}`, label: `Share ${weekLabels[week] || week}`, percent: true },
        ...(includePrice ? [{ key: `price:${week}`, label: `Precio prom ${weekLabels[week] || week}`, numeric: true, format: currency }] : []),
      ]),
      { key: "sales", label: "Venta total", numeric: true },
      { key: "share", label: "Share total", percent: true },
    ];
  }

  function renderMonthly(rows) {
    const labels = { c: "Canal", rg: "Regional", p: "Punto de venta", b: "Marca", t: "Tipo", st: "Subtipo", m: "Modelo" };
    const brand = pivot(rows, ["b"], "pe", labels, { limit: 40 });
    const subtype = pivot(rows, ["t", "st"], "pe", labels, { limit: 100 });
    const model = pivot(rows, ["t", "st", "b", "m"], "pe", labels, { limit: 200, includePrice: true });
    const pdvBrand = pivot(rows, ["c", "rg", "p", "b"], "pe", labels, { limit: 360, parentDimensions: ["c", "rg", "p"] });
    renderTable("table-month-brand", brand.columns, brand.rows, { stickyColumns: 1 });
    renderTable("table-month-subtype", subtype.columns, subtype.rows, { stickyColumns: 2 });
    renderTable("table-month-model", model.columns, model.rows, { stickyColumns: 4 });
    renderTable("table-month-pdv-brand", pdvBrand.columns, pdvBrand.rows, { stickyColumns: 4 });
  }

  function renderWeekly(rows) {
    const labels = { b: "Marca", t: "Tipo", st: "Subtipo", m: "Modelo" };
    const brand = pivot(rows, ["b"], "w", labels, { limit: 40 });
    const subtype = pivot(rows, ["t", "st"], "w", labels, { limit: 100 });
    const model = pivot(rows, ["t", "st", "b", "m"], "w", labels, { limit: 200, includePrice: true });
    const dayBrand = dailyPivot(rows, ["b"], labels, { limit: 40 });
    const dayModel = dailyPivot(rows, ["t", "st", "b", "m"], labels, { limit: 180, includePrice: true });
    renderTable("table-week-brand", brand.columns, brand.rows, { stickyColumns: 1 });
    renderTable("table-week-subtype", subtype.columns, subtype.rows, { stickyColumns: 2 });
    renderTable("table-week-model", model.columns, model.rows, { stickyColumns: 4 });
    renderTable("table-day-brand", dayBrand.columns, dayBrand.rows, { stickyColumns: 1 });
    renderTable("table-day-model", dayModel.columns, dayModel.rows, { stickyColumns: 4 });
  }

  function renderStores(rows) {
    const labels = { c: "Canal", rg: "Regional", p: "Punto de venta", t: "Tipo", st: "Subtipo", b: "Marca", m: "Modelo" };
    const configs = [
      ["table-regional-subtype", ["rg", "t", "st"], ["rg"], 3, 160, false],
      ["table-regional-brand", ["rg", "b"], ["rg"], 2, 120, false],
      ["table-store-model", ["c", "rg", "p", "t", "st", "b", "m"], ["c", "rg", "p"], 7, 260, true],
      ["table-store-brand", ["c", "rg", "p", "b"], ["c", "rg", "p"], 4, 220, false],
    ];
    for (const [id, dimensions, parentDimensions, stickyColumns, limit, includePrice] of configs) {
      renderTable(id, simpleColumns(rows, dimensions, labels, includePrice), simpleRows(rows, dimensions, parentDimensions), {
        stickyColumns,
        limit,
      });
    }
  }

  function stockTableRows(stockRows, dimensions, limit) {
    const totalStock = sum(stockRows, "q");
    const detail = aggregate(stockRows, dimensions, "q")
      .slice(0, limit)
      .map((item) => ({
        ...Object.fromEntries(dimensions.map((field, index) => [field, item.values[index]])),
        stock: item.total,
        stockShare: totalStock ? item.total / totalStock : 0,
      }));
    if (!detail.length) return [];
    return [
      ...detail,
      {
        ...Object.fromEntries(dimensions.map((field, index) => [field, index === 0 ? "TOTAL" : ""])),
        stock: totalStock,
        stockShare: totalStock ? 1 : 0,
        __total: true,
      },
    ];
  }

  function renderStock(rows) {
    const stockRows = latestStockRows();
    const labels = { c: "Canal", rg: "Regional", p: "Punto de venta", t: "Tipo", st: "Subtipo", b: "Marca", m: "Modelo" };
    const stockSimple = (id, dimensions, stickyColumns, limit) =>
      renderTable(
        id,
        [
          ...dimensions.map((field) => ({ key: field, label: labels[field] })),
          { key: "stock", label: "Stock", numeric: true },
          { key: "stockShare", label: "Share stock", percent: true },
        ],
        stockTableRows(stockRows, dimensions, limit),
        { stickyColumns, limit },
      );
    stockSimple("table-stock-brand", ["b"], 1, 120);
    stockSimple("table-stock-channel", ["c", "t"], 2, 100);
    stockSimple("table-stock-channel-model", ["c", "m"], 2, 220);
    stockSimple("table-stock-pdv", ["c", "rg", "p", "m"], 4, 260);

    const stockByModel = new Map(aggregate(stockRows, ["t", "st", "b", "m"], "q").map((item) => [JSON.stringify(item.values), item.total]));
    const salesByModel = new Map(aggregate(rows, ["t", "st", "b", "m"]).map((item) => [JSON.stringify(item.values), item.total]));
    const totalStock = sum(stockRows, "q");
    const totalSales = sum(rows);
    const weeks = Math.max(1, new Set(rows.map((row) => row.w).filter(Boolean)).size);
    const keys = new Set([...stockByModel.keys(), ...salesByModel.keys()]);
    const modelRows = [...keys]
      .map((key) => {
        const values = JSON.parse(key);
        const stock = stockByModel.get(key) || 0;
        const sales = salesByModel.get(key) || 0;
        const weekly = sales / weeks;
        return {
          t: values[0],
          st: values[1],
          b: values[2],
          m: values[3],
          stock,
          stockShare: totalStock ? stock / totalStock : 0,
          sales,
          salesShare: totalSales ? sales / totalSales : 0,
          weekly,
          coverage: weekly > 0 ? stock / weekly : null,
        };
      })
      .sort((a, b) => b.stock - a.stock || b.sales - a.sales);
    if (modelRows.length) {
      const weekly = totalSales / weeks;
      modelRows.push({
        t: "TOTAL",
        st: "",
        b: "",
        m: "",
        stock: totalStock,
        stockShare: totalStock ? 1 : 0,
        sales: totalSales,
        salesShare: totalSales ? 1 : 0,
        weekly,
        coverage: weekly ? totalStock / weekly : null,
        __total: true,
      });
    }
    renderTable(
      "table-stock-model",
      [
        { key: "t", label: "Tipo" },
        { key: "st", label: "Subtipo" },
        { key: "b", label: "Marca" },
        { key: "m", label: "Modelo" },
        { key: "stock", label: "Stock", numeric: true },
        { key: "stockShare", label: "Share stock", percent: true },
        { key: "sales", label: "Venta seleccionada", numeric: true },
        { key: "salesShare", label: "Share venta", percent: true },
        { key: "weekly", label: "Prom. semanal", numeric: true },
        { key: "coverage", label: "Sem. cobertura", numeric: true },
      ],
      modelRows,
      { stickyColumns: 4, limit: 260 },
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

  function wosFormat(value) {
    if (value == null || Number.isNaN(Number(value))) return "Sin venta";
    if (value > 99) return ">99";
    return Number(value).toFixed(1);
  }

  function wosClass(wos) {
    if (wos == null) return "";
    if (wos < 1.5) return "alert-stock";
    if (wos > 5) return "alert-sale";
    return "";
  }

  function totalWosRows(rows, dimensions) {
    if (!rows.length) return [];
    const lastSales = rows.reduce((total, row) => total + Number(row.lastSales || 0), 0);
    const average = rows.reduce((total, row) => total + Number(row.average || 0), 0);
    const stock = rows.reduce((total, row) => total + Number(row.stock || 0), 0);
    const sales = rows.reduce((total, row) => total + Number(row.sales || 0), 0);
    const total = {
      ...Object.fromEntries(dimensions.map((field, index) => [field, index === 0 ? "TOTAL" : ""])),
      sales,
      lastSales,
      average,
      stock,
      wos: wosValue(stock, average),
      __total: true,
    };
    return [...rows, total];
  }

  function wosRows(rows, stockRows, weeks, dimensions, limit = 50000) {
    const weekIds = new Set(weeks.map((week) => week.SEMANA));
    const lastWeekId = weeks.at(-1)?.SEMANA;
    const salesByKey = new Map(
      aggregate(rows.filter((row) => weekIds.has(row.w)), dimensions).map((item) => [JSON.stringify(item.values), item.total]),
    );
    const lastSalesByKey = new Map(
      aggregate(rows.filter((row) => row.w === lastWeekId), dimensions).map((item) => [JSON.stringify(item.values), item.total]),
    );
    const stockByKey = new Map(aggregate(stockRows, dimensions, "q").map((item) => [JSON.stringify(item.values), item.total]));
    const keys = new Set([...salesByKey.keys(), ...stockByKey.keys()]);
    const detail = [...keys]
      .map((key) => {
        const values = JSON.parse(key);
        const sales = salesByKey.get(key) || 0;
        const lastSales = lastSalesByKey.get(key) || 0;
        const average = weeks.length ? sales / weeks.length : 0;
        const stock = stockByKey.get(key) || 0;
        const wos = wosValue(stock, average);
        return {
          ...Object.fromEntries(dimensions.map((field, index) => [field, values[index] || "-"])),
          sales,
          lastSales,
          average,
          stock,
          wos,
          __class: wosClass(wos),
        };
      })
      .filter((row) => row.sales || row.stock)
      .sort((a, b) => b.stock - a.stock || b.average - a.average || String(a.m || "").localeCompare(String(b.m || ""), "es"))
      .slice(0, limit);
    return totalWosRows(detail, dimensions);
  }

  function renderWos() {
    const weeks = lastCompleteWeeks(3);
    const rows = filteredRows(["year", "month", "week", "day", "weekday"]);
    const stockRows = latestStockRows();
    const dimensions = ["c", "rg", "p", "t", "st", "b", "m"];
    const labels = { c: "Canal", rg: "Regional", p: "Punto de venta", t: "Tipo", st: "Subtipo", b: "Marca", m: "Modelo" };
    const mainRows = wosRows(rows, stockRows, weeks, dimensions, 50000);
    const stockAlerts = totalWosRows(mainRows.filter((row) => !row.__total && row.wos != null && row.wos < 1.5), dimensions);
    const salesAlerts = totalWosRows(mainRows.filter((row) => !row.__total && row.wos != null && row.wos > 5), dimensions);
    const columns = [
      ...dimensions.map((field) => ({ key: field, label: labels[field] })),
      { key: "average", label: "Prom. 3 sem", numeric: true, format: decimal },
      { key: "lastSales", label: "Venta últ. sem.", numeric: true, format: number },
      { key: "stock", label: "Stock", numeric: true },
      { key: "wos", label: "WOS", numeric: true, format: wosFormat },
    ];
    renderPagedTable("table-wos-main", columns, mainRows, {
      stickyColumns: 7,
      pageKey: "wosMain",
      pagerId: "wos-main-pager",
      pageSize: 300,
    });
    renderPagedTable("table-wos-stock-alert", columns, stockAlerts, {
      stickyColumns: 3,
      pageKey: "wosStock",
      pagerId: "wos-stock-pager",
      pageSize: 300,
    });
    renderPagedTable("table-wos-sales-alert", columns, salesAlerts, {
      stickyColumns: 3,
      pageKey: "wosSales",
      pagerId: "wos-sales-pager",
      pageSize: 300,
    });

    const first = weeks[0];
    const last = weeks.at(-1);
    const scope = weeks.length && first && last ? `${weekLabels[first.SEMANA] || first.SEMANA} a ${weekLabels[last.SEMANA] || last.SEMANA} · Stock ${latestStockDate()}` : "Sin semanas completas";
    document.getElementById("wos-main-scope").textContent = scope;
    document.getElementById("wos-stock-scope").textContent = `${number(stockAlerts.filter((row) => !row.__total).length)} alertas`;
    document.getElementById("wos-sales-scope").textContent = `${number(salesAlerts.filter((row) => !row.__total).length)} alertas`;
  }

  function priceAtDate(points, date) {
    let price = null;
    for (const point of points || []) {
      if (point.d > date) break;
      price = point.p;
    }
    return price;
  }

  function historyDateLabel(date) {
    return new Date(`${date}T00:00:00Z`)
      .toLocaleDateString("es-PE", { day: "2-digit", month: "short", timeZone: "UTC" })
      .replace(".", "");
  }

  function renderPriceHistory(rows) {
    const history = DATA.priceHistory || {};
    const year = String(history.year || "");
    const yearRows = rows.filter((row) => row.y === year);
    const selectedMonths = state.month.size ? state.month : null;
    const dates = (history.dates || [])
      .filter((date) => date.startsWith(year))
      .filter((date) => !selectedMonths || selectedMonths.has(date.slice(5, 7)))
      .sort();
    const grouped = aggregate(yearRows, ["t", "st", "b", "m"]);
    const bySubtype = new Map();
    for (const item of grouped) {
      const [type, subtype, brand, model] = item.values;
      if (!history.models?.[model]) continue;
      const key = `${type}||${subtype}`;
      if (!bySubtype.has(key)) bySubtype.set(key, []);
      bySubtype.get(key).push({ type, subtype, brand, model, sales: item.total, points: history.models[model].points || [] });
    }
    const selected = [...bySubtype.values()].flatMap((items) =>
      items.sort((a, b) => b.sales - a.sales || a.model.localeCompare(b.model, "es")).slice(0, 5),
    );
    const output = selected.map((item) => {
      const row = { ...item };
      for (const date of dates) row[`price:${date}`] = priceAtDate(item.points, date);
      return row;
    });
    renderTable(
      "table-price-history",
      [
        { key: "type", label: "Tipo" },
        { key: "subtype", label: "Subtipo" },
        { key: "brand", label: "Marca" },
        { key: "model", label: "Modelo" },
        { key: "sales", label: "Ventas filtros", numeric: true },
        ...dates.map((date) => ({ key: `price:${date}`, label: historyDateLabel(date), numeric: true, format: currency })),
      ],
      output,
      { stickyColumns: 4, limit: 240 },
    );
    const scope = document.getElementById("price-history-scope");
    if (scope) scope.textContent = `${number(output.length)} modelos. ${number(dates.length)} fechas de precio en ${year}.`;
  }

  function renderKpis(rows) {
    const sales = sum(rows);
    const denominator = sum(filteredRows(["brand"]));
    const brands = aggregate(rows, ["b"]);
    const stockRows = latestStockRows();
    document.getElementById("kpi-sales").textContent = number(sales);
    document.getElementById("kpi-share").textContent = percent(denominator ? sales / denominator : 0);
    document.getElementById("kpi-brand").textContent = brands[0]?.values[0] || "-";
    document.getElementById("kpi-stock").textContent = number(sum(stockRows, "q"));
  }

  function selectedYearsForLoad() {
    return state.year.size ? [...state.year] : (DATA.lists?.years || []).map(String);
  }

  function render() {
    normalizeRows(DATA.rows);
    refreshFilters();
    const rows = filteredRows();
    renderKpis(rows);
    if (state.view === "mensual") renderMonthly(rows);
    if (state.view === "avances") renderWeekly(rows);
    if (state.view === "tiendas") renderStores(rows);
    if (state.view === "historico") renderPriceHistory(rows);
    if (state.view === "stock") renderStock(rows);
    if (state.view === "wos") renderWos();
    document.getElementById("source-label").textContent =
      `Actualizado ${new Date(DATA.meta.generated_at).toLocaleString("es-PE")} · ${number(DATA.meta.total_sales)} ventas · stock ${number(DATA.meta.stock_total)}`;
  }

  async function onFilterChange(name, select) {
    state[name] = selectedValues(select);
    state.pages = {};
    if (name === "year") {
      select.disabled = true;
      try {
        await window.ensureReportYears(selectedYearsForLoad());
        normalizeRows(DATA.rows);
      } finally {
        select.disabled = false;
      }
    }
    render();
  }

  function bindEvents() {
    for (const [name] of filterConfig) {
      const select = document.getElementById(`filter-${name}`);
      select.addEventListener("change", () => onFilterChange(name, select));
    }
    document.getElementById("reset-filters").addEventListener("click", async () => {
      for (const [name] of filterConfig) state[name].clear();
      state.pages = {};
      const latestYear = String((DATA.lists?.years || []).at(-1) || "");
      state.year = new Set([latestYear]);
      await window.ensureReportYears([latestYear]);
      normalizeRows(DATA.rows);
      render();
    });
    document.querySelectorAll(".tab").forEach((button) => {
      button.addEventListener("click", () => {
        state.view = button.dataset.view;
        state.pages = {};
        document.querySelectorAll(".tab").forEach((item) => item.classList.toggle("is-active", item === button));
        document.querySelectorAll(".view").forEach((view) => view.classList.toggle("is-active", view.id === `view-${state.view}`));
        render();
      });
    });
  }

  refreshFilters();
  bindEvents();
  render();
  if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => {});
})();
