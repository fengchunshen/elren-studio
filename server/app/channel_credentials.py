"""Write-only channel secrets, encrypted separately from the database backup."""
import fcntl
import os
import time
from pathlib import Path
from cryptography.fernet import Fernet, InvalidToken
from .config import settings
from .models import ChannelCredential
from .provider_environment import read_provider_environment


def cipher(create=False):
    directory = Path(os.getenv('CHANNEL_KEY_DIR', str(settings.asset_dir.parent / 'secrets')))
    key_path = directory / 'channel.key'
    try:
        if create:
            directory.mkdir(parents=True, exist_ok=True, mode=0o700)
            # Serialize first creation across API processes; never rotate an existing key.
            fd = os.open(directory / '.key.lock', os.O_CREAT | os.O_RDWR, 0o600)
            with os.fdopen(fd, 'w') as lock:
                fcntl.flock(lock, fcntl.LOCK_EX)
                if not key_path.exists():
                    fd = os.open(key_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
                    with os.fdopen(fd, 'wb') as output:
                        output.write(Fernet.generate_key())
                        output.flush()
                        os.fsync(output.fileno())
        return Fernet(key_path.read_bytes())
    except (OSError, ValueError):
        raise ValueError('渠道密钥存储不可用，请检查服务端密钥文件和权限') from None


def key_value(value):
    if value is None:
        return None
    secret = value.get_secret_value().strip()
    if not secret:
        return None  # Blank means preserve, never clear or store a mask.
    if not 8 <= len(secret) <= 4096 or not secret.isascii() or any(ord(c) < 33 or ord(c) > 126 for c in secret):
        raise ValueError('API Key 格式不正确，请粘贴完整密钥')
    if set(secret) <= {'*'}:
        raise ValueError('请输入真实 API Key，不能保存脱敏占位符')
    return secret


def legacy_secret(channel):
    return read_provider_environment().get(channel.key_env) or os.getenv(channel.key_env, '')


def resolve_channel_secret(db, channel):
    stored = db.get(ChannelCredential, channel.id)
    if stored:
        try:
            # Bind ciphertext to its channel to prevent accidental row swapping.
            plaintext = cipher().decrypt(stored.ciphertext.encode()).decode()
            identity, secret = plaintext.split('\n', 1)
            if identity != channel.id:
                raise ValueError()
            return secret
        except (InvalidToken, UnicodeError, ValueError):
            raise ValueError('渠道密钥无法解密，请恢复密钥文件或重新保存 API Key') from None
    return legacy_secret(channel)


def save_channel_secret(db, channel, secret):
    if not secret:
        return False
    encoded = cipher(create=True).encrypt(f'{channel.id}\n{secret}'.encode()).decode()
    stored = db.get(ChannelCredential, channel.id)
    if not stored:
        stored = ChannelCredential(channel_id=channel.id)
        db.add(stored)
    stored.ciphertext, stored.updated_at = encoded, time.time()
    return True


def channel_dict(db, channel):
    stored = db.get(ChannelCredential, channel.id)
    configured = bool(stored or legacy_secret(channel))
    return {name: getattr(channel, name) for name in
            ('id', 'created_at', 'name', 'base_url', 'key_env', 'active', 'concurrency', 'asset_hosts')} | {
        'credential_configured': configured,
        'credential_source': 'saved' if stored else 'server' if configured else 'missing',
        'credential_updated_at': stored.updated_at if stored else None,
    }
