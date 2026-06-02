from typing import List, Optional, Set
from app.models.notification import Notification
from app.models.user import User, UserRole
from app.services.websocket_service import manager
from beanie import PydanticObjectId
from beanie.operators import In
import logging

logger = logging.getLogger(__name__)

class NotificationService:
    @staticmethod
    async def notify_user(
        user_id: PydanticObjectId,
        title: str,
        message: str,
        type: str = "system",
        sender_id: Optional[PydanticObjectId] = None,
        chat_group_id: Optional[PydanticObjectId] = None
    ):
        notification = Notification(
            user_id=user_id,
            sender_id=sender_id,
            title=title,
            message=message,
            type=type,
            chat_group_id=chat_group_id
        )
        await notification.insert()

        # Push via WebSocket
        try:
            await manager.send_personal_message({
                "type": "notification",
                "data": {
                    "id": str(notification.id),
                    "title": title,
                    "message": message,
                    "type": type,
                    "created_at": notification.created_at.isoformat()
                }
            }, str(user_id))
        except Exception as e:
            logger.warning(f"Failed to push notification via WS: {e}")

        return notification

    @staticmethod
    async def notify_users(
        user_ids: List[PydanticObjectId],
        title: str,
        message: str,
        type: str = "system",
        sender_id: Optional[PydanticObjectId] = None
    ):
        if not user_ids:
            return

        notifications = [
            Notification(
                user_id=uid,
                sender_id=sender_id,
                title=title,
                message=message,
                type=type
            )
            for uid in user_ids
        ]
        await Notification.insert_many(notifications)

        # Push via WebSocket for each user
        for uid in user_ids:
            try:
                await manager.send_personal_message({
                    "type": "notification",
                    "data": {
                        "title": title,
                        "message": message,
                        "type": type,
                    }
                }, str(uid))
            except Exception as e:
                logger.warning(f"Failed to push notification via WS to user {uid}: {e}")

    @staticmethod
    async def notify_management_for_user(
        user: User,
        title: str,
        message: str,
        type: str = "system",
        exclude_user: bool = True,
        force_notify_admins: bool = False
    ):
        recipient_ids: Set[PydanticObjectId] = set()

        if user.reporting_manager_id:
            recipient_ids.add(user.reporting_manager_id)
        if user.hr_reporting_manager_id:
            recipient_ids.add(user.hr_reporting_manager_id)

        # Notify HR team
        hr_users = await User.find(
            In(User.role, [UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.ASSISTANT_HR_MANAGER]),
            User.is_active == True,
            User.is_deleted == False
        ).to_list()

        for hr in hr_users:
            if hr.id == user.id and not force_notify_admins:
                continue
            recipient_ids.add(hr.id)

        if exclude_user and not force_notify_admins:
            recipient_ids.discard(user.id)

        await NotificationService.notify_users(
            user_ids=list(recipient_ids),
            title=title,
            message=message,
            type=type,
            sender_id=user.id
        )
