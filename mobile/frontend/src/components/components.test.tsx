import { fireEvent, render as baseRender, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { FestivalHero } from "@/components/FestivalHero";
import { Glass } from "@/components/Glass";
import { PressableScale, splitLayoutStyle } from "@/components/Motion";
import { PATTERNS, PatternArt } from "@/components/Patterns";
import { PATTERN_IDS } from "@/lib/appearance";
import { ProgressRing } from "@/components/ProgressRing";
import { FestivalRow, TraditionRow } from "@/components/Rows";
import { ScreenSkeleton } from "@/components/Skeleton";
import { EmptyState, ErrorState } from "@/components/States";
import { TrackRow } from "@/components/TrackRow";
import { ClockProvider } from "@/lib/clock-context";
import { resetClock } from "@/lib/clock";
import type { Festival, Tradition } from "@/lib/schemas";

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const render = (ui: ReactElement) =>
  baseRender(<SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>);

const festival = (start: string, end: string, over: Partial<Festival> = {}): Festival => ({
  id: "f1",
  household_id: "h1",
  type: "DIWALI",
  name: "Diwali 2026",
  start_date: start,
  end_date: end,
  status: "planning",
  readiness_score: 0,
  year: 2026,
  ...over,
});

const tradition: Tradition = {
  id: "t1",
  household_id: "h1",
  festival_type: "DIWALI",
  name: "Lighting the first diya",
  category: "RITUAL",
  scope: "family",
  description: null,
  origin: null,
  significance: null,
  instructions: null,
  region: null,
  started_year: 1998,
  active: true,
  created_by: "u1",
};

describe("visual components render without crashing", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 10, 24, 10));
  });
  afterEach(() => jest.useRealTimers());

  it("draws every pattern the person can choose, and nothing for plain", async () => {
    await render(
      <>
        {PATTERNS.map((pattern) => (
          <PatternArt key={pattern.id} id={pattern.id} size={120} />
        ))}
      </>,
    );
    expect(PATTERNS.map((pattern) => pattern.id)).toEqual(PATTERN_IDS);
  });

  it("shows how far along the progress ring is", async () => {
    await render(<ProgressRing value={3} total={5} />);
    expect(screen.getByText("3/5")).toBeTruthy();
    expect(screen.getByRole("progressbar").props.accessibilityValue).toMatchObject({ now: 3, max: 5 });
  });

  it("counts down to an upcoming festival", async () => {
    await render(<FestivalHero festival={festival("2026-12-24", "2026-12-26")} progress={{ done: 1, total: 3 }} />);
    expect(screen.getByText("30")).toBeTruthy();
    expect(screen.getByText("days to go")).toBeTruthy();
    expect(screen.getByText("2 still to go")).toBeTruthy();
  });

  it("says 'Today' while a festival is on and celebrates when every tradition is done", async () => {
    await render(<FestivalHero festival={festival("2026-11-23", "2026-11-25")} progress={{ done: 3, total: 3 }} />);
    expect(screen.getByText("Today")).toBeTruthy();
    expect(screen.getByText("Every tradition honoured")).toBeTruthy();
  });

  it("marks past festivals as done and omits the ring when there are no traditions", async () => {
    await render(<FestivalHero festival={festival("2026-11-08", "2026-11-12")} progress={{ done: 0, total: 0 }} />);
    expect(screen.getByText("Done")).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("renders festival and tradition rows", async () => {
    await render(
      <>
        <FestivalRow festival={festival("2026-12-24", "2026-12-26")} onPress={jest.fn()} />
        <FestivalRow festival={festival("2026-11-08", "2026-11-12")} onPress={jest.fn()} />
        <FestivalRow festival={festival("2026-12-24", "2026-12-26", { status: "cancelled" })} onPress={jest.fn()} />
        <TraditionRow tradition={tradition} onPress={jest.fn()} />
      </>,
    );
    expect(screen.getByText("30")).toBeTruthy();
    expect(screen.getByText("Cancelled")).toBeTruthy();
    expect(screen.getByText(/since 1998/)).toBeTruthy();
  });

  it("renders states and buttons", async () => {
    await render(
      <>
        <ScreenSkeleton />
        <EmptyState icon="calendar" title="Nothing yet" message="Add one" actionLabel="Add" onAction={jest.fn()} />
        <ErrorState message="Offline" onRetry={jest.fn()} />
        <Button label="Primary" onPress={jest.fn()} />
        <Button label="Secondary" variant="secondary" icon="add" onPress={jest.fn()} />
        <Button label="Busy" loading onPress={jest.fn()} />
      </>,
    );
    expect(screen.getByText("Nothing yet")).toBeTruthy();
    expect(screen.getByText("Offline")).toBeTruthy();
  });
});


const styleOf = (node: { props: { style?: unknown } } | undefined) =>
  (StyleSheet.flatten(node?.props.style as never) ?? {}) as Record<string, unknown>;

describe("PressableScale layout", () => {
  it("separates layout styles from visual styles", () => {
    const { outer, inner } = splitLayoutStyle([
      { flex: 1, marginTop: 4, alignSelf: "stretch" },
      { backgroundColor: "white", padding: 8, borderRadius: 12 },
    ]);
    expect(outer).toEqual({ flex: 1, marginTop: 4, alignSelf: "stretch" });
    expect(inner).toEqual({ backgroundColor: "white", padding: 8, borderRadius: 12 });
  });

  it("puts flex on the touchable itself so row siblings share the width", async () => {
    await render(
      <View style={{ flexDirection: "row" }}>
        <PressableScale accessibilityRole="button" accessibilityLabel="tile" style={{ flex: 1, backgroundColor: "white" }}>
          <View />
        </PressableScale>
      </View>,
    );

    const touchable = screen.getByRole("button");
    expect(styleOf(touchable).flex).toBe(1);
    expect(styleOf(touchable.children[0] as never).backgroundColor).toBe("white");
    expect(styleOf(touchable.children[0] as never).flex).toBeUndefined();
  });
});

describe("Button shape", () => {
  it("rounds the solid fill to the same corners as its touch area", async () => {
    await render(<Button label="Go" onPress={jest.fn()} />);

    const shell = screen.getByRole("button").children[0] as never;
    const clip = (shell as { children: unknown[] }).children[0] as never;

    expect(styleOf(shell).backgroundColor).toBeTruthy();
    expect(styleOf(shell).borderRadius).toBe(16);
    expect(styleOf(clip).overflow).toBe("hidden");
    expect(styleOf(clip).borderRadius).toBe(16);
  });

  it("is at least a comfortable touch target tall", async () => {
    await render(<Button label="Go" onPress={jest.fn()} />);
    expect(styleOf(screen.getByRole("button")).minHeight).toBeGreaterThanOrEqual(44);
  });
});

describe("household time zone", () => {
  // 20:00 UTC on 24 Nov is already 25 Nov in Bengaluru, but still 24 Nov in California.
  beforeEach(() => {
    resetClock();
    jest.useFakeTimers().setSystemTime(new Date("2026-11-24T20:00:00Z"));
  });
  afterEach(() => jest.useRealTimers());

  const diwali = festival("2026-11-25", "2026-11-27");

  it("shows the festival as today for a household in India", async () => {
    await render(
      <ClockProvider timeZone="Asia/Kolkata">
        <FestivalHero festival={diwali} />
      </ClockProvider>,
    );
    expect(screen.getByText("Today")).toBeTruthy();
  });

  it("shows the same festival as tomorrow for a household in California", async () => {
    await render(
      <ClockProvider timeZone="America/Los_Angeles">
        <FestivalHero festival={diwali} />
      </ClockProvider>,
    );
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("day to go")).toBeTruthy();
  });

  it("is unaffected by the device's own time zone (the test runner is on Asia/Kolkata)", async () => {
    await render(
      <ClockProvider timeZone="Pacific/Auckland">
        <FestivalHero festival={festival("2026-11-26", "2026-11-27")} />
      </ClockProvider>,
    );
    // 20:00 UTC on the 24th is 09:00 on the 25th in Auckland, so the 26th is one day away.
    expect(screen.getByText("day to go")).toBeTruthy();
  });
});

describe("Glass", () => {
  it("renders its children whatever material the platform uses", async () => {
    await render(
      <Glass>
        <AppText>inside the glass</AppText>
      </Glass>,
    );
    expect(screen.getByText("inside the glass")).toBeTruthy();
  });
});

describe("TrackRow", () => {
  const track = {
    id: "hanuman-chalisa",
    title: "Hanuman Chalisa",
    kind: "stotra",
    faith: "hindu",
    theme: "Hanuman",
    language: "Awadhi",
    note: "Tulsidas's forty verses",
    performer: "Hariharan",
    festivals: ["RAMA_NAVAMI"],
    links: { youtube: "https://y", spotify: "https://s", jiosaavn: "https://j" },
  };

  it("shows the title, theme, language and performer, and offers a choice of apps", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    await render(<TrackRow track={track} />);

    expect(screen.getByText("Hanuman Chalisa")).toBeTruthy();
    expect(screen.getByText("Hanuman · Awadhi · Hariharan")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button"));

    expect(alert).toHaveBeenCalledWith(
      "Hanuman Chalisa",
      expect.any(String),
      expect.arrayContaining([
        expect.objectContaining({ text: "YouTube" }),
        expect.objectContaining({ text: "Spotify" }),
        expect.objectContaining({ text: "JioSaavn" }),
      ]),
    );
  });
});
