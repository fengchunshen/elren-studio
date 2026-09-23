import logging
import signal
import threading
import time
import uuid
import httpx
from sqlalchemy import select, update
from .db import Session
from .models import Task, Attempt, Channel, User, Asset
from .pricing import current_price, snapshot
from .services import record_usage
from .assets import save_asset, asset_dict
from .providers import invoke, interpret, normalized_usage, download_output, ProviderPreflightError
from .provider_errors import provider_failure_message
from .task_recovery import recovery_mode, recovery_message

logger = logging.getLogger("elren.worker")
LEASE_SECONDS = 180


def claim():
    with Session() as db:
        now = time.time()
        # Expired submissions are ambiguous, never put them back into the submit queue.
        db.execute(update(Task).where(Task.status == "submitting", Task.lease_until < now).values(status="reconciling", lease_token=None, lease_until=0))
        candidates = list(db.scalars(select(Task).where(Task.status.in_(["queued", "running", "reconciling"]),
                        Task.next_at <= now, Task.lease_until <= now).order_by(Task.next_at, Task.created_at).limit(30).with_for_update(skip_locked=True)))
        for task in candidates:
            channel = db.scalar(select(Channel).where(Channel.id == task.offering_snapshot["channel_id"]).with_for_update(skip_locked=True))
            if not channel:
                continue
            user = db.get(User, task.user_id)
            if task.status == "queued" and (not user.active or not channel.active):
                task.status, task.billing_status, task.cost_status = "canceled", "not_billable", "not_incurred"
                task.finished_at = now
                continue
            attempt = db.scalar(select(Attempt).where(Attempt.task_id == task.id))
            if task.status == "reconciling" and recovery_mode(task.offering_snapshot, attempt) == "manual":
                # Manual work has no automatic HTTP action. Keep it out of the
                # hot queue; an administrator supplying a job ID resets next_at.
                task.next_at = now + 86400
                continue
            if task.status == "queued":
                candidates_in_channel = db.execute(select(Task, Attempt).join(Attempt, Attempt.task_id == Task.id).where(
                    Attempt.channel_id == channel.id, Task.status.in_(["submitting", "running", "reconciling"]))).all()
                running = sum(1 for active_task, active_attempt in candidates_in_channel
                              if active_task.status != "reconciling" or active_task.lease_until > now
                              or recovery_mode(active_task.offering_snapshot, active_attempt) != "manual")
                if running >= channel.concurrency:
                    continue
                cost = current_price(db, task.offering_id, "cost")
                if not cost:
                    continue
                attempt = Attempt(task_id=task.id, channel_id=channel.id, cost_snapshot=snapshot(cost))
                db.add(attempt)
                task.status = "submitting"
            token = str(uuid.uuid4())
            task.lease_token, task.lease_until = token, now + LEASE_SECONDS
            db.commit()
            return task.id, token
        db.commit()
    return None


def heartbeat(identity, token, stop):
    while not stop.wait(20):
        try:
            with Session() as db:
                db.execute(update(Task).where(Task.id == identity, Task.lease_token == token).values(lease_until=time.time() + LEASE_SECONDS))
                db.commit()
        except Exception:
            logger.exception("lease renewal failed task=%s", identity)


def execute(identity, token, client=None):
    stop = threading.Event()
    thread = threading.Thread(target=heartbeat, args=(identity, token, stop), daemon=True)
    thread.start()
    try:
        with Session() as db:
            task = db.get(Task, identity)
            if not task or task.lease_token != token:
                return
            attempt = db.scalar(select(Attempt).where(Attempt.task_id == identity))
            channel = db.get(Channel, attempt.channel_id)
            try:
                # A saved successful response is replayed only to persist assets and meter usage.
                replay = attempt.state == "response_received" and attempt.response and interpret(task.offering_snapshot, attempt.response, bool(attempt.remote_id))["state"] in {"succeeded", "failed"}
                if replay:
                    status_code, response, request_id = 200, attempt.response, attempt.request_id
                else:
                    status_code, response, request_id = invoke(db, task, attempt, channel, bool(attempt.remote_id), client)
                task = db.scalar(select(Task).where(Task.id == identity).with_for_update().execution_options(populate_existing=True))
                if task.lease_token != token:
                    return
                attempt.response, attempt.request_id = response, request_id or attempt.request_id
                attempt.state = "response_received" if 200 <= status_code < 300 else "unknown" if status_code >= 500 else "rejected"
                outcome = interpret(task.offering_snapshot, response, bool(attempt.remote_id))
                if outcome.get("remote_id"):
                    attempt.remote_id = outcome["remote_id"]
                if status_code >= 400:
                    if attempt.remote_id or status_code >= 500:
                        task.status, task.next_at = "reconciling", time.time() + 30
                        task.error = recovery_message(recovery_mode(task.offering_snapshot, attempt), response)
                    else:
                        task.status, task.billing_status = "failed", "not_billable"
                        task.error = provider_failure_message(response, f"上游请求失败（HTTP {status_code}）")
                        task.finished_at = time.time()
                        meters, raw = normalized_usage(task.offering_snapshot, response)
                        record_usage(db, task, attempt, meters, raw, billable=False)
                    db.commit()
                    return
                task.status = outcome["state"] if outcome["state"] in {"running", "reconciling"} else "reconciling"
                task.next_at = time.time() + 5
                # Persist upstream evidence before accessing temporary media URLs.
                db.commit()
                if outcome["state"] in {"running", "reconciling"}:
                    return
                if outcome["state"] == "failed":
                    task.status = "failed"
                    task.billing_status = "not_billable"
                    task.error = provider_failure_message(response, "上游未返回有效结果")
                    meters, raw = normalized_usage(task.offering_snapshot, response)
                    record_usage(db, task, attempt, meters, raw, billable=False)
                else:
                    outputs = []
                    for index, url in enumerate(outcome.get("outputs", [])):
                        asset = db.scalar(select(Asset).where(Asset.task_id == identity, Asset.output_index == index))
                        if not asset:
                            data, mime = download_output(url, channel, client)
                            asset = save_asset(db, task.user_id, task.project_id, data, mime, f"output-{index + 1}", identity, index)
                            db.commit()
                        outputs.append(asset)
                    task = db.scalar(select(Task).where(Task.id == identity).with_for_update().execution_options(populate_existing=True))
                    if task.lease_token != token:
                        return
                    task.result = {"text": outcome.get("text", ""), "assets": [asset_dict(asset) for asset in outputs]}
                    requested = task.payload["input"].get("parameters", {}).get("n", task.payload["input"].get("parameters", {}).get("count", 1))
                    task.status = "partially_succeeded" if outputs and len(outputs) < requested else "succeeded"
                    meters, raw = normalized_usage(task.offering_snapshot, response, outputs, task.payload["input"])
                    record_usage(db, task, attempt, meters, raw)
                    task.error = None
                task.finished_at = time.time()
                attempt.state = task.status
                db.commit()
            except ProviderPreflightError as error:
                db.rollback()
                task = db.scalar(select(Task).where(Task.id == identity).with_for_update().execution_options(populate_existing=True))
                attempt = db.scalar(select(Attempt).where(Attempt.task_id == identity))
                if task.lease_token == token:
                    if attempt.remote_id:
                        task.status, task.next_at = "reconciling", time.time() + 30
                    else:
                        task.status, task.billing_status, task.cost_status = "failed", "not_billable", "not_incurred"
                        task.finished_at, attempt.state = time.time(), "preflight_rejected"
                    task.error = str(error)
                    db.commit()
            except (httpx.HTTPError, ValueError, OSError) as error:
                db.rollback()
                task = db.scalar(select(Task).where(Task.id == identity).with_for_update().execution_options(populate_existing=True))
                if task.lease_token == token:
                    task.status, task.next_at = "reconciling", time.time() + 30
                    task.error = recovery_message(recovery_mode(task.offering_snapshot, attempt), attempt.response)
                    db.commit()
                logger.warning("task=%s awaiting reconciliation error_type=%s", identity, type(error).__name__)
    finally:
        stop.set()
        thread.join(timeout=1)
        with Session() as db:
            db.execute(update(Task).where(Task.id == identity, Task.lease_token == token).values(lease_until=0, lease_token=None))
            db.commit()


def main():
    from .provider_environment import load_provider_environment
    load_provider_environment()
    logging.basicConfig(level=logging.INFO)
    # Provider output URLs can contain temporary access signatures.
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    stopping = threading.Event()
    def request_stop(signum, frame):
        stopping.set()
    for signum in (signal.SIGINT, signal.SIGTERM):
        signal.signal(signum, request_stop)
    from .media_processing import claim_media_job, execute_media_job
    def media_loop():
        while not stopping.is_set():
            try:
                job = claim_media_job(Session)
                if job:
                    execute_media_job(Session, *job)
                else:
                    stopping.wait(1)
            except Exception:
                logger.exception("media worker cycle failed")
                stopping.wait(5)
    threading.Thread(target=media_loop, daemon=False, name="media-render").start()
    while not stopping.is_set():
        try:
            claimed = claim()
            if claimed:
                execute(*claimed)
            else:
                stopping.wait(1)
        except KeyboardInterrupt:
            break
        except Exception:
            logger.exception("worker cycle failed")
            stopping.wait(2)


if __name__ == "__main__":
    main()
