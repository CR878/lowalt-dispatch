from __future__ import annotations

import pytest

from agent.settings import M3Settings


def test_defaults_are_local_and_do_not_need_cloud_keys():
    config = M3Settings.from_env({})
    assert config.mode == "mock"
    assert config.ledger_backend == "sqlite"
    assert config.cache_backend == "none"
    assert config.archive_backend == "local"
    assert config.missing() == []


def test_selected_cloud_backends_fail_instead_of_silent_local_fallback():
    config = M3Settings.from_env(
        {"M3_LEDGER_BACKEND": "rds", "M3_ARCHIVE_BACKEND": "obs", "M3_CACHE_BACKEND": "redis"}
    )
    assert set(config.missing()) == {
        "RDS_DSN",
        "OBS_ENDPOINT",
        "OBS_BUCKET",
        "HUAWEI_CLOUD_AK",
        "HUAWEI_CLOUD_SK",
        "DCS_HOST",
    }
    with pytest.raises(ValueError, match="RDS_DSN"):
        config.make_repository()


def test_config_errors_and_repr_do_not_echo_secrets():
    config = M3Settings.from_env(
        {"RDS_DSN": "postgresql://user:private-password@localhost/test", "MAAS_API_KEY": "private-key"}
    )
    assert "private-password" not in repr(config)
    assert "private-key" not in repr(config)
    with pytest.raises(ValueError) as error:
        M3Settings.from_env({"DCS_PORT": "password-disguised-as-port"})
    assert "password-disguised-as-port" not in str(error.value)


def test_remote_mqtt_requires_tls_and_authentication():
    config = M3Settings.from_env({"MQTT_HOST": "mqtt.example.org"})
    with pytest.raises(ValueError, match="TLS"):
        config.make_mqtt_channel()


def test_maas_full_endpoint_overrides_legacy_base_url():
    config = M3Settings.from_env(
        {
            "MAAS_BASE_URL": "https://example.org/v1",
            "MAAS_CHAT_ENDPOINT": "https://example.org/custom/chat/completions",
        }
    )
    assert config.maas_endpoint == "https://example.org/custom/chat/completions"


def test_rds_configuration_cannot_point_to_sqlite():
    config = M3Settings.from_env({"M3_LEDGER_BACKEND": "rds", "RDS_DSN": "sqlite:///local.db"})
    with pytest.raises(ValueError, match="PostgreSQL"):
        config.make_repository()


def test_cloud_clients_can_be_constructed_without_network():
    pytest.importorskip("obs")
    pytest.importorskip("redis")
    pytest.importorskip("paho.mqtt.client")
    config = M3Settings.from_env(
        {
            "M3_ARCHIVE_BACKEND": "obs",
            "OBS_ENDPOINT": "https://obs.example.org",
            "OBS_BUCKET": "test-bucket",
            "HUAWEI_CLOUD_AK": "not-a-real-ak",
            "HUAWEI_CLOUD_SK": "not-a-real-sk",
            "M3_CACHE_BACKEND": "redis",
            "DCS_HOST": "127.0.0.1",
            "DCS_TLS": "false",
        }
    )
    archive = config.make_archive()
    projection = config.make_projection()
    channel = config.make_mqtt_channel()
    assert archive.bucket == "test-bucket"
    assert projection.client.connection_pool.connection_kwargs["host"] == "127.0.0.1"
    archive.client.close()
    projection.client.close()
    channel.close()
