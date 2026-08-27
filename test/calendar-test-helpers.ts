type CalendarUser = {
  click: (element: Element) => Promise<void>;
};

function visibleMonthBounds(popover: HTMLElement) {
  const dates = [...popover.querySelectorAll<HTMLElement>(
    '[role="gridcell"][data-day]:not([data-outside="true"])',
  )]
    .map((cell) => cell.dataset.day)
    .filter((date): date is string => Boolean(date))
    .sort();

  return { first: dates[0], last: dates.at(-1) };
}

async function findCalendarDay(
  user: CalendarUser,
  popoverSelector: string,
  date: string,
) {
  for (let attempt = 0; attempt < 36; attempt += 1) {
    const popover = document.querySelector<HTMLElement>(popoverSelector);
    if (!popover) throw new Error(`Calendar popover ${popoverSelector} is not open`);

    const day = popover.querySelector<HTMLElement>(
      `[role="gridcell"][data-day="${date}"]:not([data-outside="true"]) button`,
    );
    if (day) return day;

    const { first, last } = visibleMonthBounds(popover);
    const direction = first && date < first ? "previous" : last && date > last ? "next" : null;
    const navigation = direction
      ? popover.querySelector<HTMLElement>(`.ui-calendar-${direction}`)
      : null;
    if (!navigation) break;
    await user.click(navigation);
  }

  throw new Error(`Calendar day ${date} is not available`);
}

export async function selectDate(
  user: CalendarUser,
  trigger: HTMLElement,
  date: string,
) {
  await user.click(trigger);
  await user.click(await findCalendarDay(user, ".date-picker-popover", date));
}

export async function selectDateRange(
  user: CalendarUser,
  trigger: HTMLElement,
  startDate: string,
  endDate: string,
) {
  await user.click(trigger);
  await user.click(
    await findCalendarDay(user, ".date-range-picker-popover", startDate),
  );
  await user.click(
    await findCalendarDay(user, ".date-range-picker-popover", endDate),
  );
}
