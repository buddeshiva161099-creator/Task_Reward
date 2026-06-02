from fastapi import WebSocket
from typing import Dict, List
import json
import logging

logger = logging.getLogger(__name__)

class ConnectionManager:
    def __init__(self):
        # active_connections[user_id] = [WebSocket, ...]
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)
        logger.info(f"User {user_id} connected via WebSocket. Total connections for user: {len(self.active_connections[user_id])}")

    def disconnect(self, websocket: WebSocket, user_id: str):
        if user_id in self.active_connections:
            self.active_connections[user_id].remove(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
        logger.info(f"User {user_id} disconnected from WebSocket.")

    async def send_personal_message(self, message: dict, user_id: str):
        if user_id in self.active_connections:
            msg_json = json.dumps(message)
            for connection in self.active_connections[user_id]:
                try:
                    await connection.send_text(msg_json)
                except Exception as e:
                    logger.error(f"Error sending WebSocket message to user {user_id}: {e}")

manager = ConnectionManager()
