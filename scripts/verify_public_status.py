from __future__ import annotations

import argparse
import json
import time
import urllib.request
from pathlib import Path


def fetch_status(url: str, request_id: str) -> dict:
    request = urllib.request.Request(
        f"{url.rstrip('/')}?cb={request_id}-{int(time.time())}",
        headers={"User-Agent": "ReporteShareMovilesVerifier/1.0", "Cache-Control": "no-cache"},
    )
    with urllib.request.urlopen(request, timeout=45) as response:
        return json.loads(response.read().decode("utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser(description="Confirma que Cloudflare publicó exactamente la actualización solicitada.")
    parser.add_argument("expected")
    parser.add_argument("--url", default="https://reporte-share-moviles.pages.dev/status.json")
    parser.add_argument("--wait-seconds", type=int, default=300)
    parser.add_argument("--interval-seconds", type=int, default=15)
    args = parser.parse_args()

    expected = json.loads(Path(args.expected).read_text(encoding="utf-8"))
    deadline = time.monotonic() + args.wait_seconds
    last = None
    last_error = None
    while time.monotonic() < deadline:
        try:
            last = fetch_status(args.url, str(expected["request_id"]))
            keys = [
                "request_id",
                "latest_oracle",
                "max_sales_date_mobile",
                "max_sales_date_accessories",
                "latest_price_list",
                "cruces_file_id",
            ]
            differences = {
                key: {"expected": expected.get(key), "public": last.get(key)}
                for key in keys
                if expected.get(key) != last.get(key)
            }
            if not differences:
                print(json.dumps({"verified": True, "public": last}, ensure_ascii=False, indent=2))
                return 0
            last_error = f"Contenido aún anterior: {differences}"
        except Exception as error:
            last_error = f"{type(error).__name__}: {error}"
        print(json.dumps({"verified": False, "waiting": last_error}, ensure_ascii=False), flush=True)
        time.sleep(args.interval_seconds)

    raise RuntimeError(
        "Cloudflare no mostró la actualización esperada dentro del plazo. "
        f"Último estado={last!r}. Último error={last_error}"
    )


if __name__ == "__main__":
    raise SystemExit(main())
