import { describe, expect, it } from "vitest";
import { escapeHtml, renderInstance } from "../../../src/alloy/alloyInstanceView.js";
import { AlloyInstance } from "../../../src/alloy/alloyTypes.js";

function instance(overrides: Partial<AlloyInstance> = {}): AlloyInstance {
    return {
        sessionId: "session-1",
        satisfiable: true,
        commandName: "singleWorld",
        instanceNumber: 1,
        instanceXml: "<alloy><instance></instance></alloy>",
        ...overrides,
    };
}

describe("escapeHtml", () => {
    // Instances are Alloy XML, so the markup is guaranteed to contain angle brackets. Dropping
    // it into the webview unescaped would both break the page and execute whatever it carries.
    it("escapes markup so instance XML renders as text", () => {
        expect(escapeHtml("<sig label=\"Person\"/>"))
            .toBe("&lt;sig label=&quot;Person&quot;/&gt;");
    });

    it("escapes ampersands before anything else, so entities are not doubled", () => {
        expect(escapeHtml("a & <b>")).toBe("a &amp; &lt;b&gt;");
    });

    it("neutralises a script tag", () => {
        expect(escapeHtml("<script>alert(1)</script>")).not.toContain("<script>");
    });
});

describe("renderInstance", () => {
    it("shows the instance number and the command that produced it", () => {
        const html = renderInstance(instance({ instanceNumber: 3 }));

        expect(html).toContain("Instance 3");
        expect(html).toContain("singleWorld");
    });

    it("renders the Alloy XML escaped", () => {
        const html = renderInstance(instance({ instanceXml: "<alloy><sig label=\"Person\"/></alloy>" }));

        expect(html).toContain("&lt;alloy&gt;");
        expect(html).not.toContain("<alloy>");
    });

    it("offers a way to step to the next instance", () => {
        const html = renderInstance(instance());

        expect(html).toContain("id=\"next\"");
        expect(html).toContain("postMessage({ command: \"next\" })");
    });

    // No instance is a result about the ontology — likely over-constrained — not a failure, so
    // it gets stated rather than shown as an error.
    it("explains an unsatisfiable result instead of showing an empty page", () => {
        const html = renderInstance(instance({ satisfiable: false, instanceXml: undefined, instanceNumber: 0 }));

        expect(html).toContain("No more instances");
        expect(html).toContain("found no instance");
        expect(html).toContain("singleWorld");
    });

    it("distinguishes running out of instances from never having one", () => {
        const exhausted = renderInstance(instance({ satisfiable: false, instanceXml: undefined, instanceNumber: 4 }));

        expect(exhausted).toContain("no further instance");
    });

    it("surfaces warnings from the transformation", () => {
        const html = renderInstance(instance({ warnings: ["Sig Person is empty"] }));

        expect(html).toContain("Sig Person is empty");
    });

    it("omits the warning list when there is nothing to report", () => {
        expect(renderInstance(instance())).not.toContain("class=\"warnings\"");
    });

    it("declares a content security policy that blocks remote code", () => {
        const html = renderInstance(instance());

        expect(html).toContain("Content-Security-Policy");
        expect(html).toContain("default-src 'none'");
    });
});
