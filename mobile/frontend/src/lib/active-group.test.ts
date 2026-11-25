import { pickGroup } from "@/lib/active-group";

const groups = [{ id: "a" }, { id: "b" }, { id: "c" }];

describe("pickGroup", () => {
  it("uses the remembered group when the person still belongs to it", () => {
    expect(pickGroup(groups, "b")).toEqual({ id: "b" });
  });

  it("falls back to the first group when the remembered one is gone or unset", () => {
    expect(pickGroup(groups, "left-this-one")).toEqual({ id: "a" });
    expect(pickGroup(groups, null)).toEqual({ id: "a" });
  });

  it("has nothing to pick before groups load or when there are none", () => {
    expect(pickGroup(undefined, "a")).toBeUndefined();
    expect(pickGroup([], "a")).toBeUndefined();
  });
});
