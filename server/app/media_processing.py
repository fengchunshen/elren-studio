"""Local video rendering from owned assets; no remote URLs or user supplied commands."""
import json
import math
import re
import logging
import shutil
import subprocess
import tempfile
import time
import uuid
from pathlib import Path
from sqlalchemy import select, or_, and_
from .assets import save_asset, asset_dict
from .config import settings
from .models import MediaJob, Asset


def job_dict(job):
    return {"id": job.id, "project_id": job.project_id, "status": job.status, "progress": job.progress, "result": job.result, "error": job.error}


def probe(path):
    result = subprocess.run(["ffprobe", "-v", "error", "-protocol_whitelist", "file,pipe", "-show_streams", "-show_format", "-of", "json", str(path)], capture_output=True, timeout=20, check=True)
    return json.loads(result.stdout)


def scene_boundaries(path, start, end):
    response = subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-protocol_whitelist", "file,pipe", "-i", str(path), "-vf", r"select=gt(scene\,0.35),showinfo", "-an", "-f", "null", "-"], capture_output=True, timeout=240, check=True)
    changes = [float(value) for value in re.findall(r"pts_time:([0-9.]+)", response.stderr.decode(errors="replace"))]
    points = [start]
    for value in changes:
        if value - points[-1] >= 1 and end - value >= 1:
            points.append(value)
    points.append(end)
    if len(points) > 101:
        raise ValueError("识别出的镜头过多，请先裁剪较短片段")
    return list(zip(points, points[1:]))


def validate_clips(db, user_id, project_id, clips, width, height):
    if not isinstance(clips, list) or not 1 <= len(clips) <= 100:
        raise ValueError("请添加 1–100 个视频片段")
    if width not in {720, 1080, 1280, 1920} or height not in {720, 1080, 1280, 1920}:
        raise ValueError("不支持的成片尺寸")
    normalized = []
    for item in clips:
        if not isinstance(item, dict) or set(item) - {"asset_id", "start", "end"}:
            raise ValueError("片段参数无效")
        asset = db.get(Asset, item.get("asset_id"))
        if not asset or asset.user_id != user_id or asset.project_id != project_id:
            raise ValueError("视频素材不属于当前项目")
        if not asset.mime.startswith("video/"):
            raise ValueError("时间线只接受视频素材")
        start, end = float(item.get("start", 0)), item.get("end")
        end = float(end) if end is not None else None
        if not math.isfinite(start) or start < 0 or (end is not None and (not math.isfinite(end) or end <= start)):
            raise ValueError("片段入点和出点无效")
        normalized.append({"asset_id": asset.id, "start": start, "end": end})
    return {"clips": normalized, "width": width, "height": height}


def claim_media_job(factory):
    with factory() as db:
        now = time.time()
        job = db.scalar(select(MediaJob).where(or_(MediaJob.status == "queued", and_(MediaJob.status == "running", MediaJob.lease_until < now))).order_by(MediaJob.created_at).with_for_update(skip_locked=True).limit(1))
        if not job:
            return None
        job.status, job.lease_until, job.lease_token = "running", now + 300, str(uuid.uuid4())
        db.commit()
        return job.id, job.lease_token


def execute_media_job(factory, identity, token):
    try:
        with factory() as db:
            job = db.get(MediaJob, identity)
            if not job or job.lease_token != token or job.status == "canceled":
                return
            payload = job.payload
            user_id, project_id = job.user_id, job.project_id
            clips = [(item, db.get(Asset, item["asset_id"])) for item in payload["clips"]]
        if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
            raise ValueError("视频处理服务尚未安装 FFmpeg")
        with tempfile.TemporaryDirectory(prefix="elren-video-") as directory:
            directory = Path(directory)
            if payload.get("operation") == "scene_split":
                clip, asset = clips[0]
                path = settings.asset_dir / asset.storage_key
                end = clip["end"] if clip["end"] is not None else float(probe(path)["format"]["duration"])
                clips = [({**clip, "start": start, "end": finish}, asset) for start, finish in scene_boundaries(path, clip["start"], end)]
            names = []
            for index, (clip, asset) in enumerate(clips):
                with factory() as db:
                    job = db.get(MediaJob, identity)
                    if job.lease_token != token or job.status == "canceled":
                        return
                    job.progress, job.lease_until = int(index * 85 / len(clips)), time.time() + 300
                    db.commit()
                path = settings.asset_dir / asset.storage_key
                metadata = probe(path)
                if not any(stream.get("codec_type") == "video" for stream in metadata.get("streams", [])):
                    raise ValueError("素材中没有可用的视频轨道")
                duration = float(metadata.get("format", {}).get("duration", 0))
                end = clip["end"] if clip["end"] is not None else duration
                if not math.isfinite(duration) or end > duration + 0.1 or clip["start"] >= duration:
                    raise ValueError("裁剪范围超出视频时长")
                has_audio = any(stream.get("codec_type") == "audio" for stream in metadata.get("streams", []))
                width, height = payload["width"], payload["height"]
                name = f"clip-{index}.mp4"
                command = ["ffmpeg", "-nostdin", "-v", "error", "-y", "-protocol_whitelist", "file,pipe", "-ss", str(clip["start"]), "-i", str(path)]
                if not has_audio:
                    command += ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"]
                command += ["-t", str(end - clip["start"]), "-map", "0:v:0", "-map", "0:a:0" if has_audio else "1:a:0", "-vf", f"scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", str(directory / name)]
                subprocess.run(command, capture_output=True, timeout=240, check=True)
                names.append(name)
            if payload.get("operation") == "scene_split":
                if sum((directory / name).stat().st_size for name in names) > settings.max_upload_bytes:
                    raise ValueError("分镜结果超过大小上限")
                with factory() as db:
                    job = db.scalar(select(MediaJob).where(MediaJob.id == identity).with_for_update())
                    if job.lease_token != token or job.status == "canceled":
                        return
                    outputs = [save_asset(db, user_id, project_id, (directory / name).read_bytes(), "video/mp4", f"scene-{index + 1}.mp4") for index, name in enumerate(names)]
                    job.result, job.status, job.progress = {"assets": [asset_dict(asset) for asset in outputs]}, "succeeded", 100
                    db.commit()
                return
            with factory() as db:
                job = db.get(MediaJob, identity)
                if job.lease_token != token or job.status == "canceled":
                    return
                job.lease_until = time.time() + 180
                db.commit()
            (directory / "clips.txt").write_text("\n".join(f"file '{name}'" for name in names))
            output = directory / "result.mp4"
            subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-protocol_whitelist", "file,pipe", "-f", "concat", "-safe", "1", "-i", str(directory / "clips.txt"), "-c", "copy", "-movflags", "+faststart", str(output)], capture_output=True, timeout=120, check=True)
            if output.stat().st_size > settings.max_upload_bytes:
                raise ValueError("成片超过素材大小上限，请缩短时间线或降低分辨率")
            with factory() as db:
                job = db.scalar(select(MediaJob).where(MediaJob.id == identity).with_for_update())
                if job.lease_token != token or job.status == "canceled":
                    return
                asset = save_asset(db, user_id, project_id, output.read_bytes(), "video/mp4", "timeline.mp4")
                job.result, job.status, job.progress = {"asset": asset_dict(asset)}, "succeeded", 100
                db.commit()
    except (ValueError, OSError, subprocess.SubprocessError, json.JSONDecodeError) as error:
        logging.getLogger("elren.media").warning("Media job %s failed: %s", identity, type(error).__name__)
        with factory() as db:
            job = db.get(MediaJob, identity)
            if job and job.lease_token == token and job.status != "canceled":
                job.status, job.error = "failed", "视频处理失败，请检查片段范围、文件格式或服务日志后重试"
                db.commit()
