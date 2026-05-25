import { getSetting } from "@/lib/settings-store";

function latestBackupDate(): Date | null {
  const lastAt = getSetting("last_backup_at")?.trim();
  if (!lastAt) return null;
  const parsed = new Date(lastAt);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function startOfLocalWeek(d: Date): Date {
  const day = startOfLocalDay(d);
  const dow = day.getDay();
  day.setDate(day.getDate() - dow);
  return day;
}

export function isScheduledBackupDue(): boolean {
  const schedule = getSetting("backup_schedule")?.trim() || "manual";
  if (schedule === "manual") return false;

  const latest = latestBackupDate();
  const now = new Date();

  if (schedule === "daily") {
    const windowStart = startOfLocalDay(now);
    return !latest || latest < windowStart;
  }

  if (schedule === "weekly") {
    const windowStart = startOfLocalWeek(now);
    return !latest || latest < windowStart;
  }

  return false;
}
