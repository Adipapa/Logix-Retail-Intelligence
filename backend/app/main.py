from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from app.api.auth import router as auth_router
from app.api.dropbox import router as dropbox_router
from app.api.analytics import router as analytics_router
from app.core.config import settings
from app.core.security import hash_password
from app.database.session import Base, SessionLocal, engine
from app.models.user import User, UserRole
from app.integrations.scheduler import start_scheduler, stop_scheduler
import app.models  # register all SQLAlchemy models before schema creation

@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.secret_key.startswith("replace-with-"):
        raise RuntimeError("Set a unique SECRET_KEY in backend/.env before starting the API.")
    if settings.bootstrap_admin_password and settings.bootstrap_admin_password.startswith("change-this"):
        raise RuntimeError("Replace BOOTSTRAP_ADMIN_PASSWORD in backend/.env before starting the API.")
    # Development bootstrap only. Production schema changes must run through Alembic.
    if settings.app_env == "development":
        Base.metadata.create_all(bind=engine)
    if settings.bootstrap_admin_email and settings.bootstrap_admin_password:
        with SessionLocal() as db:
            email = settings.bootstrap_admin_email.lower()
            if not db.scalar(select(User).where(User.email == email)):
                db.add(User(email=email, full_name=settings.bootstrap_admin_name,
                            password_hash=hash_password(settings.bootstrap_admin_password),
                            role=UserRole.admin))
                db.commit()
    start_scheduler()
    yield
    stop_scheduler()

app = FastAPI(title=settings.app_name, version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origin_list,
                   allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
app.include_router(auth_router, prefix=settings.api_v1_prefix)
app.include_router(dropbox_router, prefix=settings.api_v1_prefix)
app.include_router(analytics_router, prefix=settings.api_v1_prefix)

@app.get("/health")
def health():
    return {"status": "ok", "service": "logix-retail-api"}
