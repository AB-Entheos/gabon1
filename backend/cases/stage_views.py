"""Stage-level counts for the dashboard.

GET /api/v1/cases-stages returns:
{
  "drafts": int,
  "submitted": int,
  "verified": int,
  "by_step": { "1": int, "2": int, ..., "6": int },
  "approved": int,
  "closed": int,
  "rejected": int,
  "total": int
}
"""
from __future__ import annotations

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.models import User
from accounts.permissions import IsSuperAdmin
from cases.models import Case


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def cases_stages(request):
    """Counts of cases per approval stage. Visible to all authenticated users.

    Approvers see only their stage counts; ADMIN/SUPER_ADMIN see everything;
    CBs see only their own cases. This is the data that powers the
    stage-dashboard cards.
    """
    u: User = request.user
    qs = Case.objects.all()

    if u.role in u.FIELD_REPORTER_ROLES:
        qs = qs.filter(created_by=u)
    elif u.role not in ("ADMIN", "SUPER_ADMIN"):
        # Approvers see all non-draft cases
        qs = qs.exclude(status=Case.Status.DRAFT)

    by_step = {str(s): qs.filter(
        status=Case.Status.AT_APPROVAL, current_step=s
    ).count() for s in range(2, 7)}

    return Response(
        {
            "drafts": qs.filter(status=Case.Status.DRAFT).count(),
            "submitted": qs.filter(status=Case.Status.SUBMITTED).count(),
            "verified": qs.filter(status=Case.Status.VERIFIED).count(),
            "by_step": by_step,
            "approved": qs.filter(status=Case.Status.APPROVED).count(),
            "closed": qs.filter(status=Case.Status.CLOSED).count(),
            "rejected": qs.filter(status=Case.Status.REJECTED).count(),
            "total": qs.count(),
        }
    )
