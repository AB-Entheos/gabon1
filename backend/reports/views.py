"""Quarterly + annual reports. PDF via WeasyPrint, XLSX via openpyxl.

Headers are localized to the requesting user's preferred_language.
"""
from __future__ import annotations

import datetime
import io

from django.http import HttpResponse
from django.utils import translation
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import IsAdmin
from cases.models import Case, Event


def _quarter_range(q: int, year: int) -> tuple[datetime.datetime, datetime.datetime]:
    start_month = (q - 1) * 3 + 1
    start = datetime.datetime(year, start_month, 1)
    end_month = start_month + 3
    if end_month > 12:
        end_month = 1
        year += 1
    end = datetime.datetime(year, end_month, 1)
    return start, end


def _render_pdf(*, title: str, headers: list[str], rows: list[list[str]], language: str) -> bytes:
    """Render an A4 landscape PDF via WeasyPrint + minimal HTML.

    On systems without libgobject installed (Windows dev), this raises OSError;
    callers should fall back to XLSX in that case.
    """
    from weasyprint import HTML

    html = f"""<!doctype html>
<html lang="{language}"><head><meta charset="utf-8">
<style>
  @page {{ size: A4 landscape; margin: 18mm; }}
  body {{ font-family: 'Public Sans', system-ui, sans-serif; color: #212B36; font-size: 11px; }}
  h1 {{ font-size: 18px; margin-bottom: 4px; }}
  .meta {{ color: #637381; margin-bottom: 14px; }}
  table {{ width: 100%; border-collapse: collapse; }}
  th, td {{ padding: 6px 8px; border-bottom: 1px solid #DFE3E8; text-align: left; }}
  th {{ background: #F4F6F8; text-transform: uppercase; font-size: 10px; letter-spacing: .04em; }}
  tr:nth-child(even) td {{ background: #FAFBFC; }}
</style></head>
<body>
<h1>{title}</h1>
<div class="meta">{datetime.date.today().isoformat()}</div>
<table>
  <thead><tr>{''.join(f'<th>{h}</th>' for h in headers)}</tr></thead>
  <tbody>{''.join('<tr>' + ''.join(f'<td>{c}</td>' for c in row) + '</tr>' for row in rows)}</tbody>
</table>
</body></html>"""
    return HTML(string=html).write_pdf()


def _render_xlsx(*, headers: list[str], rows: list[list[str]]) -> bytes:
    """Render an XLSX with a single sheet."""
    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    ws.append(headers)
    for r in rows:
        ws.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdmin])
def quarterly_report(request):
    """GET /reports/quarterly?year=2026&q=3&format=pdf|xlsx"""
    year = int(request.query_params.get("year", datetime.date.today().year))
    q = int(request.query_params.get("q", (datetime.date.today().month - 1) // 3 + 1))
    fmt = request.query_params.get("format", "pdf").lower()

    start, end = _quarter_range(q, year)
    cases = Case.objects.filter(reported_at__gte=start, reported_at__lt=end)

    if fmt not in ("pdf", "xlsx"):
        return Response({"detail": "format must be pdf or xlsx"}, status=400)

    with translation.override(request.user.preferred_language):
        if request.user.preferred_language == "fr":
            title = f"Rapport trimestriel — T{q} {year}"
            headers = ["UID", "Requérant", "Type", "Statut", "Étape", "Montant", "Signalé le"]
        else:
            title = f"Quarterly report — Q{q} {year}"
            headers = ["UID", "Claimant", "Type", "Status", "Step", "Amount", "Reported"]

        rows = [
            [
                c.uid.hex[:8] + "…",
                c.claimant_name,
                c.case_type,
                c.status,
                c.current_step,
                f"{c.amount_authorized or 0:,} XAF",
                c.reported_at.date().isoformat(),
            ]
            for c in cases
        ]

        if fmt == "pdf":
            try:
                data = _render_pdf(title=title, headers=headers, rows=rows, language=request.user.preferred_language)
                resp = HttpResponse(data, content_type="application/pdf")
                resp["Content-Disposition"] = f'attachment; filename="hec-{year}-Q{q}.pdf"'
                return resp
            except OSError as e:
                # WeasyPrint system deps missing — fall back to XLSX on the fly.
                return Response(
                    {"detail": f"PDF rendering unavailable on this host ({e.__class__.__name__}). Please choose XLSX format."},
                    status=status.HTTP_503_SERVICE_UNAVAILABLE,
                )
        else:
            data = _render_xlsx(headers=headers, rows=rows)
            resp = HttpResponse(
                data,
                content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
            resp["Content-Disposition"] = f'attachment; filename="hec-{year}-Q{q}.xlsx"'
            return resp


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdmin])
def annual_report(request):
    """GET /reports/annual?year=2026&format=pdf|xlsx"""
    year = int(request.query_params.get("year", datetime.date.today().year))
    fmt = request.query_params.get("format", "pdf").lower()

    start = datetime.datetime(year, 1, 1)
    end = datetime.datetime(year + 1, 1, 1)
    cases = Case.objects.filter(reported_at__gte=start, reported_at__lt=end)
    events = Event.objects.filter(occurred_at__gte=start, occurred_at__lt=end)

    with translation.override(request.user.preferred_language):
        if request.user.preferred_language == "fr":
            title = f"Rapport annuel — {year}"
            headers = ["UID", "Requérant", "Type", "Statut", "Étape", "Montant", "Signalé le"]
        else:
            title = f"Annual report — {year}"
            headers = ["UID", "Claimant", "Type", "Status", "Step", "Amount", "Reported"]

        rows = [
            [
                c.uid.hex[:8] + "…",
                c.claimant_name,
                c.case_type,
                c.status,
                c.current_step,
                f"{c.amount_authorized or 0:,} XAF",
                c.reported_at.date().isoformat(),
            ]
            for c in cases
        ]

        if fmt == "pdf":
            try:
                data = _render_pdf(title=title, headers=headers, rows=rows, language=request.user.preferred_language)
                resp = HttpResponse(data, content_type="application/pdf")
                resp["Content-Disposition"] = f'attachment; filename="hec-{year}.pdf"'
                return resp
            except OSError as e:
                return Response(
                    {"detail": f"PDF rendering unavailable on this host ({e.__class__.__name__}). Please choose XLSX format."},
                    status=status.HTTP_503_SERVICE_UNAVAILABLE,
                )
        else:
            data = _render_xlsx(headers=headers, rows=rows)
            resp = HttpResponse(
                data,
                content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
            resp["Content-Disposition"] = f'attachment; filename="hec-{year}.xlsx"'
            return resp


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdmin])
def summary(request):
    """Top-line counts for the dashboard cards."""
    today = datetime.date.today()
    month_start = today.replace(day=1)
    return Response(
        {
            "total_cases": Case.objects.count(),
            "drafts": Case.objects.filter(status=Case.Status.DRAFT).count(),
            "in_approval": Case.objects.filter(status=Case.Status.AT_APPROVAL).count(),
            "approved": Case.objects.filter(status=Case.Status.APPROVED).count(),
            "closed": Case.objects.filter(status=Case.Status.CLOSED).count(),
            "rejected": Case.objects.filter(status=Case.Status.REJECTED).count(),
            "accelerated_benefit_released": Case.objects.filter(accelerated_benefit_released=True).count(),
            "events_total": Event.objects.count(),
            "events_this_month": Event.objects.filter(occurred_at__gte=month_start).count(),
        }
    )
