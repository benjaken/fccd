import { describe, expect, it } from "vitest";

import { isWithinCustomerServiceSchedule } from "../supabase/functions/_shared/customer-service-schedule.ts";

const schedule = {
  timeZone: "Asia/Hong_Kong",
  weekdayStart: "19:00",
  weekdayEnd: "09:00",
  weekendStart: "10:00",
  weekendEnd: "18:00",
};

describe("customer-service weekday and weekend schedule", () => {
  it("uses the weekday window from Monday through Friday", () => {
    expect(
      isWithinCustomerServiceSchedule({
        ...schedule,
        now: new Date("2026-09-14T00:30:00.000Z"), // Monday 08:30 HKT
      }),
    ).toBe(true);
    expect(
      isWithinCustomerServiceSchedule({
        ...schedule,
        now: new Date("2026-09-14T01:30:00.000Z"), // Monday 09:30 HKT
      }),
    ).toBe(false);
  });

  it("uses the weekend window on Saturday and Sunday", () => {
    expect(
      isWithinCustomerServiceSchedule({
        ...schedule,
        now: new Date("2026-09-13T04:00:00.000Z"), // Sunday 12:00 HKT
      }),
    ).toBe(true);
    expect(
      isWithinCustomerServiceSchedule({
        ...schedule,
        now: new Date("2026-09-13T12:00:00.000Z"), // Sunday 20:00 HKT
      }),
    ).toBe(false);
  });

  it("keeps equal start and end as an all-day window", () => {
    expect(
      isWithinCustomerServiceSchedule({
        ...schedule,
        weekendStart: "00:00",
        weekendEnd: "00:00",
        now: new Date("2026-09-13T12:00:00.000Z"),
      }),
    ).toBe(true);
  });
});
