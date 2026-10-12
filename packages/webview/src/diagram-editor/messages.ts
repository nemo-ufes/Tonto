import type { ViewFile, ViewModel } from "tonto-cli/lib/view/model/index.js";
import type { TontoDiagramDirection, TontoDiagramGraph, TontoDiagramIssue } from "tonto-cli";

export type DiagramDocumentStateStatus = "loading" | "ready" | "error";

export type DiagramDocumentStateMessage = {
    type: "documentState";
    status?: DiagramDocumentStateStatus;
    documentText: string;
    graph?: TontoDiagramGraph;
    issues: TontoDiagramIssue[];
    viewModel?: ViewModel;
    arrangement?: ViewFile;
    isLegacy?: boolean;
};

export type DiagramExportFormat = "png" | "svg" | "plantuml";

export type DiagramOutgoingMessage =
    | { type: "updateArrangement"; arrangement: ViewFile }
    | { type: "revealSource"; id: string }
    | { type: "selection"; ids: string[] }
    | { type: "rasterized"; id: string | number; dataUrl?: string; error?: string }
    | { type: "convertView" }
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
        svg?: string;
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
