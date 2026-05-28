import { formatRelativeTime } from "../relative-time";

const NOW = new Date("2026-05-27T12:00:00.000Z").getTime();

describe("formatRelativeTime", () => {
  it("returns 'just now' for timestamps less than a minute ago", () => {
    expect(formatRelativeTime(NOW - 5 * 1000, NOW)).toBe("just now");
    expect(formatRelativeTime(NOW - 30 * 1000, NOW)).toBe("just now");
    expect(formatRelativeTime(NOW - 59 * 1000, NOW)).toBe("just now");
  });

  it("returns minutes ago under an hour", () => {
    expect(formatRelativeTime(NOW - 60 * 1000, NOW)).toBe("1m ago");
    expect(formatRelativeTime(NOW - 5 * 60 * 1000, NOW)).toBe("5m ago");
    expect(formatRelativeTime(NOW - 59 * 60 * 1000, NOW)).toBe("59m ago");
  });

  it("returns hours ago under a day", () => {
    expect(formatRelativeTime(NOW - 60 * 60 * 1000, NOW)).toBe("1h ago");
    expect(formatRelativeTime(NOW - 5 * 60 * 60 * 1000, NOW)).toBe("5h ago");
    expect(formatRelativeTime(NOW - 23 * 60 * 60 * 1000, NOW)).toBe("23h ago");
  });

  it("returns days ago under a week", () => {
    expect(formatRelativeTime(NOW - 24 * 60 * 60 * 1000, NOW)).toBe("1d ago");
    expect(formatRelativeTime(NOW - 3 * 24 * 60 * 60 * 1000, NOW)).toBe("3d ago");
    expect(formatRelativeTime(NOW - 6 * 24 * 60 * 60 * 1000, NOW)).toBe("6d ago");
  });

  it("returns a calendar date past a week (same year)", () => {
    // NOW is 2026-05-27T12:00 UTC, so 14 days earlier is 2026-05-13
    const fortnightAgo = new Date("2026-05-13T12:00:00.000Z").getTime();
    expect(formatRelativeTime(fortnightAgo, NOW)).toBe("May 13");
  });

  it("includes the year when older than the current year", () => {
    const lastYear = new Date("2025-12-01T12:00:00.000Z").getTime();
    expect(formatRelativeTime(lastYear, NOW)).toBe("Dec 1, 2025");
  });

  it("returns 'just now' when timestamp is slightly in the future (clock skew tolerance)", () => {
    expect(formatRelativeTime(NOW + 1000, NOW)).toBe("just now");
  });
});
