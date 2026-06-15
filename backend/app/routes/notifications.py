from fastapi import APIRouter, Depends, HTTPException, status, WebSocket, WebSocketDisconnect
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.models.notification import Notification
from app.services.websocket_service import manager
from app.schemas.notification import NotificationResponse, NotificationList
from beanie import PydanticObjectId
from typing import List

router = APIRouter(prefix="/notifications", tags=["Notifications"])

@router.get("", response_model=NotificationList)
async def get_notifications(current_user: User = Depends(get_current_user)):
    """Fetch recent notifications for the current user."""
    print(f"Fetching notifications for user: {current_user.id} ({current_user.email})")
    notifications = await Notification.find(
        Notification.user_id == current_user.id
    ).sort("-created_at").limit(20).to_list()
    
    unread_count = await Notification.find(
        Notification.user_id == current_user.id,
        Notification.is_read == False
    ).count()
    
    print(f"Found {len(notifications)} notifications, {unread_count} unread")
    
    return {
        "items": [NotificationResponse.from_notification(n) for n in notifications],
        "unread_count": unread_count
    }

@router.patch("/{notification_id}/read", response_model=NotificationResponse)
async def mark_notification_as_read(
    notification_id: str,
    current_user: User = Depends(get_current_user)
):
    """Mark a specific notification as read."""
    try:
        obj_id = PydanticObjectId(notification_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid notification ID")
        
    notification = await Notification.get(obj_id)
    if not notification or notification.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Notification not found")
        
    notification.is_read = True
    await notification.save()
    return NotificationResponse.from_notification(notification)

@router.post("/read-all")
async def mark_all_notifications_as_read(current_user: User = Depends(get_current_user)):
    """Mark all notifications for the current user as read."""
    await Notification.find(
        Notification.user_id == current_user.id,
        Notification.is_read == False
    ).update({"$set": {"is_read": True}})
    
    return {"message": "All notifications marked as read"}

@router.delete("/{notification_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_notification(
    notification_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete a specific notification."""
    try:
        obj_id = PydanticObjectId(notification_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid notification ID")
        
    notification = await Notification.get(obj_id)
    if not notification or notification.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Notification not found")
        
    await notification.delete()
    return None

@router.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str, token: str = None):
    """
    WebSocket endpoint for real-time notifications.
    Validates token from query parameters or cookies, checking user ID ownership and token version.
    """
    token_val = token or websocket.cookies.get("access_token") or websocket.cookies.get("owner_access_token")
    if token_val:
        from app.auth.jwt_handler import decode_access_token
        payload = decode_access_token(token_val)
        if payload:
            sub = payload.get("sub")
            token_version = payload.get("token_version", 0)
            user = await User.get(PydanticObjectId(sub)) if sub else None
            
            if not user or user.token_version != token_version or (sub and sub != user_id):
                # Security: trying to subscribe to another user's stream or stale token
                await websocket.accept()
                await websocket.send_json({"type": "error", "message": "Unauthorized stream access"})
                await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
                return

    await manager.connect(websocket, user_id)
    try:
        while True:
            # Keep the connection open
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id)
