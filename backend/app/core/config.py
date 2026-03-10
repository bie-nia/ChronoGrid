from typing import List
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://adhd:adhd_secret@localhost:5432/adhd_calendar"
    SECRET_KEY: str = "supersecretkey_change_in_production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080  # 7 days

    ADMIN_EMAIL: str = "admin@adhd.local"
    ADMIN_PASSWORD: str = "changeme_admin"

    DEMO_EMAIL: str = "demo@chronogrid.app"
    DEMO_PASSWORD: str = "demo-only-no-real-data"

    # CORS — lista originów oddzielona przecinkami
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    @property
    def allowed_origins_list(self) -> List[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    class Config:
        env_file = ".env"


settings = Settings()
