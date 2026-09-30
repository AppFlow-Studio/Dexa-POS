import { getCategoryLockState } from "@/lib/menu/categoryLockState";
import type { Category } from "@/lib/types";

const menu = { id: "m1", name: "Lunch" };
const at = new Date("2026-09-26T12:00:00");

const category = (overrides: Partial<Category> = {}): Category =>
  ({
    id: "c1",
    name: "Burgers",
    isActive: true,
    schedules: [],
    ...overrides,
  }) as Category;

const scheduled = category({
  schedules: [{ day: "monday", startTime: "09:00", endTime: "11:00" }] as any,
});

const lockState = ({
  cat = category(),
  onSchedule = true,
  activeForMenu = true,
  grantedCategories = [] as string[],
  grantedMenus = [] as string[],
} = {}) =>
  getCategoryLockState({
    category: cat,
    menu,
    at,
    isCategoryAvailableNow: () => onSchedule,
    isCategoryActiveForMenu: () => activeForMenu,
    grantedCategories: new Set(grantedCategories),
    grantedMenus: new Set(grantedMenus),
  });

describe("getCategoryLockState", () => {
  it("leaves an unscheduled category open and unlocked", () => {
    expect(lockState()).toMatchObject({
      isScheduled: false,
      isAvailable: true,
      showLock: false,
    });
  });

  it("leaves a scheduled category inside its window open", () => {
    expect(lockState({ cat: scheduled })).toMatchObject({
      isScheduled: true,
      isNormallyAvailable: true,
      showLock: false,
    });
  });

  it("locks a scheduled category outside its window", () => {
    expect(lockState({ cat: scheduled, onSchedule: false })).toMatchObject({
      isAvailable: false,
      hasOverride: false,
      showLock: true,
    });
  });

  it("opens an off-schedule category unlocked by a category grant", () => {
    expect(
      lockState({
        cat: scheduled,
        onSchedule: false,
        grantedCategories: ["Burgers"],
      }),
    ).toMatchObject({
      isNormallyAvailable: false,
      hasOverride: true,
      isAvailable: true,
      showLock: false,
    });
  });

  it("opens an off-schedule category when its menu was unlocked", () => {
    expect(
      lockState({ cat: scheduled, onSchedule: false, grantedMenus: ["Lunch"] }),
    ).toMatchObject({ hasOverride: true, isAvailable: true, showLock: false });
  });

  it("needs a PIN but shows no lock for an unscheduled category switched off for the menu", () => {
    expect(lockState({ activeForMenu: false })).toMatchObject({
      isAvailable: false,
      showLock: false,
    });
  });

  it("treats legacy string entries as unscheduled", () => {
    expect(lockState({ cat: "Burgers" as any, onSchedule: false })).toMatchObject(
      { isScheduled: false, isAvailable: true, showLock: false },
    );
  });
});
