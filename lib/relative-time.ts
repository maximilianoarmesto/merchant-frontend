const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function formatRelativeTime(timestamp: number, now: number = Date.now()): string {
  const diff = now - timestamp;
  if (!Number.isFinite(diff)) return "";

  if (diff < 0) return "just now";
  if (diff < MINUTE_MS) return "just now";
  if (diff < HOUR_MS) {
    const m = Math.floor(diff / MINUTE_MS);
    return `${m}m ago`;
  }
  if (diff < DAY_MS) {
    const h = Math.floor(diff / HOUR_MS);
    return `${h}h ago`;
  }
  if (diff < WEEK_MS) {
    const d = Math.floor(diff / DAY_MS);
    return `${d}d ago`;
  }
  const date = new Date(timestamp);
  const sameYear = new Date(now).getFullYear() === date.getFullYear();
  const month = MONTH_NAMES[date.getMonth()];
  const day = date.getDate();
  return sameYear ? `${month} ${day}` : `${month} ${day}, ${date.getFullYear()}`;
}
