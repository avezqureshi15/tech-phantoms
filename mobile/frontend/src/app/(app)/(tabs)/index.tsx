import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { Avatar } from "@/components/Avatar";
import { Card } from "@/components/Card";
import { FestivalHero } from "@/components/FestivalHero";
import { Glass } from "@/components/Glass";
import { GroupBadge } from "@/components/GroupBadge";
import { IconTile } from "@/components/IconTile";
import { ListRow } from "@/components/ListRow";
import { FadeInUp, PressableScale } from "@/components/Motion";
import { SectionTitle } from "@/components/Rows";
import { Screen } from "@/components/Screen";
import { ErrorState, ScreenSkeleton } from "@/components/States";
import {
  useActiveHousehold,
  useChecklist,
  useFeatures,
  useFestival,
  useFestivals,
  useHousehold,
  useIsAdmin,
  useToday as useTodayPage,
  useTraditions,
} from "@/features/queries";
import { useCurrentUser } from "@/lib/auth";
import { now } from "@/lib/clock";
import { useToday } from "@/lib/clock-context";
import { daysBetween, daysUntil, formatDate, formatTime, parseDate } from "@/lib/dates";
import { errorProps } from "@/lib/errors";
import { pickFeatured } from "@/lib/festivals";
import { categoryMeta, faithLabel, type IconName } from "@/lib/meta";
import type { Today } from "@/lib/schemas";
import { colors, radius, spacing } from "@/lib/theme";

function greeting(): string {
  const hour = now().getHours(); // the person's own local hour, on a server-corrected clock
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** One line about today, chosen by what the person follows. */
function todayLine(page: Today): {
  icon: IconName;
  title: string;
  line: string;
} {
  if (page.lunar) {
    const tithi = page.lunar.tithis.find((t) => t.end > page.sun_moon.sunrise) ?? page.lunar.tithis[0];
    return {
      icon: "moon",
      title: `${tithi?.name ?? ""} · ${tithi?.paksha ?? ""} paksha`,
      line: `${page.lunar.month_amanta} · Vikram ${page.lunar.vikram_samvat}`,
    };
  }
  if (page.hijri) {
    return {
      icon: "moon",
      title: `${page.hijri.day} ${page.hijri.month_name}`,
      line: `${page.hijri.year} AH · expected`,
    };
  }
  if (page.season) return { icon: "book", title: page.season.name, line: page.season.note };
  return {
    icon: "sunny",
    title: "Sunrise and sunset",
    line: `${page.sun_moon.sunrise.slice(11, 16)} · ${page.sun_moon.sunset.slice(11, 16)}`,
  };
}

const QUICK: readonly {
  icon: IconName;
  label: string;
  href: string;
  adminOnly?: boolean;
}[] = [
  {
    icon: "calendar",
    label: "Festival",
    href: "/festival/new",
    adminOnly: true,
  },
  { icon: "wallet", label: "Expense", href: "/expense/new" },
  { icon: "person-add", label: "Invite", href: "/member/new", adminOnly: true },
];

export default function HomeScreen() {
  const features = useFeatures();
  const user = useCurrentUser();
  const today = useToday();
  const { household } = useActiveHousehold();
  const isAdmin = useIsAdmin(household?.id);
  const festivals = useFestivals(household?.id);
  const members = useHousehold(household?.id);
  const traditions = useTraditions(household?.id);
  const page = useTodayPage(today, null);
  const featured = useMemo(
    () => (festivals.data ? pickFeatured(festivals.data, today) : undefined),
    [festivals.data, today],
  );
  const detail = useFestival(featured?.id);
  const checklist = useChecklist(featured?.id);

  const refreshing = festivals.isRefetching || detail.isRefetching || checklist.isRefetching;
  const refresh = () => {
    void festivals.refetch();
    void detail.refetch();
    void checklist.refetch();
    void page.refetch();
  };

  if (!festivals.data) {
    return festivals.isError ? (
      <ErrorState {...errorProps(festivals.error)} onRetry={() => void festivals.refetch()} />
    ) : (
      <ScreenSkeleton />
    );
  }

  const isHousehold = household?.kind === "household";
  const items = checklist.data ?? [];
  const done = items.filter((i) => i.completed).length;
  const pending = items.filter((i) => !i.completed).slice(0, 4);
  const upcomingEvents = (detail.data?.events ?? []).filter((e) => daysUntil(e.event_date, today) >= 0).slice(0, 3);
  const ahead = (page.data?.upcoming ?? []).slice(0, 3);

  const stats: {
    icon: IconName;
    value: number | undefined;
    label: string;
    href: string;
  }[] = [
    {
      icon: "people",
      value: members.data?.members.length,
      label: isHousehold ? "Family" : "Members",
      href: "/family",
    },
    ...(isHousehold
      ? [
          {
            icon: "flame" as IconName,
            value: traditions.data?.length,
            label: "Traditions",
            href: "/traditions",
          },
        ]
      : []),
    {
      icon: "calendar",
      value: festivals.data.length,
      label: "Festivals",
      href: "/festivals",
    },
  ];

  return (
    <Screen topInset refreshing={refreshing} onRefresh={refresh}>
      <FadeInUp>
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Switch group, current: ${household?.name ?? ""}`}
            onPress={() => router.push("/group")}
            style={styles.pillWrap}
          >
            <Glass radius={radius.pill} interactive style={styles.groupPill}>
              {household ? <GroupBadge group={household} size={30} /> : null}
              <AppText variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>
                {household?.name}
              </AppText>
              <Ionicons name="chevron-down" size={16} color={colors.muted} />
            </Glass>
          </Pressable>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" accessibilityLabel="Search" onPress={() => router.push("/search")}>
              <Glass radius={22} interactive style={styles.circle}>
                <Ionicons name="search" size={20} color={colors.maroon} />
              </Glass>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Members" onPress={() => router.push("/family")}>
              <Glass radius={22} interactive style={styles.circle}>
                <Avatar name={user.name} uri={user.avatar_url} size={34} />
              </Glass>
            </Pressable>
          </View>
        </View>
      </FadeInUp>

      <FadeInUp delay={40} style={styles.greeting}>
        <AppText variant="eyebrow" color={colors.saffronDeep}>
          {greeting()}
        </AppText>
        <AppText variant="display" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
          {user.name.split(" ")[0]}
        </AppText>
      </FadeInUp>

      {features.announcement ? (
        <FadeInUp delay={50}>
          <ListRow
            leading={<IconTile icon="megaphone" tint={colors.gold} />}
            title={features.announcement}
            titleLines={4}
            accessibilityLabel={`Notice: ${features.announcement}`}
          />
        </FadeInUp>
      ) : null}

      {features.on("utsav") ? (
        <FadeInUp delay={60}>
          <ListRow
            leading={<IconTile icon="sparkles" gradient={[colors.saffronDeep, colors.saffron]} />}
            title="Ask Utsav"
            subtitle="Plan hosting, festivals and more"
            onPress={() => router.push("/utsav")}
          />
        </FadeInUp>
      ) : null}

      {features.on("utsav") && features.on("utsav_voice") && features.on("elder_mode") ? (
        <FadeInUp delay={70}>
          <ListRow
            leading={<IconTile icon="mic" tint={colors.success} />}
            title="Talk with Utsav"
            subtitle="Voice only, made easy for elders"
            onPress={() => router.push({ pathname: "/voice", params: { mode: "elder" } })}
          />
        </FadeInUp>
      ) : null}
      {features.on("utsav") && features.on("utsav_voice") && features.on("recite_mode") ? (
        <FadeInUp delay={80}>
          <ListRow
            leading={<IconTile icon="musical-notes" tint={colors.gold} />}
            title="Practise a prayer"
            subtitle="Say it line by line and get gentle corrections"
            onPress={() => router.push({ pathname: "/voice", params: { mode: "recite" } })}
          />
        </FadeInUp>
      ) : null}
      {features.on("support_callback") ? (
        <FadeInUp delay={90}>
          <ListRow
            leading={<IconTile icon="call" tint={colors.saffronDeep} />}
            title="Need help? Get a call back"
            subtitle="Our team phones you, in your language"
            onPress={() => router.push("/support")}
          />
        </FadeInUp>
      ) : null}

      {page.data ? (
        <FadeInUp delay={80}>
          {(() => {
            const line = todayLine(page.data);
            return (
              <ListRow
                leading={<IconTile icon={line.icon} gradient={[colors.maroon, colors.saffronDeep]} />}
                title={line.title}
                subtitle={`Today · ${line.line}`}
                onPress={() => router.push("/today")}
                accessibilityLabel={`Today: ${line.title}. Open the daily page`}
              />
            );
          })()}
        </FadeInUp>
      ) : null}

      {!featured ? (
        <FadeInUp delay={110}>
          <Card style={styles.welcome}>
            <IconTile icon="calendar" size={64} />
            <AppText variant="title" style={styles.center}>
              Plan your first festival
            </AppText>
            <AppText color={colors.muted} style={styles.center}>
              Add Diwali, Eid, Christmas, Pongal, whatever your group celebrates, and bring everyone together.
            </AppText>
          </Card>
        </FadeInUp>
      ) : (
        <FadeInUp delay={110}>
          <FestivalHero
            festival={featured}
            progress={{ done, total: items.length }}
            onPress={() => router.push(`/festival/${featured.id}`)}
          />
        </FadeInUp>
      )}

      <FadeInUp delay={150}>
        <View style={styles.quick}>
          {QUICK.filter((q) => !q.adminOnly || isAdmin).map((q) => (
            <PressableScale
              key={q.label}
              accessibilityRole="button"
              accessibilityLabel={`Add ${q.label.toLowerCase()}`}
              onPress={() => router.push(q.href as never)}
              style={styles.quickItem}
            >
              <IconTile icon={q.icon} size={40} />
              <AppText variant="label">{q.label}</AppText>
            </PressableScale>
          ))}
        </View>
      </FadeInUp>

      <FadeInUp delay={190}>
        <View style={styles.stats}>
          {stats.map((stat) => (
            <PressableScale
              key={stat.label}
              accessibilityRole="button"
              accessibilityLabel={`${stat.label}: ${stat.value ?? ""}`}
              onPress={() => router.push(stat.href as never)}
              style={styles.stat}
            >
              <AppText variant="title" style={styles.statValue}>
                {stat.value ?? "–"}
              </AppText>
              <AppText variant="caption" color={colors.muted}>
                {stat.label}
              </AppText>
            </PressableScale>
          ))}
        </View>
      </FadeInUp>

      {upcomingEvents.length > 0 && featured ? (
        <FadeInUp delay={230} style={styles.section}>
          <SectionTitle
            title="Coming up"
            actionLabel="Full plan"
            onAction={() => router.push(`/festival/${featured.id}`)}
          />
          {upcomingEvents.map((event) => {
            const date = parseDate(event.event_date);
            return (
              <ListRow
                key={event.id}
                leading={
                  <View style={styles.dateBadge}>
                    <AppText variant="eyebrow" color={colors.saffronDeep}>
                      {date.toLocaleDateString("en-IN", { month: "short" })}
                    </AppText>
                    <AppText variant="title" style={styles.dateDay}>
                      {date.getDate()}
                    </AppText>
                  </View>
                }
                title={event.name}
                subtitle={
                  [formatTime(event.start_time), event.location].filter(Boolean).join(" · ") ||
                  formatDate(event.event_date)
                }
              />
            );
          })}
        </FadeInUp>
      ) : null}

      {isHousehold && pending.length > 0 && featured ? (
        <FadeInUp delay={260} style={styles.section}>
          <SectionTitle
            title="Traditions to honour"
            actionLabel="See all"
            onAction={() => router.push(`/festival/${featured.id}`)}
          />
          {pending.map((item) => (
            <ListRow
              key={item.tradition.id}
              leading={<IconTile icon={categoryMeta(item.tradition.category).icon} tint={colors.maroon} />}
              title={item.tradition.name}
              onPress={() => router.push(`/tradition/${item.tradition.id}`)}
            />
          ))}
        </FadeInUp>
      ) : null}

      {ahead.length > 0 ? (
        <FadeInUp delay={290} style={styles.section}>
          <SectionTitle title="Dates ahead" actionLabel="Today" onAction={() => router.push("/today")} />
          {ahead.map((o) => {
            const away = daysBetween(today, o.date);
            return (
              <ListRow
                key={`${o.code}-${o.date}`}
                leading={<IconTile icon="sparkles" tint={colors.gold} />}
                title={o.name}
                subtitle={`${faithLabel(o.faith)} · ${formatDate(o.date)}`}
                trailing={
                  <AppText variant="label" color={colors.saffronDeep}>
                    {away === 0 ? "Today" : away === 1 ? "Tomorrow" : `${away} days`}
                  </AppText>
                }
              />
            );
          })}
        </FadeInUp>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  pillWrap: { flexShrink: 1 },
  groupPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: 14,
    minHeight: 44,
  },
  actions: { flexDirection: "row", gap: spacing.sm },
  circle: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  greeting: { gap: 2, marginTop: spacing.sm },
  welcome: {
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.xl,
  },
  center: { textAlign: "center" },
  quick: { flexDirection: "row", gap: spacing.md },
  quickItem: {
    flex: 1,
    alignItems: "center",
    gap: 6,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: "#FFFDF9",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.95)",
  },
  stats: { flexDirection: "row", gap: spacing.md },
  stat: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: "rgba(94,22,38,0.06)",
  },
  statValue: { fontSize: 26, lineHeight: 30 },
  section: { gap: spacing.md },
  dateBadge: {
    width: 44,
    height: 48,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.saffronSoft,
  },
  dateDay: { fontSize: 20, lineHeight: 24 },
});
