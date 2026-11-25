import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { Alert, View } from "react-native";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Screen } from "@/components/Screen";
import { ErrorState, ScreenSkeleton } from "@/components/States";
import { errorProps } from "@/lib/errors";
import { useActiveHousehold, useDeleteExpense, useIsAdmin, useMemberNames } from "@/features/queries";
import { request } from "@/lib/api";
import { useCurrentUser } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { categoryIcon, titleCase } from "@/lib/meta";
import { formatMoney } from "@/lib/money";
import { expenseSchema } from "@/lib/schemas";
import { colors, spacing } from "@/lib/theme";

export default function ExpenseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useCurrentUser();
  const { household } = useActiveHousehold();
  const { name } = useMemberNames(household?.id);
  const isAdmin = useIsAdmin(household?.id);
  const remove = useDeleteExpense(household?.id ?? "");
  const expense = useQuery({
    queryKey: ["expense", id],
    queryFn: () => request(`/expenses/${id}`, { schema: expenseSchema }),
  });

  if (!expense.data) {
    return expense.isError ? <ErrorState {...errorProps(expense.error)} onRetry={() => void expense.refetch()} /> : <ScreenSkeleton />;
  }
  const e = expense.data;
  const canChange = isAdmin || e.created_by === user.id;
  const who = (userId: string | null) => (userId === user.id ? "You" : name(userId));

  const confirmDelete = () =>
    Alert.alert("Delete this expense?", "Everyone's balances will update.", [
      { text: "Keep it", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => remove.mutate(e.id, { onSuccess: () => router.back() }) },
    ]);

  return (
    <Screen>
      <View style={{ alignItems: "center", gap: spacing.sm }}>
        <Ionicons name={categoryIcon(e.category)} size={36} color={colors.saffronDeep} />
        <AppText variant="display">{formatMoney(e.amount_minor, e.currency)}</AppText>
        <AppText variant="title" style={{ textAlign: "center" }}>
          {e.description}
        </AppText>
        <AppText color={colors.muted}>
          {titleCase(e.category)} · {formatDate(e.spent_on)} · paid by {who(e.paid_by)}
        </AppText>
      </View>

      <Card>
        <View style={{ gap: spacing.md }}>
          <AppText variant="heading">Split {e.split_type === "equal" ? "equally" : "by exact amounts"}</AppText>
          {e.shares.map((s) => (
            <View key={`${s.user_id}`} style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <AppText>{who(s.user_id)}</AppText>
              <AppText variant="label">{formatMoney(s.amount_minor, e.currency)}</AppText>
            </View>
          ))}
        </View>
      </Card>

      {e.notes ? <AppText color={colors.muted}>{e.notes}</AppText> : null}
      {canChange ? <Button label="Delete expense" variant="danger" loading={remove.isPending} onPress={confirmDelete} /> : null}
    </Screen>
  );
}
