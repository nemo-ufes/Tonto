import { describe, expect, it } from "vitest";
import {
    createNonce,
    escapeHtml,
    renderInstance,
    serialisePayload,
    toPayload,
} from "../../../src/alloy/alloyInstanceView.js";
import { AlloyInstance, InstanceDTO } from "../../../src/alloy/alloyTypes.js";

const oneWorld: InstanceDTO = {
    commandName: "singleWorld",
    instanceNumber: 1,
    classes: ["Pessoa"],
    worlds: [{
        id: "world_structure/CurrentWorld$0",
        kind: "CurrentWorld",
        next: [],
        atoms: [{ id: "Object$0", classes: ["Pessoa"] }],
        tuples: [],
    }],
};

function instance(overrides: Partial<AlloyInstance> = {}): AlloyInstance {
    return {
        sessionId: "session-1",
        satisfiable: true,
        commandName: "singleWorld",
        instanceNumber: 1,
        instanceXml: "<alloy><instance></instance></alloy>",
        instance: oneWorld,
        ...overrides,
    };
}

const ontology = [{ alloyName: "Pessoa", name: "Pessoa", stereotype: "kind" }];

function render(value: AlloyInstance): string {
    return renderInstance(value, ontology, "vscode-resource://pack/webview/alloyGraph.js", "test-nonce");
}

describe("escapeHtml", () => {
    it("escapes markup", () => {
        expect(escapeHtml("<sig label=\"Person\"/>")).toBe("&lt;sig label=&quot;Person&quot;/&gt;");
    });

    it("escapes ampersands before anything else, so entities are not doubled", () => {
        expect(escapeHtml("a & <b>")).toBe("a &amp; &lt;b&gt;");
    });

    it("neutralises a script tag", () => {
        expect(escapeHtml("<script>alert(1)</script>")).not.toContain("<script>");
    });
});

describe("serialisePayload", () => {
    // `</script>` inside a string literal closes the enclosing tag whatever the quoting, which
    // would spill the rest of the payload into the document. Class names come from the
    // modeller's ontology, so this is reachable rather than theoretical.
    it("escapes markup that would close the script tag early", () => {
        const payload = toPayload(instance({
            instance: {
                ...oneWorld,
                worlds: [{
                    ...oneWorld.worlds[0],
                    atoms: [{ id: "Object$0", classes: ["</script><img src=x>"] }],
                }],
            },
        }), ontology);

        const serialised = serialisePayload(payload);

        expect(serialised).not.toContain("</script>");
        expect(serialised).toContain("\\u003c");
    });

    it("still parses back to the same payload", () => {
        const payload = toPayload(instance(), ontology);

        expect(JSON.parse(serialisePayload(payload))).toEqual(payload);
    });
});

describe("toPayload", () => {
    it("carries the worlds the script needs to draw", () => {
        const payload = toPayload(instance(), ontology);

        expect(payload.worlds).toHaveLength(1);
        expect(payload.worlds[0].nodes[0].label).toBe("Pessoa");
    });

    // The server never sees the stereotypes — it only gets the generated Alloy — so the
    // extension has to supply them for a kind to be told from a phase.
    // Only the first instance of a session carries an ontology; the rest come straight from
    // the server, which has never seen a stereotype. Passing it separately is what keeps a
    // session from quietly losing the ability to tell a kind from a phase halfway through.
    it("needs the ontology passed in, not read off the instance", () => {
        const withoutOntology = toPayload(instance(), undefined);

        expect(withoutOntology.worlds[0].nodes[0].label).toBe("");
        expect(withoutOntology.worlds[0].nodes[0].qualifiers).toEqual(["Pessoa"]);
    });

    // The payload crosses into the webview, so it should carry what is needed to draw and
    // nothing else — the session id is the handle for stepping and closing.
    it("does not leak the session id into the webview", () => {
        expect(JSON.stringify(toPayload(instance(), ontology))).not.toContain("session-1");
    });

    it("explains an over-constrained model rather than showing an empty canvas", () => {
        const payload = toPayload(instance({ satisfiable: false, instance: undefined, instanceNumber: 0 }), ontology);

        expect(payload.message).toContain("no instance");
        expect(payload.message).toContain("over-constrained");
    });

    it("distinguishes running out of instances from never having one", () => {
        const payload = toPayload(instance({ satisfiable: false, instance: undefined, instanceNumber: 4 }), ontology);

        expect(payload.message).toContain("no further instance");
    });

    it("explains a satisfiable instance that has no worlds to draw", () => {
        const payload = toPayload(instance({ instance: { ...oneWorld, worlds: [] } }), ontology);

        expect(payload.message).toContain("no possible worlds");
    });

    it("says nothing when there is a graph to show", () => {
        expect(toPayload(instance(), ontology).message).toBeUndefined();
    });
});

describe("renderInstance", () => {
    it("shows the instance number and the command that produced it", () => {
        const html = render(instance({ instanceNumber: 3 }));

        expect(html).toContain("Instance 3");
        expect(html).toContain("singleWorld");
    });

    // Stepping only posts a payload, so the heading has to be addressable for the script to
    // keep it in step — otherwise it reports the opening instance forever.
    it("gives the heading an id the script can update", () => {
        expect(render(instance())).toContain("<h1 id=\"heading\">");
    });

    it("loads the graph script from the uri it is given", () => {
        expect(render(instance())).toContain("src=\"vscode-resource://pack/webview/alloyGraph.js\"");
    });

    // Hiding is a class, not an inline style: clearing an inline display falls back to the
    // stylesheet, so an element the stylesheet hides can never be revealed by the script.
    it("hides what the script reveals with a class, not a stylesheet rule", () => {
        const html = render(instance());

        expect(html).toContain(".hidden { display: none !important; }");
        expect(html).toContain("id=\"worldmap-section\" class=\"hidden\"");
        expect(html).not.toMatch(/#worldmap-section \{[^}]*display:\s*none/);
        expect(html).not.toMatch(/#empty \{[^}]*display:\s*none/);
    });

    it("offers a way to step to the next instance", () => {
        expect(render(instance())).toContain("id=\"next\"");
    });

    it("surfaces warnings from the transformation", () => {
        expect(render(instance({ warnings: ["Sig Person is empty"] }))).toContain("Sig Person is empty");
    });

    it("omits the warning list when there is nothing to report", () => {
        expect(render(instance())).not.toContain("class=\"warnings\"");
    });

    // Scripts are admitted by nonce rather than 'unsafe-inline', so an injected script tag
    // cannot run even if it reaches the page.
    it("admits only its own scripts, by nonce", () => {
        const html = render(instance());

        expect(html).toContain("script-src 'nonce-test-nonce'");
        expect(html).toContain("default-src 'none'");
        expect(html).not.toContain("script-src 'unsafe-inline'");
        expect(html.match(/<script/g) ?? []).toHaveLength(2);
        expect(html.match(/nonce="test-nonce"/g) ?? []).toHaveLength(2);
    });
});

describe("createNonce", () => {
    it("is long enough to be unguessable", () => {
        expect(createNonce()).toHaveLength(32);
    });

    it("differs between renders", () => {
        expect(createNonce()).not.toBe(createNonce());
    });

    it("stays within characters that need no escaping in an attribute", () => {
        expect(createNonce()).toMatch(/^[A-Za-z0-9]+$/);
    });
});
