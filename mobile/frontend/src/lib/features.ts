import { z } from "zod";

/** The features that can be switched off from Flagsmith. Everything is on until the server says otherwise. */
export const FEATURES = [
  "utsav",
  "utsav_voice",
  "elder_mode",
  "recite_mode",
  "event_search",
  "receipt_scan",
  "document_upload",
  "support_callback",
] as const;
export type Feature = (typeof FEATURES)[number];

export const featuresSchema = z.object({
  features: z.record(z.string(), z.boolean()),
  announcement: z.string().nullable(),
});
export type FeaturesResponse = z.infer<typeof featuresSchema>;

/** What the app assumes before the server has answered, or when it cannot: everything on, no notice. */
export const FEATURE_DEFAULTS: FeaturesResponse = {
  features: Object.fromEntries(FEATURES.map((name) => [name, true])),
  announcement: null,
};

/** Whether a feature is on. A feature the server did not mention keeps its default (on). */
export function isOn(data: FeaturesResponse | undefined, name: Feature): boolean {
  return (data ?? FEATURE_DEFAULTS).features[name] ?? true;
}
