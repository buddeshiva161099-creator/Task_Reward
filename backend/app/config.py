"""
Application configuration loaded from environment variables.
"""
from pydantic_settings import BaseSettings
from pydantic import field_validator
from typing import List
import urllib.parse

INSECURE_JWT_SECRETS = {"change-this-secret", "your-super-secret-jwt-key-change-this", "", "secret_key"}


class Settings(BaseSettings):
    MONGODB_URL: str = "mongodb://127.0.0.1:27017"
    DATABASE_NAME: str = "employee_task_reward"
    JWT_SECRET: str = "change-this-secret"
    JWT_ALGORITHM: str = "HS256"
    JWT_AUDIENCE: str = "vision:app"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    CORS_ORIGINS: str = "http://localhost:3000"
    ENVIRONMENT: str = "development"
    ALLOW_PUBLIC_REGISTRATION: bool = False
    AUTO_SEED_DEFAULT_USERS: bool = False
    ALLOW_IN_MEMORY_DB_FALLBACK: bool = False
    MAX_UPLOAD_BYTES: int = 5 * 1024 * 1024

    @field_validator("MONGODB_URL", mode="before")
    @classmethod
    def escape_mongodb_url(cls, v: str) -> str:
        if not isinstance(v, str):
            return v
        if not v.startswith("mongodb://") and not v.startswith("mongodb+srv://"):
            return v
        try:
            prefix, rest = v.split("://", 1)
            if "/" in rest:
                auth_host, path = rest.split("/", 1)
                path = "/" + path
            else:
                auth_host, path = rest, ""
            
            if "@" in auth_host:
                creds, host = auth_host.rsplit("@", 1)
                if ":" in creds:
                    user, password = creds.split(":", 1)
                    safe_user = urllib.parse.quote_plus(urllib.parse.unquote(user))
                    safe_pass = urllib.parse.quote_plus(urllib.parse.unquote(password))
                    return f"{prefix}://{safe_user}:{safe_pass}@{host}{path}"
        except Exception:
            pass
        return v

    @property
    def cors_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.lower() in {"prod", "production"}

    @property
    def uses_insecure_jwt_secret(self) -> bool:
        return (
            self.JWT_SECRET in INSECURE_JWT_SECRETS or 
            len(self.JWT_SECRET) < 32 or 
            self.JWT_SECRET.lower() in {"secret", "secret_key", "default", "jwt_secret", "key"}
        )

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
