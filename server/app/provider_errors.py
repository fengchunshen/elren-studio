"""Translate recognized provider failures without exposing raw upstream messages."""


def provider_failure_message(response, fallback):
    error = response.get("error") if isinstance(response, dict) else None
    if not isinstance(error, dict):
        return fallback
    code, message = error.get("code"), error.get("message")
    if not isinstance(code, str):
        return fallback
    if code == "InputImageSensitiveContentDetected.PrivacyInformation":
        return "参考图被判定可能包含真人，未通过人像隐私审核。请使用符合该模型要求的参考素材。"
    if code.split(".")[0] == "InputImageSensitiveContentDetected":
        return "参考图未通过内容审核，请使用符合该模型要求的参考素材。"
    if code.split(".")[0] == "OutputImageSensitiveContentDetected":
        if isinstance(message, str) and "copyright restrictions" in message.lower():
            return "生成结果可能涉及版权限制，未通过审核。请调整创作内容后重试。"
        return "生成结果未通过内容审核，请调整创作内容后重试。"
    return fallback
