"""
FastAPI application entry point. Updated with Global Search.
Employee Task & Reward Management System
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database.connection import init_db




from app.routes import auth, employees, tasks, dashboard, reports, companies, attendance, search, holidays, notifications, categories, leaves, regularization, payroll, chat, ai, simulation


import asyncio
from app.services import recurrence_service
from app.middleware import exception_handler_middleware


def validate_runtime_security_settings():
    """Fail fast on deployment settings that would weaken production security."""
    if not settings.is_production:
        return
    if settings.uses_insecure_jwt_secret:
        raise RuntimeError("JWT_SECRET must be changed before running in production.")
    if "*" in settings.cors_origins_list:
        raise RuntimeError("CORS_ORIGINS cannot include '*' when ENVIRONMENT=production.")
    if settings.ALLOW_PUBLIC_REGISTRATION:
        raise RuntimeError("ALLOW_PUBLIC_REGISTRATION must be disabled in production.")

async def auto_checkout_stale_sessions():
    """Auto-close attendance sessions that are still open past work hours."""
    from app.models.attendance import Attendance, ist_now
    from app.models.company import Company
    from datetime import datetime, timedelta
    import logging
    _logger = logging.getLogger(__name__)
    
    try:
        # Find all open sessions
        open_sessions = await Attendance.find(Attendance.check_out == None).to_list()
        
        for session in open_sessions:
            company = await Company.get(session.company_id)
            if not company or not company.auto_checkout_enabled:
                continue
            
            # Parse work_end_time robustly
            try:
                wt = company.work_end_time.strip().upper()
                is_pm = "PM" in wt
                wt_clean = wt.replace("AM", "").replace("PM", "").strip()
                end_parts = wt_clean.split(":")
                end_hour = int(end_parts[0])
                end_min = int(end_parts[1]) if len(end_parts) > 1 else 0
                if is_pm and end_hour < 12:
                    end_hour += 12
            except Exception:
                end_hour, end_min = 18, 0  # Default 6 PM IST
            
            # Use timezone-aware calculations
            from datetime import timezone
            from app.models.attendance import IST
            now_utc = datetime.now(timezone.utc)
            local_now = now_utc.astimezone(IST)
            session_age_hours = (now_utc - session.check_in).total_seconds() / 3600
            
            # Auto-close if: current IST hour is past (end + 1h) OR session > 14h
            if local_now.hour > end_hour + 1 or session_age_hours > 14:
                session.check_out = now_utc
                session.is_auto_closed = True
                session.remarks = (session.remarks or "") + " [Auto-closed by system]"
                if "auto_closed" not in session.flags:
                    session.flags.append("auto_closed")
                await session.save()

                # Send missed checkout alert
                try:
                    from app.services.notification_service import NotificationService
                    await NotificationService.notify_user(
                        user_id=session.user_id,
                        title="Missed Checkout Alert",
                        message="You missed to check out yesterday. Your session was automatically closed by the system.",
                        type="system"
                    )
                except Exception as ne:
                    _logger.warning(f"Could not send auto-checkout notification: {ne}")

                _logger.info(f"[AUTO-CHECKOUT] Closed stale session for user {session.user_id}")
    except Exception as e:
        _logger.error(f"Error in auto-checkout: {e}")


async def run_periodic_tasks():
    """Background loop for recurring tasks."""
    while True:
        try:
            await recurrence_service.process_recurrence()
            await auto_checkout_stale_sessions()
        except Exception as e:
            print(f"Error in background task: {e}")
        await asyncio.sleep(3600) # Check every hour

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan - initialize DB and background tasks."""
    validate_runtime_security_settings()
    await init_db()
    bg_task = asyncio.create_task(run_periodic_tasks())
    yield
    bg_task.cancel()


app = FastAPI(
    title="Employee Task & Reward Management System",
    description="API for managing employees, tasks, productivity tracking, and rewards",
    version="1.0.0",
    lifespan=lifespan,
)

from fastapi.staticfiles import StaticFiles
import os

# Create uploads directory if not exists
os.makedirs("uploads/chat", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# Register custom exception handler
app.middleware("http")(exception_handler_middleware)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router)
app.include_router(employees.router)
app.include_router(tasks.router)
app.include_router(dashboard.router)
app.include_router(reports.router)
app.include_router(companies.router)
app.include_router(attendance.router, prefix="/attendance", tags=["Attendance"])
app.include_router(holidays.router, prefix="/holidays", tags=["Holiday Management"])
app.include_router(search.router)
app.include_router(notifications.router)
app.include_router(categories.router)
app.include_router(leaves.router)
app.include_router(regularization.router)
app.include_router(payroll.router)
app.include_router(chat.router)
app.include_router(ai.router)
app.include_router(simulation.router)



@app.get("/", tags=["Health"])
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "app": "Employee Task & Reward Management System",
        "version": "1.0.0",
    }