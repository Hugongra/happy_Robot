"""Importa FastMCP del paquete PyPI evitando shadowing por la carpeta local `mcp/`."""

from __future__ import annotations

import sys
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from mcp.server.fastmcp import FastMCP as FastMCPType


def _norm_path(entry: str) -> str:
    if not entry:
        return ""
    try:
        return Path(entry).resolve().as_posix()
    except (OSError, ValueError):
        return entry.replace("\\", "/")


def prepare_pypi_mcp_import() -> Path:
    """Quita el paquete local `mcp` de sys.modules/sys.path."""
    mcp_dir = Path(__file__).resolve().parent
    repo_root = mcp_dir.parent
    mcp_dir_s = mcp_dir.as_posix()
    repo_s = repo_root.as_posix()
    remove_paths = {mcp_dir_s, repo_s}
    local_mcp_at_repo = (repo_root / "mcp" / "__init__.py").is_file()

    for name in list(sys.modules):
        if name != "mcp" and not name.startswith("mcp."):
            continue
        mod = sys.modules[name]
        mod_file = (getattr(mod, "__file__", "") or "").replace("\\", "/")
        mod_paths = getattr(mod, "__path__", None)
        local_paths = [p.replace("\\", "/") for p in mod_paths] if mod_paths else []
        is_local = mcp_dir_s in mod_file or any(
            p == mcp_dir_s or p.startswith(mcp_dir_s + "/") for p in local_paths
        )
        if is_local:
            del sys.modules[name]

    filtered: list[str] = []
    for entry in sys.path:
        if not entry:
            if local_mcp_at_repo:
                continue
            filtered.append(entry)
            continue
        if _norm_path(entry) not in remove_paths:
            filtered.append(entry)
    sys.path[:] = filtered
    return mcp_dir


def import_fastmcp_class() -> type[FastMCPType]:
    mcp_dir = prepare_pypi_mcp_import()
    from mcp.server.fastmcp import FastMCP

    if str(mcp_dir) not in sys.path:
        sys.path.insert(0, str(mcp_dir))
    return FastMCP
