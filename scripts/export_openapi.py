from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from smart_gate.config import Settings
from smart_gate.main import create_app


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="Xuất hoặc kiểm tra OpenAPI runtime")
    parser.add_argument("--output", type=Path, default=Path("docs/openapi.json"))
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    app = create_app(Settings(_env_file=None, APP_ENV="test"))
    schema = app.openapi()
    target = args.output
    if args.check:
        if not target.is_file() or json.loads(target.read_text(encoding="utf-8")) != schema:
            parser.exit(1, f"Contract drift: {target} khác OpenAPI runtime; xuất lại và review.\n")
        print(f"OpenAPI runtime khớp {target}")
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(schema, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Đã ghi {target}")


if __name__ == "__main__":
    main()
