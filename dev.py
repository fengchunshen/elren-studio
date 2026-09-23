"""Run the platform from source: ./start-dev.sh; stop with Ctrl+C or ./stop-dev.sh."""
import argparse
import fcntl
import filecmp
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import threading
import time
from urllib.request import urlopen
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent
SERVER = ROOT / "server"
PYTHON = SERVER / ".venv/bin/python"


def runtime_dir():
    path = SERVER / "data/dev"
    path.mkdir(parents=True, exist_ok=True)
    return path


def ensure_docker(environment):
    probe = subprocess.run(["docker", "info"], env=environment, stdout=subprocess.DEVNULL,
                           stderr=subprocess.DEVNULL, timeout=10)
    if probe.returncode:
        print("正在启动 Docker Desktop…", flush=True)
        run(["docker", "desktop", "start", "--timeout", "60"], environment)


def service_ready(url):
    try:
        with urlopen(url, timeout=1) as response:
            return response.status == 200
    except OSError:
        return False


def forward_logs(process, name, path):
    with path.open("a") as log:
        os.chmod(path, 0o600)
        log.write(f"\n--- {time.strftime('%Y-%m-%d %H:%M:%S')} ---\n")
        for line in process.stdout:
            log.write(line)
            log.flush()
            print(f"[{name}] {line}", end="", flush=True)


def start_all(ports, environment):
    environment = {**environment, "COMPOSE_ANSI": "never", "COMPOSE_PROGRESS": "plain"}
    directory = runtime_dir()
    children = []
    stopping = threading.Event()
    finished = threading.Event()
    socket_path = directory / "control.sock"
    database_managed = False
    old_handlers = {}
    with (directory / "run.lock").open("a+") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print("开发服务已经由一键脚本运行，无需重复启动。")
            return 0

        # The container API does not publish this host port. Detect a leftover
        # local API before changing any Docker services or database state.
        check_port(ports["API"])

        def signal_children(signum):
            for process in children:
                try:
                    os.killpg(process.pid, signum)
                except ProcessLookupError:
                    pass

        def request_stop(signum, frame):
            if stopping.is_set():
                print("强制结束本次启动的应用进程。", flush=True)
                signal_children(signal.SIGKILL)
            stopping.set()

        for signum in (signal.SIGINT, signal.SIGTERM):
            old_handlers[signum] = signal.signal(signum, request_stop)
        socket_path.unlink(missing_ok=True)
        control = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        control.bind(str(socket_path))
        os.chmod(socket_path, 0o600)
        control.listen(2)
        control.settimeout(0.5)

        def listen():
            while not finished.is_set():
                try:
                    connection, _ = control.accept()
                except (socket.timeout, OSError):
                    continue
                with connection:
                    connection.settimeout(1)
                    try:
                        if connection.recv(32).strip() == b"stop":
                            stopping.set()
                            connection.sendall(b"ok\n")
                    except OSError:
                        pass

        listener = threading.Thread(target=listen, daemon=True)
        listener.start()
        try:
            ensure_docker(environment)
            setup(ports, environment, announce=False)
            if stopping.is_set():
                database_managed = True
                return 0
            check_port(ports["WEB"])
            check_port(ports["API"])
            database_managed = True
            for name in ("api", "worker", "web"):
                process = subprocess.Popen([sys.executable, "-u", str(ROOT / "dev.py"), name],
                                           cwd=ROOT, env={**environment, "ELREN_DEV_SUPERVISOR_PID": str(os.getpid())}, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                           stderr=subprocess.STDOUT, text=True, bufsize=1, start_new_session=True)
                children.append(process)
                threading.Thread(target=forward_logs, args=(process, name, directory / f"{name}.log"), daemon=True).start()
            deadline = time.monotonic() + 45
            ready = False
            while not stopping.wait(0.25):
                failed = next((index for index, process in enumerate(children) if process.poll() is not None), None)
                if failed is not None:
                    print(f"{('api', 'worker', 'web')[failed]} 已退出，请检查 {directory} 中的日志。", flush=True)
                    return 1
                if not ready:
                    ready = service_ready(f"http://127.0.0.1:{ports['API']}/api/v1/health") and service_ready(f"http://localhost:{ports['WEB']}/api/v1/health")
                    if ready:
                        print(f"\n开发环境已启动：\n  前端：http://localhost:{ports['WEB']}\n  后端：http://127.0.0.1:{ports['API']}/docs\n  日志：{directory}\n热更新已开启。按 Ctrl+C 或执行 ./stop-dev.sh 停止全部服务。\n", flush=True)
                    elif time.monotonic() > deadline:
                        raise ValueError(f"服务未能就绪，请检查 {directory} 中的日志")
            return 0
        finally:
            print("正在停止本次启动的开发服务…", flush=True)
            signal_children(signal.SIGTERM)
            while any(process.poll() is None for process in children):
                time.sleep(0.2)
            if database_managed:
                try:
                    run(compose(True) + ["stop", "db"], environment)
                except subprocess.CalledProcessError:
                    print("数据库停止失败，请检查 Docker 状态；数据未删除。", flush=True)
            finished.set()
            listener.join(timeout=2)
            control.close()
            socket_path.unlink(missing_ok=True)
            for signum, handler in old_handlers.items():
                signal.signal(signum, handler)


def stop_all():
    directory = runtime_dir()
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as client:
        client.settimeout(3)
        try:
            client.connect(str(directory / "control.sock"))
            client.sendall(b"stop\n")
            if client.recv(32).strip() != b"ok":
                raise ValueError("停止请求未被确认")
        except (FileNotFoundError, ConnectionRefusedError):
            print("未发现一键启动的开发进程。手动启动的进程请在原终端按 Ctrl+C 停止。")
            return 0
    deadline = time.monotonic() + 30
    with (directory / "run.lock").open("a+") as lock:
        while True:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                print("前端、API、Worker 和数据库已停止，数据保留。")
                return 0
            except BlockingIOError:
                if time.monotonic() >= deadline:
                    print("停止请求已发送，正在等待当前工作步骤结束。")
                    return 0
                time.sleep(0.2)


def env_file(path):
    """Read literal dotenv values without executing shell code or expanding variables."""
    result = {}
    if not path.exists():
        return result
    for number, raw in enumerate(path.read_text().splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:]
        key, separator, value = line.partition("=")
        key, value = key.strip(), value.strip()
        if not separator or not key.isidentifier():
            raise ValueError(f"{path.name} 第 {number} 行不是 KEY=value 格式")
        if value.startswith(("'", '"')):
            if len(value) < 2 or value[-1] != value[0]:
                raise ValueError(f"{path.name} 第 {number} 行引号未闭合")
            value = value[1:-1]
        else:
            value = value.split(" #", 1)[0].rstrip()
        result[key] = value
    return result


def configuration():
    platform = env_file(SERVER / ".env.platform")
    password = platform.get("ELREN_DB_PASSWORD")
    if not password:
        raise ValueError("缺少 server/.env.platform 中的 ELREN_DB_PASSWORD，请恢复原有数据库连接配置。")
    overrides = env_file(SERVER / ".env.development")
    ports = {}
    for name, fallback in (("WEB", 8081), ("API", 8000), ("DB", 55432)):
        port = int(overrides.get(f"ELREN_DEV_{name}_PORT", fallback))
        if not 1024 <= port <= 65535:
            raise ValueError(f"ELREN_DEV_{name}_PORT 必须在 1024–65535 之间")
        ports[name] = port
    if len(set(ports.values())) != 3:
        raise ValueError("前端、API 和数据库必须使用不同端口")
    environment = os.environ.copy()
    # Build the connection from this project's credentials, not another shell's DATABASE_URL.
    environment.update({
        "ELREN_DB_PASSWORD": password,
        "ELREN_DEV_DB_PORT": str(ports["DB"]),
        "ELREN_DEV_API_URL": f"http://127.0.0.1:{ports['API']}",
        "DATABASE_URL": f"postgresql+psycopg://elren:{quote(password, safe='')}@127.0.0.1:{ports['DB']}/elren",
        "PUBLIC_ORIGIN": f"http://localhost:{ports['WEB']}",
        "COOKIE_SECURE": "false",
        "ASSET_DIR": str(SERVER / "data/assets"),
        "VITE_PLATFORM_MODE": "true",
        "PYTHONUNBUFFERED": "1",
    })
    return ports, environment


def compose(override=False):
    command = ["docker", "compose", "--env-file", str(SERVER / ".env.platform"),
               "-f", str(ROOT / "compose.platform.yaml")]
    if override:
        command += ["-f", str(ROOT / "compose.dev.yaml")]
    return command


def run(command, environment, cwd=ROOT, capture=False):
    return subprocess.run([str(part) for part in command], cwd=cwd, env=environment,
                          check=True, text=True, stdout=subprocess.PIPE if capture else None)


def check_port(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        try:
            probe.bind(("127.0.0.1", port))
        except OSError as error:
            raise ValueError(f"本机端口 {port} 已被占用；请检查对应进程，或在 server/.env.development 中修改端口。") from error


def copy_assets(environment):
    """Append existing container assets once; never overwrite differing local files."""
    destination = SERVER / "data/assets"
    marker = SERVER / "data/.docker-assets-imported"
    destination.mkdir(parents=True, exist_ok=True)
    if marker.exists():
        return
    container = run(compose() + ["ps", "-aq", "api"], environment, capture=True).stdout.strip()
    if not container:
        return
    with tempfile.TemporaryDirectory(prefix="elren-dev-assets-") as directory:
        run(["docker", "cp", f"{container}:/app/data/assets/.", directory], environment)
        files = []
        for path in Path(directory).rglob("*"):
            if path.is_symlink():
                raise ValueError("原素材目录存在符号链接，请先核对素材目录")
            if path.is_file():
                target = destination / path.relative_to(directory)
                if target.exists() and not filecmp.cmp(path, target, shallow=False):
                    raise ValueError(f"本机素材与容器素材重名且内容不同：{target.name}，未覆盖原文件")
                files.append((path, target))
        for source, target in files:
            if not target.exists():
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, target)
        marker.write_text("Copied existing Docker assets without removing the original volume.\n")


def require_environment():
    if not PYTHON.exists():
        raise ValueError("后端依赖尚未准备好，请先运行 npm run dev:setup")


def setup(ports, environment, announce=True):
    run(["docker", "info", "--format", "Docker engine: {{.ServerVersion}}"], environment)
    print("停止本项目的镜像应用服务，保留数据库与持久化卷。", flush=True)
    run(compose() + ["stop", "web", "api", "worker"], environment)
    copy_assets(environment)
    # A mapped database from an earlier setup can already own the requested port.
    mapping = subprocess.run(compose(True) + ["port", "db", "5432"], cwd=ROOT, env=environment,
                             text=True, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    mapped = mapping.stdout.strip() if mapping.returncode == 0 else ""
    if mapped not in {f"127.0.0.1:{ports['DB']}", f"0.0.0.0:{ports['DB']}"}:
        check_port(ports["DB"])
    run(compose(True) + ["up", "-d", "--no-deps", "--no-build", "--wait", "--wait-timeout", "60", "db"], environment)
    run(["uv", "sync", "--project", SERVER, "--frozen", "--cache-dir", SERVER / ".cache/uv"], environment)
    if not (ROOT / "node_modules/.bin/vite").exists():
        run(["npm", "ci"], environment)
    migrate(environment)
    if announce:
        print(f"\n开发环境就绪。前端 http://localhost:{ports['WEB']}，API http://127.0.0.1:{ports['API']}，数据库 127.0.0.1:{ports['DB']}。")
        print("分别开三个终端：npm run dev:web / npm run dev:api / npm run dev:worker")


def migrate(environment):
    require_environment()
    run([PYTHON, "-m", "alembic", "upgrade", "head"], environment, cwd=SERVER)


def code_stamp():
    return tuple(sorted((str(path), path.stat().st_mtime_ns) for path in (SERVER / "app").rglob("*.py")))


def supervisor_gone(environment):
    parent = environment.get("ELREN_DEV_SUPERVISOR_PID")
    return bool(parent and str(os.getppid()) != parent)


def supervised_command(command, environment):
    """Keep a parent watcher alive instead of exec-ing away its cleanup logic."""
    child = subprocess.Popen([str(part) for part in command], env=environment)
    stopping = threading.Event()
    old_handlers = {}

    def stop(signum, frame):
        stopping.set()

    for signum in (signal.SIGINT, signal.SIGTERM):
        old_handlers[signum] = signal.signal(signum, stop)
    try:
        while child.poll() is None:
            if stopping.wait(0.25) or supervisor_gone(environment):
                child.terminate()
                return child.wait()
        return child.returncode
    finally:
        if child.poll() is None:
            child.terminate()
            child.wait()
        for signum, handler in old_handlers.items():
            signal.signal(signum, handler)


def worker(environment):
    # Provider keys stay in the worker's environment and are never printed.
    environment.update({key: value for key, value in env_file(SERVER / ".env.providers").items()
                        if key.startswith("ELREN_PROVIDER_")})
    stopping = False
    child = None

    def stop(signum, frame):
        nonlocal stopping
        if stopping and child and child.poll() is None:
            child.kill()
        stopping = True

    for signum in (signal.SIGINT, signal.SIGTERM):
        signal.signal(signum, stop)

    def finish():
        if child and child.poll() is None:
            child.terminate()
            while child.poll() is None:
                time.sleep(0.2)

    try:
        stamp = code_stamp()
        child = subprocess.Popen([str(PYTHON), "-m", "app.worker"], cwd=SERVER, env=environment)
        print("Worker 已启动；Python 代码修改后，在当前工作步骤结束时自动重启。", flush=True)
        while not stopping:
            if supervisor_gone(environment):
                break
            if child.poll() is not None:
                return child.returncode
            if code_stamp() != stamp:
                print("检测到 Worker 代码变化，等待当前工作步骤结束…", flush=True)
                finish()
                if stopping:
                    break
                stamp = code_stamp()
                child = subprocess.Popen([str(PYTHON), "-m", "app.worker"], cwd=SERVER, env=environment)
                print("Worker 已加载最新代码。", flush=True)
            time.sleep(0.5)
    finally:
        finish()
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["all", "stop", "setup", "web", "api", "worker", "migrate"])
    args = parser.parse_args()
    if args.command == "stop":
        return stop_all()
    ports, environment = configuration()
    if args.command == "all":
        return start_all(ports, environment)
    if args.command == "setup":
        setup(ports, environment)
        return 0
    if args.command == "migrate":
        migrate(environment)
        return 0
    if args.command == "web":
        check_port(ports["WEB"])
        environment.pop("DATABASE_URL", None)
        environment.pop("ELREN_DB_PASSWORD", None)
        command = [shutil.which("node") or "node", str(ROOT / "node_modules/vite/bin/vite.js"),
                   "--host", "localhost", "--port", str(ports["WEB"]), "--strictPort"]
        os.chdir(ROOT)
    else:
        require_environment()
        if args.command == "worker":
            return worker(environment)
        check_port(ports["API"])
        command = [str(PYTHON), "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1",
                   "--port", str(ports["API"]), "--reload", "--reload-dir", str(SERVER / "app")]
        os.chdir(SERVER)
    if environment.get("ELREN_DEV_SUPERVISOR_PID"):
        return supervised_command(command, environment)
    os.execvpe(command[0], command, environment)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, FileNotFoundError) as error:
        print(f"开发启动失败：{error}", file=sys.stderr)
        sys.exit(1)
    except subprocess.CalledProcessError as error:
        print("开发准备未完成。请根据上面的输出检查 Docker、端口或依赖。", file=sys.stderr)
        sys.exit(error.returncode)
