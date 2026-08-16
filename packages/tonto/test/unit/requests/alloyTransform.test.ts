import { Project } from "ontouml-js";
import { describe, expect, it } from "vitest";
import {
  AlloyResultResponse,
  ErrorAlloyResultResponse,
  TransformTontoToAlloy,
  getAlloyModules,
  validateProjectForAlloyTransform,
} from "../../../src/cli/requests/alloyTransform.js";

function asError(response: AlloyResultResponse | ErrorAlloyResultResponse): ErrorAlloyResultResponse {
  expect(response).not.toHaveProperty("result");
  return response as ErrorAlloyResultResponse;
}

function asResult(response: AlloyResultResponse | ErrorAlloyResultResponse): AlloyResultResponse {
  expect(response).toHaveProperty("result");
  return response as AlloyResultResponse;
}

function errorCodes(response: ErrorAlloyResultResponse): (string | undefined)[] {
  return response.info.map((info) => info.code);
}

describe("TransformTontoToAlloy", () => {
  it("returns the three Alloy modules for a valid project", async () => {
    const project = new Project();
    project.createModel().createKind("Person");

    const { result, status } = asResult(await TransformTontoToAlloy(project));

    expect(status).toBe(200);
    expect(result.mainModule).toContain("Person");
    expect(result.worldStructureModule.length).toBeGreaterThan(0);
    expect(result.ontologicalPropertiesModule.length).toBeGreaterThan(0);
  });

  it("emits the possible-worlds run predicates the V&V workflow depends on", async () => {
    const project = new Project();
    project.createModel().createKind("Person");

    const { result } = asResult(await TransformTontoToAlloy(project));

    expect(result.mainModule).toContain("run singleWorld");
    expect(result.mainModule).toContain("run linearWorlds");
    expect(result.mainModule).toContain("run multipleWorlds");
  });

  it("reports a missing root model instead of transforming", async () => {
    const response = asError(await TransformTontoToAlloy(new Project()));

    expect(response.status).toBe(400);
    expect(errorCodes(response)).toContain("missing_project_model");
  });

  it("does not require relations to be named", async () => {
    const project = new Project();
    const model = project.createModel();
    model.createMaterialRelation(model.createKind("A"), model.createKind("B"));

    expect(validateProjectForAlloyTransform(project)).toEqual([]);
    asResult(await TransformTontoToAlloy(project));
  });
});

describe("validateProjectForAlloyTransform", () => {
  // Each case below makes the transformation throw a bare TypeError. The point of
  // validating first is to name the offending element instead.

  it("catches an unnamed class", async () => {
    const project = new Project();
    project.createModel().createKind();

    expect(errorCodes(asError(await TransformTontoToAlloy(project)))).toContain("missing_classifier_name");
  });

  it("catches an unnamed attribute and names its owner", async () => {
    const project = new Project();
    const model = project.createModel();
    const person = model.createKind("Person");
    person.createAttribute(model.createDatatype("Text"));

    const response = asError(await TransformTontoToAlloy(project));

    expect(errorCodes(response)).toContain("missing_attribute_name");
    expect(response.info.some((info) => info.description?.includes("Person"))).toBe(true);
  });

  it("catches an unnamed enumeration literal", async () => {
    const project = new Project();
    project.createModel().createEnumeration("Colour").createLiteral();

    expect(errorCodes(asError(await TransformTontoToAlloy(project)))).toContain("missing_literal_name");
  });

  it("catches a relation end without a type", async () => {
    const project = new Project();
    const model = project.createModel();
    const person = model.createKind("Person");
    const relation = model.createMaterialRelation(person, person, "knows");
    relation.properties[1].propertyType = undefined;

    expect(errorCodes(asError(await TransformTontoToAlloy(project)))).toContain("missing_relation_endpoint_type");
  });
});

describe("getAlloyModules", () => {
  it("orders main last, since it imports the other two", () => {
    const modules = getAlloyModules({
      mainModule: "main",
      worldStructureModule: "world",
      ontologicalPropertiesModule: "properties",
    });

    expect(modules.map((module) => module.name)).toEqual(["world_structure", "ontological_properties", "main"]);
    expect(modules.at(-1)?.content).toBe("main");
  });
});
