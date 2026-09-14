type CustomerServiceScheduleInput = {
  now?: Date;
  timeZone: string;
  weekdayStart: string;
  weekdayEnd: string;
  weekendStart: string;
  weekendEnd: string;
};

function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function isWithinWindow(current: number, start: string, end: string) {
  const from = timeToMinutes(start);
  const until = timeToMinutes(end);
  if (from === until) return true;
  return from < until
    ? current >= from && current < until
    : current >= from || current < until;
}

export function isWithinCustomerServiceSchedule({
  now = new Date(),
  timeZone,
  weekdayStart,
  weekdayEnd,
  weekendStart,
  weekendEnd,
}: CustomerServiceScheduleInput) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const weekday = parts.find((part) => part.type === "weekday")?.value;
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(
    parts.find((part) => part.type === "minute")?.value ?? 0,
  );
  const weekend = weekday === "Sat" || weekday === "Sun";

  return isWithinWindow(
    hour * 60 + minute,
    weekend ? weekendStart : weekdayStart,
    weekend ? weekendEnd : weekdayEnd,
  );
}
