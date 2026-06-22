import * as React from "react";
import {
    Background,
    BackgroundVariant,
    Controls,
    ReactFlow,
    ReactFlowProvider,
    type Edge,
    type Node,
    useEdgesState,
    useNodesInitialized,
    useNodesState,
    useReactFlow,
} from "@xyflow/react";
import type {
    TontoDiagramGraph,
    TontoDiagramIssue,
    TontoDiagramPresentation,
} from "tonto-cli";
import { cn } from "./utils/cn";
import { DiagramNode } from "./components/diagram-node";
import { EdgesOverlay } from "./components/edges-overlay";
import { ExportFab } from "./components/export-fab";
import { PackageTree } from "./components/package-tree";
import { Sidebar, type SidebarTabId } from "./components/sidebar";
import { SourcePanel } from "./components/source-panel";
import { ViewPanel } from "./components/view-panel";
import { SettingsModal } from "./components/settings-modal";
import { UfoLegend } from "./components/ufo-legend";
import { downloadPng, downloadSvg } from "./lib/export";
import { useDiagramSettings } from "./lib/settings";
import type { DiagramDocumentStateMessage, DiagramDocumentStateStatus, DiagramExportFormat } from "./messages";
import { postToVscode } from "./vscode";

const NODE_TYPES = {
    diagram: DiagramNode,
};

type Theme = "light" | "dark";

const THEME_STORAGE_KEY = "tonto-diagram-theme";

export function App() {
    const [theme, setTheme] = React.useState<Theme>(() => {
        if (typeof window === "undefined") {
            return "light";
        }
        const stored = window.localStorage?.getItem(THEME_STORAGE_KEY);
        if (stored === "light" || stored === "dark") {
            return stored;
        }
        return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    });

    React.useEffect(() => {
        const root = document.documentElement;
        root.classList.toggle("dark", theme === "dark");
        try {
            window.localStorage?.setItem(THEME_STORAGE_KEY, theme);
        } catch {
            // ignore storage errors
        }
    }, [theme]);

    return (
        <ReactFlowProvider>
            <DiagramEditor theme={theme} onSetTheme={setTheme} />
        </ReactFlowProvider>
    );
}

function DiagramEditor({ theme, onSetTheme }: { theme: Theme; onSetTheme: (next: Theme) => void }) {
    const isDark = theme === "dark";
    const { settings, patchSettings } = useDiagramSettings(theme);

    const [documentText, setDocumentText] = React.useState("");
    const [sourceDraft, setSourceDraft] = React.useState("");
    const [graph, setGraph] = React.useState<TontoDiagramGraph | undefined>();
    const [status, setStatus] = React.useState<DiagramDocumentStateStatus>("loading");
    const [issues, setIssues] = React.useState<TontoDiagramIssue[]>([]);
    const [issuesDismissed, setIssuesDismissed] = React.useState(false);
    const [hasReceivedState, setHasReceivedState] = React.useState(false);
    const [sidebarTab, setSidebarTab] = React.useState<SidebarTabId>("packages");
    const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
    const [settingsOpen, setSettingsOpen] = React.useState(false);
    const [titleDraft, setTitleDraft] = React.useState<string>("");
    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
    // ReactFlow edges stay empty — we render relations ourselves via
    // `EdgesOverlay` to bypass the rendering issues we hit in this webview.
    const [edges] = useEdgesState<Edge>([]);
    const [diagramEdges, setDiagramEdges] = React.useState<TontoDiagramGraph["edges"]>([]);
    const reactFlow = useReactFlow();
    const nodesInitialized = useNodesInitialized();
    const sourceUpdateTimeout = React.useRef<number | undefined>(undefined);
    const hasFitInitialGraph = React.useRef(false);
    const canvasDescriptionId = React.useId();

    React.useEffect(() => {
        const onMessage = (event: MessageEvent<DiagramDocumentStateMessage>) => {
            if (event.data?.type !== "documentState") return;
            const next = event.data;
            const nextStatus = resolveDocumentStatus(next);

            setHasReceivedState(true);
            setDocumentText(next.documentText);
            setIssues(next.issues ?? []);
            setIssuesDismissed(false);

            // Keep the source textarea quiet while the user is editing it — only
            // accept upstream source changes when they actually differ.
            setSourceDraft((current) => (current === next.documentText ? current : next.documentText));

            if (next.graph) {
                // Graph available — adopt it, refresh nodes/edges in place.
                setGraph(next.graph);
                setTitleDraft((current) => (current && current.trim() && current !== next.graph!.title ? current : next.graph!.title));
                setNodes(toFlowNodes(next.graph));
                setDiagramEdges(next.graph.edges);
                setStatus(nextStatus === "loading" ? "ready" : nextStatus);
                return;
            }

            // No graph in this update.
            //   - On the FIRST handshake (no prior graph), surface the loader.
            //   - On subsequent interim updates, keep the prior diagram visible
            //     and just track the status quietly so we don't blank the view.
            setStatus(nextStatus);
            if (nextStatus === "error" && !hasFitInitialGraph.current) {
                setGraph(undefined);
                setNodes([]);
                setDiagramEdges([]);
            }
        };

        window.addEventListener("message", onMessage);
        postToVscode({ type: "ready" });

        return () => {
            window.removeEventListener("message", onMessage);
            if (sourceUpdateTimeout.current) {
                window.clearTimeout(sourceUpdateTimeout.current);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [setNodes]);

    React.useEffect(() => {
        if (!hasReceivedState || sourceDraft === documentText) return;
        sourceUpdateTimeout.current = window.setTimeout(() => {
            postToVscode({ type: "updateSource", text: sourceDraft });
        }, 250);
        return () => {
            if (sourceUpdateTimeout.current) {
                window.clearTimeout(sourceUpdateTimeout.current);
            }
        };
    }, [documentText, hasReceivedState, sourceDraft]);

    React.useEffect(() => {
        if (!graph || !nodesInitialized || hasFitInitialGraph.current) return;
        hasFitInitialGraph.current = true;
        void reactFlow.fitView({ padding: 0.16, maxZoom: 1, duration: 0 });
    }, [graph, nodesInitialized, reactFlow]);

    const persistNodeLayout = React.useCallback((nextNodes: Node[]) => {
        postToVscode({
            type: "updateLayout",
            nodes: nextNodes.map((node) => ({
                id: node.id,
                specifier: typeof node.data?.specifier === "string" ? node.data.specifier : node.id,
                x: node.position.x,
                y: node.position.y,
            })),
        });
    }, []);

    const commitTitle = React.useCallback(() => {
        const next = titleDraft.trim();
        if (!graph || !next || next === graph.title) {
            setTitleDraft(graph?.title ?? next);
            return;
        }
        postToVscode({ type: "updateTitle", title: next });
    }, [graph, titleDraft]);

    const handleExport = React.useCallback((format: DiagramExportFormat) => {
        const base = (graph?.title || "diagram").replace(/[^\w.-]+/g, "_");
        if (format === "png") {
            void downloadPng(base);
        } else if (format === "svg") {
            void downloadSvg(base);
        } else {
            postToVscode({ type: "requestExport", format });
        }
    }, [graph?.title]);

    if (!hasReceivedState) {
        return <DiagramStartupView />;
    }

    // Only block the canvas with the loader before the first successful render;
    // after that, updates flow in silently in the background.
    const hasRenderedOnce = graph !== undefined;
    const isLoading = status === "loading" && !hasRenderedOnce;
    const isBlockingError = !isLoading && !hasRenderedOnce && graph === undefined && status === "error";
    const visibleIssues = issues.filter((issue) => issue.severity !== "error");
    const shouldShowIssuesPanel = !isBlockingError && !issuesDismissed && visibleIssues.length > 0;

    const legend = graph && !isLoading && !isBlockingError ? (
        <UfoLegend nodes={graph.nodes} isDark={isDark} />
    ) : null;

    return (
        <div className={cn("flex h-full w-full", `density-${settings.density}`)}>
            <Sidebar
                activeTab={sidebarTab}
                onChangeTab={setSidebarTab}
                collapsed={sidebarCollapsed}
                onToggleCollapsed={() => setSidebarCollapsed((prev) => !prev)}
                onOpenSettings={() => setSettingsOpen(true)}
                footer={legend}
            >
                {renderSidebarBody({ tab: sidebarTab, graph, sourceDraft, setSourceDraft })}
            </Sidebar>

            <div className="tonto-canvas-region">
                <header className="tonto-canvas-header">
                    <div className="tonto-diagram-title">
                        <input
                            className="tonto-diagram-title-input"
                            value={titleDraft}
                            placeholder={graph?.title ?? "Tonto Diagram"}
                            spellCheck={false}
                            onChange={(event) => setTitleDraft(event.target.value)}
                            onBlur={commitTitle}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                    event.preventDefault();
                                    (event.target as HTMLInputElement).blur();
                                } else if (event.key === "Escape") {
                                    setTitleDraft(graph?.title ?? "");
                                    (event.target as HTMLInputElement).blur();
                                }
                            }}
                            aria-label="Diagram name"
                        />
                        <span className="ext">.tontodiagram</span>
                    </div>
                    <div className="tonto-spacer" />
                </header>

                <div
                    className={cn(
                        "relative flex-1 w-full",
                        !settings.minorGrid && "no-minor-grid",
                        !settings.vignette && "no-vignette",
                    )}
                >
                    <div id={canvasDescriptionId} className="sr-only">
                        {getCanvasDescription(graph)}
                    </div>

                    <ReactFlow
                        fitView
                        fitViewOptions={{ padding: 0.16, maxZoom: 1 }}
                        nodes={nodes}
                        edges={edges}
                        nodeTypes={NODE_TYPES}
                        onNodesChange={onNodesChange}
                        onNodeDragStop={(_, draggedNode) => {
                            const nextNodes = nodes.map((node) =>
                                node.id === draggedNode.id
                                    ? { ...node, position: draggedNode.position }
                                    : node,
                            );
                            setNodes(nextNodes);
                            persistNodeLayout(nextNodes);
                        }}
                        aria-label={graph ? `${graph.title} diagram canvas` : "Tonto diagram canvas"}
                        aria-describedby={canvasDescriptionId}
                        role="region"
                        tabIndex={0}
                        nodesFocusable
                        edgesFocusable
                        nodesConnectable={false}
                        edgesReconnectable={false}
                        className="h-full w-full"
                        style={{ background: "var(--bg)" }}
                    >
                        <Background
                            id="tonto-grid-minor"
                            variant={BackgroundVariant.Dots}
                            gap={16}
                            size={1.1}
                            color="var(--grid-minor)"
                        />
                        <Background
                            id="tonto-grid-major"
                            variant={BackgroundVariant.Dots}
                            gap={80}
                            size={1.8}
                            color="var(--grid-major)"
                        />
                        <Controls showInteractive={false} />
                        <EdgesOverlay
                            edges={diagramEdges}
                            showCardinalities
                            routing={settings.edgeRouting}
                        />
                    </ReactFlow>

                    <div className="tonto-canvas-vignette" aria-hidden="true" />

                    <ExportFab onExport={handleExport} />

                    {isLoading ? (
                        <DiagramFeedbackView
                            variant="loading"
                            title="Building diagram"
                            message="Resolving the project model and layout."
                        />
                    ) : null}

                    {isBlockingError ? (
                        <DiagramFeedbackView
                            variant="error"
                            title="Diagram cannot be rendered"
                            message="Fix the reported errors and the preview will update."
                            issues={issues}
                        />
                    ) : null}

                    {shouldShowIssuesPanel ? (
                        <div className="tonto-issues-panel">
                            <div className="tonto-issues-header">
                                <span>Issues · {visibleIssues.length}</span>
                                <button
                                    type="button"
                                    className="tonto-icon-btn"
                                    onClick={() => setIssuesDismissed(true)}
                                    title="Dismiss"
                                    aria-label="Dismiss issues"
                                >
                                    ×
                                </button>
                            </div>
                            {visibleIssues.map((issue, index) => (
                                <div key={`${issue.message}:${index}`} className="tonto-issue-row">
                                    <span className="sev">{issue.severity}</span>
                                    <span className="line">{issue.line ? `L${issue.line}` : ""}</span>
                                    <span style={{ flex: 1 }}>{issue.message}</span>
                                </div>
                            ))}
                        </div>
                    ) : null}
                </div>
            </div>

            <SettingsModal
                open={settingsOpen}
                onClose={() => setSettingsOpen(false)}
                settings={settings}
                onChange={patchSettings}
                theme={theme}
                onSetTheme={onSetTheme}
            />
        </div>
    );
}

function renderSidebarBody({
    tab,
    graph,
    sourceDraft,
    setSourceDraft,
}: {
    tab: SidebarTabId;
    graph: TontoDiagramGraph | undefined;
    sourceDraft: string;
    setSourceDraft: (next: string) => void;
}): React.ReactNode {
    if (tab === "source") {
        return <SourcePanel value={sourceDraft} onChange={setSourceDraft} />;
    }

    if (!graph) {
        return (
            <div className="font-mono text-[11px] text-[var(--fg-muted)]" style={{ padding: "16px 14px" }}>
                Waiting for project context…
            </div>
        );
    }

    if (tab === "packages") {
        return (
            <PackageTree
                workspace={graph.workspace}
                imports={graph.imports}
                include={graph.filter.include}
                onChangeImports={(next) => postToVscode({ type: "updateImports", imports: next })}
                onChangeInclude={(next) => postToVscode({ type: "updateInclude", include: next })}
            />
        );
    }

    if (tab === "view") {
        return (
            <ViewPanel
                presentation={graph.presentation}
                filter={graph.filter}
                onChangePresentation={(next: Partial<TontoDiagramPresentation>) =>
                    postToVscode({
                        type: "updatePresentation",
                        direction: next.direction,
                        stereotypes: next.stereotypes,
                        attributes: next.attributes,
                    })
                }
                onChangeFilterFlags={(next: { external?: boolean; datatypes?: boolean }) =>
                    postToVscode({
                        type: "updateFilterFlags",
                        external: next.external,
                        datatypes: next.datatypes,
                    })
                }
            />
        );
    }

    return null;
}

function getCanvasDescription(graph: TontoDiagramGraph | undefined): string {
    if (!graph) return "The Tonto diagram canvas is loading.";
    return `${graph.title} contains ${graph.nodes.length} nodes and ${graph.edges.length} edges.`;
}

function DiagramStartupView() {
    return (
        <div className="flex h-full w-full items-center justify-center bg-[var(--bg)] px-4 text-[var(--fg)]">
            <DiagramFeedbackCard
                variant="loading"
                title="Loading diagram editor"
                message="Preparing the .tontodiagram visualization."
            />
        </div>
    );
}

type DiagramFeedbackViewProps = {
    variant: "loading" | "error";
    title: string;
    message: string;
    issues?: TontoDiagramIssue[];
};

function DiagramFeedbackView(props: DiagramFeedbackViewProps) {
    return (
        <div className="tonto-loader-overlay">
            <DiagramFeedbackCard {...props} />
        </div>
    );
}

function DiagramFeedbackCard({ variant, title, message, issues = [] }: DiagramFeedbackViewProps) {
    const visibleIssues = issues.slice(0, 5);
    const remainingIssueCount = issues.length - visibleIssues.length;

    return (
        <div
            className="tonto-loader-card"
            role={variant === "error" ? "alert" : "status"}
            aria-live={variant === "error" ? "assertive" : "polite"}
            style={{ flexDirection: "column", alignItems: "stretch", gap: 12 }}
        >
            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                {variant === "loading" ? (
                    <div className="tonto-spinner" aria-hidden="true" />
                ) : (
                    <div
                        className="font-mono"
                        aria-hidden="true"
                        style={{
                            width: 20,
                            height: 20,
                            display: "grid",
                            placeItems: "center",
                            border: "1px solid var(--err)",
                            color: "var(--err)",
                            background: "var(--err-soft)",
                            fontSize: 12,
                            fontWeight: 600,
                            borderRadius: 2,
                        }}
                    >
                        !
                    </div>
                )}
                <div className="tonto-loader-text" style={{ minWidth: 0 }}>
                    <div className="title">{title}</div>
                    <div className="desc">{message}</div>
                </div>
            </div>

            {visibleIssues.length > 0 ? (
                <div
                    style={{
                        border: "1px solid var(--err)",
                        background: "var(--err-soft)",
                        color: "var(--err)",
                        padding: "8px 10px",
                        fontFamily: "Geist Mono, ui-monospace, monospace",
                        fontSize: 11,
                        lineHeight: 1.5,
                        borderRadius: 2,
                    }}
                >
                    {visibleIssues.map((issue, index) => (
                        <div key={`${issue.message}:${index}`}>{formatIssue(issue)}</div>
                    ))}
                    {remainingIssueCount > 0 ? (
                        <div style={{ marginTop: 4, opacity: 0.75 }}>
                            {remainingIssueCount} more issue{remainingIssueCount === 1 ? "" : "s"}
                        </div>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}

function formatIssue(issue: TontoDiagramIssue): string {
    const location = typeof issue.line === "number" ? ` line ${issue.line}` : "";
    return `${issue.severity.toUpperCase()}${location}: ${issue.message}`;
}

function resolveDocumentStatus(message: DiagramDocumentStateMessage): DiagramDocumentStateStatus {
    if (message.status) return message.status;
    if (message.graph) return "ready";
    return message.issues?.some((issue) => issue.severity === "error") ? "error" : "loading";
}

function toFlowNodes(graph: TontoDiagramGraph): Node[] {
    return graph.nodes.map((node) => ({
        id: node.id,
        type: "diagram",
        position: node.position,
        data: {
            node,
            specifier: node.specifier,
            showAttributes: graph.presentation.attributes,
            showStereotypes: graph.presentation.stereotypes,
        },
    }));
}

