# Observability Baseline

## Current Signals

- `GET /api/health` for app + DB readiness.
- JSON log lines via `src/lib/logging.ts`.
- Structured API error payloads with user-action guidance.

## Minimum Dashboards/Alerts

- Health endpoint uptime
- Error rate by API route
- Auth failure count
- Listing-generation failure count
- SQLite I/O failure events

## Incident Triage Workflow

1. Confirm `health` status.
2. Check recent error logs by timestamp.
3. Identify failing route and error code.
4. Retry if transient; rollback if systemic.
5. Document root cause and preventive action.
