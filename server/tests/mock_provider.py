"""Local-only provider fixture for browser integration checks; no real API calls."""
from fastapi import FastAPI

app = FastAPI()


@app.post('/v1/chat/completions')
def chat(body: dict):
    return {'id': 'browser-fixture', 'choices': [{'message': {'role': 'assistant', 'content': '模拟联调完成：这是本地测试供应商返回的回答。'}}],
            'usage': {'prompt_tokens': 1000, 'completion_tokens': 100, 'prompt_tokens_details': {'cached_tokens': 200}}}

