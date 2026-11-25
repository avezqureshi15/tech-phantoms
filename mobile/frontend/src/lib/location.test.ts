import { roundCoordinates } from "@/lib/location";

describe("roundCoordinates", () => {
  it("keeps about a kilometre of precision and no more", () => {
    expect(roundCoordinates({ latitude: 12.971598, longitude: 77.594566 })).toEqual({
      latitude: 12.97,
      longitude: 77.59,
    });
  });

  it("handles the southern and western hemispheres", () => {
    expect(roundCoordinates({ latitude: -33.8688, longitude: -151.2093 })).toEqual({
      latitude: -33.87,
      longitude: -151.21,
    });
  });
});
