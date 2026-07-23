from __future__ import annotations

import argparse
import base64
import gzip
import json
import re
import shutil
from collections import defaultdict
from pathlib import Path

from build_web_dashboard_data import build


def script_tag(src: str) -> str:
    return f'    <script src="{src}"></script>'


def encoded_payload(value: object) -> tuple[str, int, int]:
    raw = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    compressed = gzip.compress(raw, compresslevel=9, mtime=0)
    return base64.b64encode(compressed).decode("ascii"), len(raw), len(compressed)


def write_compressed_dashboard(input_json: Path, price_changes_json: Path, source_dir: Path, output_dir: Path) -> dict:
    output_dir.mkdir(parents=True, exist_ok=True)
    for old in [
        *output_dir.glob("data_rows_*.js"),
        output_dir / "data_head.js",
        output_dir / "data.js",
        output_dir / "data_compressed.js",
        output_dir / "data_core_compressed.js",
        output_dir / "loader.js",
    ]:
        if old.exists():
            old.unlink()

    for name in ["styles.css", "app.js", "manifest.webmanifest", "sw.js"]:
        shutil.copy2(source_dir / name, output_dir / name)

    payload = build(input_json, price_changes_json)
    cache_version = "".join(
        character
        for character in str(payload.get("meta", {}).get("generated_at", ""))
        if character.isdigit()
    ) or "1"
    rows_by_year: dict[str, list[dict]] = defaultdict(list)
    for row in payload.pop("rows"):
        rows_by_year[str(row.get("y") or "Sin año")].append(row)

    payload["rows"] = []
    core_encoded, core_json_bytes, core_compressed_bytes = encoded_payload(payload)
    (output_dir / "data_core_compressed.js").write_text(
        "window.REPORT_CORE_GZIP_BASE64=" + json.dumps(core_encoded, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )

    year_stats = {}
    for year, rows in sorted(rows_by_year.items()):
        encoded, json_bytes, compressed_bytes = encoded_payload(rows)
        (output_dir / f"data_rows_{year}.js").write_text(
            "window.REPORT_YEAR_GZIP_BASE64=window.REPORT_YEAR_GZIP_BASE64||{};"
            f"window.REPORT_YEAR_GZIP_BASE64[{json.dumps(year)}]={json.dumps(encoded, separators=(',', ':'))};\n",
            encoding="utf-8",
        )
        year_stats[year] = {
            "rows": len(rows),
            "json_mb": round(json_bytes / 1024 / 1024, 2),
            "compressed_mb": round(compressed_bytes / 1024 / 1024, 2),
        }

    years = [str(year) for year in payload.get("lists", {}).get("years", [])]
    latest_year = years[-1] if years else sorted(rows_by_year)[-1]
    year_files = {year: f"data_rows_{year}.js?v={cache_version}" for year in sorted(rows_by_year)}
    (output_dir / "loader.js").write_text(
        f"""(async function(){{
  const label = document.getElementById("source-label");
  if (label) label.textContent = "Cargando data del reporte...";
  if (!("DecompressionStream" in window)) {{
    throw new Error("Este navegador no soporta descompresion nativa del reporte.");
  }}

  const yearFiles = {json.dumps(year_files, ensure_ascii=False, separators=(",", ":"))};
  const latestYear = {json.dumps(latest_year)};
  window.REPORT_YEAR_GZIP_BASE64 = window.REPORT_YEAR_GZIP_BASE64 || {{}};
  window.REPORT_YEAR_ROWS = window.REPORT_YEAR_ROWS || {{}};

  async function unpack(encoded) {{
    const raw = atob(encoded || "");
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return JSON.parse(await new Response(stream).text());
  }}

  function loadScript(src) {{
    return new Promise((resolve, reject) => {{
      const script = document.createElement("script");
      script.src = src;
      script.onload = () => {{
        script.remove();
        resolve();
      }};
      script.onerror = () => {{
        script.remove();
        reject(new Error(`No se pudo descargar ${{src}}.`));
      }};
      document.head.appendChild(script);
    }});
  }}

  async function loadYear(year) {{
    if (window.REPORT_YEAR_ROWS[year]) return;
    const src = yearFiles[year];
    if (!src) throw new Error(`No hay datos disponibles para el año ${{year}}.`);
    if (!window.REPORT_YEAR_GZIP_BASE64[year]) await loadScript(src);
    window.REPORT_YEAR_ROWS[year] = await unpack(window.REPORT_YEAR_GZIP_BASE64[year]);
    delete window.REPORT_YEAR_GZIP_BASE64[year];
  }}

  window.REPORT_DATA = await unpack(window.REPORT_CORE_GZIP_BASE64 || "");
  delete window.REPORT_CORE_GZIP_BASE64;

  window.ensureReportYears = async function(years) {{
    const wanted = [...new Set((years || []).map(String))].filter((year) => yearFiles[year]);
    for (const year of wanted) await loadYear(year);
    for (const year of Object.keys(window.REPORT_YEAR_ROWS)) {{
      if (!wanted.includes(year)) delete window.REPORT_YEAR_ROWS[year];
    }}
    window.REPORT_DATA.rows = wanted.flatMap((year) => window.REPORT_YEAR_ROWS[year] || []);
    return window.REPORT_DATA.rows;
  }};

  await window.ensureReportYears([latestYear]);
  const script = document.createElement("script");
  script.src = "app.js?v={cache_version}";
  document.body.appendChild(script);
}})().catch((error) => {{
  console.error(error);
  const label = document.getElementById("source-label");
  if (label) label.textContent = "No se pudo cargar el reporte. Actualiza la página para intentar nuevamente.";
  const main = document.querySelector(".main");
  if (main) {{
    const message = document.createElement("p");
    message.className = "load-error";
    message.setAttribute("role", "alert");
    message.textContent = "Ocurrió un problema al cargar los datos del reporte.";
    main.prepend(message);
  }}
}});
""",
        encoding="utf-8",
    )

    html = (source_dir / "index.html").read_text(encoding="utf-8")
    scripts = "\n".join(
        [
            script_tag(f"data_core_compressed.js?v={cache_version}"),
            script_tag(f"data_rows_{latest_year}.js?v={cache_version}"),
            script_tag(f"loader.js?v={cache_version}"),
        ]
    )
    html = re.sub(r'href="styles\.css(?:\?v=[^"]+)?"', f'href="styles.css?v={cache_version}"', html)
    html = re.sub(
        r'\s*<script src="data_core_compressed\.js(?:\?v=[^"]+)?"></script>\n'
        r'\s*<script src="data_rows_[^"]+?\.js(?:\?v=[^"]+)?"></script>\n'
        r'\s*<script src="loader\.js(?:\?v=[^"]+)?"></script>',
        "\n" + scripts,
        html,
    )
    html = html.replace('    <script src="data.js"></script>\n    <script src="app.js"></script>', scripts)
    (output_dir / "index.html").write_text(html, encoding="utf-8")

    readme = output_dir / "README.md"
    readme.write_text(
        """# Reporte Share Moviles

Dashboard web estatico del reporte de ventas moviles.

Cloudflare Pages debe publicar esta carpeta tal como esta, sin build command.

Configuracion recomendada en Cloudflare Pages:

- Framework preset: None
- Build command: dejar vacio
- Build output directory: `/`
- Production branch: `main`
""",
        encoding="utf-8",
    )

    return {
        "rows": sum(len(rows) for rows in rows_by_year.values()),
        "output": str(output_dir),
        "latest_year": latest_year,
        "core_json_mb": round(core_json_bytes / 1024 / 1024, 2),
        "core_compressed_mb": round(core_compressed_bytes / 1024 / 1024, 2),
        "years": year_stats,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Construye una version comprimida del dashboard web.")
    parser.add_argument("input_json")
    parser.add_argument("price_changes_json")
    parser.add_argument("source_dir")
    parser.add_argument("output_dir")
    args = parser.parse_args()
    result = write_compressed_dashboard(Path(args.input_json), Path(args.price_changes_json), Path(args.source_dir), Path(args.output_dir))
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
