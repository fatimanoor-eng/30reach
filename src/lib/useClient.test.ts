import { describe, expect, it } from "vitest";
import { clientInitials } from "./useClient";

describe("clientInitials", () => {
  it("first two letters of the first word, uppercase", () => {
    expect(clientInitials("OBU Health")).toBe("OB");
    expect(clientInitials("  northwind clinic ")).toBe("NO");
    expect(clientInitials("A")).toBe("A");
    expect(clientInitials("")).toBe("");
  });
});
