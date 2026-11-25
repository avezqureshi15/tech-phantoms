import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { ScrollView, StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Glass } from "@/components/Glass";
import { PatternSurface } from "@/components/Patterns";
import { Chip } from "@/components/Chip";
import { PageHeader, SectionTitle } from "@/components/Rows";
import { Screen } from "@/components/Screen";
import { EmptyState, ErrorState, ScreenSkeleton } from "@/components/States";
import { errorProps } from "@/lib/errors";
import {
  useActiveHousehold,
  useBalances,
  useExpenses,
  useExpenseSummary,
  useFestivals,
  useMemberNames,
  useSettle,
} from "@/features/queries";
import { useCurrentUser } from "@/lib/auth";
import { useToday } from "@/lib/clock-context";
import { formatDate } from "@/lib/dates";
import { categoryIcon } from "@/lib/meta";
import { formatMoney } from "@/lib/money";
import type { Expense } from "@/lib/schemas";
import { colors, radius, spacing } from "@/lib/theme";

function ExpenseRow({ expense, payer }: { expense: Expense; payer: string }) {
  return (
    <Card onPress={() => router.push(`/expense/${expense.id}`)} accessibilityLabel={expense.description}>
      <View style={styles.row}>
        <View style={styles.iconTile}>
          <Ionicons name={categoryIcon(expense.category)} size={22} color={colors.maroon} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="heading" numberOfLines={1}>
            {expense.description}
          </AppText>
          <AppText variant="caption" color={colors.muted}>
            {payer} paid · {formatDate(expense.spent_on)}
          </AppText>
        </View>
        <AppText variant="heading">{formatMoney(expense.amount_minor, expense.currency)}</AppText>
      </View>
    </Card>
  );
}

export default function ExpensesScreen() {
  const user = useCurrentUser();
  const today = useToday();
  const { festival } = useLocalSearchParams<{ festival?: string }>();
  const { household } = useActiveHousehold();
  const festivals = useFestivals(household?.id);
  const names = useMemberNames(household?.id);
  const expenses = useExpenses(household?.id, festival);
  const balances = useBalances(household?.id, festival);
  const summary = useExpenseSummary(household?.id, festival);
  const settle = useSettle(household?.id ?? "");

  if (!expenses.data || !balances.data || !summary.data) {
    const failed = expenses.error ?? balances.error ?? summary.error;
    return failed ? (
      <ErrorState {...errorProps(failed)} onRetry={() => void expenses.refetch()} />
    ) : (
      <ScreenSkeleton />
    );
  }

  const currency = balances.data.currency;
  const mine = balances.data.members.find((m) => m.user_id === user.id)?.net_minor ?? 0;
  const addHref = festival ? `/expense/new?festival=${festival}` : "/expense/new";
  const status =
    mine === 0 ? "You're all settled up" : mine > 0 ? `You are owed ${formatMoney(mine, currency)}` : `You owe ${formatMoney(-mine, currency)}`;

  return (
    <Screen
      topInset
      refreshing={expenses.isRefetching}
      onRefresh={() => {
        void expenses.refetch();
        void balances.refetch();
        void summary.refetch();
      }}
    >
      <PageHeader title="Expenses" subtitle={household?.name} onAdd={() => router.push(addHref as never)} addLabel="Add expense" />

      {festivals.data && festivals.data.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
          <Chip label="Everything" selected={!festival} onPress={() => router.setParams({ festival: undefined })} />
          {festivals.data.map((f) => (
            <Chip key={f.id} label={f.name} selected={festival === f.id} onPress={() => router.setParams({ festival: f.id })} />
          ))}
        </ScrollView>
      ) : null}

      <PatternSurface color={colors.maroon} style={styles.summary}>
        <AppText variant="eyebrow" color="rgba(255,255,255,0.8)">
          {festival ? "Spent on this festival" : "Total spent"}
        </AppText>
        <AppText variant="display" color="#FFFFFF" adjustsFontSizeToFit numberOfLines={1}>
          {formatMoney(summary.data.total_minor, currency)}
        </AppText>
        <Glass radius={radius.pill} tint="rgba(232,89,12,0.5)" style={styles.statusChip}>
          <Ionicons
            name={mine === 0 ? "checkmark-circle" : mine > 0 ? "arrow-down-circle" : "arrow-up-circle"}
            size={18}
            color="#FFFFFF"
          />
          <AppText variant="label" color="#FFFFFF">
            {status}
          </AppText>
        </Glass>
      </PatternSurface>

      {balances.data.transfers.length > 0 ? (
        <View style={{ gap: spacing.md }}>
          <SectionTitle title="Settle up" />
          {balances.data.transfers.map((t) => {
            const involvesMe = t.payer === user.id || t.payee === user.id;
            return (
              <Card key={`${t.payer}-${t.payee}`}>
                <View style={styles.row}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <AppText variant="heading">
                      {t.payer === user.id ? "You" : names.name(t.payer)} pay{t.payer === user.id ? "" : "s"}{" "}
                      {t.payee === user.id ? "you" : names.name(t.payee)}
                    </AppText>
                    <AppText color={colors.saffronDeep} variant="label">
                      {formatMoney(t.amount_minor, currency)}
                    </AppText>
                  </View>
                  {involvesMe && !festival && t.payer && t.payee ? (
                    <Button
                      label="Mark paid"
                      variant="secondary"
                      loading={settle.isPending}
                      onPress={() =>
                        settle.mutate({ payer: t.payer!, payee: t.payee!, amount_minor: t.amount_minor, settled_on: today })
                      }
                    />
                  ) : null}
                </View>
              </Card>
            );
          })}
        </View>
      ) : null}

      <View style={{ gap: spacing.md }}>
        <SectionTitle title="Expenses" />
        {expenses.data.length === 0 ? (
          <View style={{ minHeight: 260 }}>
            <EmptyState
              icon="wallet"
              title="No expenses yet"
              message="Add what you spend together and FestiveOS keeps count of who owes whom."
              actionLabel="Add an expense"
              onAction={() => router.push(addHref as never)}
            />
          </View>
        ) : (
          expenses.data.map((e) => <ExpenseRow key={e.id} expense={e} payer={e.paid_by === user.id ? "You" : names.name(e.paid_by)} />)
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  iconTile: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.sand,
  },
  summary: { gap: spacing.sm, alignItems: "flex-start", borderRadius: radius.lg, padding: spacing.xl },
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
});
