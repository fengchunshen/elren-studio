"""Bounded read-only model-list probe; never creates a generation task."""
from urllib.parse import urlsplit
import httpx
from .security import validate_remote_url


def probe_channel(base_url, secret):
    base = base_url.rstrip('/')
    try:
        validate_remote_url(base)
        parsed = urlsplit(base)
        if parsed.query:
            raise ValueError()
    except (ValueError, OSError):
        return {'ok': False, 'message': 'API 地址无法访问，请检查域名及 HTTPS 配置。'}
    if not secret:
        return {'ok': False, 'message': '请先填写 API Key。'}
    if parsed.path.rstrip('/'):
        path = '/models'
    elif parsed.hostname == 'api.deepseek.com':
        path = '/models'
    elif parsed.hostname == 'ark.cn-beijing.volces.com':
        path = '/api/v3/models'
    else:
        path = '/v1/models'
    try:
        with httpx.Client(timeout=httpx.Timeout(15, connect=5), follow_redirects=False, trust_env=False) as client:
            with client.stream('GET', base + path, headers={'Authorization': f'Bearer {secret}', 'Accept': 'application/json'}) as response:
                status = response.status_code
                if status in (401, 403):
                    return {'ok': False, 'message': '认证未通过，请检查 API Key 或模型列表访问权限。'}
                if status == 429:
                    return {'ok': False, 'message': '供应商请求限流，请稍后重试。'}
                if status in (404, 405):
                    return {'ok': False, 'message': '该地址未提供模型列表接口，暂时无法用此方式验证密钥。'}
                if status != 200:
                    return {'ok': False, 'message': f'供应商返回 HTTP {status}，连接测试未通过。'}
                content = bytearray()
                for chunk in response.iter_bytes():
                    content.extend(chunk)
                    if len(content) > 1024 * 1024:
                        return {'ok': False, 'message': '供应商响应过大，连接测试未通过。'}
                import json
                data = json.loads(content)
                if not isinstance(data, dict) or not isinstance(data.get('data'), list):
                    return {'ok': False, 'message': '接口未返回有效模型列表，请检查 API 地址。'}
        return {'ok': True, 'message': '连接成功，已读取模型列表。此测试不验证生成权限或余额。'}
    except httpx.TimeoutException:
        return {'ok': False, 'message': '连接超时，请稍后重试或检查 API 地址。'}
    except httpx.HTTPError:
        return {'ok': False, 'message': '无法连接供应商，请检查网络及 HTTPS 证书。'}
    except (ValueError, UnicodeError):
        return {'ok': False, 'message': '接口未返回有效模型列表，请检查 API 地址。'}
