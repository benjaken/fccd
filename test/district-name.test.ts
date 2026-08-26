import { describe, expect, it } from "vitest";

import {
  districtNameFromAddress,
  normalizeDeliveryAddress,
} from "@/lib/district-name";

const districts = ["九龍", "九龍灣", "沙田", "中環", "西營盤", "香港仔", "葵涌"];

describe("district name from address", () => {
  it("picks the longest matching district prefix", () => {
    expect(districtNameFromAddress("九龍灣啟祥道17號", districts)).toBe("九龍灣");
    expect(districtNameFromAddress("中環康樂廣場8號", districts)).toBe("中環");
  });

  it("strips leading notes and Hong Kong prefixes before matching", () => {
    expect(normalizeDeliveryAddress("(運費到付) 葵涌葵合街1號")).toBe("葵涌葵合街1號");
    expect(districtNameFromAddress("香港西營盤第三街88號", districts)).toBe("西營盤");
    expect(districtNameFromAddress("香港新界沙田小瀝源", districts)).toBe("沙田");
    expect(districtNameFromAddress("香港香港仔田灣海旁道", districts)).toBe("香港仔");
  });

  it("returns null when the address has no district prefix", () => {
    expect(districtNameFromAddress("Room D-G, 5/F", districts)).toBeNull();
    expect(districtNameFromAddress("", districts)).toBeNull();
  });
});
