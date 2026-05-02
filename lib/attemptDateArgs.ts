/**
 * Shared date parsing for REST + LLM tools (attempt queries).
 * Args: last_days OR from_date / to_date (YYYY-MM-DD, UTC bounds).
 */

function parseISODateUtcStart(d: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d.trim());
  if (!m) return null;
  const dt = new Date(
    Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0)
  );
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function endOfUtcDay(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(23, 59, 59, 999);
  return x;
}

/** Mutates filter. Returns machine-readable label for diagnostics. */
export function mergeAttemptDateOntoMongoFilter(
  filter: Record<string, unknown>,
  args: Record<string, unknown>
): string {
  const rawLast =
    args.last_days !== undefined && args.last_days !== ""
      ? typeof args.last_days === "number"
        ? args.last_days
        : Number.parseInt(String(args.last_days), 10)
      : NaN;

  if (
    typeof rawLast === "number" &&
    !Number.isNaN(rawLast) &&
    rawLast > 0
  ) {
    const n = Math.min(Math.max(Math.floor(rawLast), 1), 366);
    const end = new Date();
    end.setUTCHours(23, 59, 59, 999);
    const start = new Date(end);
    start.setUTCDate(end.getUTCDate() - (n - 1));
    start.setUTCHours(0, 0, 0, 0);
    filter.createdAt = { $gte: start, $lte: end };
    return `rolling_last_${n}_days_UTC`;
  }

  const fromS =
    typeof args.from_date === "string" ? args.from_date.trim() : "";
  const toS = typeof args.to_date === "string" ? args.to_date.trim() : "";

  if (!fromS && !toS) return "all_time";

  let gte =
    fromS && parseISODateUtcStart(fromS)
      ? parseISODateUtcStart(fromS)!
      : new Date(0);
  let lte =
    toS && parseISODateUtcStart(toS)
      ? endOfUtcDay(parseISODateUtcStart(toS)!)
      : endOfUtcDay(new Date());

  if (lte.getTime() < gte.getTime()) {
    const temp = gte;
    gte = lte;
    lte = temp;
  }

  filter.createdAt = { $gte: gte, $lte: lte };
  return `from_${fromS || "epoch"}_to_${toS || "today"}_UTC`;
}
