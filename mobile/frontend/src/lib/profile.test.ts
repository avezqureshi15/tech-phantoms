import { draftOf, isDirty, toUpdate, toggleFaith } from "@/lib/profile";

const user = { faiths: ["hindu", "christian"], home_city: "bengaluru" };

describe("editing a profile", () => {
  it("starts from what is saved and is not dirty", () => {
    expect(isDirty(user, draftOf(user))).toBe(false);
    expect(toUpdate(user, draftOf(user))).toEqual({});
  });

  it("does not change the saved profile when the draft is edited", () => {
    const draft = draftOf(user);
    draft.faiths.push("sikh");
    expect(user.faiths).toEqual(["hindu", "christian"]);
  });

  it("ignores the order faiths were chosen in", () => {
    expect(isDirty(user, { faiths: ["christian", "hindu"], homeCity: "bengaluru" })).toBe(false);
  });

  it("sends only the faiths when only they changed", () => {
    const draft = { faiths: ["hindu"], homeCity: "bengaluru" };
    expect(isDirty(user, draft)).toBe(true);
    expect(toUpdate(user, draft)).toEqual({ faiths: ["hindu"] });
  });

  it("sends only the city when only it changed, and can clear it", () => {
    expect(toUpdate(user, { faiths: user.faiths, homeCity: "chennai" })).toEqual({ home_city: "chennai" });
    expect(toUpdate(user, { faiths: user.faiths, homeCity: null })).toEqual({ home_city: null });
  });

  it("can clear every faith (someone who does not wish to say)", () => {
    expect(toUpdate(user, { faiths: [], homeCity: "bengaluru" })).toEqual({ faiths: [] });
  });

  it("toggles a faith on and off without touching the others", () => {
    expect(toggleFaith(["hindu"], "sikh")).toEqual(["hindu", "sikh"]);
    expect(toggleFaith(["hindu", "sikh"], "hindu")).toEqual(["sikh"]);
    expect(toggleFaith([], "jain")).toEqual(["jain"]);
  });
});
