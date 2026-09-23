from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, SecretStr


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Credentials(Strict):
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=256)


class NewUser(Credentials):
    role: Literal["admin", "user"] = "user"


class UserPatch(Strict):
    active: bool | None = None
    role: Literal["admin", "user"] | None = None


class PasswordChange(Strict):
    current_password: str
    password: str = Field(min_length=12, max_length=256)


class ProjectInput(Strict):
    name: str = Field(min_length=1, max_length=200)
    archived: bool = False


class ChannelInput(Strict):
    name: str = Field(min_length=1, max_length=100)
    base_url: str
    key_env: str | None = None
    api_key: SecretStr | None = None
    active: bool = True
    concurrency: int = Field(default=2, ge=1, le=20)
    asset_hosts: list[str] = Field(default_factory=list, max_length=20)


class ChannelTestInput(Strict):
    base_url: str
    channel_id: str | None = None
    api_key: SecretStr | None = None


class OfferingInput(Strict):
    name: str = Field(min_length=1, max_length=200)
    channel_id: str
    upstream_model: str = Field(min_length=1, max_length=200)
    operation: Literal["text.generate", "image.generate", "image.edit", "video.generate", "audio.generate", "video.edit", "video.extend", "video.retake", "video.replace", "video.remove", "video.avatar", "image.upscale", "image.remove_background", "image.relight", "image.expand", "image.inpaint", "image.angles", "image.skin", "image.erase", "model.generate"]
    adapter: Literal["openai_chat", "openai_image", "openai_image_edit", "json_async", "http_media", "minimax_h3"]
    config: dict = Field(default_factory=dict)
    parameters: dict = Field(default_factory=dict)
    active: bool = False


class PriceInput(Strict):
    offering_id: str
    kind: Literal["sale", "cost"]
    currency: str = "USD"
    display_currency: str = "CNY"
    fx: str
    markup: str = "0"
    components: list[dict]
    source: str = Field(min_length=1, max_length=2000)


class TaskInput(Strict):
    project_id: str
    model_offering_id: str
    operation: str
    input: dict
    source: dict = Field(default_factory=dict)


class TaskCreate(TaskInput):
    quote_id: str


class MediaRenderInput(Strict):
    project_id: str
    clips: list[dict] = Field(min_length=1, max_length=100)
    width: int = 1280
    height: int = 720
    operation: Literal["concat", "scene_split"] = "concat"


class Adjustment(Strict):
    original_entry_id: str
    amount: str
    reason: str = Field(min_length=1, max_length=1000)


class Reconcile(Strict):
    outcome: Literal["failed"] | None = None
    remote_id: str | None = Field(default=None, max_length=300)
    meters: dict | None = None
    reason: str = Field(min_length=1, max_length=1000)
    evidence_reference: str = Field(min_length=1, max_length=1000)
