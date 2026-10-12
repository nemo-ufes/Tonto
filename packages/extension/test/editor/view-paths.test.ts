import { expect, it } from "vitest";
import { inferViewSource, namedViewPath } from "../../src/diagram-editor/view-paths.js";
it("resolves named views against the longest proven model name", () => {
  expect(inferViewSource("/models/views/customer.orders.taxonomy.tontoview", ["customer.tonto", "customer.orders.tonto"]))
    .toBe("/models/customer.orders.tonto");
  expect(inferViewSource("/models/views/missing.taxonomy.tontoview", ["customer.tonto"])).toBeUndefined();
  expect(namedViewPath("/models/customer.tonto", "Core Taxonomy")).toBe("/models/views/customer.Core-Taxonomy.tontoview");
});
