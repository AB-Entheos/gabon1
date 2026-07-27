"""JSON-schema validator for form definitions + submission payloads.

Each FormDefinition.schema is validated when published.  Each submission's
payload is validated against the (active) schema before persistence.
"""
from __future__ import annotations

from typing import Any

import jsonschema
from django.core.exceptions import ValidationError
from jsonschema import Draft202012Validator


SUPPORTED_FIELD_TYPES = {
    "text", "textarea", "number", "date", "time", "datetime",
    "select", "multiselect", "radio", "checkbox", "tel", "email",
    "file", "signature", "section", "static",
}

FIELD_TYPES_WITH_OPTIONS = {"select", "multiselect", "radio"}


def bilingual_field(value: Any) -> str:
    """Return EN if present, else FR, else raw string. Never break on missing lang."""
    if isinstance(value, dict):
        return value.get("en") or value.get("fr") or ""
    if isinstance(value, str):
        return value
    return str(value)


def validate_schema(schema: dict) -> None:
    """Raise ValidationError if the form schema is invalid."""
    if not isinstance(schema, dict):
        raise ValidationError("Schema must be a JSON object.")
    if "fields" not in schema or not isinstance(schema["fields"], list):
        raise ValidationError("Schema must contain a 'fields' list.")
    if not schema["fields"]:
        raise ValidationError("Schema must have at least one field.")

    seen_ids: set[str] = set()
    for i, field in enumerate(schema["fields"]):
        if not isinstance(field, dict):
            raise ValidationError(f"Field #{i} must be an object.")
        fid = field.get("id")
        if not fid or not isinstance(fid, str):
            raise ValidationError(f"Field #{i} missing 'id'.")
        if fid in seen_ids:
            raise ValidationError(f"Duplicate field id: {fid!r}.")
        seen_ids.add(fid)

        ftype = field.get("type")
        if ftype not in SUPPORTED_FIELD_TYPES:
            raise ValidationError(
                f"Field {fid!r}: type {ftype!r} not in {sorted(SUPPORTED_FIELD_TYPES)}."
            )

        if "label" in field and not (
            isinstance(field["label"], dict) or isinstance(field["label"], str)
        ):
            raise ValidationError(
                f"Field {fid!r}: 'label' must be {{en,fr}} object or string."
            )

        if ftype in FIELD_TYPES_WITH_OPTIONS:
            options = field.get("options", [])
            if not isinstance(options, list) or not options:
                raise ValidationError(
                    f"Field {fid!r}: '{ftype}' requires non-empty 'options' list."
                )
            for j, opt in enumerate(options):
                if not isinstance(opt, dict) or "value" not in opt:
                    raise ValidationError(
                        f"Field {fid!r} option #{j}: missing 'value'."
                    )
                if "label" in opt and not (
                    isinstance(opt["label"], dict) or isinstance(opt["label"], str)
                ):
                    raise ValidationError(
                        f"Field {fid!r} option #{j}: 'label' must be {{en,fr}} or string."
                    )

        if ftype == "number":
            if "min" in field and not isinstance(field["min"], (int, float)):
                raise ValidationError(f"Field {fid!r}: 'min' must be numeric.")
            if "max" in field and not isinstance(field["max"], (int, float)):
                raise ValidationError(f"Field {fid!r}: 'max' must be numeric.")


def build_payload_validator(schema: dict) -> Draft202012Validator:
    """Build a JSON-schema validator from a form schema, for payload validation."""
    properties: dict = {}
    required: list[str] = []

    for field in schema["fields"]:
        if field.get("type") in {"section", "static"}:
            continue
        fid = field["id"]
        ftype = field.get("type")

        prop: dict = {}
        if ftype in {"text", "textarea", "tel", "email", "select", "radio"}:
            prop["type"] = "string"
        elif ftype == "multiselect":
            prop["type"] = "array"
            prop["items"] = {"type": "string"}
        elif ftype == "number":
            prop["type"] = "number"
            if "min" in field:
                prop["minimum"] = field["min"]
            if "max" in field:
                prop["maximum"] = field["max"]
        elif ftype in {"date", "time", "datetime"}:
            prop["type"] = "string"
            prop["format"] = "date-time" if ftype == "datetime" else ftype
        elif ftype == "checkbox":
            prop["type"] = "boolean"
        elif ftype in {"file", "signature"}:
            # Signature = string (typed name) + optional attachment list
            prop["oneOf"] = [
                {"type": "string"},
                {"type": "object"},
            ]
        else:
            prop = {"type": ["string", "number", "boolean", "array", "object", "null"]}

        if "default" in field:
            prop["default"] = field["default"]

        properties[fid] = prop
        if field.get("required"):
            required.append(fid)

    json_schema = {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "additionalProperties": True,  # allow extra metadata fields
        "properties": properties,
    }
    if required:
        json_schema["required"] = required

    return Draft202012Validator(json_schema)


def validate_payload(schema: dict, payload: dict) -> None:
    validator = build_payload_validator(schema)
    errors = sorted(validator.iter_errors(payload), key=lambda e: e.path)
    if errors:
        msgs = []
        for e in errors:
            path = ".".join(str(x) for x in e.absolute_path) or "(root)"
            msgs.append(f"{path}: {e.message}")
        raise ValidationError("Payload validation failed: " + "; ".join(msgs))


def normalize_legacy_bilingual(schema: dict) -> dict:
    """Promote legacy label:"string" → label:{"en":"string"} in place.

    Idempotent: safe to run on already-bilingual schemas.
    """
    if not isinstance(schema, dict):
        return schema

    def upgrade(value):
        if isinstance(value, str):
            return {"en": value, "fr": value}
        if isinstance(value, dict):
            return {k: upgrade(v) if k == "label" else v for k, v in value.items()}
        return value

    out = dict(schema)
    if "fields" in out:
        out["fields"] = [upgrade(f) for f in out["fields"]]
    return out
