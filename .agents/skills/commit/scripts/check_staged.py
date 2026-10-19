#!/usr/bin/env python3
"""Check the staged changes of the Elren Studio repository before committing.

Prints 错误 (must fix before committing), 提醒 (judge case by case) and 建议测试
(commands matching the changed areas). Exits with status 1 when any 错误 is found.
"""
import os
import re
import subprocess
import sys
from pathlib import Path, PurePosixPath
from urllib.parse import unquote

MB = 1024 * 1024
FORBIDDEN = [
    (re.compile(r'(^|/)\.env(\.(?!example$)[^/]*)?$'), '环境变量文件可能含密钥'),
    (re.compile(r'(^|/)secrets/'), '密钥目录'),
    (re.compile(r'^server/data/'), '运行数据、日志和素材'),
    (re.compile(r'^CLAUDE\.md$'), '本机协作说明，按约定不提交'),
    (re.compile(r'(^|/)AGENTS\.md$'), '本机协作说明，按约定不提交'),
    (re.compile(r'^dist/'), '构建产物'),
    (re.compile(r'(^|/)(node_modules|\.venv|__pycache__)/|\.pyc$'), '依赖或缓存'),
    (re.compile(r'(^|/)\.DS_Store$'), '系统文件'),
    (re.compile(r'\.(dump|sqlite3?|db)$'), '数据库文件'),
]
SECRET = re.compile(
    r'sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_\w{20,}'
    r'|xox[abprs]-[A-Za-z0-9-]{10,}|Bearer\s+[A-Za-z0-9._~+/-]{30,}'
    r'|(?i:api[_-]?key|secret|password|passwd|token|sessionid)["\']?\s*[:=]\s*["\']?[A-Za-z0-9/+_.~-]{16,}')
PLACEHOLDER = re.compile(r'YOUR_|<[^>]+>|\$\{|process\.env|os\.getenv|example|test-|not-a-real|redacted|\*{4,}', re.I)
# The old project name may only appear in the migration code and its documentation (see CLAUDE.md).
OLD_NAME = re.compile('tapnow', re.I)
OLD_NAME_ALLOWED = (
    'src/services/legacyStorage.js', 'tests/legacy-storage.test.js',
    'localserver/elren-server-full.py', 'localserver/LocalServer_README.md', 'localserver/Docker_README.md',
    'server/migrations/versions/0004_elren_credential_names.py', 'server/tests/test_legacy_names.py',
    'server/README.md', '.agents/skills/commit/',
    'docs/research/reference-workflow-methodology-2026-09-29.md',
)
LINK = re.compile(r'\]\(([^)\s]+)\)')
FRONTEND_WIDE = ('package.json', 'package-lock.json', 'vite.config.js', 'vitest.config.js', 'tailwind.config.js',
                 'postcss.config.js', 'index.html', 'tests/setup.js', 'jsconfig.json', 'components.json',
                 'scripts/elren-boot-splash.mjs')


def is_ui(path):
    """Changes that alter what the page shows: components, styles, copy, theme and the boot page."""
    return path == 'index.html' or path.startswith('src/i18n/') or path == 'src/lib/theme.js' or (
        path.startswith('src/') and path.endswith(('.jsx', '.css')))


def heading_anchors(text):
    """Approximate GitHub heading anchors of a Markdown document."""
    anchors, seen, fenced = set(), {}, False
    for line in text.splitlines():
        if line.lstrip().startswith('```'):
            fenced = not fenced
            continue
        match = None if fenced else re.match(r'#{1,6}\s+(.*?)\s*#*\s*$', line)
        if not match:
            continue
        slug = re.sub(r'[^\w\- ]', '', re.sub(r'<[^>]+>', '', match.group(1)).strip().lower()).replace(' ', '-')
        count = seen.get(slug, 0)
        anchors.add(slug if count == 0 else f'{slug}-{count}')
        seen[slug] = count + 1
    return anchors


def read_markdown(path, index_files):
    if path in index_files:
        return git('show', f':{path}')
    return Path(path).read_text(encoding='utf-8') if Path(path).is_file() else ''


def git(*args):
    return subprocess.run(['git', '-c', 'core.quotePath=false', *args], capture_output=True, text=True, check=True).stdout


def staged():
    """Return (status, path) for staged entries; renames report their destination."""
    fields = git('diff', '--cached', '--name-status', '-z', '--no-renames').split('\0')
    entries, index = [], 0
    while index < len(fields) - 1:
        status, path = fields[index], fields[index + 1]
        entries.append((status[0], path))
        index += 2
    return entries


def added_lines():
    """Yield (path, line) for every line added in the staged diff."""
    path = None
    for line in git('diff', '--cached', '-U0', '--no-color', '--no-renames').splitlines():
        if line.startswith('+++ '):
            path = line[6:] if line.startswith('+++ b/') else None
        elif line.startswith('+') and path:
            yield path, line[1:]


def main():
    os.chdir(git('rev-parse', '--show-toplevel').strip())
    entries = staged()
    if not entries:
        print('暂存区为空：先用 git add <路径> 暂存本次要提交的文件。')
        return 1
    present = [path for status, path in entries if status != 'D']
    index_files = set(git('ls-files').splitlines())
    errors, warnings = [], []

    for path in present:
        for pattern, reason in FORBIDDEN:
            if pattern.search(path):
                errors.append(f'{path}：{reason}，不应提交')
        if OLD_NAME.search(path):
            errors.append(f'{path}：文件名含旧项目名')
        size = int(git('cat-file', '-s', f':{path}').strip() or 0)
        if size > 50 * MB:
            errors.append(f'{path}：{size / MB:.1f} MB，超过 GitHub 建议上限')
        elif size > 5 * MB:
            warnings.append(f'{path}：{size / MB:.1f} MB，确认确实需要纳入版本库')

    for path, line in added_lines():
        if SECRET.search(line) and not PLACEHOLDER.search(line):
            errors.append(f'{path}：新增内容疑似密钥：{line.strip()[:80]}')
        if OLD_NAME.search(line) and not path.startswith(OLD_NAME_ALLOWED):
            errors.append(f'{path}：新增内容含旧项目名：{line.strip()[:80]}')

    for path in present:
        if not path.endswith('.md'):
            continue
        text = git('show', f':{path}')
        for target in LINK.findall(text):
            if re.match(r'^[a-z][a-z0-9+.-]*:', target, re.I):
                continue
            relative, _, anchor = (unquote(part) for part in target.partition('#'))
            resolved = os.path.normpath(str(PurePosixPath(path).parent / relative)) if relative else path
            in_index = resolved in index_files or any(item.startswith(resolved.rstrip('/') + '/') for item in index_files)
            if not os.path.exists(resolved):
                errors.append(f'{path}：链接目标不存在 {target}')
                continue
            if not in_index:
                warnings.append(f'{path}：链接目标 {target} 未纳入版本库，提交后链接会失效')
            if anchor and resolved.endswith('.md') and anchor.lower() not in heading_anchors(read_markdown(resolved, index_files)):
                warnings.append(f'{path}：链接锚点可能不存在 {target}（按 GitHub 规则近似判断）')

    paths = [path for _, path in entries]
    if 'server/app/models.py' in present and not any(
            status == 'A' and path.startswith('server/migrations/versions/') for status, path in entries):
        warnings.append('server/app/models.py 有改动但没有新增 Alembic 迁移；如改了表结构需补迁移')
    if any(is_ui(p) for p in present):
        warnings.append('包含界面改动（组件、样式、文案或主题）：“验证”行要写明浏览器是否已验证（见 docs/frontend-ui.md）')

    commands = []
    if any(p in FRONTEND_WIDE for p in paths):
        commands.append('npx vitest run --no-file-parallelism   # 构建或测试配置有变，跑前端全量（约 11 分钟，可后台）')
        commands.append('VITE_PLATFORM_MODE=true npx vite build --outDir "$(mktemp -d)"   # 确认仍能构建')
    else:
        sources = [p for p in present if p.startswith('src/') and p.endswith(('.js', '.jsx'))]
        tests = [p for p in present if p.startswith('tests/') and '.test.' in p]
        if sources:
            commands.append('npx vitest related --run ' + ' '.join(sources) + '   # 涉及 App.jsx 时约 2 分钟')
        if tests:
            commands.append('npx vitest run ' + ' '.join(tests))
    if any(p.startswith('server/') or p == 'dev.py' for p in paths):
        commands.append('(cd server && uv run --frozen pytest -q)')
    local_py = [p for p in present if p.startswith('localserver/') and p.endswith('.py')]
    if local_py:
        commands.append('python3 -c "import ast, sys; [ast.parse(open(f).read(), f) for f in sys.argv[1:]]" ' + ' '.join(local_py))
    if any(p.startswith('docker/') or p in ('compose.platform.yaml', 'compose.dev.yaml', 'docker-compose.yml') for p in paths):
        commands.append('docker compose -f docker-compose.yml config --quiet')
        commands.append('docker compose --env-file server/.env.platform -f compose.platform.yaml -f compose.dev.yaml config --quiet')

    for title, items in (('错误', errors), ('提醒', warnings)):
        for item in dict.fromkeys(items):
            print(f'[{title}] {item}')
    if commands:
        print('[建议测试]')
        for command in commands:
            print(f'  {command}')
    elif not errors:
        print('[建议测试] 仅文档或说明改动，脚本已检查链接与锚点，无需运行测试')
    print(f'共 {len(entries)} 个暂存项，{len(errors)} 个错误，{len(warnings)} 个提醒。')
    return 1 if errors else 0


if __name__ == '__main__':
    sys.exit(main())
