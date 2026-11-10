"""Explicit local/cloud adapter selection. No resource provisioning or probes."""

from __future__ import annotations

import os
from collections.abc import Mapping
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from pydantic import Field, SecretStr, ValidationError

from agent.contracts import Contract


class M3Settings(Contract):
    mode: Literal["mock", "integration"] = "mock"
    ledger_backend: Literal["sqlite", "rds"] = "sqlite"
    sqlite_path: Path = Path("logs/agent/m3-ledger.sqlite3")
    rds_dsn: SecretStr = SecretStr("")
    audit_dir: Path = Path("logs/agent/runs")
    archive_backend: Literal["local", "obs"] = "local"
    archive_dir: Path = Path("logs/agent/archive")
    obs_endpoint: str = ""
    obs_bucket: str = ""
    cloud_ak: SecretStr = SecretStr("")
    cloud_sk: SecretStr = SecretStr("")
    cloud_token: SecretStr = SecretStr("")
    cache_backend: Literal["none", "redis"] = "none"
    redis_host: str = ""
    redis_port: int = Field(default=6379, ge=1, le=65535)
    redis_password: SecretStr = SecretStr("")
    redis_tls: bool = True
    maas_endpoint: str = ""
    maas_model: str = ""
    maas_api_key: SecretStr = SecretStr("")
    mqtt_host: str = "127.0.0.1"
    mqtt_port: int = Field(default=1883, ge=1, le=65535)
    mqtt_username: str = ""
    mqtt_password: SecretStr = SecretStr("")
    mqtt_tls: bool = False
    mqtt_ca_file: str = ""
    mqtt_client_id: str = "cloud-api"
    vehicle_id: str = "px4-sitl-1"
    ack_timeout_s: float = Field(default=3, gt=0, le=30)

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> M3Settings:
        source = os.environ if env is None else env
        keys = {
            "M3_RUN_MODE": "mode",
            "M3_LEDGER_BACKEND": "ledger_backend",
            "M3_SQLITE_PATH": "sqlite_path",
            "RDS_DSN": "rds_dsn",
            "M3_AUDIT_DIR": "audit_dir",
            "M3_ARCHIVE_BACKEND": "archive_backend",
            "M3_ARCHIVE_DIR": "archive_dir",
            "OBS_ENDPOINT": "obs_endpoint",
            "OBS_BUCKET": "obs_bucket",
            "HUAWEI_CLOUD_AK": "cloud_ak",
            "HUAWEI_CLOUD_SK": "cloud_sk",
            "HUAWEI_CLOUD_SECURITY_TOKEN": "cloud_token",
            "M3_CACHE_BACKEND": "cache_backend",
            "DCS_HOST": "redis_host",
            "DCS_PORT": "redis_port",
            "DCS_PASSWORD": "redis_password",
            "DCS_TLS": "redis_tls",
            "MAAS_CHAT_ENDPOINT": "maas_endpoint",
            "MAAS_MODEL": "maas_model",
            "MAAS_API_KEY": "maas_api_key",
            "MQTT_HOST": "mqtt_host",
            "MQTT_PORT": "mqtt_port",
            "MQTT_USERNAME": "mqtt_username",
            "MQTT_PASSWORD": "mqtt_password",
            "MQTT_TLS": "mqtt_tls",
            "MQTT_CA_FILE": "mqtt_ca_file",
            "MQTT_CLIENT_ID_CLOUD": "mqtt_client_id",
            "M3_VEHICLE_ID": "vehicle_id",
            "M3_ACK_TIMEOUT_S": "ack_timeout_s",
        }
        values = {field: source[key] for key, field in keys.items() if source.get(key, "").strip()}
        # Retain old .env compatibility; the explicit full endpoint takes precedence.
        if "maas_endpoint" not in values and source.get("MAAS_BASE_URL", "").strip():
            values["maas_endpoint"] = source["MAAS_BASE_URL"].rstrip("/") + "/chat/completions"
        try:
            return cls.model_validate(values)
        except ValidationError as exc:
            fields = sorted({str(error["loc"][0]) for error in exc.errors()})
            raise ValueError("Invalid M3 configuration fields: " + ", ".join(fields)) from None

    def missing(self) -> list[str]:
        requirements = []
        if self.ledger_backend == "rds" and not self.rds_dsn.get_secret_value():
            requirements.append("RDS_DSN")
        if self.archive_backend == "obs":
            for name, value in {
                "OBS_ENDPOINT": self.obs_endpoint,
                "OBS_BUCKET": self.obs_bucket,
                "HUAWEI_CLOUD_AK": self.cloud_ak.get_secret_value(),
                "HUAWEI_CLOUD_SK": self.cloud_sk.get_secret_value(),
            }.items():
                if not value:
                    requirements.append(name)
        if self.cache_backend == "redis" and not self.redis_host:
            requirements.append("DCS_HOST")
        if any((self.maas_endpoint, self.maas_model, self.maas_api_key.get_secret_value())):
            for name, value in {
                "MAAS_CHAT_ENDPOINT": self.maas_endpoint,
                "MAAS_MODEL": self.maas_model,
                "MAAS_API_KEY": self.maas_api_key.get_secret_value(),
            }.items():
                if not value:
                    requirements.append(name)
        return sorted(requirements)

    def make_repository(self):
        from agent.repository import RunRepository

        if self.ledger_backend == "rds":
            if not self.rds_dsn.get_secret_value():
                raise ValueError("RDS_DSN is required; SQLite fallback is not automatic")
            if self.rds_dsn.get_secret_value().split(":", 1)[0] not in {
                "postgres",
                "postgresql",
                "postgresql+psycopg",
            }:
                raise ValueError("RDS backend requires a PostgreSQL DSN")
            return RunRepository(self.rds_dsn.get_secret_value())
        self.sqlite_path.parent.mkdir(parents=True, exist_ok=True)
        return RunRepository("sqlite:///" + self.sqlite_path.resolve().as_posix())

    def make_projection(self):
        if self.cache_backend == "none":
            return None
        if not self.redis_host:
            raise ValueError("DCS_HOST is required")
        import redis
        from redis.backoff import NoBackoff
        from redis.retry import Retry

        from agent.projection import RedisProjection

        client = redis.Redis(
            host=self.redis_host,
            port=self.redis_port,
            password=self.redis_password.get_secret_value() or None,
            ssl=self.redis_tls,
            socket_timeout=3,
            socket_connect_timeout=3,
            retry=Retry(NoBackoff(), 0),
        )
        return RedisProjection(client)

    def make_archive(self):
        from agent.archive import LocalAuditObjects, ObsAuditObjects

        if self.archive_backend == "local":
            return LocalAuditObjects(self.archive_dir)
        if any(
            key in self.missing()
            for key in ("OBS_ENDPOINT", "OBS_BUCKET", "HUAWEI_CLOUD_AK", "HUAWEI_CLOUD_SK")
        ):
            raise ValueError("OBS configuration incomplete; local fallback is not automatic")
        if urlsplit(self.obs_endpoint).scheme != "https":
            raise ValueError("OBS_ENDPOINT must use HTTPS")
        import certifi
        from obs import ObsClient

        client = ObsClient(
            access_key_id=self.cloud_ak.get_secret_value(),
            secret_access_key=self.cloud_sk.get_secret_value(),
            security_token=self.cloud_token.get_secret_value() or None,
            server=self.obs_endpoint,
            timeout=5,
            max_retry_count=0,
            ssl_verify=certifi.where(),
        )
        # The OBS SDK disables hostname checking by default even with a CA file.
        if client.context is not None:
            client.context.check_hostname = True
        return ObsAuditObjects(client, self.obs_bucket)

    def make_extractor(self):
        from agent.maas import MaasTaskExtractor

        return MaasTaskExtractor(self.maas_endpoint, self.maas_api_key, self.maas_model)

    def make_mqtt_channel(self):
        local = self.mqtt_host in {"localhost", "127.0.0.1", "::1"}
        if not local and (
            not self.mqtt_tls or not self.mqtt_username or not self.mqtt_password.get_secret_value()
        ):
            raise ValueError("Remote MQTT requires TLS and per-client authentication")
        import paho.mqtt.client as mqtt

        from agent.messaging import MqttCommandChannel

        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=self.mqtt_client_id)
        client.connect_timeout = 5
        client.max_queued_messages_set(1)
        if self.mqtt_username:
            client.username_pw_set(self.mqtt_username, self.mqtt_password.get_secret_value())
        if self.mqtt_tls:
            client.tls_set(ca_certs=self.mqtt_ca_file or None)
        return MqttCommandChannel(
            client, self.vehicle_id, run_mode=self.mode, ack_timeout_s=self.ack_timeout_s
        )
