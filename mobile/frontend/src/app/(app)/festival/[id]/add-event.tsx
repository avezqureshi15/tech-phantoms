import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { DateField, Field, TimeField } from "@/components/Field";
import { Screen } from "@/components/Screen";
import { ErrorState, ScreenSkeleton } from "@/components/States";
import { errorProps } from "@/lib/errors";
import { useAddEvent, useFestival } from "@/features/queries";
import { useToday } from "@/lib/clock-context";
import { parseDate, toApiDate, toApiTime } from "@/lib/dates";
import { colors } from "@/lib/theme";

export default function AddEventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const festival = useFestival(id);

  if (!festival.data) {
    return festival.isError ? (
      <ErrorState {...errorProps(festival.error)} onRetry={() => void festival.refetch()} />
    ) : (
      <ScreenSkeleton topInset={false} />
    );
  }

  return <AddEventForm festivalId={id} start={festival.data.start_date} end={festival.data.end_date} />;
}

function AddEventForm({ festivalId, start, end }: { festivalId: string; start: string; end: string }) {
  const min = parseDate(start);
  const max = parseDate(end);
  const today = parseDate(useToday());
  const initial = today < min ? min : today > max ? max : today;

  const addEvent = useAddEvent(festivalId);
  const [name, setName] = useState("");
  const [date, setDate] = useState(initial);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [endTime, setEndTime] = useState<Date | null>(null);
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!name.trim()) return setError("Give the event a name.");
    if (startTime && endTime && toApiTime(endTime) <= toApiTime(startTime)) {
      return setError("The end time must be after the start time.");
    }
    setError(null);
    addEvent.mutate(
      {
        name: name.trim(),
        event_date: toApiDate(date),
        start_time: startTime ? toApiTime(startTime) : undefined,
        end_time: endTime ? toApiTime(endTime) : undefined,
        location: location.trim() || undefined,
        description: description.trim() || undefined,
      },
      { onSuccess: () => router.back() },
    );
  };

  return (
    <Screen>
      <Field label="Event name" value={name} onChangeText={setName} placeholder="Lakshmi Puja" autoCapitalize="words" />
      <DateField label="Date" value={date} onChange={setDate} minimumDate={min} maximumDate={max} />
      <TimeField label="Starts (optional)" value={startTime} onChange={setStartTime} />
      <TimeField label="Ends (optional)" value={endTime} onChange={setEndTime} />
      <Field label="Where (optional)" value={location} onChangeText={setLocation} placeholder="Home, living room" />
      <Field label="Notes (optional)" value={description} onChangeText={setDescription} multiline />
      {error || addEvent.error ? (
        <AppText variant="label" color={colors.danger} accessibilityLiveRegion="polite">
          {error ?? addEvent.error?.message}
        </AppText>
      ) : null}
      <Button label="Add event" loading={addEvent.isPending} onPress={submit} />
    </Screen>
  );
}
