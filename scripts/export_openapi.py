from __future__ import annotations

import json
from pathlib import Path

from smart_gate.config import Settings
from smart_gate.main import create_app


def main() -> None:
    app = create_app(Settings(_env_file=None, APP_ENV="test"))
    target = Path("docs/openapi.json")
    target.write_text(json.dumps(app.openapi(), ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Đã ghi {target}")


if __name__ == "__main__":
    main()
