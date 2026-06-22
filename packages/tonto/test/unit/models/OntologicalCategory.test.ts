import { describe, expect, it } from "vitest";
import {
  OntologicalCategoryEnum,
  isSortalOntoCategory,
  isUltimateSortalOntoCategory,
  isBaseSortalOntoCategory,
  isNonSortalOntoCategory,
  getOntologicalCategory,
} from "../../../src/language/models/OntologicalCategory.js";

describe("OntologicalCategory", () => {
  const ultimateSortals = ["kind", "collective", "quantity", "relator", "quality", "mode", "intrinsicMode", "extrinsicMode"];
  const baseSortals = ["subkind", "phase", "role", "historicalRole"];
  const allSortals = [...ultimateSortals, ...baseSortals];
  const nonSortals = ["category", "mixin", "phaseMixin", "roleMixin", "historicalRoleMixin"];

  describe("isSortalOntoCategory", () => {
    it.each(allSortals)("should return true for sortal '%s'", (stereotype) => {
      expect(isSortalOntoCategory(stereotype)).toBe(true);
    });

    it.each(nonSortals)("should return false for non-sortal '%s'", (stereotype) => {
      expect(isSortalOntoCategory(stereotype)).toBe(false);
    });

    it("should return false for unknown stereotype", () => {
      expect(isSortalOntoCategory("unknown")).toBe(false);
    });

    it("should return false for empty string", () => {
      expect(isSortalOntoCategory("")).toBe(false);
    });
  });

  describe("isUltimateSortalOntoCategory", () => {
    it.each(ultimateSortals)("should return true for ultimate sortal '%s'", (stereotype) => {
      expect(isUltimateSortalOntoCategory(stereotype)).toBe(true);
    });

    it.each(baseSortals)("should return false for base sortal '%s'", (stereotype) => {
      expect(isUltimateSortalOntoCategory(stereotype)).toBe(false);
    });

    it.each(nonSortals)("should return false for non-sortal '%s'", (stereotype) => {
      expect(isUltimateSortalOntoCategory(stereotype)).toBe(false);
    });

    it("should return false for unknown stereotype", () => {
      expect(isUltimateSortalOntoCategory("unknown")).toBe(false);
    });
  });

  describe("isBaseSortalOntoCategory", () => {
    it.each(baseSortals)("should return true for base sortal '%s'", (stereotype) => {
      expect(isBaseSortalOntoCategory(stereotype)).toBe(true);
    });

    it.each(ultimateSortals)("should return false for ultimate sortal '%s'", (stereotype) => {
      expect(isBaseSortalOntoCategory(stereotype)).toBe(false);
    });

    it.each(nonSortals)("should return false for non-sortal '%s'", (stereotype) => {
      expect(isBaseSortalOntoCategory(stereotype)).toBe(false);
    });

    it("should return false for unknown stereotype", () => {
      expect(isBaseSortalOntoCategory("unknown")).toBe(false);
    });
  });

  describe("isNonSortalOntoCategory", () => {
    // Note: 'mixin' is semi-rigid and not included in allOntologicalCategories
    // (which is Sortals + Rigid + AntiRigid), so isNonSortalOntoCategory returns false for it.
    // This is a known limitation of the current implementation.
    const nonSortalsInAllCategories = ["category", "phaseMixin", "roleMixin", "historicalRoleMixin"];
    const semiRigidNonSortals = ["mixin"];

    it.each(nonSortalsInAllCategories)("should return true for non-sortal '%s'", (stereotype) => {
      expect(isNonSortalOntoCategory(stereotype)).toBe(true);
    });

    it.each(semiRigidNonSortals)(
      "should return false for semi-rigid non-sortal '%s' (not in allOntologicalCategories)",
      (stereotype) => {
        expect(isNonSortalOntoCategory(stereotype)).toBe(false);
      }
    );

    it.each(allSortals)("should return false for sortal '%s'", (stereotype) => {
      expect(isNonSortalOntoCategory(stereotype)).toBe(false);
    });

    it("should return false for unknown stereotype", () => {
      expect(isNonSortalOntoCategory("unknown")).toBe(false);
    });
  });

  describe("getOntologicalCategory", () => {
    const mappings: [string, OntologicalCategoryEnum][] = [
      ["class", OntologicalCategoryEnum.CLASS],
      ["type", OntologicalCategoryEnum.TYPE],
      ["historicalRole", OntologicalCategoryEnum.HISTORICAL_ROLE],
      ["historicalRoleMixin", OntologicalCategoryEnum.HISTORICAL_ROLE_MIXIN],
      ["event", OntologicalCategoryEnum.EVENT],
      ["situation", OntologicalCategoryEnum.SITUATION],
      ["category", OntologicalCategoryEnum.CATEGORY],
      ["mixin", OntologicalCategoryEnum.MIXIN],
      ["roleMixin", OntologicalCategoryEnum.ROLE_MIXIN],
      ["phaseMixin", OntologicalCategoryEnum.PHASE_MIXIN],
      ["kind", OntologicalCategoryEnum.KIND],
      ["collective", OntologicalCategoryEnum.COLLECTIVE],
      ["quantity", OntologicalCategoryEnum.QUANTITY],
      ["relator", OntologicalCategoryEnum.RELATOR],
      ["quality", OntologicalCategoryEnum.QUALITY],
      ["mode", OntologicalCategoryEnum.MODE],
      ["intrinsicMode", OntologicalCategoryEnum.INTRINSIC_MODE],
      ["extrinsicMode", OntologicalCategoryEnum.EXTRINSIC_MODE],
      ["subkind", OntologicalCategoryEnum.SUBKIND],
      ["role", OntologicalCategoryEnum.ROLE],
      ["phase", OntologicalCategoryEnum.PHASE],
      ["enumeration", OntologicalCategoryEnum.ENUMERATION],
      ["datatype", OntologicalCategoryEnum.DATATYPE],
      ["abstract", OntologicalCategoryEnum.ABSTRACT],
    ];

    it.each(mappings)("should map '%s' to %s", (input, expected) => {
      expect(getOntologicalCategory(input)).toBe(expected);
    });

    it("should return undefined for unknown stereotype", () => {
      expect(getOntologicalCategory("unknown")).toBeUndefined();
    });

    it("should return undefined for empty string", () => {
      expect(getOntologicalCategory("")).toBeUndefined();
    });

    it("should be case-sensitive", () => {
      expect(getOntologicalCategory("Kind")).toBeUndefined();
      expect(getOntologicalCategory("KIND")).toBeUndefined();
    });
  });
});
