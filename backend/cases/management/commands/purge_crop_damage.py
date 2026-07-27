"""Remove every case (and its descendants) whose case_type is CROP_DAMAGE.

Used during the project migration that drops crop-damage support. Safe to
run repeatedly: it is a no-op when no CROP_DAMAGE cases remain.

Deletes per case:
  - All FormSubmission rows for the case and their FormAttachment rows
  - All Event rows (the audit table is append-only in production via a
    PostgreSQL trigger; on dev SQLite the trigger is a no-op, so the
    ORM delete succeeds as-is).
"""
from django.core.management.base import BaseCommand

from cases.models import Case
from forms.models import FormAttachment, FormSubmission


class Command(BaseCommand):
    help = "Delete every CROP_DAMAGE case (and its submissions / events)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Print what would be deleted without changing anything.",
        )

    def handle(self, *args, **options):
        dry = options["dry_run"]
        cases = list(Case.objects.filter(case_type="CROP_DAMAGE").only("id", "uid", "claimant_name"))
        if not cases:
            self.stdout.write(self.style.SUCCESS("No CROP_DAMAGE cases to remove."))
            return

        self.stdout.write(f"Found {len(cases)} CROP_DAMAGE case(s):")
        for c in cases:
            self.stdout.write(f"  - {c.uid}  {c.claimant_name}")

        if dry:
            self.stdout.write(self.style.WARNING("Dry run; nothing changed."))
            return

        case_ids = [c.id for c in cases]
        # Order matters: attachments → submissions → events → case
        att_qs = FormAttachment.objects.filter(submission__case_id__in=case_ids)
        sub_qs = FormSubmission.objects.filter(case_id__in=case_ids)
        att_n = att_qs.count()
        sub_n = sub_qs.count()
        att_qs.delete()
        sub_qs.delete()

        from cases.models import Event

        ev_n = Event.objects.filter(case_id__in=case_ids).count()
        Event.objects.filter(case_id__in=case_ids).delete()

        deleted_n, _ = Case.objects.filter(id__in=case_ids).delete()
        self.stdout.write(self.style.SUCCESS(
            f"Removed {deleted_n} case(s), {sub_n} submission(s), {att_n} attachment(s) and {ev_n} event(s)."
        ))