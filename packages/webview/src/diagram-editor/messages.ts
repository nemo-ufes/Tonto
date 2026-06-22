import type { TontoDiagramDirection, TontoDiagramGraph, TontoDiagramIssue } from "tonto-cli";

export type DiagramDocumentStateStatus = "loading" | "ready" | "error";

export type DiagramDocumentStateMessage = {
    type: "documentState";
    status?: DiagramDocumentStateStatus;
    documentText: string;
    graph?: TontoDiagramGraph;
    issues: TontoDiagramIssue[];
};

export type DiagramExportFormat = "png" | "svg" | "plantuml";

export type DiagramOutgoingMessage =
    | {
        type: "ready";
    }
    | {
        type: "updateSource";
        text: string;
    }
    | {
        type: "updateTitle";
        title: string;
    }
    | {
        type: "requestExport";
        format: DiagramExportFormat;
    }
    | {
        type: "updateLayout";
        nodes: Array<{
            id: string;
            specifier: string;
            x: number;
            y: number;
        }>;
    }
    | {
        type: "updateImports";
        imports: string[];
    }
    | {
        type: "updateInclude";
        include: string[];
    }
    | {
        type: "updatePresentation";
        direction?: TontoDiagramDirection;
        stereotypes?: boolean;
        attributes?: boolean;
    }
    | {
        type: "updateFilterFlags";
        external?: boolean;
        datatypes?: boolean;
    };
