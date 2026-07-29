"""Management command to send test emails for every notification type.

Usage:
    python manage.py test_emails --to mark@ab-entheos.co.ke
"""
from __future__ import annotations

import sys
from io import StringIO

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Send one test email per notification type to verify Resend integration."

    def add_arguments(self, parser):
        parser.add_argument(
            "--to",
            default="mark@ab-entheos.co.ke",
            help="Recipient email address (default: mark@ab-entheos.co.ke)",
        )
        parser.add_argument(
            "--lang",
            choices=["en", "fr", "both"],
            default="both",
            help="Which language templates to test (default: both)",
        )

    def handle(self, *args, **options):
        to = options["to"]
        lang = options["lang"]

        # Force dev settings so we use console backend + sync celery
        import os
        os.environ.setdefault("DJANGO_SETTINGS_MODULE", "hec_fund.settings.dev")

        import django
        django.setup()

        from django.conf import settings
        from notifications.tasks import send_notification_email

        # Fake objects for template context
        class FakeUser:
            first_name = "Jean-Pierre"
            email = to
            preferred_language = "fr"
            def get_role_display(self): return "Chef de Brigade"
            def get_preferred_language_display(self): return "Français"

        class FakeCase:
            uid = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
            claimant_name = "Marie Obame"
            case_type = "MEDICAL"
            incident_location = "Lopé National Park, Gabon"
            incident_at = "2026-07-28"
            reported_at = "2026-07-29"
            amount_authorized = "1500000"
            amount_proposed = "1200000"
            village = "Batoué"
            current_step = 3
            sla_deadline = "2026-08-05"
            def get_case_type_display(self): return "Medical"
            created_by = FakeUser()

        fake_user = FakeUser()
        fake_case = FakeCase()

        # Define every notification scenario
        scenarios: list[tuple[str, str, dict]] = [
            ("account_created", "en", {"user": fake_user, "temp_password": "Xk9#mP2$vL7nQ"}),
            ("account_created", "fr", {"user": fake_user, "temp_password": "Xk9#mP2$vL7nQ"}),
            ("password_reset", "en", {"user": fake_user, "reset_url": "http://localhost:5173/reset?token=abc123"}),
            ("password_reset", "fr", {"user": fake_user, "reset_url": "http://localhost:5173/reset?token=abc123"}),
            ("new_claim", "en", {"case": fake_case, "recipient": fake_user}),
            ("new_claim", "fr", {"case": fake_case, "recipient": fake_user}),
            ("case_submitted", "en", {"case": fake_case, "recipient": fake_user}),
            ("case_submitted", "fr", {"case": fake_case, "recipient": fake_user}),
            ("case_verified", "en", {"case": fake_case, "recipient": fake_user, "step": 3}),
            ("case_verified", "fr", {"case": fake_case, "recipient": fake_user, "step": 3}),
            ("case_approved", "en", {"case": fake_case, "step": 6}),
            ("case_approved", "fr", {"case": fake_case, "step": 6}),
            ("case_rejected", "en", {"case": fake_case, "actor": fake_user}),
            ("case_rejected", "fr", {"case": fake_case, "actor": fake_user}),
            ("case_deferred", "en", {"case": fake_case, "actor": fake_user, "step": 4}),
            ("case_deferred", "fr", {"case": fake_case, "actor": fake_user, "step": 4}),
            ("case_closed", "en", {"case": fake_case, "actor": fake_user, "recipient": fake_user}),
            ("case_closed", "fr", {"case": fake_case, "actor": fake_user, "recipient": fake_user}),
            ("amount_proposed", "en", {"case": fake_case, "amount_xaf": 1200000, "actor": fake_user}),
            ("amount_proposed", "fr", {"case": fake_case, "amount_xaf": 1200000, "actor": fake_user}),
            ("amount_authorized", "en", {"case": fake_case, "amount_xaf": 1500000, "actor": fake_user}),
            ("amount_authorized", "fr", {"case": fake_case, "amount_xaf": 1500000, "actor": fake_user}),
        ]

        # Filter by language if requested
        if lang == "en":
            scenarios = [(n, l, c) for n, l, c in scenarios if l == "en"]
        elif lang == "fr":
            scenarios = [(n, l, c) for n, l, c in scenarios if l == "fr"]

        api_key = getattr(settings, "RESEND_API_KEY", "")
        provider = "Resend" if api_key else "console (no API key set)"
        from_email = getattr(settings, "DEFAULT_FROM_EMAIL", "unknown")

        self.stdout.write(self.style.WARNING(
            f"\n  Sending {len(scenarios)} test emails to: {to}\n"
            f"  From: {from_email}\n"
            f"  Provider: {provider}\n"
        ))

        sent = 0
        failed = 0
        for notification_type, language, ctx in scenarios:
            label = f"{notification_type} [{language}]"
            try:
                # Call synchronously since CELERY_TASK_ALWAYS_EAGER=True in dev
                result = send_notification_email(
                    notification_type=notification_type,
                    recipient_email=to,
                    language=language,
                    template_context=ctx,
                )
                self.stdout.write(self.style.SUCCESS(f"  ✓ {label}"))
                sent += 1
            except Exception as e:
                self.stderr.write(self.style.ERROR(f"  ✗ {label} — {e}"))
                failed += 1

        self.stdout.write(self.style.WARNING(
            f"\n  Done: {sent} sent, {failed} failed out of {len(scenarios)}\n"
        ))
