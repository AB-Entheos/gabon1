from django.utils.deprecation import MiddlewareMixin


class AuditMiddleware(MiddlewareMixin):
    """Captures IP + user agent on every request for audit trail."""

    def process_request(self, request):
        request._audit_ip = self._client_ip(request)
        request._audit_ua = request.META.get("HTTP_USER_AGENT", "")[:512]

    @staticmethod
    def _client_ip(request):
        forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.META.get("REMOTE_ADDR")
