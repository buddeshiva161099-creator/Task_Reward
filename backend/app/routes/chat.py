import os
import shutil
from datetime import datetime
from app.utils.ist_time import to_utc_iso
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from pydantic import BaseModel
from beanie import PydanticObjectId

from app.models.user import User, UserRole
from app.models.chat_group import ChatGroup
from app.models.chat_message import ChatMessage
from app.models.task import Task
from app.models.activity_log import ActivityLog
from app.models.notification import Notification
from app.auth.dependencies import get_current_user

router = APIRouter(prefix="/chat", tags=["Chat Collaboration"])

# --- schemas ---

class GroupCreateRequest(BaseModel):
    name: str
    members: List[str]

class GroupUpdateRequest(BaseModel):
    name: Optional[str] = None
    members: Optional[List[str]] = None

class MessageSendRequest(BaseModel):
    group_id: Optional[str] = None
    recipient_id: Optional[str] = None
    text: str
    type: str = "text"
    attachment_url: Optional[str] = None
    attachment_name: Optional[str] = None
    task_card_id: Optional[str] = None

class TipRequest(BaseModel):
    recipient_id: str
    points: float
    message: str

class ReadMessageRequest(BaseModel):
    group_id: Optional[str] = None
    sender_id: Optional[str] = None

# Helper to check if a user can manage groups / send tips
def is_manager(user: User) -> bool:
    return user.role != UserRole.EMPLOYEE

# --- API Endpoints ---

@router.get("/users", response_model=List[dict])
async def get_active_chat_users(current_user: User = Depends(get_current_user)):
    """Retrieve all active, non-deleted employees for direct chats, with last message, unread count, sorted by recent activity."""
    users = await User.find(User.is_deleted != True).to_list()
    
    hydrated_users = []
    for u in users:
        if u.id == current_user.id:
            continue
            
        # Get the last message between current_user and this contact
        last_msg = await ChatMessage.find({
            "$or": [
                {"sender_id": current_user.id, "recipient_id": u.id},
                {"sender_id": u.id, "recipient_id": current_user.id}
            ]
        }).sort("-created_at").first_or_none()
        
        # Calculate unread count (messages sent by u to current_user, that current_user has not read)
        unread_count = await ChatMessage.find({
            "sender_id": u.id,
            "recipient_id": current_user.id,
            "read_by": {"$ne": current_user.id}
        }).count()
        
        last_msg_text = ""
        last_msg_time = None
        if last_msg:
            last_msg_time = to_utc_iso(last_msg.created_at)
            if last_msg.deleted_for_everyone:
                last_msg_text = "[Message deleted]"
            elif last_msg.type == "file":
                last_msg_text = "📁 File: " + (last_msg.attachment_name or "Attachment")
            elif last_msg.type == "task":
                last_msg_text = "📋 Shared Task"
            elif last_msg.type == "tip":
                last_msg_text = f"🏆 Appreciated +{last_msg.tip_points} pts"
            else:
                last_msg_text = last_msg.text
                
        hydrated_users.append({
            "id": str(u.id),
            "name": u.name,
            "email": u.email,
            "role": u.role.value,
            "last_active": to_utc_iso(u.last_active) if u.last_active else None,
            "last_message_text": last_msg_text,
            "last_message_time": last_msg_time,
            "unread_count": unread_count
        })
        
    def get_sort_key(item):
        return item["last_message_time"] if item["last_message_time"] else "1970-01-01T00:00:00Z"
        
    hydrated_users.sort(key=get_sort_key, reverse=True)
    return hydrated_users

@router.get("/groups", response_model=List[dict])
async def get_my_chat_groups(current_user: User = Depends(get_current_user)):
    """Retrieve all groups current user is a member of, with last message, unread count, sorted by recent activity."""
    groups = await ChatGroup.find(ChatGroup.members == current_user.id).to_list()
    
    hydrated_groups = []
    for g in groups:
        # Get the last message in this group
        last_msg = await ChatMessage.find(ChatMessage.group_id == g.id).sort("-created_at").first_or_none()
        
        # Calculate unread count in this group (messages not sent by current_user, and not read by current_user)
        unread_count = await ChatMessage.find({
            "group_id": g.id,
            "sender_id": {"$ne": current_user.id},
            "read_by": {"$ne": current_user.id}
        }).count()
        
        last_msg_text = ""
        last_msg_time = None
        if last_msg:
            last_msg_time = to_utc_iso(last_msg.created_at)
            if last_msg.deleted_for_everyone:
                last_msg_text = "[Message deleted]"
            elif last_msg.type == "file":
                last_msg_text = f"{last_msg.sender_name}: 📁 File"
            elif last_msg.type == "task":
                last_msg_text = f"{last_msg.sender_name}: 📋 Shared Task"
            elif last_msg.type == "tip":
                last_msg_text = f"{last_msg.sender_name}: 🏆 Appreciated +{last_msg.tip_points} pts"
            else:
                last_msg_text = f"{last_msg.sender_name}: {last_msg.text}"
                
        hydrated_groups.append({
            "id": str(g.id),
            "name": g.name,
            "members": [str(m) for m in g.members],
            "created_by": str(g.created_by),
            "created_at": g.created_at.isoformat(),
            "updated_at": g.updated_at.isoformat(),
            "last_message_text": last_msg_text,
            "last_message_time": last_msg_time,
            "unread_count": unread_count
        })
        
    def get_sort_key(item):
        return item["last_message_time"] if item["last_message_time"] else "1970-01-01T00:00:00Z"
        
    hydrated_groups.sort(key=get_sort_key, reverse=True)
    return hydrated_groups

@router.post("/groups", status_code=status.HTTP_201_CREATED)
async def create_chat_group(
    request: GroupCreateRequest,
    current_user: User = Depends(get_current_user)
):
    """Create a new group chat. (Restricted to Managers/HR/Admins)"""
    if not is_manager(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only managers and administrators are authorized to create groups."
        )

    # Prepare members list (always include the creator)
    member_ids = {current_user.id}
    for m_id in request.members:
        try:
            member_ids.add(PydanticObjectId(m_id))
        except Exception:
            continue

    group = ChatGroup(
        name=request.name.strip(),
        members=list(member_ids),
        created_by=current_user.id
    )
    await group.insert()
    return {
        "message": "Group created successfully",
        "group": {
            "id": str(group.id),
            "name": group.name,
            "members": [str(m) for m in group.members]
        }
    }

@router.put("/groups/{group_id}")
async def update_chat_group(
    group_id: str,
    request: GroupUpdateRequest,
    current_user: User = Depends(get_current_user)
):
    """Modify group name or member list. (Restricted to Managers/HR/Admins)"""
    if not is_manager(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only managers and administrators are authorized to manage groups."
        )

    group = await ChatGroup.get(PydanticObjectId(group_id))
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")

    if request.name is not None:
        group.name = request.name.strip()

    if request.members is not None:
        member_ids = {current_user.id}
        for m_id in request.members:
            try:
                member_ids.add(PydanticObjectId(m_id))
            except Exception:
                continue
        group.members = list(member_ids)

    group.updated_at = datetime.utcnow()
    await group.save()
    return {
        "message": "Group updated successfully",
        "group": {
            "id": str(group.id),
            "name": group.name,
            "members": [str(m) for m in group.members]
        }
    }

@router.delete("/groups/{group_id}")
async def delete_chat_group(
    group_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete a group chat completely. (Restricted to Managers/HR/Admins)"""
    if not is_manager(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only managers and administrators are authorized to delete groups."
        )

    group = await ChatGroup.get(PydanticObjectId(group_id))
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")

    # Delete all messages inside this group
    await ChatMessage.find(ChatMessage.group_id == group.id).delete()
    await group.delete()

    return {"message": "Group and its conversation logs deleted successfully"}

@router.get("/history", response_model=List[dict])
async def get_chat_history(
    group_id: Optional[str] = None,
    recipient_id: Optional[str] = None,
    q: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Fetch message history for direct or group chats. Supports case-insensitive content query `q`."""
    if not group_id and not recipient_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Must provide either group_id or recipient_id"
        )

    query = {}
    if group_id:
        query["group_id"] = PydanticObjectId(group_id)
    else:
        # Direct 1-on-1 chat query: sender=current & recipient=other OR vice-versa
        other_uid = PydanticObjectId(recipient_id)
        query["$or"] = [
            {"sender_id": current_user.id, "recipient_id": other_uid},
            {"sender_id": other_uid, "recipient_id": current_user.id}
        ]

    # Exclude messages deleted for current user
    if "$and" not in query:
        query = {"$and": [query]}
    query["$and"].append({"deleted_for_users": {"$ne": current_user.id}})

    # Apply keyword filtering if provided
    if q and q.strip():
        # Match case-insensitive substring
        query["$and"].append({"text": {"$regex": q.strip(), "$options": "i"}})

    messages = await ChatMessage.find(query).sort("created_at").to_list()

    # Hydrate tasks if type == "task" or task_card_id is present
    hydrated = []
    for msg in messages:
        task_details = None
        if msg.task_card_id:
            task = await Task.get(msg.task_card_id)
            if task:
                task_details = {
                    "id": str(task.id),
                    "work_description": task.work_description,
                    "status": task.status.value,
                    "priority": task.priority.value,
                    "deadline": task.deadline.isoformat() if task.deadline else None
                }
        
        hydrated.append({
            "id": str(msg.id),
            "group_id": str(msg.group_id) if msg.group_id else None,
            "sender_id": str(msg.sender_id),
            "sender_name": msg.sender_name,
            "recipient_id": str(msg.recipient_id) if msg.recipient_id else None,
            "text": msg.text,
            "type": msg.type,
            "attachment_url": msg.attachment_url,
            "attachment_name": msg.attachment_name,
            "task_card_id": str(msg.task_card_id) if msg.task_card_id else None,
            "task_details": task_details,
            "tip_points": msg.tip_points,
            "deleted_for_everyone": msg.deleted_for_everyone,
            "created_at": to_utc_iso(msg.created_at)
        })
    return hydrated

@router.post("/messages", status_code=status.HTTP_201_CREATED)
async def send_chat_message(
    request: MessageSendRequest,
    current_user: User = Depends(get_current_user)
):
    """Post a new message in direct or group chats."""
    g_id = PydanticObjectId(request.group_id) if request.group_id else None
    r_id = PydanticObjectId(request.recipient_id) if request.recipient_id else None
    t_id = PydanticObjectId(request.task_card_id) if request.task_card_id else None

    msg = ChatMessage(
        group_id=g_id,
        sender_id=current_user.id,
        sender_name=current_user.name,
        recipient_id=r_id,
        text=request.text,
        type=request.type,
        attachment_url=request.attachment_url,
        attachment_name=request.attachment_name,
        task_card_id=t_id
    )
    await msg.insert()

    # Determine preview text for the notification
    preview_text = request.text
    if request.type == "file":
        preview_text = f"📁 File: {request.attachment_name or 'Attachment'}"
    elif request.type == "task":
        preview_text = "📋 Shared Task"
    elif request.type == "tip":
        preview_text = "🏆 Appreciated points"

    # Create Notifications
    if r_id:
        notif = Notification(
            user_id=r_id,
            sender_id=current_user.id,
            title=f"New message from {current_user.name}",
            message=preview_text,
            type="chat"
        )
        await notif.insert()
    elif g_id:
        group = await ChatGroup.get(g_id)
        if group:
            for member_id in group.members:
                if member_id != current_user.id:
                    notif = Notification(
                        user_id=member_id,
                        sender_id=current_user.id,
                        chat_group_id=g_id,
                        title=f"New message in {group.name}",
                        message=f"{current_user.name}: {preview_text}",
                        type="chat"
                    )
                    await notif.insert()

    return {"message": "Message sent", "id": str(msg.id)}

@router.post("/read")
async def mark_messages_as_read(
    request: ReadMessageRequest,
    current_user: User = Depends(get_current_user)
):
    """Mark messages as read in a direct chat or group."""
    if not request.group_id and not request.sender_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Must provide either group_id or sender_id"
        )

    collection = ChatMessage.get_motor_collection()

    if request.group_id:
        query = {
            "group_id": PydanticObjectId(request.group_id),
            "sender_id": {"$ne": current_user.id},
            "read_by": {"$ne": current_user.id}
        }
        # Mark corresponding chat notifications as read
        await Notification.find(
            Notification.user_id == current_user.id,
            Notification.chat_group_id == PydanticObjectId(request.group_id),
            Notification.type == "chat",
            Notification.is_read == False
        ).update({"$set": {"is_read": True}})
    else:
        query = {
            "sender_id": PydanticObjectId(request.sender_id),
            "recipient_id": current_user.id,
            "read_by": {"$ne": current_user.id}
        }
        # Mark corresponding chat notifications as read
        await Notification.find(
            Notification.user_id == current_user.id,
            Notification.sender_id == PydanticObjectId(request.sender_id),
            Notification.type == "chat",
            Notification.is_read == False
        ).update({"$set": {"is_read": True}})

    await collection.update_many(
        query,
        {"$addToSet": {"read_by": current_user.id}}
    )
    return {"status": "success"}

@router.post("/upload")
async def upload_chat_attachment(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """Upload file attachments for sharing inside conversations."""
    os.makedirs("uploads/chat", exist_ok=True)
    
    timestamp = int(datetime.utcnow().timestamp())
    filename = f"{timestamp}_{file.filename.replace(' ', '_')}"
    filepath = os.path.join("uploads", "chat", filename)

    with open(filepath, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Return local access URL
    public_url = f"/uploads/chat/{filename}"
    return {
        "url": public_url,
        "name": file.filename
    }

@router.post("/presence/heartbeat")
async def register_presence_heartbeat(current_user: User = Depends(get_current_user)):
    """Keep the current employee's active presence updated in the system."""
    current_user.last_active = datetime.utcnow()
    await current_user.save()
    return {"status": "heartbeat recorded", "last_active": current_user.last_active.isoformat()}

@router.post("/tip")
async def gift_points_in_chat(
    request: TipRequest,
    current_user: User = Depends(get_current_user)
):
    """Gift reward points (Tipping) to another employee inside their direct conversation chat."""
    if not is_manager(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only managers and administrators are authorized to gift reward points."
        )

    recipient = await User.get(PydanticObjectId(request.recipient_id))
    if not recipient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recipient not found")

    if recipient.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot tip reward points to yourself."
        )

    if request.points <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Gifted points value must be greater than zero."
        )

    # Add points to employee balance
    recipient.reward_points += request.points
    await recipient.save()

    # Generate appreciation tip chat message
    tip_msg = ChatMessage(
        sender_id=current_user.id,
        sender_name=current_user.name,
        recipient_id=recipient.id,
        text=request.message.strip() or f"Appreciated you with +{request.points} reward points!",
        type="tip",
        tip_points=request.points
    )
    await tip_msg.insert()

    # Create a notification for the recipient
    notif = Notification(
        user_id=recipient.id,
        sender_id=current_user.id,
        title=f"New message from {current_user.name}",
        message=f"🏆 Appreciated you with +{request.points} reward points!",
        type="chat"
    )
    await notif.insert()

    # Generate official Audit/Activity log
    audit = ActivityLog(
        user_id=current_user.id,
        user_name=current_user.name,
        action="Gave reward points",
        details=f"Appreciated employee {recipient.name} with {request.points} points in direct conversation.",
    )
    await audit.insert()

    return {
        "message": f"Successfully tipped {request.points} reward points!",
        "new_balance": recipient.reward_points
    }

@router.delete("/messages/{message_id}")
async def delete_chat_message(
    message_id: str,
    delete_type: str = "me",  # Options: "me", "everyone"
    current_user: User = Depends(get_current_user)
):
    """Delete a message. Offers 'me' (hide for current user) or 'everyone' (redact for all)."""
    msg = await ChatMessage.get(PydanticObjectId(message_id))
    if not msg:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")

    if delete_type == "me":
        # Add user to hidden list
        if current_user.id not in msg.deleted_for_users:
            msg.deleted_for_users.append(current_user.id)
            await msg.save()
        return {"message": "Message deleted for you"}

    elif delete_type == "everyone":
        # Check permissions: only sender or a manager can delete for everyone
        is_sender = msg.sender_id == current_user.id
        if not is_sender and not is_manager(current_user):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not authorized to redact this message for everyone."
            )

        msg.text = "[Message deleted]"
        msg.type = "text"
        msg.attachment_url = None
        msg.attachment_name = None
        msg.task_card_id = None
        msg.tip_points = None
        msg.deleted_for_everyone = True
        await msg.save()
        return {"message": "Message deleted for everyone"}

    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid delete_type. Must be either 'me' or 'everyone'."
        )
