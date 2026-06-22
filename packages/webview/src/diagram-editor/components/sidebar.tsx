import * as React from "react";
import { cn } from "../utils/cn";
import { GearIcon } from "./icons";

export type SidebarTabId = "packages" | "view" | "source";

type SidebarTabDescriptor = {
    id: SidebarTabId;
    label: string;
    rail: string;
};

const TABS: SidebarTabDescriptor[] = [
    { id: "packages", label: "Packages", rail: "P" },
    { id: "view", label: "View", rail: "V" },
    { id: "source", label: "Source", rail: "S" },
];

type SidebarProps = {
    activeTab: SidebarTabId;
    onChangeTab: (next: SidebarTabId) => void;
    collapsed: boolean;
    onToggleCollapsed: () => void;
    onOpenSettings: () => void;
    footer?: React.ReactNode;
    children: React.ReactNode;
};

export function Sidebar({ activeTab, onChangeTab, collapsed, onToggleCollapsed, onOpenSettings, footer, children }: SidebarProps) {
    if (collapsed) {
        return (
            <aside className="tonto-sidebar-rail">
                <button
                    type="button"
                    onClick={onToggleCollapsed}
                    className="tonto-rail-btn"
                    aria-label="Expand sidebar"
                    title="Expand sidebar"
                >
                    ›
                </button>
                {TABS.map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        className={cn("tonto-rail-btn", activeTab === tab.id && "active")}
                        onClick={() => {
                            onChangeTab(tab.id);
                            onToggleCollapsed();
                        }}
                        title={tab.label}
                        aria-label={tab.label}
                    >
                        {tab.rail}
                    </button>
                ))}
                <button
                    type="button"
                    className="tonto-rail-btn"
                    onClick={onOpenSettings}
                    title="Configuration"
                    aria-label="Configuration"
                    style={{ marginTop: "auto" }}
                >
                    <GearIcon size={13} />
                </button>
                <div className="tonto-rail-vert">tonto</div>
            </aside>
        );
    }

    return (
        <aside className="tonto-sidebar" role="complementary" aria-label="Tonto diagram sidebar">
            <div className="tonto-sidebar-header">
                <span className="tonto-sidebar-title">
                    <span className="dot" aria-hidden="true" />
                    Tonto · Diagram
                </span>
                <div style={{ display: "flex", gap: 2 }}>
                    <button
                        type="button"
                        className="tonto-icon-btn"
                        title="Configuration"
                        aria-label="Open configuration"
                        onClick={onOpenSettings}
                    >
                        <GearIcon size={13} />
                    </button>
                    <button
                        type="button"
                        className="tonto-icon-btn"
                        title="Collapse sidebar"
                        aria-label="Collapse sidebar"
                        onClick={onToggleCollapsed}
                    >
                        ‹
                    </button>
                </div>
            </div>

            <nav className="tonto-tabbar" role="tablist" aria-orientation="horizontal">
                {TABS.map((tab) => (
                    <button
                        key={tab.id}
                        role="tab"
                        id={`sidebar-tab-${tab.id}`}
                        aria-selected={activeTab === tab.id}
                        aria-controls={`sidebar-panel-${tab.id}`}
                        tabIndex={activeTab === tab.id ? 0 : -1}
                        type="button"
                        className={cn("tonto-tab", activeTab === tab.id && "active")}
                        onClick={() => onChangeTab(tab.id)}
                    >
                        {tab.label}
                    </button>
                ))}
            </nav>

            <div
                role="tabpanel"
                id={`sidebar-panel-${activeTab}`}
                aria-labelledby={`sidebar-tab-${activeTab}`}
                className="tonto-tab-body"
            >
                {children}
            </div>

            {footer}
        </aside>
    );
}
