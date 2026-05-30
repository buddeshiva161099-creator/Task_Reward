"""
Global middleware for exception handling and logging.
"""
from fastapi import Request, status
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from pydantic import ValidationError
import logging
import traceback

logger = logging.getLogger("app")

async def exception_handler_middleware(request: Request, call_next):
    """Catch-all exception handler to ensure consistent error responses."""
    try:
        return await call_next(request)
    except ValidationError as e:
        logger.error(f"Validation Error: {e.json()}")
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=jsonable_encoder({"detail": e.errors(), "message": "Input validation failed"}),
        )
    except Exception as e:
        logger.error(f"Unhandled Exception: {str(e)}")
        logger.error(traceback.format_exc())
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "message": "An internal server error occurred",
                "detail": str(e) if not request.app.debug else traceback.format_exc()
            },
        )
