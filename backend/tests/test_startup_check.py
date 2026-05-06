"""
Startup auth güvenlik kontrolü testleri — Solar Rota Backend

check_auth_config() tüm ortam kombinasyonları için doğru seviyeyi üretmeli.
apply_startup_check() warning'de devam etmeli, critical'de sys.exit(1) çağırmalı.
/health endpoint'i authMode ve startupWarnings alanlarını yansıtmalı.
"""
import os
import sys
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient


# ── check_auth_config testleri ───────────────────────────────────────────────

class TestCheckAuthConfig:

    def _run(self, env: dict):
        """Verilen env sözlüğüyle check_auth_config() çağırır."""
        # startup_check modülünü her seferinde temiz env ile yeniden yükle
        with patch.dict(os.environ, env, clear=True):
            # clear=True → tüm gerçek env var'ları sıfırla; sadece env geçerli
            from backend.startup_check import check_auth_config
            return check_auth_config()

    def test_local_dev_no_key_no_signal_is_ok(self):
        """Yerel geliştirme: key yok, bulut sinyali yok → ok (dev-mode)."""
        result = self._run({})
        assert result.level == "ok"
        assert result.auth_mode == "dev-mode"
        assert result.cloud_signals == []

    def test_key_set_local_is_ok_key_required(self):
        """Key set edilmiş, yerel ortam → ok, key-required."""
        result = self._run({"SOLARROTA_API_KEY": "supersecret"})
        assert result.level == "ok"
        assert result.auth_mode == "key-required"

    def test_key_set_with_cloud_signal_is_ok(self):
        """Key var + bulut sinyali var → ok (key-required)."""
        result = self._run({"SOLARROTA_API_KEY": "supersecret", "PORT": "8080"})
        assert result.level == "ok"
        assert result.auth_mode == "key-required"

    def test_key_set_with_explicit_production_is_ok(self):
        """SOLARROTA_ENV=production + key var → ok (key-required)."""
        result = self._run({
            "SOLARROTA_API_KEY": "supersecret",
            "SOLARROTA_ENV": "production",
        })
        assert result.level == "ok"
        assert result.auth_mode == "key-required"

    def test_cloud_signal_port_no_key_is_warning(self):
        """PORT sinyali + key yok → warning."""
        result = self._run({"PORT": "8080"})
        assert result.level == "warning"
        assert result.auth_mode == "dev-mode"
        assert "generic cloud port binding" in result.cloud_signals
        assert any("SOLARROTA_API_KEY" in m for m in result.messages)

    def test_railway_signal_no_key_is_warning(self):
        """RAILWAY_ENVIRONMENT sinyali + key yok → warning, Railway adı geçer."""
        result = self._run({"RAILWAY_ENVIRONMENT": "production"})
        assert result.level == "warning"
        assert "Railway" in result.cloud_signals

    def test_fly_signal_no_key_is_warning(self):
        """FLY_APP_NAME sinyali + key yok → warning."""
        result = self._run({"FLY_APP_NAME": "solar-rota"})
        assert result.level == "warning"
        assert "Fly.io" in result.cloud_signals

    def test_multiple_cloud_signals_are_all_listed(self):
        """Birden fazla bulut sinyali → hepsi cloud_signals listesinde."""
        result = self._run({"PORT": "8080", "FLY_APP_NAME": "solar-rota"})
        assert result.level == "warning"
        assert len(result.cloud_signals) == 2
        assert "generic cloud port binding" in result.cloud_signals
        assert "Fly.io" in result.cloud_signals

    def test_explicit_production_no_key_is_critical(self):
        """SOLARROTA_ENV=production + key yok → critical."""
        result = self._run({"SOLARROTA_ENV": "production"})
        assert result.level == "critical"
        assert result.auth_mode == "dev-mode"
        assert any("SOLARROTA_API_KEY" in m for m in result.messages)
        assert any("iptal" in m for m in result.messages)

    def test_explicit_production_case_insensitive(self):
        """SOLARROTA_ENV değeri büyük/küçük harf duyarsız olmalı."""
        result = self._run({"SOLARROTA_ENV": "PRODUCTION"})
        assert result.level == "critical"

    def test_explicit_production_with_cloud_signal_still_critical(self):
        """SOLARROTA_ENV=production + bulut sinyali + key yok → critical."""
        result = self._run({
            "SOLARROTA_ENV": "production",
            "PORT": "8080",
        })
        assert result.level == "critical"

    def test_messages_list_is_never_empty(self):
        """Her senaryoda en az bir mesaj üretilmeli."""
        for env in [
            {},
            {"SOLARROTA_API_KEY": "key"},
            {"PORT": "8080"},
            {"SOLARROTA_ENV": "production"},
        ]:
            result = self._run(env)
            assert len(result.messages) >= 1, f"Boş mesaj listesi: env={env}"


# ── apply_startup_check testleri ─────────────────────────────────────────────

class TestApplyStartupCheck:

    def test_ok_level_does_not_exit(self):
        """`ok` seviyesi sys.exit çağırmamalı."""
        from backend.startup_check import StartupCheckResult, apply_startup_check
        result = StartupCheckResult(level="ok", messages=["all good"])
        apply_startup_check(result)   # exception yoksa geçer

    def test_warning_level_does_not_exit(self):
        """`warning` seviyesi sys.exit çağırmamalı."""
        from backend.startup_check import StartupCheckResult, apply_startup_check
        result = StartupCheckResult(
            level="warning",
            messages=["cloud detected, no key"],
            cloud_signals=["Railway"],
        )
        apply_startup_check(result)   # exception yoksa geçer

    def test_critical_level_calls_sys_exit(self):
        """`critical` seviyesi sys.exit(1) çağırmalı."""
        from backend.startup_check import StartupCheckResult, apply_startup_check
        result = StartupCheckResult(
            level="critical",
            messages=["production env + no key"],
        )
        with pytest.raises(SystemExit) as exc_info:
            apply_startup_check(result)
        assert exc_info.value.code == 1

    def test_warning_writes_to_log(self, caplog):
        """`warning` seviyesi log.warning çağırmalı."""
        import logging
        from backend.startup_check import StartupCheckResult, apply_startup_check
        result = StartupCheckResult(
            level="warning",
            messages=["msg-one", "msg-two"],
        )
        with caplog.at_level(logging.WARNING, logger="backend.startup_check"):
            apply_startup_check(result)
        assert "msg-one" in caplog.text
        assert "msg-two" in caplog.text

    def test_critical_writes_to_log_before_exit(self, caplog):
        """`critical` seviyesi log.critical yazmalı, sonra exit etmeli."""
        import logging
        from backend.startup_check import StartupCheckResult, apply_startup_check
        result = StartupCheckResult(
            level="critical",
            messages=["fatal-message"],
        )
        with caplog.at_level(logging.CRITICAL, logger="backend.startup_check"):
            with pytest.raises(SystemExit):
                apply_startup_check(result)
        assert "fatal-message" in caplog.text


# ── /health endpoint yansıma testleri ────────────────────────────────────────

class TestHealthEndpointReflection:
    """
    main.py import edildiğinde check_auth_config() çalışır.
    Gerçek ortamda SOLARROTA_API_KEY yok, bulut sinyali yok → dev-mode / ok.
    Bu testler mevcut test ortamını (boş env) baz alır.
    """

    @pytest.fixture(autouse=True)
    def client(self):
        from backend.main import app
        self._client = TestClient(app)

    def test_health_returns_200(self):
        r = self._client.get("/health")
        assert r.status_code == 200

    def test_health_includes_auth_mode(self):
        r = self._client.get("/health")
        data = r.json()
        assert "authMode" in data
        assert data["authMode"] in ("dev-mode", "key-required")

    def test_health_includes_startup_warnings(self):
        r = self._client.get("/health")
        data = r.json()
        assert "startupWarnings" in data
        assert isinstance(data["startupWarnings"], list)

    def test_health_dev_mode_in_test_env(self):
        """Test ortamında SOLARROTA_API_KEY set değil → dev-mode beklenir."""
        r = self._client.get("/health")
        assert r.json()["authMode"] == "dev-mode"

    def test_health_no_startup_warnings_in_local_env(self):
        """Yerel test ortamında (bulut sinyali yok) uyarı listesi boş olmalı."""
        r = self._client.get("/health")
        assert r.json()["startupWarnings"] == []
