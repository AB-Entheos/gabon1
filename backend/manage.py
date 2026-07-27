#!/usr/bin/env python
import os
import sys


def main():
    # Default to dev (SQLite). Set DJANGO_SETTINGS_MODULE=hec_fund.settings.prod
    # in production environments (see deploy.sh).
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "hec_fund.settings.dev")
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Is it installed and on PYTHONPATH? "
            "Activate the virtualenv with `source venv/bin/activate`."
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
