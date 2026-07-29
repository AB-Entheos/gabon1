"""Seed demo data: multiple users per role (CB/AB/WCS/DGFC/DGFAP/MINISTER), an
ADMIN, and a SUPER_ADMIN. Plus villages, fund settings, and a published
bilingual CB incident-report form.
"""
from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify

from accounts.models import User, Village
from cases.models import FundSettings
from forms.models import FormDefinition


SEED_USERS = [
    # email, role, language, first_name, last_name, requires_2fa, village_slug_or_None
    # --- Two CBs per village (so multiple CBs can co-exist) ---
    ("cb.libreville@hec.local",  "CB", "fr", "Jean",      "Mboumba",   False, "libreville"),
    ("cb.libreville2@hec.local", "CB", "fr", "Alice",     "Mbouyi",    False, "libreville"),
    ("cb.oyem@hec.local",        "CB", "fr", "Pierre",    "Nze",       False, "oyem"),
    ("cb.franceville@hec.local", "CB", "fr", "Estelle",   "Koumba",    False, "franceville"),
    ("cb.makokou@hec.local",     "CB", "fr", "Bruno",     "Engonga",   False, "makokou"),
    # --- Two DPs per village (Delegué Provincial — same field-reporter role as CB) ---
    ("dp.libreville@hec.local",  "DP", "fr", "Sylvain",   "Ndong",     False, "libreville"),
    ("dp.libreville2@hec.local", "DP", "fr", "Helene",    "Mba",       False, "libreville"),
    ("dp.oyem@hec.local",        "DP", "fr", "Patrick",   "Eyenga",    False, "oyem"),
    ("dp.franceville@hec.local", "DP", "fr", "Yvonne",    "Bekale",    False, "franceville"),
    ("dp.makokou@hec.local",     "DP", "fr", "Christian", "Akoma",     False, "makokou"),
    # --- Two AB Entheos reps ---
    ("ab@hec.local",             "AB", "fr", "Marie",     "Ndong",     True,  None),
    ("ab2@hec.local",            "AB", "fr", "Camille",   "Eyenga",    True,  None),
    # --- Two WCS tech partners ---
    ("wcs@hec.local",            "WCS","fr", "Paul",      "Mba",       True,  None),
    ("wcs2@hec.local",           "WCS","fr", "Lea",       "Akoma",     True,  None),
    # --- Two DGFC ---
    ("dgfc@hec.local",           "DGFC","fr","Sylvie",    "Bekale",    True,  None),
    ("dgfc2@hec.local",          "DGFC","fr","Robert",    "Mba",       True,  None),
    # --- Two DGFAP (amount-deciders) ---
    ("dgfap@hec.local",          "DGFAP","fr","Andre",    "Moussavou", True,  None),
    ("dgfap2@hec.local",         "DGFAP","fr","Patricia", "Ngo Bessala",True,  None),
    # --- Two Ministers (cabinet can rotate) ---
    ("minister@hec.local",       "MINISTER","fr","H.E. Lea","Obame",     True,  None),
    ("minister2@hec.local",      "MINISTER","fr","H.E. Paul","Biyoghe",  True,  None),
    # --- Administrator (form publisher, audit viewer, payments triggerer) ---
    ("admin@hec.local",          "ADMIN","en","Operator",  "HEC",       True,  None),
    # --- Super Administrator (god-mode: user CRUD, role assignment, system settings) ---
    ("superadmin@hec.local",     "SUPER_ADMIN","en","Sysadmin","HEC",   True,  None),
]

SEED_VILLAGES = [
    ("Libreville",  "Estuaire",       "cb.libreville@hec.local"),
    ("Oyem",        "Woleu-Ntem",     "cb.oyem@hec.local"),
    ("Franceville", "Haut-Ogooue",    "cb.franceville@hec.local"),
    ("Makokou",     "Ogooue-Ivindo",  "cb.makokou@hec.local"),
]

# Secondary contact per village (a DP).  CBs are the primary contact_user; DPs
# are recorded here for the villages API if/when it is added.
SEED_VILLAGE_DPS = [
    ("Libreville",  "dp.libreville@hec.local"),
    ("Oyem",        "dp.oyem@hec.local"),
    ("Franceville", "dp.franceville@hec.local"),
    ("Makokou",     "dp.makokou@hec.local"),
]

SEED_PASSWORD = "HEC-Dev-2026!"


INCIDENT_FORM_SCHEMA = {
    "title": {"en": "CB Incident Report", "fr": "Rapport d'incident CB"},
    "description": {
        "en": "Initial incident report submitted by a field reporter (CB or DP) within 48 hours of the event.",
        "fr": "Rapport d'incident initial soumis par un rapporteur terrain (CB ou DP) dans les 48 heures suivant l'evenement.",
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
            "id": "village_name_text",
            "type": "text",
            "label": {"en": "Village name", "fr": "Nom du village"},
            "help": {"en": "Name of the village where the incident occurred.", "fr": "Nom du village ou l'incident a eu lieu."},
            "required": True,
        },
        {
            "id": "chef_de_village",
            "type": "text",
            "label": {"en": "Chef de village (village chief)", "fr": "Chef de village"},
            "help": {"en": "Full name of the village chief who witnessed or reported the incident.", "fr": "Nom complet du chef de village temoin ou rapporteur."},
            "required": False,
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
    help = "Seed demo data: multi-user-per-role, villages, fund settings, one bilingual CB form."

    @transaction.atomic
    def handle(self, *args, **options):
        # FundSettings singleton
        fs, _ = FundSettings.objects.get_or_create(pk=1)
        self.stdout.write(self.style.SUCCESS(
            f"FundSettings: medical={fs.medical_ceiling_xaf:,} XAF · "
            f"burial={fs.burial_ceiling_xaf:,} XAF"
        ))

        # Villages
        village_by_name = {}
        for name, region, email in SEED_VILLAGES:
            contact = User.objects.filter(email=email).first()
            village, created = Village.objects.get_or_create(
                name=name,
                defaults={"region": region, "contact_user": contact},
            )
            if created or (getattr(village, "contact_user_id", None) is None and contact is not None):
                village.contact_user = contact
                village.save(update_fields=["contact_user"])
            village_by_name[name.lower()] = village
            self.stdout.write(f"  Village: {name} ({region})  primary={contact.email if contact else '-'}")

        # Log secondary DP contact per village (informational; full villages
        # API not yet available, so the contact_user stays the CB).
        for name, email in SEED_VILLAGE_DPS:
            dp = User.objects.filter(email=email).first()
            self.stdout.write(f"           (DP contact for {name}: {dp.email if dp else email})")

        # Pre-compute village ids so we don't rely on the dynamically-generated
        # `_id` attribute on unsaved model classes (Pylance reports the
        # class-level access as a diagnostic).
        village_id_by_name = {
            name: v.pk for name, v in village_by_name.items()
        }

        # Users
        for row in SEED_USERS:
            email, role, lang, first, last, requires_2fa, village_slug = row
            village = village_by_name.get(village_slug) if village_slug else None
            username = email.split("@")[0]
            # Use username as the primary lookup key — it's stable and unique.
            # This avoids IntegrityError when the VPS has a user with the same
            # username but a different email (e.g. from a previous seed).
            user, created = User.objects.update_or_create(
                username=username,
                defaults={
                    "email": email,
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
                user.set_password(SEED_PASSWORD)
                user.save()
            self.stdout.write(self.style.SUCCESS(
                f"  {role:12s} {email:36s}  lang={lang}  2fa={requires_2fa}  "
                f"village={village.name if village else '-':12s}  "
                f"{'(NEW)' if created else '(updated)'}"
            ))

        # Bilingual CB incident form
        slug = slugify(INCIDENT_FORM_SCHEMA["title"]["en"])
        version = 1
        fd, created = FormDefinition.objects.get_or_create(
            slug=slug,
            version=version,
            defaults={
                "title": INCIDENT_FORM_SCHEMA["title"]["en"],
                "schema": INCIDENT_FORM_SCHEMA,
                "role_scope": "CB,DP",
                "status": FormDefinition.Status.PUBLISHED,
                "published_at": timezone.now(),
            },
        )
        self.stdout.write(self.style.SUCCESS(
            f"  FormDefinition: {fd.slug} v{fd.version} [{fd.status}] "
            f"({len(INCIDENT_FORM_SCHEMA['fields'])} fields, bilingual)"
        ))

        # Summary
        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("=" * 70))
        self.stdout.write(self.style.SUCCESS("Seed complete. Test credentials:"))
        self.stdout.write(self.style.SUCCESS(f"  password: {SEED_PASSWORD}"))
        roles_seen = {}
        for row in SEED_USERS:
            _, role, lang, *_ = row
            roles_seen.setdefault(role, []).append((row[0], lang))
        for role, accounts in roles_seen.items():
            self.stdout.write(self.style.SUCCESS(f"  {role} ({len(accounts)} accounts):"))
            for email, lang in accounts:
                self.stdout.write(f"      {email:40s}  ({lang})")
        self.stdout.write(self.style.SUCCESS("=" * 70))
