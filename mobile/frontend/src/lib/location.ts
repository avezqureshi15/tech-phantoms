import * as Location from "expo-location";
import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useState } from "react";

/**
 * Finding where the person is, for sunrise-based dates and regional wording.
 *
 * Asked once, in the foreground, at modest accuracy (a city, not a street). The point is rounded to
 * two decimals (about a kilometre) and kept on the phone only; the server uses it to answer a
 * request and never stores it.
 */
const KEY = "festiveos.location";
const DECIMALS = 100;

export type Coordinates = { latitude: number; longitude: number };
export type LocationState = {
  coords: Coordinates | null;
  status: "idle" | "locating" | "denied" | "unavailable";
};

const round = (value: number) => Math.round(value * DECIMALS) / DECIMALS;

export function roundCoordinates(point: Coordinates): Coordinates {
  return { latitude: round(point.latitude), longitude: round(point.longitude) };
}

async function remember(point: Coordinates | null) {
  try {
    if (point) await SecureStore.setItemAsync(KEY, JSON.stringify(point));
    else await SecureStore.deleteItemAsync(KEY);
  } catch {
    // Not remembering a location is harmless: the next launch simply asks again.
  }
}

async function recall(): Promise<Coordinates | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Coordinates>) : null;
    return typeof parsed?.latitude === "number" && typeof parsed.longitude === "number"
      ? { latitude: parsed.latitude, longitude: parsed.longitude }
      : null;
  } catch {
    return null;
  }
}

export function useDeviceLocation() {
  const [state, setState] = useState<LocationState>({ coords: null, status: "idle" });

  useEffect(() => {
    void recall().then((coords) => coords && setState({ coords, status: "idle" }));
  }, []);

  /** Ask for permission if needed and read the current position. */
  const detect = useCallback(async () => {
    setState((s) => ({ ...s, status: "locating" }));
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") return setState((s) => ({ ...s, status: "denied" }));
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coords = roundCoordinates(position.coords);
      await remember(coords);
      setState({ coords, status: "idle" });
    } catch {
      setState((s) => ({ ...s, status: "unavailable" }));
    }
  }, []);

  /** Stop using the detected place and go back to the saved city. */
  const forget = useCallback(async () => {
    await remember(null);
    setState({ coords: null, status: "idle" });
  }, []);

  return { ...state, detect, forget };
}
