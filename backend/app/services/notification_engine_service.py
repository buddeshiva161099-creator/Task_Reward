"""
Notification engine service for rendering templates, checking preferences, and logging deliveries.
"""
from typing import Optional, Dict, Any, List
from app.models.notification_engine import NotificationTemplate, NotificationPreference, NotificationDeliveryLog
from app.models.user import User
from app.services.notification_service import NotificationService
from beanie import PydanticObjectId
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


class NotificationEngineService:
    @staticmethod
    async def seed_templates():
        """Seed default notification templates if they do not exist."""
        defaults = [
            {
                "template_name": "leave_applied",
                "title_template": "New Leave Application",
                "body_template": "{{user_name}} has applied for {{leave_type}} leave from {{start_date}} to {{end_date}}.",
                "channels": ["in_app", "email"]
            },
            {
                "template_name": "leave_approved",
                "title_template": "Leave Request Approved",
                "body_template": "Your leave request from {{start_date}} to {{end_date}} has been approved by {{approver_name}}.",
                "channels": ["in_app", "email"]
            },
            {
                "template_name": "leave_rejected",
                "title_template": "Leave Request Rejected",
                "body_template": "Your leave request from {{start_date}} to {{end_date}} has been rejected. Comments: {{comments}}.",
                "channels": ["in_app", "email"]
            },
            {
                "template_name": "task_assigned",
                "title_template": "New Task Assigned",
                "body_template": "You have been assigned a new task: {{work_description}} (Priority: {{priority}}).",
                "channels": ["in_app", "email"]
            },
            {
                "template_name": "task_overdue",
                "title_template": "Task Overdue Notice",
                "body_template": "Task '{{work_description}}' assigned to you is overdue since {{deadline}}.",
                "channels": ["in_app", "email"]
            },
            {
                "template_name": "payroll_drafted",
                "title_template": "Payroll Draft Generated",
                "body_template": "Payroll draft for the month {{month}} has been generated for review.",
                "channels": ["in_app", "email"]
            },
            {
                "template_name": "payroll_locked",
                "title_template": "Payroll Period Locked",
                "body_template": "Payroll period for the month {{month}} has been locked.",
                "channels": ["in_app", "email"]
            },
            {
                "template_name": "payroll_paid",
                "title_template": "Payslip Released",
                "body_template": "Your payslip for {{month}} has been released. Net Salary: {{net_salary}}.",
                "channels": ["in_app", "email", "sms"]
            }
        ]

        for item in defaults:
            existing = await NotificationTemplate.find_one(NotificationTemplate.template_name == item["template_name"])
            if not existing:
                template = NotificationTemplate(**item)
                await template.insert()
                logger.info(f"Seeded notification template: {item['template_name']}")

    @staticmethod
    def render_string(template_str: str, context: Dict[str, Any]) -> str:
        """Render templates by replacing {{key}} placeholders."""
        rendered = template_str
        for k, v in context.items():
            placeholder = "{{" + str(k) + "}}"
            rendered = rendered.replace(placeholder, str(v))
        return rendered

    @classmethod
    async def dispatch_templated_notification(
        cls,
        user_id: PydanticObjectId,
        template_name: str,
        context: Dict[str, Any],
        sender_id: Optional[PydanticObjectId] = None,
        chat_group_id: Optional[PydanticObjectId] = None
    ) -> List[NotificationDeliveryLog]:
        """Render and dispatch notifications via in_app, email, and sms based on templates & user preference."""
        # 1. Fetch user preference or create default
        pref = await NotificationPreference.find_one(NotificationPreference.user_id == user_id)
        if not pref:
            pref = NotificationPreference(user_id=user_id)
            await pref.insert()

        # 2. Fetch template
        template = await NotificationTemplate.find_one(NotificationTemplate.template_name == template_name)
        if not template:
            logger.warning(f"Template '{template_name}' not found. Using fallback rendering.")
            title = f"Alert: {template_name.replace('_', ' ').title()}"
            body = "Notification context details: " + str(context)
            channels = ["in_app"]
        else:
            title = cls.render_string(template.title_template, context)
            body = cls.render_string(template.body_template, context)
            channels = template.channels

        logs = []

        # 3. Deliver per channel
        for channel in channels:
            # Check preferences
            enabled = True
            if channel == "in_app" and not pref.in_app_enabled:
                enabled = False
            elif channel == "email" and not pref.email_enabled:
                enabled = False
            elif channel == "sms" and not pref.sms_enabled:
                enabled = False

            if not enabled:
                # Log preference rejection
                log = NotificationDeliveryLog(
                    user_id=user_id,
                    channel=channel,
                    status="failed",
                    error_message="User opted out of this channel in preferences."
                )
                await log.insert()
                logs.append(log)
                continue

            if channel == "in_app":
                try:
                    notif = await NotificationService.notify_user(
                        user_id=user_id,
                        title=title,
                        message=body,
                        type="system" if template_name != "chat" else "chat",
                        sender_id=sender_id,
                        chat_group_id=chat_group_id
                    )
                    log = NotificationDeliveryLog(
                        notification_id=notif.id,
                        user_id=user_id,
                        channel="in_app",
                        status="delivered",
                        sent_at=datetime.now(timezone.utc)
                    )
                    await log.insert()
                    logs.append(log)
                except Exception as e:
                    logger.error(f"Failed to send in-app notification: {e}")
                    log = NotificationDeliveryLog(
                        user_id=user_id,
                        channel="in_app",
                        status="failed",
                        error_message=str(e)
                    )
                    await log.insert()
                    logs.append(log)
            else:
                # Mock email/sms delivery log
                log = NotificationDeliveryLog(
                    user_id=user_id,
                    channel=channel,
                    status="delivered",
                    sent_at=datetime.now(timezone.utc),
                    error_message=f"Mocked {channel.upper()} delivery successfully."
                )
                await log.insert()
                logs.append(log)

        return logs
