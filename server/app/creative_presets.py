"""Model families seen in the reference product, with verified public protocols; prices stay unconfigured."""


def creative_presets():
    eleven = {"name": "ElevenLabs 官方", "base_url": "https://api.elevenlabs.io", "key_env": "ELREN_PROVIDER_ELEVENLABS", "asset_hosts": []}
    auth = {"auth_header": "xi-api-key", "auth_scheme": "raw", "max_assets": 0, "accepted_media": [], "binary_output": True, "output_path": "output", "usage_headers": {"characters": "character-cost"}, "usage_paths": {"characters": "usage.characters"}}
    return [
        {"id": "eleven-v3-voice", "name": "ElevenLabs V3 · 配音", "source": "https://elevenlabs.io/docs/api-reference/text-to-speech/convert",
         "note": "参考产品音频面板可见 ElevenLabs V3。需填写当前账号可用的 voice_id、凭据及正式价格；未完成真实调用。", "channel": eleven,
         "offering": {"name": "ElevenLabs V3 · 配音", "upstream_model": "eleven_v3", "operation": "audio.generate", "adapter": "http_media",
            "parameters": {"voice_id": {"type": "string", "label": "音色 ID", "required": True}, "output_format": {"type": "string", "enum": ["mp3_44100_128"], "default": "mp3_44100_128"}},
            "config": {**auth, "audio_purpose": "speech", "submit_path": "/v1/text-to-speech/{voice_id}", "body": {"text": "{{input.prompt}}", "model_id": "{{model}}"}, "query": {"output_format": "{{input.parameters.output_format}}"}}}, "reference_price": None},
        {"id": "eleven-sound-effects", "name": "ElevenLabs · 音效", "source": "https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert",
         "note": "音效使用独立的 sound-generation 接口和模型 ID，不能把产品中的 V3 标签直接传入音效接口。需填写正式价格。", "channel": eleven,
         "offering": {"name": "ElevenLabs · 音效", "upstream_model": "eleven_text_to_sound_v2", "operation": "audio.generate", "adapter": "http_media",
            "parameters": {"duration_seconds": {"type": "number", "min": 0.5, "max": 30, "default": 5}, "loop": {"type": "boolean", "default": False}},
            "config": {**auth, "audio_purpose": "sound", "submit_path": "/v1/sound-generation", "body": {"text": "{{input.prompt}}", "model_id": "{{model}}", "duration_seconds": "{{input.parameters.duration_seconds}}", "loop": "{{input.parameters.loop}}"}}}, "reference_price": None},
        {"id": "minimax-music-2-6", "name": "MiniMax Music 2.6", "source": "https://platform.minimax.io/docs/api-reference/music-generation",
         "note": "参考产品面板可见 Music 2.6。官方国际站公告：2026-08-20 起音乐付费 API 不再面向新用户，老付费账号可继续；请先确认账号资格与价格。",
         "channel": {"name": "MiniMax 国际站音乐", "base_url": "https://api.minimax.io", "key_env": "ELREN_PROVIDER_MINIMAX_MUSIC", "asset_hosts": []},
         "offering": {"name": "MiniMax Music 2.6", "upstream_model": "music-2.6", "operation": "audio.generate", "adapter": "json_async",
            "parameters": {"lyrics": {"type": "string", "label": "歌词", "multiline": True, "default": ""}, "is_instrumental": {"type": "boolean", "label": "纯音乐", "default": True}},
            "config": {"audio_purpose": "music", "accepted_media": [], "max_assets": 0, "submit_path": "/v1/music_generation",
                "body": {"model": "{{model}}", "prompt": "{{input.prompt}}", "lyrics": "{{input.parameters.lyrics}}", "is_instrumental": "{{input.parameters.is_instrumental}}", "output_format": "url", "audio_setting": {"sample_rate": 44100, "bitrate": 256000, "format": "mp3"}},
                "error_code_path": "base_resp.status_code", "success_codes": [0], "output_path": "data.audio", "usage_paths": {"audio_seconds": "extra_info.music_duration"}, "usage_divisors": {"audio_seconds": 1000}}}, "reference_price": None},
        {"id": "topaz-standard-v2", "name": "Topaz · 高清增强", "source": "https://developer.topazlabs.com/getting-started/quickstart",
         "note": "参考产品的增强节点显示 Topazlabs。此预设使用官方 Standard V2 异步增强协议；需填写价格、凭据与实际输出 CDN 白名单。",
         "channel": {"name": "Topaz 官方", "base_url": "https://api.topazlabs.com", "key_env": "ELREN_PROVIDER_TOPAZ", "asset_hosts": []},
         "offering": {"name": "Topaz · 高清增强", "upstream_model": "Standard V2", "operation": "image.upscale", "adapter": "http_media",
            "parameters": {"output_width": {"type": "integer", "min": 1, "max": 8192, "default": 2048}, "output_height": {"type": "integer", "min": 1, "max": 8192, "default": 2048}},
            "config": {"auth_header": "X-API-Key", "auth_scheme": "raw", "min_assets": 1, "max_assets": 1, "accepted_media": ["image"], "request_format": "multipart", "file_field": "image",
                "submit_path": "/image/v1/enhance/async", "status_path": "/image/v1/status/{id}", "result_path": "/image/v1/download/{id}",
                "body": {"model": "{{model}}", "output_format": "png", "output_width": "{{input.parameters.output_width}}", "output_height": "{{input.parameters.output_height}}"},
                "request_id_path": "process_id", "status_field": "status", "success_values": ["Completed"], "failure_values": ["Failed", "Cancelled"], "output_path": "result.url"}}, "reference_price": None},
    ]
