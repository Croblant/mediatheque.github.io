#!/bin/sh
cd "$(dirname "$0")"
exec node .agents/skills/realsheet-tunebooks-sync/scripts/sync-sidecars.mjs --watch
