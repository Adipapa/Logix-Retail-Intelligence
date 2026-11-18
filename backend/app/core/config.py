from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    app_name: str = "Logix Retail Intelligence API"
    app_env: str = "development"
    api_v1_prefix: str = "/api/v1"
    secret_key: str
    access_token_expire_minutes: int = 30
    database_url: str
    cors_origins: str = "http://localhost:3000,http://localhost:5173"
    bootstrap_admin_email: str | None = None
    bootstrap_admin_password: str | None = None
    bootstrap_admin_name: str = "System Administrator"

    @property
    def cors_origin_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]

settings = Settings()
