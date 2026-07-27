"""Bilingual form labels and validation messages."""
from django import forms
from django.utils.translation import gettext_lazy as _


class StyledFormMixin:
    """Apply WildCover-inspired dark form styling."""

    base_class = (
        "w-full rounded border border-grey-500/32 bg-bg-paper px-3 py-2 text-white "
        "placeholder-grey-500 focus:border-white focus:outline-none focus:ring-2 "
        "focus:ring-primary/40"
    )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        for field in self.fields.values():
            widget = field.widget
            if isinstance(widget, (forms.TextInput, forms.EmailInput, forms.URLInput, forms.NumberInput, forms.PasswordInput)):
                widget.attrs.setdefault("class", self.base_class)
            elif isinstance(widget, forms.Textarea):
                widget.attrs.setdefault("class", self.base_class)
                widget.attrs.setdefault("rows", 3)
            elif isinstance(widget, forms.Select):
                widget.attrs.setdefault("class", self.base_class)
            elif isinstance(widget, forms.CheckboxInput):
                widget.attrs.setdefault(
                    "class",
                    "h-4 w-4 rounded border-grey-500/32 bg-bg-paper text-primary "
                    "focus:ring-2 focus:ring-primary/40",
                )
            field.label_suffix = ""
