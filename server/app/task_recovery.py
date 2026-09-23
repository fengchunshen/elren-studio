"""Describe only recovery work the worker can perform without regenerating."""
from .providers import interpret


def recovery_mode(offering, attempt):
    if attempt is None:
        return "manual"
    if attempt.state == "response_received" and attempt.response:
        try:
            outcome = interpret(offering, attempt.response, bool(attempt.remote_id))
            if outcome["state"] in {"succeeded", "failed"}:
                return "persist"
        except (ValueError, TypeError, KeyError, AttributeError):
            # Malformed provider data is not permission to submit again.
            pass
    if attempt.remote_id and (offering["adapter"] == "minimax_h3" or offering["config"].get("status_path")):
        return "poll"
    return "manual"


def recovery_message(mode, response=None):
    if mode == "persist":
        return "结果已返回，正在继续处理。"
    if mode == "poll":
        return "暂时无法获取生成进度，正在自动重查。"
    if isinstance(response, dict) and response.get("cloudflare_error") is True and response.get("error_code") == 524:
        return "生成服务响应超时，未收到结果。需人工核对，请勿重复生成。"
    return "生成结果尚未确认。需人工核对，请勿重复生成。"
