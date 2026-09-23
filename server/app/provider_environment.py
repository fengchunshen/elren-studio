"""Load local provider credentials only in the worker; deployed workers use env_file."""
import os
from pathlib import Path


def read_provider_environment(path=None):
    path = Path(path) if path is not None else Path(__file__).resolve().parents[1] / '.env.providers'
    if not path.exists():
        return {}
    values = {}
    for raw in path.read_text().splitlines():
        line = raw.strip().removeprefix('export ')
        name, separator, value = line.partition('=')
        name, value = name.strip(), value.strip()
        if not separator or not name.startswith('ELREN_PROVIDER_') or not name.isidentifier():
            continue
        if value.startswith(('"', "'")):
            if len(value) < 2 or value[-1] != value[0]:
                raise ValueError('供应商凭据文件存在未闭合引号')
            value = value[1:-1]
        else:
            value = value.split(' #', 1)[0].rstrip()
        # Values are literal: never execute shell substitutions or print credentials.
        values[name] = value
    return values


def load_provider_environment(path=None):
    os.environ.update(read_provider_environment(path))
