import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseListingText, petsAllowed } from "../src";

const text = readFileSync(new URL("./fixtures/apartments-com.txt", import.meta.url), "utf8");

describe("Apartments.com page text", () => {
  it("pulls address, rent, beds, baths and size", () => {
    const info = parseListingText(text);
    expect(info.address).toBe("7865 Grove Ct W");
    expect(info.city).toBe("Germantown");
    expect(info.state).toBe("TN");
    expect(info.zip).toBe("38138");
    expect(info.rent).toBe(1315);
    expect(info.bedrooms).toBe(1);
    expect(info.bathrooms).toBe(1);
    expect(info.sqft).toBe(790);
    expect(info.phone).toBe("(901) 437-0181");
    expect(info.title).toBe("The Grove Germantown Apartments");
  });

  it("falls back to the address when no name line precedes it", () => {
    const info = parseListingText("9954 Lake Geneva St Unit 1, Lakeland, TN 38002\n$1,450/mo\n3 bd 2 ba");
    expect(info.title).toBe("9954 Lake Geneva St Unit 1, Lakeland");
    expect(info.zip).toBe("38002");
  });

  it("reads the pet policy", () => {
    expect(petsAllowed("Pets allowed")).toBe(true);
    expect(petsAllowed("Dogs welcome · Cats welcome · Pet Rent $25")).toBe(true);
    expect(petsAllowed("Sorry, no pets")).toBe(false);
    expect(petsAllowed("2 Beds 2 Baths")).toBeUndefined();
    expect(parseListingText("123 Main St, Germantown, TN 38138\n$1,500/mo\nPet friendly").pets).toBe(true);
  });
});
