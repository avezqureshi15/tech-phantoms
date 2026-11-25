import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { Chip } from "@/components/Chip";
import { Glass } from "@/components/Glass";
import { PatternSurface } from "@/components/Patterns";
import { mix } from "@/lib/color";
import { PageHeader, SectionTitle } from "@/components/Rows";
import { Screen } from "@/components/Screen";
import { EmptyState, ErrorState, ScreenSkeleton } from "@/components/States";
import { errorProps } from "@/lib/errors";
import { useCities, useNearestCity, useToday, useUpdateProfile, type Where } from "@/features/queries";
import { useCurrentUser } from "@/lib/auth";
import { deviceTimeZone, now } from "@/lib/clock";
import { useToday as useTodayDate } from "@/lib/clock-context";
import { addDays, daysBetween, formatDate, placeClock } from "@/lib/dates";
import { useDeviceLocation } from "@/lib/location";
import { FAITHS, faithLabel } from "@/lib/meta";
import type { Observance, PanchangSpan, Today } from "@/lib/schemas";
import { colors, radius, spacing } from "@/lib/theme";

// v2: an earlier build recorded "asked" before the attempt, so a failed first try was never retried.
const ASKED_KEY = "festiveos.location-asked.v2";

const spanText = (spans: PanchangSpan[], day: string, paksha = false) =>
  spans.map((s) => `${s.name}${paksha && s.paksha ? ` (${s.paksha})` : ""} until ${placeClock(s.end, day)}`);

function Row({ label, values, tone }: { label: string; values: string[]; tone?: string }) {
  return (
    <View style={styles.row}>
      <AppText variant="label" color={colors.muted} style={styles.rowLabel}>
        {label}
      </AppText>
      <View style={{ flex: 1, gap: 2 }}>
        {values.map((value) => (
          <AppText key={value} color={tone ?? colors.ink}>
            {value}
          </AppText>
        ))}
      </View>
    </View>
  );
}

function Hero({ page, day }: { page: Today; day: string }) {
  const first = page.lunar?.tithis.find((t) => t.end > page.sun_moon.sunrise) ?? page.lunar?.tithis[0];
  let eyebrow = formatDate(day);
  let title = `Sunrise ${placeClock(page.sun_moon.sunrise, day)}`;
  let line = `Sunset ${placeClock(page.sun_moon.sunset, day)}`;
  let foot: string | null = null;

  if (page.lunar && first) {
    eyebrow = `${formatDate(day)}`;
    title = first.name;
    line = `${first.paksha} paksha · until ${placeClock(first.end, day)}`;
    foot = `${page.lunar.month_amanta} · Vikram Samvat ${page.lunar.vikram_samvat} · Shaka ${page.lunar.shaka_year}`;
  } else if (page.hijri) {
    title = `${page.hijri.day} ${page.hijri.month_name}`;
    line = `${page.hijri.year} AH · expected, depends on the moon being sighted`;
  } else if (page.season) {
    title = page.season.name;
    line = page.season.note;
  }

  return (
    <PatternSurface color={mix(colors.saffronDeep, colors.maroon, 0.4)} style={styles.hero}>
      <AppText variant="eyebrow" color="rgba(255,255,255,0.85)">
        {eyebrow}
      </AppText>
      <AppText variant="display" color="#FFFFFF" numberOfLines={2}>
        {title}
      </AppText>
      <AppText color="rgba(255,255,255,0.92)">{line}</AppText>
      {foot ? (
        <Glass tint="rgba(255,255,255,0.14)" radius={14} style={styles.heroFoot}>
          <AppText variant="caption" color="#FFFFFF" style={{ padding: 10 }}>
            {foot}
          </AppText>
        </Glass>
      ) : null}
    </PatternSurface>
  );
}

function Prayers({ page, day, isToday, placeName }: { page: Today; day: string; isToday: boolean; placeName: string }) {
  const p = page.prayers;
  if (!p) return null;
  const rows: [string, string | null][] = [
    ["Fajr", p.fajr],
    ["Sunrise", p.sunrise],
    ["Dhuhr", p.dhuhr],
    ["Asr", p.asr],
    ["Maghrib", p.maghrib],
    ["Isha", p.isha],
  ];
  const next = isToday ? rows.find(([, at]) => at && Date.parse(at) > now().getTime())?.[0] : undefined;
  return (
    <Card>
      <View style={{ gap: spacing.md }}>
        <AppText variant="heading">Prayer times</AppText>
        {rows.map(([name, at]) => (
          <View key={name} style={[styles.prayer, next === name && styles.prayerNext]}>
            <AppText color={next === name ? colors.maroon : colors.ink} variant={next === name ? "heading" : "body"}>
              {name}
            </AppText>
            <AppText color={next === name ? colors.maroon : colors.muted} variant={next === name ? "heading" : "body"}>
              {at ? placeClock(at, day) : "–"}
            </AppText>
          </View>
        ))}
        <AppText variant="caption" color={colors.muted}>
          Calculated for {placeName} ({p.method}, {p.school} Asr). Your masjid&apos;s timetable
          is the authority where it differs by a few minutes.
        </AppText>
      </View>
    </Card>
  );
}

function ObservanceRow({ item, today }: { item: Observance; today: string }) {
  const away = daysBetween(today, item.date);
  return (
    <Card>
      <View style={styles.observance}>
        <View style={styles.dateTile}>
          <AppText variant="eyebrow" color={colors.saffronDeep}>
            {formatDate(item.date).split(" ")[1]}
          </AppText>
          <AppText variant="title" style={{ fontSize: 22, lineHeight: 26 }}>
            {item.date.slice(8)}
          </AppText>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="heading" numberOfLines={2}>
            {item.name}
          </AppText>
          <AppText variant="caption" color={colors.muted} numberOfLines={2}>
            {item.detail}
          </AppText>
        </View>
        <View style={{ alignItems: "flex-end", gap: 4 }}>
          <Chip label={faithLabel(item.faith)} />
          <AppText variant="caption" color={colors.saffronDeep}>
            {away === 0 ? "Today" : away === 1 ? "Tomorrow" : `in ${away} days`}
          </AppText>
        </View>
      </View>
    </Card>
  );
}

export default function TodayScreen() {
  const user = useCurrentUser();
  const todayDate = useTodayDate();
  const cities = useCities();
  const location = useDeviceLocation();
  const updateProfile = useUpdateProfile();
  const [picked, setPicked] = useState<string | null>(null);
  const [cityPick, setCityPick] = useState<string | null>(null);
  const date = picked ?? todayDate;

  // Ask for the location once, on first open. After that it is the person's call.
  useEffect(() => {
    void (async () => {
      if (await SecureStore.getItemAsync(ASKED_KEY).catch(() => "1")) return;
      await location.detect(); // granted, denied or failed, it has now been asked
      await SecureStore.setItemAsync(ASKED_KEY, "1").catch(() => undefined);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const where: Where | null = cityPick
    ? { city: cityPick }
    : location.coords
      ? { coordinates: location.coords, timezone: deviceTimeZone() }
      : null; // the server falls back to the person's saved city, then Delhi
  const page = useToday(date, where);
  const nearest = useNearestCity(location.coords && !cityPick ? location.coords : null);

  const toggleFaith = (value: string) =>
    updateProfile.mutate({
      faiths: user.faiths.includes(value) ? user.faiths.filter((f) => f !== value) : [...user.faiths, value],
    });

  if (!page.data) {
    return page.isError ? (
      <ErrorState {...errorProps(page.error)} onRetry={() => void page.refetch()} />
    ) : (
      <ScreenSkeleton />
    );
  }
  const data = page.data;
  const t = data.terms;
  const usingLocation = !!location.coords && !cityPick;
  const placeName = usingLocation ? `Near ${nearest.data?.city.name ?? "you"}` : data.place.name;
  const range = (p: { start: string; end: string }) => `${placeClock(p.start, date)} – ${placeClock(p.end, date)}`;

  return (
    <Screen topInset refreshing={page.isRefetching} onRefresh={() => void page.refetch()}>
      <PageHeader title="Today" subtitle={`${placeName} · ${formatDate(date)}`} />

      <View style={styles.dayNav}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous day" onPress={() => setPicked(addDays(date, -1))}>
          <Glass radius={20} interactive style={styles.navButton}>
            <Ionicons name="chevron-back" size={20} color={colors.maroon} />
          </Glass>
        </Pressable>
        <Chip label="Today" selected={date === todayDate} onPress={() => setPicked(null)} icon="today" />
        <Pressable accessibilityRole="button" accessibilityLabel="Next day" onPress={() => setPicked(addDays(date, 1))}>
          <Glass radius={20} interactive style={styles.navButton}>
            <Ionicons name="chevron-forward" size={20} color={colors.maroon} />
          </Glass>
        </Pressable>
      </View>

      <Hero page={data} day={date} />
      <Prayers page={data} day={date} isToday={date === todayDate} placeName={placeName} />

      {data.season ? (
        <Card>
          <View style={styles.row}>
            <Ionicons name="book" size={22} color={colors.saffronDeep} />
            <View style={{ flex: 1 }}>
              <AppText variant="heading">{data.season.name}</AppText>
              <AppText color={colors.muted}>
                {data.season.note} · liturgical colour {data.season.colour}
              </AppText>
            </View>
          </View>
        </Card>
      ) : null}

      {data.lunar ? (
        <Card>
          <View style={{ gap: spacing.md }}>
            <AppText variant="heading">The five limbs</AppText>
            <Row label={t.tithi} values={spanText(data.lunar.tithis, date, true)} />
            <Row label={t.nakshatra} values={spanText(data.lunar.nakshatras, date)} />
            <Row label={t.yoga} values={spanText(data.lunar.yogas, date)} />
            <Row label={t.karana} values={spanText(data.lunar.karanas, date)} />
            <Row label="Month" values={[data.lunar.month_amanta, ...(data.lunar.month_purnimanta !== data.lunar.month_amanta ? [`${data.lunar.month_purnimanta} (north)`] : [])]} />
          </View>
        </Card>
      ) : null}

      {data.timings ? (
        <Card>
          <View style={{ gap: spacing.md }}>
            <AppText variant="heading">Timings</AppText>
            <Row label={t.abhijit} values={[range(data.timings.abhijit_muhurta)]} tone={colors.success} />
            <Row label={t.brahma} values={[range(data.timings.brahma_muhurta)]} tone={colors.success} />
            <Row label={t.rahu_kalam} values={[range(data.timings.rahu_kalam)]} tone={colors.danger} />
            <Row label={t.yamaganda} values={[range(data.timings.yamaganda)]} tone={colors.danger} />
            <Row label={t.gulika} values={[range(data.timings.gulika)]} tone={colors.danger} />
          </View>
        </Card>
      ) : null}

      <Card>
        <View style={{ gap: spacing.md }}>
          <AppText variant="heading">Sun and Moon</AppText>
          <Row label="Sunrise" values={[placeClock(data.sun_moon.sunrise, date)]} />
          <Row label="Sunset" values={[placeClock(data.sun_moon.sunset, date)]} />
          {data.sun_moon.moonrise ? <Row label="Moonrise" values={[placeClock(data.sun_moon.moonrise, date)]} /> : null}
          {data.sun_moon.moonset ? <Row label="Moonset" values={[placeClock(data.sun_moon.moonset, date)]} /> : null}
          {data.lunar ? <Row label="Sun in" values={[data.lunar.sun_sign]} /> : null}
          {data.lunar ? <Row label="Moon in" values={[data.lunar.moon_sign]} /> : null}
        </View>
      </Card>

      <View style={{ gap: spacing.sm }}>
        <SectionTitle title="Place" />
        <Glass radius={radius.md} style={styles.placeCard}>
          <View style={styles.row}>
            <Ionicons name={usingLocation ? "navigate" : "location"} size={20} color={colors.saffronDeep} />
            <View style={{ flex: 1 }}>
              <AppText variant="label">
                {usingLocation ? `Your location${nearest.data ? ` · near ${nearest.data.city.name}` : ""}` : data.place.name}
              </AppText>
              <AppText variant="caption" color={colors.muted}>
                {usingLocation
                  ? "Used on this phone for accurate sunrise; never stored."
                  : location.status === "denied"
                    ? "Location is off. Turn it on in Settings, or pick a city."
                    : "Choose a city, or use your location."}
              </AppText>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setCityPick(null);
              void location.detect();
            }}
          >
            <AppText variant="label" color={colors.saffronDeep}>
              {location.status === "locating" ? "Finding you…" : "Use my location"}
            </AppText>
          </Pressable>
        </Glass>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
          {(cities.data ?? []).map((c) => (
            <Chip
              key={c.key}
              label={c.name}
              icon="location"
              selected={cityPick === c.key || (!usingLocation && !cityPick && c.key === data.place.key)}
              onPress={() => {
                setCityPick(c.key);
                updateProfile.mutate({ home_city: c.key });
              }}
            />
          ))}
        </ScrollView>
      </View>

      <View style={{ gap: spacing.md }}>
        <SectionTitle title="Coming up" />
        {data.upcoming.length === 0 ? (
          <View style={{ minHeight: 200 }}>
            <EmptyState icon="calendar" title="Nothing listed" message="No observances for your faiths in this period." />
          </View>
        ) : (
          data.upcoming.map((o) => <ObservanceRow key={`${o.code}-${o.date}`} item={o} today={todayDate} />)
        )}
        {data.faiths.includes("muslim") ? (
          <AppText variant="caption" color={colors.muted}>
            Muslim dates are expected from the crescent and depend on local moon sighting; confirm with
            your local committee.
          </AppText>
        ) : null}
      </View>

      <View style={{ gap: spacing.sm }}>
        <SectionTitle title="What I follow" />
        <View style={styles.faiths}>
          {FAITHS.map((f) => (
            <Chip key={f.value} label={f.label} icon={f.icon} selected={user.faiths.includes(f.value)} onPress={() => toggleFaith(f.value)} />
          ))}
        </View>
        <AppText variant="caption" color={colors.muted}>
          {user.faiths.length === 0 ? "Showing a general page. " : "This page is tailored to what you follow. "}
          Tap to change.
        </AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.lg, padding: spacing.xl, gap: spacing.sm },
  heroFoot: { marginTop: spacing.md, alignSelf: "flex-start" },
  row: { flexDirection: "row", gap: spacing.md, alignItems: "center" },
  rowLabel: { width: 112 },
  dayNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  navButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  prayer: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, paddingHorizontal: 8, borderRadius: 10 },
  prayerNext: { backgroundColor: colors.saffronSoft },
  placeCard: { padding: spacing.lg, gap: spacing.md },
  observance: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  dateTile: { width: 52, height: 56, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.saffronSoft },
  faiths: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
});
