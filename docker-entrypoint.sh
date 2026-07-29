#!/bin/sh
set -e

# Ensure the files directory (bind-mounted from the host) is writable by the
# hec user.  This script runs as root (no USER directive in entrypoint),
# then drops to UID 1000 (hec) for the actual application process.
if [ -d /app/files ]; then
    # Fix ownership in case the host directory was created by root
    chown -R hec:hec /app/files 2>/dev/null || chmod -R 777 /app/files 2>/dev/null || true
fi

# Drop to the hec user and run the command
exec gosu hec "$@"
