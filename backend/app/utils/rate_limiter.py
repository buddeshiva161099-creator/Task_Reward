from collections import defaultdict
import time
from fastapi import HTTPException, Request, status

class RateLimiter:
    """
    A lightweight in-memory sliding-window rate limiter.
    Can be used as a FastAPI dependency.
    """
    def __init__(self, times: int, seconds: int):
        self.times = times
        self.seconds = seconds
        self.requests = defaultdict(list)

    def is_rate_limited(self, key: str) -> bool:
        now = time.time()
        # Filter out timestamps older than self.seconds
        self.requests[key] = [t for t in self.requests[key] if now - t < self.seconds]
        if len(self.requests[key]) >= self.times:
            return True
        self.requests[key].append(now)
        return False

    async def __call__(self, request: Request):
        client_ip = request.client.host if request.client else "unknown"
        # Scope rate limit per client IP and endpoint path
        key = f"{client_ip}:{request.url.path}"
        if self.is_rate_limited(key):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests. Please try again later."
            )
