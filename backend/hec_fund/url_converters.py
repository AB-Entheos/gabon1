from django.urls import register_converter
from django.urls.converters import UUIDConverter


class CaseUidConverter(UUIDConverter):
    """UUID converter that accepts both 32-char hex (no dashes) and standard
    36-char dashed UUIDs. Returns the dashed form on conversion so downstream
    view code (e.g. ``Case.objects.get(uid=...)``) keeps working.
    """

    regex = r"[0-9a-fA-F]{32}|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"

    def to_python(self, value):
        if value and len(value) == 32 and "-" not in value:
            value = f"{value[0:8]}-{value[8:12]}-{value[12:16]}-{value[16:20]}-{value[20:]}"
        return super().to_python(value)

    def to_url(self, value):
        if isinstance(value, str) and "-" not in value and len(value) == 32:
            value = f"{value[0:8]}-{value[8:12]}-{value[12:16]}-{value[16:20]}-{value[20:]}"
        return super().to_url(value)


def register_caseuid_converter():
    """Register the converter under the ``caseuid`` path-converter name."""
    register_converter(CaseUidConverter, "caseuid")
