import base64
import hashlib
import io
import uuid
from pathlib import Path
from PIL import Image
from .config import settings
from .models import Asset


def save_asset(db, user_id, project_id, data, mime, name="asset", task_id=None, output_index=None):
    if not data or len(data) > settings.max_upload_bytes:
        raise ValueError("文件为空或超过 100 MB")
    if data[:4] == b"glTF":
        mime = "model/gltf-binary"
    if mime.startswith("image/"):
        with Image.open(io.BytesIO(data)) as image:
            image.verify()
            mime = Image.MIME.get(image.format, "")
        if mime not in {"image/png", "image/jpeg", "image/webp", "image/gif"}:
            raise ValueError("不支持的图片类型")
    elif mime == "model/gltf-binary":
        if len(data) < 20 or data[:4] != b"glTF" or int.from_bytes(data[4:8], "little") != 2 or int.from_bytes(data[8:12], "little") != len(data):
            raise ValueError("无效的 GLB 文件")
    elif mime not in {"video/mp4", "video/webm", "video/quicktime", "audio/mpeg", "audio/wav", "audio/x-wav", "audio/flac", "audio/aac", "audio/ogg", "audio/mp4", "audio/webm"}:
        raise ValueError("不支持的文件类型")
    key = str(uuid.uuid4())
    settings.asset_dir.mkdir(parents=True, exist_ok=True)
    (settings.asset_dir / key).write_bytes(data)
    asset = Asset(user_id=user_id, project_id=project_id, task_id=task_id, output_index=output_index,
                  storage_key=key, mime=mime, name=Path(name).name[:200], size=len(data), sha256=hashlib.sha256(data).hexdigest())
    db.add(asset)
    db.flush()
    return asset


def data_url(asset):
    return f"data:{asset.mime};base64," + base64.b64encode((settings.asset_dir / asset.storage_key).read_bytes()).decode()


def asset_dict(asset):
    return {"id": asset.id, "url": f"/api/v1/assets/{asset.id}/content", "name": asset.name, "mime": asset.mime, "size": asset.size}
