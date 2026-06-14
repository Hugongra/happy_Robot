"""Entry point for `python -m mcp.server` from the repository root."""

import sys
from pathlib import Path

_mcp_dir = Path(__file__).resolve().parent.parent
if str(_mcp_dir) not in sys.path:
    sys.path.insert(0, str(_mcp_dir))

from stdio_server import main

if __name__ == "__main__":
    main()
