import { getSetting } from "@/lib/settings-store";

function latestBackupDate(): Date | null {
  const lastAt = getSetting("last_backup_at")?.trim();
  if (!lastAt) return null;
  const parsed = new Date(lastAt);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseBackupTime(): { hours: number; minutes: number } {
  const raw = getSetting("backup_time")?.trim() || "02:00";
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return { hours: 2, minutes: 0 };
  const hours = Math.min(23, Math.max(0, parseInt(match[1], 10)));
  const minutes = Math.min(59, Math.max(0, parseInt(match[2], 10)));
  return { hours, minutes };
}

function parseBackupDay(): number {
  const raw = getSetting("backup_day")?.trim();
  if (!raw) return 0;
  const day = parseInt(raw, 10);
  return Number.isFinite(day) && day >= 0 && day <= 6 ? day : 0;
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function startOfLocalWeek(d: Date, weekStartDay: number): Date {
  const day = startOfLocalDay(d);
  const dow = day.getDay();
  const diff = (dow - weekStartDay + 7) % 7;
  day.setDate(day.getDate() - diff);
  return day;
}

export function isScheduledBackupDue(): boolean {
  const schedule = getSetting("backup_schedule")?.trim() || "manual";
  if (schedule === "manual") return false;

  const latest = latestBackupDate();
  const now = new Date();
  const { hours, minutes } = parseBackupTime();

  if (schedule === "daily") {
    const windowStart = startOfLocalDay(now);
    windowStart.setHours(hours, minutes, 0, 0);
    if (now < windowStart) return false;
    return !latest || latest < windowStart;
  }

  if (schedule === "weekly") {
    const backupDay = parseBackupDay();
    const windowStart = startOfLocalWeek(now, backupDay);
    windowStart.setHours(hours, minutes, 0, 0);
    if (now < windowStart) return false;
    return !latest || latest < windowStart;
  }

  return false;
}
