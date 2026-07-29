#!/bin/sh
set -e

# Ensure directories (bind-mounted from the host) are writable by the
# hec user.  This script runs as root (no USER directive in entrypoint),
# then drops to UID 1000 (hec) for the actual application process.
for dir in /app/files /app/staticfiles /app/media; do
    if [ -d "$dir" ]; then
        chown -R hec:hec "$dir" 2>/dev/null || chmod -R 777 "$dir" 2>/dev/null || true
    fi
done

# Drop to the hec user and run the command
exec gosu hec "$@"
