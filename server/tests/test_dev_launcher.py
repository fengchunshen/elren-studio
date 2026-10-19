import importlib.util
import hashlib
import os
from pathlib import Path
import sys
from types import SimpleNamespace

import pytest

spec = importlib.util.spec_from_file_location("elren_dev", Path(__file__).resolve().parents[2] / "dev.py")
dev = importlib.util.module_from_spec(spec)
# Importing dev.py must not leave a __pycache__ in the repository root.
write_bytecode, sys.dont_write_bytecode = sys.dont_write_bytecode, True
spec.loader.exec_module(dev)
sys.dont_write_bytecode = write_bytecode


def test_env_values_are_literal(tmp_path):
    path = tmp_path / ".env"
    path.write_text("# comment\nexport KEY='a#b$(touch never)'\nPORT=8081 # note\n")
    assert dev.env_file(path) == {"KEY": "a#b$(touch never)", "PORT": "8081"}


def test_project_credentials_and_ports_override_other_project_shell(tmp_path, monkeypatch):
    monkeypatch.setattr(dev, "SERVER", tmp_path)
    monkeypatch.setenv("DATABASE_URL", "postgresql://other-project/private")
    (tmp_path / ".env.platform").write_text("ELREN_DB_PASSWORD='a@b:c/#'\n")
    (tmp_path / ".env.development").write_text("ELREN_DEV_API_PORT=18000\n")
    ports, environment = dev.configuration()
    assert ports == {"WEB": 8081, "API": 18000, "DB": 55432}
    assert environment["DATABASE_URL"] == "postgresql+psycopg://elren:a%40b%3Ac%2F%23@127.0.0.1:55432/elren"
    assert environment["PUBLIC_ORIGIN"] == "http://localhost:8081"
    assert environment["ELREN_DEV_API_URL"] == "http://127.0.0.1:18000"
    assert environment["ASSET_DIR"] == str(tmp_path / "data/assets")


def test_duplicate_ports_are_rejected(tmp_path, monkeypatch):
    monkeypatch.setattr(dev, "SERVER", tmp_path)
    (tmp_path / ".env.platform").write_text("ELREN_DB_PASSWORD=example\n")
    (tmp_path / ".env.development").write_text("ELREN_DEV_API_PORT=8081\n")
    with pytest.raises(ValueError, match="不同端口"):
        dev.configuration()


def test_assets_conflict_does_not_overwrite_local_file(tmp_path, monkeypatch):
    monkeypatch.setattr(dev, "SERVER", tmp_path)
    destination = tmp_path / "data/assets"
    destination.mkdir(parents=True)
    (destination / "asset-id").write_bytes(b"existing local asset")
    def command(args, environment, capture=False):
        if "ps" in args:
            return SimpleNamespace(stdout="existing-container")
        (Path(args[-1]) / "asset-id").write_bytes(b"different container asset")
        return SimpleNamespace(stdout="")
    monkeypatch.setattr(dev, "run", command)
    with pytest.raises(ValueError, match="未覆盖"):
        dev.copy_assets({})
    assert (destination / "asset-id").read_bytes() == b"existing local asset"
    assert not (tmp_path / "data/.docker-assets-imported").exists()


def test_worker_watch_ignores_data_files(tmp_path, monkeypatch):
    monkeypatch.setattr(dev, "SERVER", tmp_path)
    (tmp_path / "app").mkdir()
    source = tmp_path / "app/worker.py"
    source.write_text("pass\n")
    before = dev.code_stamp()
    (tmp_path / "data").mkdir()
    (tmp_path / "data/example").write_text("asset")
    assert dev.code_stamp() == before
    timestamp = source.stat().st_mtime_ns + 1_000_000
    os.utime(source, ns=(timestamp, timestamp))
    assert dev.code_stamp() != before


def test_supervisor_loss_uses_parent_identity(monkeypatch):
    monkeypatch.setattr(dev.os, 'getppid', lambda: 123)
    assert not dev.supervisor_gone({})
    assert not dev.supervisor_gone({'ELREN_DEV_SUPERVISOR_PID': '123'})
    assert dev.supervisor_gone({'ELREN_DEV_SUPERVISOR_PID': '456'})


def test_api_conflict_is_reported_before_docker_changes(tmp_path, monkeypatch):
    monkeypatch.setattr(dev, 'runtime_dir', lambda: tmp_path)
    docker_calls = []
    monkeypatch.setattr(dev, 'ensure_docker', lambda env: docker_calls.append('docker'))
    def occupied(port):
        raise ValueError('port occupied')
    monkeypatch.setattr(dev, 'check_port', occupied)
    with pytest.raises(ValueError, match='port occupied'):
        dev.start_all({'API':8000,'WEB':8081}, {})
    assert docker_calls == []
    assert not (tmp_path/'control.sock').exists()


def test_setup_rejects_running_app_containers_before_starting_database(monkeypatch):
    commands = []
    monkeypatch.setattr(dev, "ensure_docker", lambda env: None)
    def run(args, environment, capture=False):
        commands.append(args)
        if "ps" in args:
            return SimpleNamespace(stdout="worker\nweb\n")
        return SimpleNamespace(stdout="")
    monkeypatch.setattr(dev, "run", run)
    with pytest.raises(ValueError, match="worker, web"):
        dev.setup({"DB": 55432, "WEB": 8081, "API": 8000}, {})
    assert not any("up" in command or "stop" in command for command in commands)


def test_setup_starts_only_database_without_stopping_app_containers(tmp_path, monkeypatch):
    root = tmp_path
    server = root / "server"
    runtime = server / "agent-runtime"
    runtime.mkdir(parents=True)
    (root / "node_modules/.bin").mkdir(parents=True)
    (root / "node_modules/.bin/vite").touch()
    lock = runtime / "package-lock.json"
    lock.write_text("{}")
    marker = runtime / "node_modules/.elren-lock.sha256"
    marker.parent.mkdir()
    marker.write_text(hashlib.sha256(lock.read_bytes()).hexdigest())
    monkeypatch.setattr(dev, "ROOT", root)
    monkeypatch.setattr(dev, "SERVER", server)
    monkeypatch.setattr(dev, "ensure_docker", lambda env: None)
    monkeypatch.setattr(dev, "copy_assets", lambda env: None)
    monkeypatch.setattr(dev, "check_port", lambda port: None)
    monkeypatch.setattr(dev, "migrate", lambda env: None)
    commands = []
    def run(args, environment, capture=False):
        commands.append(args)
        return SimpleNamespace(stdout="")
    monkeypatch.setattr(dev, "run", run)
    monkeypatch.setattr(dev.subprocess, "run", lambda *args, **kwargs: SimpleNamespace(returncode=1, stdout=""))
    dev.setup({"DB": 55432, "WEB": 8081, "API": 8000}, {}, announce=False)
    up = [command for command in commands if "up" in command]
    assert len(up) == 1
    assert up[0][-1] == "db"
    assert str(root / "compose.dev.yaml") in up[0]
    assert not any("stop" in command for command in commands)


def test_api_and_web_children_are_terminated_when_supervisor_disappears(monkeypatch):
    class Child:
        returncode = None
        terminated = False
        def poll(self): return self.returncode
        def terminate(self): self.terminated = True; self.returncode = 0
        def wait(self): return self.returncode
    child = Child()
    monkeypatch.setattr(dev.subprocess, 'Popen', lambda *args, **kwargs: child)
    monkeypatch.setattr(dev, 'supervisor_gone', lambda env: True)
    assert dev.supervised_command(['example'], {'ELREN_DEV_SUPERVISOR_PID':'123'}) == 0
    assert child.terminated


def test_worker_finishes_current_child_when_supervisor_disappears(monkeypatch):
    class Child:
        returncode = None
        terminated = False
        def poll(self): return self.returncode
        def terminate(self): self.terminated = True; self.returncode = 0
    child = Child()
    monkeypatch.setattr(dev.subprocess, 'Popen', lambda *args, **kwargs: child)
    monkeypatch.setattr(dev, 'env_file', lambda path: {})
    monkeypatch.setattr(dev, 'code_stamp', lambda: ())
    monkeypatch.setattr(dev, 'supervisor_gone', lambda env: True)
    assert dev.worker({'ELREN_DEV_SUPERVISOR_PID':'123'}) == 0
    assert child.terminated
