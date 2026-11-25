import { z } from "zod";

export const userSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  avatar_url: z.string().nullable(),
});

export const userSchema = userSummarySchema.extend({
  email: z.string(),
  phone: z.string().nullable(),
  faiths: z.array(z.string()).default([]),
  // Absent from an older server means "assume answered", so nobody is stuck on the question.
  faith_chosen: z.boolean().default(true),
  home_city: z.string().nullable().default(null),
});

export const authResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number(),
  user: userSchema,
});

export const householdSchema = z.object({
  id: z.string(),
  name: z.string(),
  created_by: z.string().nullable(),
  timezone: z.string(),
  location: z.string().nullable(),
  currency: z.string(),
  default_language: z.string(),
  faiths: z.array(z.string()).default([]),
  panchang_city: z.string().default("delhi"),
  kind: z.enum(["household", "friends", "office", "other"]).default("household"),
  icon: z.string().nullable().default(null),
  color: z.string().nullable().default(null),
});

export const memberSchema = z.object({
  user: userSummarySchema,
  relationship: z.string().nullable(),
  role: z.enum(["admin", "member"]),
  notification_preference: z.string(),
  joined_at: z.string(),
});

export const householdDetailSchema = householdSchema.extend({
  members: z.array(memberSchema),
});

export const eventSchema = z.object({
  id: z.string(),
  name: z.string(),
  event_date: z.string(),
  start_time: z.string().nullable(),
  end_time: z.string().nullable(),
  location: z.string().nullable(),
  description: z.string().nullable(),
});

export const festivalStatusSchema = z.enum(["planning", "active", "completed", "cancelled"]);

export const festivalSchema = z.object({
  id: z.string(),
  household_id: z.string(),
  type: z.string(),
  name: z.string(),
  start_date: z.string(),
  end_date: z.string(),
  status: festivalStatusSchema,
  readiness_score: z.number(),
  year: z.number(),
});

export const festivalDetailSchema = festivalSchema.extend({
  events: z.array(eventSchema),
});

export const traditionSchema = z.object({
  id: z.string(),
  household_id: z.string(),
  festival_type: z.string(),
  name: z.string(),
  category: z.string(),
  scope: z.string(),
  description: z.string().nullable(),
  origin: z.string().nullable(),
  significance: z.string().nullable(),
  instructions: z.string().nullable(),
  region: z.string().nullable(),
  started_year: z.number().nullable(),
  active: z.boolean(),
  created_by: z.string().nullable(),
});

export const occurrenceSchema = z.object({
  id: z.string(),
  festival_id: z.string(),
  festival_name: z.string(),
  year: z.number(),
  performer: userSummarySchema.nullable(),
  completed_at: z.string().nullable(),
  notes: z.string().nullable(),
  photo_url: z.string().nullable(),
});

export const traditionDetailSchema = traditionSchema.extend({
  occurrences: z.array(occurrenceSchema),
});

export const checklistItemSchema = z.object({
  tradition: traditionSchema,
  occurrence_id: z.string().nullable(),
  completed: z.boolean(),
  completed_at: z.string().nullable(),
  performed_by: userSummarySchema.nullable(),
});

export type User = z.infer<typeof userSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
export type Household = z.infer<typeof householdSchema>;
export type Member = z.infer<typeof memberSchema>;
export type HouseholdDetail = z.infer<typeof householdDetailSchema>;
export type FestivalEvent = z.infer<typeof eventSchema>;
export type FestivalStatus = z.infer<typeof festivalStatusSchema>;
export type Festival = z.infer<typeof festivalSchema>;
export type FestivalDetail = z.infer<typeof festivalDetailSchema>;
export type Tradition = z.infer<typeof traditionSchema>;
export type Occurrence = z.infer<typeof occurrenceSchema>;
export type TraditionDetail = z.infer<typeof traditionDetailSchema>;
export type ChecklistItem = z.infer<typeof checklistItemSchema>;

export const spanSchema = z.object({
  name: z.string(),
  start: z.string(),
  end: z.string(),
  number: z.number().nullable().optional(),
  paksha: z.string().nullable().optional(),
});
export const periodSchema = z.object({ start: z.string(), end: z.string() });
export const placeSchema = z.object({
  key: z.string(),
  name: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  timezone: z.string(),
});
export const panchangDaySchema = z.object({
  date: z.string(),
  place: placeSchema,
  weekday: z.string(),
  vara: z.string(),
  sunrise: z.string(),
  sunset: z.string(),
  next_sunrise: z.string(),
  moonrise: z.string().nullable(),
  moonset: z.string().nullable(),
  tithis: z.array(spanSchema),
  nakshatras: z.array(spanSchema),
  yogas: z.array(spanSchema),
  karanas: z.array(spanSchema),
  month_amanta: z.string(),
  month_purnimanta: z.string(),
  paksha: z.string(),
  vikram_samvat: z.number(),
  shaka_year: z.number(),
  sun_sign: z.string(),
  moon_sign: z.string(),
  ayanamsa: z.number(),
  rahu_kalam: periodSchema,
  yamaganda: periodSchema,
  gulika: periodSchema,
  abhijit_muhurta: periodSchema,
  brahma_muhurta: periodSchema,
});
export const observanceSchema = z.object({
  code: z.string(),
  name: z.string(),
  faith: z.string(),
  date: z.string(),
  detail: z.string(),
});
export const observanceListSchema = z.object({
  year: z.number(),
  place: placeSchema,
  observances: z.array(observanceSchema),
});

export type PanchangDay = z.infer<typeof panchangDaySchema>;
export type PanchangSpan = z.infer<typeof spanSchema>;
export type Observance = z.infer<typeof observanceSchema>;

export const shareSchema = z.object({ user_id: z.string().nullable(), amount_minor: z.number() });
export const expenseSchema = z.object({
  id: z.string(),
  household_id: z.string(),
  festival_id: z.string().nullable(),
  description: z.string(),
  category: z.string(),
  amount_minor: z.number(),
  currency: z.string(),
  paid_by: z.string().nullable(),
  spent_on: z.string(),
  split_type: z.string(),
  notes: z.string().nullable(),
  created_by: z.string().nullable(),
  shares: z.array(shareSchema),
});
export const memberBalanceSchema = z.object({
  user_id: z.string().nullable(),
  paid_minor: z.number(),
  owed_minor: z.number(),
  net_minor: z.number(),
});
export const transferSchema = z.object({
  payer: z.string().nullable(),
  payee: z.string().nullable(),
  amount_minor: z.number(),
});
export const balancesSchema = z.object({
  currency: z.string(),
  members: z.array(memberBalanceSchema),
  transfers: z.array(transferSchema),
  settled_up: z.boolean(),
});
export const summarySchema = z.object({
  currency: z.string(),
  total_minor: z.number(),
  count: z.number(),
  by_category: z.record(z.string(), z.number()),
  by_payer: z.record(z.string(), z.number()),
});
export const searchResultSchema = z.object({
  kind: z.enum(["group", "festival", "tradition", "expense", "member"]),
  id: z.string(),
  title: z.string(),
  subtitle: z.string(),
  household_id: z.string(),
});
export const searchResponseSchema = z.object({
  query: z.string(),
  results: z.array(searchResultSchema),
});

export type Expense = z.infer<typeof expenseSchema>;
export type Balances = z.infer<typeof balancesSchema>;
export type Transfer = z.infer<typeof transferSchema>;
export type SearchResult = z.infer<typeof searchResultSchema>;

// ------------------------------------------------------------------- the faith-aware Today page

export const termsSchema = z.object({
  tithi: z.string(),
  nakshatra: z.string(),
  yoga: z.string(),
  karana: z.string(),
  rahu_kalam: z.string(),
  yamaganda: z.string(),
  gulika: z.string(),
  abhijit: z.string(),
  brahma: z.string(),
});
export const sunMoonSchema = z.object({
  sunrise: z.string(),
  sunset: z.string(),
  moonrise: z.string().nullable(),
  moonset: z.string().nullable(),
});
export const lunarSchema = z.object({
  tithis: z.array(spanSchema),
  nakshatras: z.array(spanSchema),
  yogas: z.array(spanSchema),
  karanas: z.array(spanSchema),
  month_amanta: z.string(),
  month_purnimanta: z.string(),
  paksha: z.string(),
  vikram_samvat: z.number(),
  shaka_year: z.number(),
  sun_sign: z.string(),
  moon_sign: z.string(),
});
export const timingsSchema = z.object({
  rahu_kalam: periodSchema,
  yamaganda: periodSchema,
  gulika: periodSchema,
  abhijit_muhurta: periodSchema,
  brahma_muhurta: periodSchema,
});
export const hijriSchema = z.object({
  day: z.number(),
  month: z.number(),
  month_name: z.string(),
  year: z.number(),
  expected: z.boolean(),
});
export const prayersSchema = z.object({
  fajr: z.string().nullable(),
  sunrise: z.string(),
  dhuhr: z.string(),
  asr: z.string().nullable(),
  maghrib: z.string(),
  isha: z.string().nullable(),
  method: z.string(),
  school: z.string(),
});
export const seasonSchema = z.object({ name: z.string(), colour: z.string(), note: z.string() });
export const todaySchema = z.object({
  date: z.string(),
  place: placeSchema,
  region: z.string().nullable(),
  faiths: z.array(z.string()),
  terms: termsSchema,
  sun_moon: sunMoonSchema,
  lunar: lunarSchema.nullable(),
  timings: timingsSchema.nullable(),
  hijri: hijriSchema.nullable(),
  prayers: prayersSchema.nullable(),
  season: seasonSchema.nullable(),
  upcoming: z.array(observanceSchema),
});
export const nearestSchema = z.object({
  city: placeSchema,
  distance_km: z.number(),
  region: z.string().nullable(),
});

export const trackSchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: z.string(),
  faith: z.string(),
  theme: z.string(),
  language: z.string(),
  note: z.string(),
  performer: z.string().nullable(),
  festivals: z.array(z.string()),
  links: z.object({ youtube: z.string(), spotify: z.string(), jiosaavn: z.string() }),
});
export const audioListSchema = z.object({ tracks: z.array(trackSchema) });

export type Today = z.infer<typeof todaySchema>;
export type Track = z.infer<typeof trackSchema>;
export type AppUser = z.infer<typeof userSchema>;
