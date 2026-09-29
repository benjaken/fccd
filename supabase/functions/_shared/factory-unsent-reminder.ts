const HONG_KONG_TIME_ZONE = "Asia/Hong_Kong";

function hongKongDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: HONG_KONG_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function addDays(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export interface FactoryUnsentReminderTiming {
  reminderAt: Date;
  deliveryIsTomorrow: boolean;
  isDue: boolean;
}

export function factoryUnsentReminderTiming(
  deliveryStart: Date,
  now = new Date(),
  reminderHourHongKong = 17,
): FactoryUnsentReminderTiming | null {
  if (
    Number.isNaN(deliveryStart.valueOf())
    || Number.isNaN(now.valueOf())
    || !Number.isInteger(reminderHourHongKong)
    || reminderHourHongKong < 0
    || reminderHourHongKong > 23
  ) {
    return null;
  }

  const deliveryDateKey = hongKongDateKey(deliveryStart);
  const reminderDateKey = addDays(deliveryDateKey, -1);
  const reminderAt = new Date(
    `${reminderDateKey}T${String(reminderHourHongKong).padStart(2, "0")}:00:00+08:00`,
  );

  return {
    reminderAt,
    deliveryIsTomorrow: addDays(hongKongDateKey(now), 1) === deliveryDateKey,
    isDue: now.getTime() >= reminderAt.getTime(),
  };
}
