"""Seed production data: real user accounts with @ab-entheos.co.ke emails,
Gabonese villages, fund settings, and the bilingual CB incident form.

Run from backend/:
    docker compose run --rm backend python manage.py seed_real_data

To also wipe demo data first:
    docker compose run --rm backend python manage.py seed_real_data --wipe-demo
"""
from __future__ import annotations

import secrets
import string

from django.contrib.auth.models import Group
from django.core.management.base import BaseCommand
from django.db import transaction

from accounts.models import User, Village
from cases.models import FundSettings
from forms.models import FormDefinition


PROD_DOMAIN = "ab-entheos.co.ke"

# ── Production users ──────────────────────────────────────────────────────
# (email_local, role, language, first_name, last_name, village_slug_or_None)
PROD_USERS = [
    # CBs — one per village
    ("cb.libreville",  "CB", "fr", "Jean",      "Mboumba",   "libreville"),
    ("cb.oyem",        "CB", "fr", "Pierre",    "Nze",       "oyem"),
    ("cb.franceville", "CB", "fr", "Estelle",   "Koumba",    "franceville"),
    ("cb.makokou",     "CB", "fr", "Bruno",     "Engonga",   "makokou"),
    # AB Entheos
    ("ab",             "AB", "fr", "Marie",     "Ndong",     None),
    # WCS
    ("wcs",            "WCS","fr", "Paul",      "Mba",       None),
    # DGFC
    ("dgfc",           "DGFC","fr","Sylvie",    "Bekale",    None),
    # DGFAP
    ("dgfap",          "DGFAP","fr","Andre",    "Moussavou", None),
    # Minister
    ("minister",       "MINISTER","fr","H.E. Lea","Obame",   None),
    # Admin
    ("admin",          "ADMIN","en","Operator",  "HEC",       None),
    # Super Admin
    ("superadmin",     "SUPER_ADMIN","en","John Mark","Ekeno",None),
]

PROD_VILLAGES = [
    ("Libreville",  "Estuaire",       "cb.libreville"),
    ("Oyem",        "Woleu-Ntem",     "cb.oyem"),
    ("Franceville", "Haut-Ogooue",    "cb.franceville"),
    ("Makokou",     "Ogooue-Ivindo",  "cb.makokou"),
]


def _random_password(length: int = 16) -> str:
    """Generate a pronounceable-ish random password."""
    alphabet = string.ascii_letters + string.digits + "!@#$%&*"
    while True:
        pw = "".join(secrets.choice(alphabet) for _ in range(length))
        # Ensure it has mixed case, digit, and symbol
        has_upper = any(c.isupper() for c in pw)
        has_lower = any(c.islower() for c in pw)
        has_digit = any(c.isdigit() for c in pw)
        has_symbol = any(c in "!@#$%&*" for c in pw)
        if has_upper and has_lower and has_digit and has_symbol:
            return pw


INCIDENT_FORM_SCHEMA = {
    "title": {"en": "CB Incident Report", "fr": "Rapport d'incident CB"},
    "description": {
        "en": "Initial incident report submitted by a Chef de Brigade within 48 hours of the event.",
        "fr": "Rapport d'incident initial soumis par un Chef de Brigade dans les 48 heures suivant l'evenement.",
    },
    "fields": [
        {
            "id": "claimant_name",
            "type": "text",
            "label": {"en": "Claimant full name", "fr": "Nom complet du requerant"},
            "help": {"en": "As it appears on the national ID.", "fr": "Tel qu'il figure sur la piece d'identite."},
            "required": True,
        },
        {
            "id": "claimant_phone",
            "type": "tel",
            "label": {"en": "Claimant phone", "fr": "Telephone du requerant"},
            "required": True,
        },
        {
            "id": "incident_date",
            "type": "date",
            "label": {"en": "Incident date", "fr": "Date de l'incident"},
            "required": True,
        },
        {
            "id": "case_type",
            "type": "select",
            "label": {"en": "Case type", "fr": "Type de dossier"},
            "options": [
                {"value": "MEDICAL", "label": {"en": "Medical (injury)", "fr": "Medical (blessure)"}},
                {"value": "BURIAL",  "label": {"en": "Burial (death)",   "fr": "Funeraire (deces)"}},
            ],
            "required": True,
        },
        {
            "id": "elephant_count",
            "type": "number",
            "label": {"en": "Number of elephants involved", "fr": "Nombre d'elephants impliques"},
            "min": 1,
            "max": 20,
            "required": True,
        },
        {
            "id": "witness_names",
            "type": "textarea",
            "label": {"en": "Witness names (one per line)", "fr": "Noms des temoins (un par ligne)"},
        },
        {
            "id": "narrative",
            "type": "textarea",
            "label": {"en": "Incident narrative", "fr": "Description de l'incident"},
            "help": {"en": "What happened, in chronological order.", "fr": "Ce qui s'est passe, dans l'ordre chronologique."},
            "required": True,
        },
        {
            "id": "claimant_signature",
            "type": "signature",
            "label": {"en": "Claimant signature", "fr": "Signature du requerant"},
            "required": True,
        },
    ],
}


class Command(BaseCommand):
    help = "Seed production data: real users, villages, fund settings, and CB form."

    def add_arguments(self, parser):
        parser.add_argument(
            "--wipe-demo",
            action="store_true",
            help="Delete all demo (@hec.local) users before seeding.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        wipe_demo = options["wipe_demo"]

        # ── Optional: wipe demo data ─────────────────────────────────────
        if wipe_demo:
            demo_count = User.objects.filter(email__endswith="@hec.local").count()
            if demo_count:
                self.stdout.write(self.style.WARNING(
                    f"  Deleting {demo_count} demo users (@hec.local)..."
                ))
                User.objects.filter(email__endswith="@hec.local").delete()

        # ── FundSettings singleton ───────────────────────────────────────
        fs, _ = FundSettings.objects.get_or_create(pk=1)
        self.stdout.write(self.style.SUCCESS(
            f"FundSettings: medical={fs.medical_ceiling_xaf:,} XAF · "
            f"burial={fs.burial_ceiling_xaf:,} XAF"
        ))

        # ── Villages ─────────────────────────────────────────────────────
        village_by_slug = {}
        for name, region, cb_email_local in PROD_VILLAGES:
            full_email = f"{cb_email_local}@{PROD_DOMAIN}"
            contact = User.objects.filter(email=full_email).first()
            village, created = Village.objects.get_or_create(
                name=name,
                defaults={"region": region, "contact_user": contact},
            )
            if not created and getattr(village, "contact_user_id", None) is None and contact:
                village.contact_user = contact
                village.save(update_fields=["contact_user"])
            village_by_slug[cb_email_local] = village
            self.stdout.write(f"  Village: {name} ({region})")

        # ── Users ────────────────────────────────────────────────────────
        credentials: list[tuple[str, str, str]] = []  # (email, role, password)

        for email_local, role, lang, first, last, village_slug in PROD_USERS:
            email = f"{email_local}@{PROD_DOMAIN}"
            village = village_by_slug.get(village_slug) if village_slug else None

            user, created = User.objects.get_or_create(
                email=email,
                defaults={
                    "username": email_local,
                    "role": role,
                    "preferred_language": lang,
                    "first_name": first,
                    "last_name": last,
                    "village": village,
                    "is_2fa_enabled": False,
                    "is_staff": role in ("ADMIN", "SUPER_ADMIN"),
                    "is_superuser": role == "SUPER_ADMIN",
                },
            )

            if created:
                password = _random_password()
                user.set_password(password)
                user.save()
                credentials.append((email, role, password))
                self.stdout.write(self.style.SUCCESS(
                    f"  ✅ {role:12s} {email:40s}  village={village.name if village else '-':12s}  (CREATED)"
                ))
            else:
                # Update role/village if changed
                changed = False
                target_village_id = village.pk if village else None
                if getattr(user, "village_id", None) != target_village_id:
                    user.village = village
                    changed = True
                if user.role != role:
                    user.role = role
                    changed = True
                if user.is_staff != (role in ("ADMIN", "SUPER_ADMIN")):
                    user.is_staff = role in ("ADMIN", "SUPER_ADMIN")
                    changed = True
                if user.is_superuser != (role == "SUPER_ADMIN"):
                    user.is_superuser = role == "SUPER_ADMIN"
                    changed = True
                if changed:
                    user.save(update_fields=["village", "role", "is_staff", "is_superuser"])
                self.stdout.write(
                    f"  ⏭  {role:12s} {email:40s}  village={village.name if village else '-':12s}  (EXISTS)"
                )

        # ── Bilingual CB incident form ───────────────────────────────────
        from django.utils.text import slugify
        from django.utils import timezone

        slug = slugify(INCIDENT_FORM_SCHEMA["title"]["en"])
        fd, created = FormDefinition.objects.get_or_create(
            slug=slug,
            version=1,
            defaults={
                "title": INCIDENT_FORM_SCHEMA["title"]["en"],
                "schema": INCIDENT_FORM_SCHEMA,
                "role_scope": "CB",
                "status": FormDefinition.Status.PUBLISHED,
                "published_at": timezone.now(),
            },
        )
        self.stdout.write(self.style.SUCCESS(
            f"  FormDefinition: {fd.slug} v{fd.version} [{fd.status}]"
        ))

        # ── Print credentials ────────────────────────────────────────────
        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("=" * 72))
        self.stdout.write(self.style.SUCCESS("  PRODUCTION SEED COMPLETE"))
        self.stdout.write(self.style.SUCCESS("=" * 72))

        if credentials:
            self.stdout.write(self.style.WARNING(
                "\n  ⚠️  SAVE THESE PASSWORDS — they are shown ONCE only!\n"
            ))
            self.stdout.write(f"  {'EMAIL':42s} {'ROLE':14s} PASSWORD")
            self.stdout.write(f"  {'-'*42} {'-'*14} {'-'*16}")
            for email, role, password in credentials:
                self.stdout.write(f"  {email:42s} {role:14s} {password}")
        else:
            self.stdout.write(self.style.WARNING(
                "\n  No new users created (all accounts already exist)."
            ))

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("=" * 72))
