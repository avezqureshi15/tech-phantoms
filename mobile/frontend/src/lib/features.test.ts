import { FEATURE_DEFAULTS, FEATURES, featuresSchema, isOn } from "@/lib/features";

describe("feature flags in the app", () => {
  it("assumes everything is on before the server answers, and shows no notice", () => {
    expect(FEATURES.every((name) => isOn(undefined, name))).toBe(true);
    expect(FEATURE_DEFAULTS.announcement).toBeNull();
  });

  it("hides exactly what the server says is off", () => {
    const data = { features: { elder_mode: false, utsav: true }, announcement: null };

    expect(isOn(data, "elder_mode")).toBe(false);
    expect(isOn(data, "utsav")).toBe(true);
  });

  it("keeps a feature the server did not mention on, so a new feature never disappears by accident", () => {
    expect(isOn({ features: { utsav: true }, announcement: null }, "receipt_scan")).toBe(true);
  });

  it("accepts the server's answer and rejects one that is not shaped like it", () => {
    expect(featuresSchema.safeParse({ features: { utsav: false }, announcement: "Back at 10pm" }).success).toBe(true);
    expect(featuresSchema.safeParse({ features: { utsav: "no" }, announcement: null }).success).toBe(false);
    expect(featuresSchema.safeParse({}).success).toBe(false);
  });
});
