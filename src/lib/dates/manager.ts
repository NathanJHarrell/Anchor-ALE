// ── Date Manager: Human-facing date CRUD ─────────────────────────

import {
  addDate,
  getDates,
  getUpcomingDates,
  removeDate as dbRemoveDate,
} from "../database";
import type { DateEntry } from "../types";

export async function addAnniversary(label: string, date: string): Promise<DateEntry> {
  await addDate(label, date, "anniversary", true);
  const all = await getDates();
  return all[all.length - 1]!;
}

export async function addBirthday(label: string, date: string): Promise<DateEntry> {
  await addDate(label, date, "birthday", true);
  const all = await getDates();
  return all[all.length - 1]!;
}

export async function addMilestone(
  label: string,
  date: string,
  recurring = false,
): Promise<DateEntry> {
  await addDate(label, date, "milestone", recurring);
  const all = await getDates();
  return all[all.length - 1]!;
}

export async function listAllDates(): Promise<DateEntry[]> {
  return getDates();
}

export async function getUpcoming(days = 30): Promise<DateEntry[]> {
  return getUpcomingDates(days);
}

export async function removeDate(id: number): Promise<void> {
  return dbRemoveDate(id);
}
