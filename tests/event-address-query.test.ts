import { describe, expect, it } from "vitest";
import { eventAddressQuery } from "../lib/event-location";

describe("saved event address query", () => {
  it.each([
    ["172 Belmont Dr", "St. Johns, Florida", "172 Belmont Dr, St. Johns, Florida"],
    [" 4600 Silver Hill Rd ", " Washington, DC 20233 ", "4600 Silver Hill Rd, Washington, DC 20233"],
    ["172 Belmont Dr, St. Johns, FL 32259", "St. Johns, Florida", "172 Belmont Dr, St. Johns, FL 32259"],
    ["4600 Silver Hill Rd, Washington, DC 20233-0001", "The neighborhood", "4600 Silver Hill Rd, Washington, DC 20233-0001"],
    ["172 Belmont Dr, St. Johns, FL", "St. Johns, Florida", "172 Belmont Dr, St. Johns, FL"],
    ["172 Belmont Dr, St Johns, Florida", "ST. JOHNS, FLORIDA", "172 Belmont Dr, St Johns, Florida"],
    ["172 Belmont Dr, St Johns", "St. Johns, Florida", "172 Belmont Dr, St Johns, Florida"],
    ["172 Belmont Dr,", "St. Johns, FL", "172 Belmont Dr, St. Johns, FL"],
    ["123 Example Lane", "", "123 Example Lane"],
    ["", "Washington, DC", ""],
  ])("composes %s with %s without duplicating the locality", (address, city, expected) => {
    expect(eventAddressQuery(address, city)).toBe(expected);
  });
});
