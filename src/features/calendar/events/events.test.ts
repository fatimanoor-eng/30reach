import { describe, expect, it } from "vitest";
import us2022 from "../../../../supabase/functions/holidays/fixtures/us-2022.json";
import us2026 from "../../../../supabase/functions/holidays/fixtures/us-2026.json";
import { layoutWeek } from "./bars";
import { addDays, monthGrid, startOfWeek, weekdayOf } from "./dates";
import { healthEvents } from "./health";
import { holidayEvents, type HolidayRow } from "./holidays";
import { eventsInRange } from "./index";
import {
  backToSchool,
  blackFriday,
  cyberMonday,
  easterSunday,
  fathersDay,
  givingTuesday,
  marketingEvents,
  mothersDay,
  smallBusinessSaturday,
  thanksgiving,
} from "./marketing";

const named = (events: { name: string; start: string; end: string }[], name: string) => {
  const found = events.find((e) => e.name === name);
  if (!found) throw new Error(`${name} missing`);
  return found;
};

describe("marketing dates (CALENDAR_EVENTS.md required cases)", () => {
  it.each([
    ["Mother's Day 2026", mothersDay(2026), "2026-05-10"],
    ["Mother's Day 2027", mothersDay(2027), "2027-05-09"],
    ["Father's Day 2026", fathersDay(2026), "2026-06-21"],
    ["Father's Day 2027", fathersDay(2027), "2027-06-20"],
    ["Thanksgiving 2026", thanksgiving(2026), "2026-11-26"],
    ["Black Friday 2026", blackFriday(2026), "2026-11-27"],
    ["Giving Tuesday 2026", givingTuesday(2026), "2026-12-01"],
    ["Thanksgiving 2027", thanksgiving(2027), "2027-11-25"],
    ["Black Friday 2027", blackFriday(2027), "2027-11-26"],
    ["Cyber Monday 2027", cyberMonday(2027), "2027-11-29"],
    ["Giving Tuesday 2027", givingTuesday(2027), "2027-11-30"],
    ["Easter 2026", easterSunday(2026), "2026-04-05"],
    ["Easter 2027", easterSunday(2027), "2027-03-28"],
  ])("%s", (_label, actual, expected) => {
    expect(actual).toBe(expected);
  });

  it("Christmas Eve is 24 December", () => {
    expect(named(marketingEvents(2026), "Christmas Eve").start).toBe("2026-12-24");
  });

  it("Resolution season runs 26 Dec → 15 Jan and shows in both years", () => {
    const season = named(marketingEvents(2026), "Resolution season");
    expect([season.start, season.end]).toEqual(["2026-12-26", "2027-01-15"]);
    // January 2027 shows the season that started in December 2026.
    const jan = eventsInRange("2027-01-01", "2027-01-31", new Map());
    expect(named(jan, "Resolution season").start).toBe("2026-12-26");
  });

  it("Easter matches known dates across centuries", () => {
    expect(easterSunday(2000)).toBe("2000-04-23");
    expect(easterSunday(2019)).toBe("2019-04-21");
    expect(easterSunday(2038)).toBe("2038-04-25");
  });

  // 5 years spread over 2025–2035: every weekday rule lands on the right weekday.
  it.each([2025, 2028, 2030, 2033, 2035])("%i: every rule returns the right weekday", (year) => {
    const sunday = 0;
    const monday = 1;
    const tuesday = 2;
    const thursday = 4;
    const friday = 5;
    const saturday = 6;
    expect(weekdayOf(mothersDay(year))).toBe(sunday);
    expect(weekdayOf(fathersDay(year))).toBe(sunday);
    expect(weekdayOf(easterSunday(year))).toBe(sunday);
    expect(weekdayOf(backToSchool(year))).toBe(monday);
    expect(weekdayOf(thanksgiving(year))).toBe(thursday);
    expect(weekdayOf(blackFriday(year))).toBe(friday);
    expect(weekdayOf(smallBusinessSaturday(year))).toBe(saturday);
    expect(weekdayOf(cyberMonday(year))).toBe(monday);
    expect(weekdayOf(givingTuesday(year))).toBe(tuesday);
    // nth-weekday rules stay in their month and in the right week
    expect(mothersDay(year).slice(5, 7)).toBe("05");
    expect(Number(mothersDay(year).slice(8))).toBeGreaterThanOrEqual(8);
    expect(Number(mothersDay(year).slice(8))).toBeLessThanOrEqual(14);
    expect(fathersDay(year).slice(5, 7)).toBe("06");
    expect(Number(fathersDay(year).slice(8))).toBeGreaterThanOrEqual(15);
    expect(Number(fathersDay(year).slice(8))).toBeLessThanOrEqual(21);
    expect(thanksgiving(year).slice(5, 7)).toBe("11");
    expect(Number(thanksgiving(year).slice(8))).toBeGreaterThanOrEqual(22);
    expect(Number(thanksgiving(year).slice(8))).toBeLessThanOrEqual(28);
    expect(Number(backToSchool(year).slice(8))).toBeGreaterThanOrEqual(8);
    expect(Number(backToSchool(year).slice(8))).toBeLessThanOrEqual(14);
    // Easter is always 22 March – 25 April
    expect(easterSunday(year) >= `${year}-03-22` && easterSunday(year) <= `${year}-04-25`).toBe(
      true,
    );
  });
});

describe("health moments", () => {
  it("month-long moments cover the whole month, single days are one day", () => {
    const events = healthEvents(2028); // leap year
    const heart = named(events, "American Heart Month");
    expect([heart.start, heart.end]).toEqual(["2028-02-01", "2028-02-29"]);
    const diabetesDay = named(events, "World Diabetes Day");
    expect([diabetesDay.start, diabetesDay.end]).toEqual(["2028-11-14", "2028-11-14"]);
  });
});

describe("holidays (Nager.Date fixtures)", () => {
  const h2026 = holidayEvents(2026, us2026 as HolidayRow[]);

  it("MLK Day 2026 is 2026-01-19 (sanity check)", () => {
    expect(named(h2026, "Martin Luther King, Jr. Day").start).toBe("2026-01-19");
  });

  it("July 4 2026 shows on Saturday 4 July, not the observed Friday", () => {
    const july4 = named(h2026, "Independence Day");
    expect(july4.start).toBe("2026-07-04");
    expect(weekdayOf(july4.start)).toBe(6);
  });

  it("observed New Year's Day (31 Dec 2021 in the 2022 list) moves to 1 Jan 2022", () => {
    const h2022 = holidayEvents(2022, us2022 as HolidayRow[]);
    expect(named(h2022, "New Year's Day").start).toBe("2022-01-01");
    expect(named(h2022, "Christmas Day").start).toBe("2022-12-25"); // observed Mon 26 Dec
    expect(named(h2022, "Juneteenth National Independence Day").start).toBe("2022-06-19");
  });

  it("keeps nationwide holidays only, once each", () => {
    expect(h2026.some((e) => e.name === "Lincoln's Birthday")).toBe(false);
    expect(h2026.some((e) => e.name === "Good Friday")).toBe(false);
    expect(h2026.filter((e) => e.name === "Columbus Day")).toHaveLength(1);
    expect(new Set(h2026.map((e) => e.id)).size).toBe(h2026.length);
  });

  it("shows US spelling: Labor Day, not Labour Day", () => {
    expect(named(h2026, "Labor Day").start).toBe("2026-09-07");
    expect(h2026.some((e) => e.name === "Labour Day")).toBe(false);
  });

  it("non-fixed holidays keep Nager's date", () => {
    expect(named(h2026, "Thanksgiving Day").start).toBe(thanksgiving(2026));
    expect(named(h2026, "Memorial Day").start).toBe("2026-05-25");
  });
});

describe("month grid and bars", () => {
  it("weeks start on Monday and cover the whole month", () => {
    const dec = monthGrid(2026, 11);
    expect(dec[0][0]).toBe("2026-11-30");
    expect(dec.at(-1)![6]).toBe("2027-01-03");
    expect(dec.every((w) => weekdayOf(w[0]) === 1)).toBe(true);
    expect(startOfWeek("2026-12-27")).toBe("2026-12-21");
  });

  it("a multi-day bar connects across a week and carries on into the next", () => {
    const dec = monthGrid(2026, 11);
    const events = eventsInRange(dec[0][0], dec.at(-1)![6], new Map());
    const week4 = layoutWeek(dec[3], events, dec[0][0]); // 21–27 Dec
    const season = week4.find((b) => b.event.name === "Resolution season")!;
    expect(season).toMatchObject({
      startCol: 5,
      endCol: 6,
      continuesBefore: false,
      continuesAfter: true,
      showLabel: true,
    });
    const week5 = layoutWeek(dec[4], events, dec[0][0]); // 28 Dec – 3 Jan
    expect(week5.find((b) => b.event.name === "Resolution season")).toMatchObject({
      startCol: 0,
      endCol: 6,
      continuesBefore: true,
      showLabel: false,
    });
  });

  it("an event that started before the grid is labelled on its first visible bar", () => {
    const jan = monthGrid(2027, 0); // starts Mon 28 Dec 2026
    const events = eventsInRange(jan[0][0], jan.at(-1)![6], new Map());
    const bar = layoutWeek(jan[0], events, jan[0][0]).find(
      (b) => b.event.name === "Resolution season",
    )!;
    expect(bar.showLabel).toBe(true);
    expect(bar.continuesBefore).toBe(true);
  });

  it("overlapping events get separate lanes", () => {
    const week = Array.from({ length: 7 }, (_, i) => addDays("2026-11-23", i)); // Thanksgiving week
    const events = eventsInRange(week[0], week[6], new Map([[2026, us2026 as HolidayRow[]]]));
    const bars = layoutWeek(week, events, week[0]);
    const diabetesMonth = bars.find((b) => b.event.name === "American Diabetes Month")!;
    const blackFri = bars.find((b) => b.event.name === "Black Friday")!;
    expect(diabetesMonth.lane).not.toBe(blackFri.lane);
  });
});
