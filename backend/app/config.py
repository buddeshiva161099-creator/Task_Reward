"""
Application configuration loaded from environment variables.
"""
from pydantic_settings import BaseSettings
from typing import List

INSECURE_JWT_SECRETS = {"change-this-secret", "your-super-secret-jwt-key-change-this", ""}


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

    @property
    def cors_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.lower() in {"prod", "production"}

    @property
    def uses_insecure_jwt_secret(self) -> bool:
        return self.JWT_SECRET in INSECURE_JWT_SECRETS

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
