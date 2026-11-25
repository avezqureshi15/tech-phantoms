import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

import { command, request, upload } from "@/lib/api";
import { pickGroup, useActiveGroupId } from "@/lib/active-group";
import { useAuth } from "@/lib/auth";
import type { Coordinates } from "@/lib/location";
import { FEATURE_DEFAULTS, featuresSchema, isOn, type Feature } from "@/lib/features";
import { receiptDraftSchema } from "@/lib/receipt";
import { callbackResultSchema, type toRequest } from "@/lib/support";
import { attachedDocumentSchema } from "@/lib/utsav/schemas";
import {
  balancesSchema,
  checklistItemSchema,
  eventSchema,
  expenseSchema,
  festivalDetailSchema,
  festivalSchema,
  householdDetailSchema,
  householdSchema,
  memberSchema,
  audioListSchema,
  nearestSchema,
  observanceListSchema,
  todaySchema,
  occurrenceSchema,
  panchangDaySchema,
  placeSchema,
  searchResponseSchema,
  summarySchema,
  userSchema,
  traditionDetailSchema,
  traditionSchema,
  type FestivalStatus,
} from "@/lib/schemas";

const keys = {
  households: ["households"] as const,
  household: (id: string) => ["household", id] as const,
  festivals: (hid: string) => ["festivals", hid] as const,
  festival: (id: string) => ["festival", id] as const,
  checklist: (id: string) => ["checklist", id] as const,
  traditions: (hid: string) => ["traditions", hid] as const,
  tradition: (id: string) => ["tradition", id] as const,
};

export function useHouseholds() {
  return useQuery({
    queryKey: keys.households,
    queryFn: () => request("/households", { schema: z.array(householdSchema) }),
  });
}

/** The group the app is showing: the one the person last chose, or their first. */
export function useActiveHousehold() {
  const query = useHouseholds();
  const { id } = useActiveGroupId();
  return { ...query, household: pickGroup(query.data, id) };
}

export function useHousehold(id: string | undefined) {
  return useQuery({
    queryKey: keys.household(id ?? ""),
    queryFn: () => request(`/households/${id}`, { schema: householdDetailSchema }),
    enabled: !!id,
  });
}

export function useIsAdmin(householdId: string | undefined) {
  const { user } = useAuth();
  const { data } = useHousehold(householdId);
  return data?.members.some((m) => m.user.id === user?.id && m.role === "admin") ?? false;
}

export function useFestivals(householdId: string | undefined) {
  return useQuery({
    queryKey: keys.festivals(householdId ?? ""),
    queryFn: () =>
      request(`/households/${householdId}/festivals`, {
        schema: z.array(festivalSchema),
        query: { limit: 100 },
      }),
    enabled: !!householdId,
  });
}

export function useFestival(id: string | undefined) {
  return useQuery({
    queryKey: keys.festival(id ?? ""),
    queryFn: () => request(`/festivals/${id}`, { schema: festivalDetailSchema }),
    enabled: !!id,
  });
}

export function useChecklist(festivalId: string | undefined) {
  return useQuery({
    queryKey: keys.checklist(festivalId ?? ""),
    queryFn: () => request(`/festivals/${festivalId}/checklist`, { schema: z.array(checklistItemSchema) }),
    enabled: !!festivalId,
  });
}

export function useTraditions(householdId: string | undefined) {
  return useQuery({
    queryKey: keys.traditions(householdId ?? ""),
    queryFn: () =>
      request(`/households/${householdId}/traditions`, {
        schema: z.array(traditionSchema),
        query: { limit: 100 },
      }),
    enabled: !!householdId,
  });
}

export function useTradition(id: string | undefined) {
  return useQuery({
    queryKey: keys.tradition(id ?? ""),
    queryFn: () => request(`/traditions/${id}`, { schema: traditionDetailSchema }),
    enabled: !!id,
  });
}

export function useCreateHousehold() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      location?: string;
      timezone?: string;
      kind?: string;
      icon?: string | null;
      color?: string | null;
    }) => request("/households", { method: "POST", body, schema: householdSchema }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.households }),
  });
}

export function useUpdateHousehold(householdId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name?: string;
      location?: string | null;
      timezone?: string;
      faiths?: string[];
      panchang_city?: string;
      icon?: string;
      color?: string;
    }) => request(`/households/${householdId}`, { method: "PATCH", body, schema: householdSchema }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.households }),
        queryClient.invalidateQueries({ queryKey: keys.household(householdId) }),
      ]),
  });
}

export function useAddMember(householdId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; relationship?: string }) =>
      request(`/households/${householdId}/members`, {
        method: "POST",
        body,
        schema: memberSchema,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.household(householdId) }),
  });
}

type MemberChanges = {
  role?: "admin" | "member";
  /** `null` clears the relationship. */
  relationship?: string | null;
  notification_preference?: string;
};

export function useUpdateMember(householdId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, ...body }: MemberChanges & { userId: string }) =>
      request(`/households/${householdId}/members/${userId}`, {
        method: "PATCH",
        body,
        schema: memberSchema,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.household(householdId) }),
  });
}

/** An admin removing someone, or a member leaving (`isSelf`). */
export function useRemoveMember(householdId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId }: { userId: string; isSelf: boolean }) =>
      command(`/households/${householdId}/members/${userId}`, { method: "DELETE" }),
    onSuccess: (_data, { isSelf }) =>
      queryClient.invalidateQueries({
        queryKey: isSelf ? keys.households : keys.household(householdId),
      }),
  });
}

/** Only the household's sole remaining member (its admin) may do this. */
export function useDeleteHousehold(householdId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => command(`/households/${householdId}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.households }),
  });
}

export function useCreateFestival(householdId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { type: string; name: string; start_date: string; end_date: string }) =>
      request(`/households/${householdId}/festivals`, {
        method: "POST",
        body,
        schema: festivalSchema,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.festivals(householdId) }),
  });
}

export function useUpdateFestivalStatus(festival: { id: string; household_id: string }) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (status: FestivalStatus) =>
      request(`/festivals/${festival.id}`, {
        method: "PATCH",
        body: { status },
        schema: festivalSchema,
      }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.festival(festival.id) }),
        queryClient.invalidateQueries({ queryKey: keys.festivals(festival.household_id) }),
      ]),
  });
}

export function useAddEvent(festivalId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      event_date: string;
      start_time?: string;
      end_time?: string;
      location?: string;
      description?: string;
    }) => request(`/festivals/${festivalId}/events`, { method: "POST", body, schema: eventSchema }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.festival(festivalId) }),
  });
}

export function useCreateTradition(householdId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      festival_type: string;
      name: string;
      category: string;
      scope: string;
      description?: string;
      started_year?: number;
      region?: string;
    }) =>
      request(`/households/${householdId}/traditions`, {
        method: "POST",
        body,
        schema: traditionSchema,
      }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.traditions(householdId) }),
        // A new tradition can belong on the checklist of any festival of its type.
        queryClient.invalidateQueries({ queryKey: ["checklist"] }),
      ]),
  });
}

export function useCompleteTradition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { traditionId: string; festivalId: string; performedBy: string }) =>
      request(`/traditions/${args.traditionId}/occurrences`, {
        method: "POST",
        body: { festival_id: args.festivalId, performed_by: args.performedBy },
        schema: occurrenceSchema,
      }),
    onSuccess: (_data, args) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.checklist(args.festivalId) }),
        queryClient.invalidateQueries({ queryKey: keys.tradition(args.traditionId) }),
      ]),
  });
}

const STABLE = 60 * 60 * 1000; // a panchang for a given day and place never changes

export function usePanchangDay(date: string, city: string) {
  return useQuery({
    queryKey: ["panchang", "day", date, city],
    queryFn: () => request("/panchang/day", { query: { on: date, city }, schema: panchangDaySchema }),
    staleTime: STABLE,
  });
}

export function useObservances(year: number, city: string) {
  return useQuery({
    queryKey: ["panchang", "observances", year, city],
    queryFn: () => request("/panchang/observances", { query: { year, city }, schema: observanceListSchema }),
    staleTime: STABLE,
  });
}

export function useCities() {
  return useQuery({
    queryKey: ["panchang", "cities"],
    queryFn: () => request("/panchang/cities", { schema: z.array(placeSchema) }),
    staleTime: Infinity,
  });
}

// ------------------------------------------------------------------------------ expenses

const expenseKeys = {
  all: (hid: string) => ["expenses", hid] as const,
  list: (hid: string, festival?: string) => ["expenses", hid, "list", festival ?? "all"] as const,
  balances: (hid: string, festival?: string) => ["expenses", hid, "balances", festival ?? "all"] as const,
  summary: (hid: string, festival?: string) => ["expenses", hid, "summary", festival ?? "all"] as const,
};

export function useExpenses(householdId: string | undefined, festivalId?: string) {
  return useQuery({
    queryKey: expenseKeys.list(householdId ?? "", festivalId),
    queryFn: () =>
      request(`/households/${householdId}/expenses`, {
        query: { festival_id: festivalId, limit: 100 },
        schema: z.array(expenseSchema),
      }),
    enabled: !!householdId,
  });
}

export function useBalances(householdId: string | undefined, festivalId?: string) {
  return useQuery({
    queryKey: expenseKeys.balances(householdId ?? "", festivalId),
    queryFn: () =>
      request(`/households/${householdId}/balances`, {
        query: { festival_id: festivalId },
        schema: balancesSchema,
      }),
    enabled: !!householdId,
  });
}

export function useExpenseSummary(householdId: string | undefined, festivalId?: string) {
  return useQuery({
    queryKey: expenseKeys.summary(householdId ?? "", festivalId),
    queryFn: () =>
      request(`/households/${householdId}/expenses/summary`, {
        query: { festival_id: festivalId },
        schema: summarySchema,
      }),
    enabled: !!householdId,
  });
}

export type NewExpense = {
  description: string;
  amount_minor: number;
  paid_by: string;
  split: { type: "equal" | "exact"; entries: { user_id: string; value?: number }[] };
  category: string;
  spent_on: string;
  festival_id?: string | null;
  notes?: string;
};

export function useCreateExpense(householdId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: NewExpense) =>
      request(`/households/${householdId}/expenses`, { method: "POST", body, schema: expenseSchema }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: expenseKeys.all(householdId) }),
  });
}

export function useDeleteExpense(householdId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (expenseId: string) => command(`/expenses/${expenseId}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: expenseKeys.all(householdId) }),
  });
}

export function useSettle(householdId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { payer: string; payee: string; amount_minor: number; settled_on: string }) =>
      command(`/households/${householdId}/settlements`, { method: "POST", body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: expenseKeys.all(householdId) }),
  });
}

// --------------------------------------------------------------------------------- search

export function useSearch(query: string) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: ["search", trimmed],
    queryFn: () => request("/search", { query: { q: trimmed }, schema: searchResponseSchema }),
    enabled: trimmed.length >= 2,
    staleTime: 30_000,
    placeholderData: (previous) => previous, // keep the last results on screen while typing
  });
}

/** id -> display name for everyone in a group; people who left show as "Former member". */
export function useMemberNames(householdId: string | undefined) {
  const { data } = useHousehold(householdId);
  const names = new Map<string, string>();
  data?.members.forEach((member) => names.set(member.user.id, member.user.name));
  return {
    members: data?.members ?? [],
    name: (id: string | null) => (id ? (names.get(id) ?? "Former member") : "Former member"),
  };
}

// ------------------------------------------------------ profile, Today, nearest city, audio

/** Where Today is computed: a listed city, or the device's own coordinates. */
export type Where = { city: string } | { coordinates: Coordinates; timezone: string };

const whereQuery = (where: Where) =>
  "city" in where
    ? { city: where.city }
    : { latitude: where.coordinates.latitude, longitude: where.coordinates.longitude, timezone: where.timezone };

export function useToday(date: string, where: Where | null) {
  return useQuery({
    queryKey: ["today", date, where],
    queryFn: () =>
      request("/panchang/today", { query: { on: date, ...(where ? whereQuery(where) : {}) }, schema: todaySchema }),
    staleTime: STABLE,
  });
}

export function useNearestCity(coordinates: Coordinates | null) {
  return useQuery({
    queryKey: ["nearest", coordinates],
    queryFn: () => request("/panchang/nearest", { query: { ...coordinates! }, schema: nearestSchema }),
    enabled: !!coordinates,
    staleTime: Infinity,
  });
}

export function useAudio(festival?: string) {
  return useQuery({
    queryKey: ["audio", festival ?? "mine"],
    queryFn: () => request("/audio", { query: { festival }, schema: audioListSchema }),
    staleTime: Infinity, // a fixed catalogue
  });
}

export function useUpdateProfile() {
  const { updateUser } = useAuth();
  return useMutation({
    mutationFn: (body: { faiths?: string[]; home_city?: string | null }) =>
      request("/users/me", { method: "PATCH", body, schema: userSchema }),
    onSuccess: (user) => updateUser(user),
  });
}

export type ReceiptFile = { uri: string; name: string; type: string };

/** Reads a receipt photo or PDF into a draft expense. Saves nothing. */
export function useScanReceipt(householdId: string) {
  return useMutation({
    mutationFn: (file: ReceiptFile) => upload(`/households/${householdId}/expenses/scan`, file, receiptDraftSchema),
  });
}

/** Reads a document (photo or PDF) into text that can be attached to a message to Utsav. */
export function useReadDocument(householdId: string | undefined) {
  return useMutation({
    mutationFn: (file: ReceiptFile) => upload(`/households/${householdId}/ai/documents`, file, attachedDocumentSchema),
  });
}

/** Asks the support team to phone the person back. Their number is sent once and not kept by the app. */
export function useRequestCallback() {
  return useMutation({
    mutationFn: (body: ReturnType<typeof toRequest>) =>
      request("/support/callback", { method: "POST", body, schema: callbackResultSchema }),
  });
}

/**
 * What is switched on. The server evaluates the feature flags for this person, so the app holds no
 * flag key. If the server cannot be reached the last answer (or "everything on") is used, so a flag
 * outage never hides a working feature.
 */
export function useFeatures() {
  const query = useQuery({
    queryKey: ["features"],
    queryFn: () => request("/features", { schema: featuresSchema }),
    staleTime: 5 * 60_000,
    retry: 1,
    placeholderData: FEATURE_DEFAULTS,
  });
  return {
    on: (name: Feature) => isOn(query.data, name),
    announcement: query.data?.announcement ?? null,
  };
}
