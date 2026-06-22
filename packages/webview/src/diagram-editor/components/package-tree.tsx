import * as React from "react";
import type { TontoDiagramElementContext, TontoDiagramWorkspaceContext } from "tonto-cli";

type PackageTreeProps = {
    workspace: TontoDiagramWorkspaceContext;
    imports: string[];
    include: string[];
    onChangeImports: (next: string[]) => void;
    onChangeInclude: (next: string[]) => void;
};

type PackageNode = {
    name: string;
    elements: TontoDiagramElementContext[];
};

type TriState = "checked" | "unchecked" | "indeterminate";

export function PackageTree({ workspace, imports, include, onChangeImports, onChangeInclude }: PackageTreeProps) {
    const importsSet = React.useMemo(() => new Set(imports), [imports]);
    const includeSet = React.useMemo(() => new Set(include), [include]);
    const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set(imports));

    const packages: PackageNode[] = React.useMemo(() => {
        const byName = new Map<string, PackageNode>();
        for (const pkg of workspace.packages) {
            byName.set(pkg.name, { name: pkg.name, elements: [] });
        }
        for (const element of workspace.elements) {
            const bucket = byName.get(element.packageName);
            if (bucket) {
                bucket.elements.push(element);
            }
        }
        return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
    }, [workspace]);

    const togglePackage = (name: string) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(name)) next.delete(name);
            else next.add(name);
            return next;
        });
    };

    const setPackageChecked = (pkg: PackageNode, checked: boolean) => {
        const nextImports = new Set(importsSet);
        if (checked) nextImports.add(pkg.name);
        else nextImports.delete(pkg.name);
        onChangeImports([...nextImports]);

        if (!checked) {
            const nextInclude = include.filter((item) =>
                !pkg.elements.some((element) => itemMatchesElement(item, element)),
            );
            if (nextInclude.length !== include.length) {
                onChangeInclude(nextInclude);
            }
        }
    };

    const setElementChecked = (element: TontoDiagramElementContext, checked: boolean) => {
        const nextInclude = new Set(includeSet);
        if (checked) {
            nextInclude.add(element.name);
        } else {
            nextInclude.delete(element.name);
            nextInclude.delete(element.qualifiedName);
        }
        onChangeInclude([...nextInclude]);
    };

    if (packages.length === 0) {
        return (
            <div className="font-mono text-[11px] text-[var(--fg-muted)]" style={{ padding: "16px 14px" }}>
                No packages found in this project.
            </div>
        );
    }

    return (
        <ul className="tonto-tree-section" role="tree" aria-label="Project packages">
            {packages.map((pkg) => {
                const isExpanded = expanded.has(pkg.name);
                const isImported = importsSet.has(pkg.name);
                const includedElementCount = pkg.elements.filter((element) => isElementIncluded(element, includeSet)).length;
                const triState = computeTriState(isImported, includedElementCount, pkg.elements.length);
                return (
                    <li key={pkg.name} role="treeitem" aria-expanded={isExpanded}>
                        <div className="tonto-pkg-row" onClick={() => togglePackage(pkg.name)}>
                            <span className="caret" aria-hidden="true">{isExpanded ? "▾" : "▸"}</span>
                            <TriCheckbox
                                state={triState}
                                onChange={() => setPackageChecked(pkg, triState !== "checked")}
                                ariaLabel={`Include package ${pkg.name}`}
                            />
                            <span className="tonto-pkg-name">{pkg.name}</span>
                            <span className="tonto-pkg-count">{pkg.elements.length}</span>
                        </div>
                        {isExpanded ? (
                            <ul role="group" className="tonto-children">
                                {pkg.elements.map((element) => {
                                    const checked = isElementIncluded(element, includeSet);
                                    return (
                                        <li
                                            key={element.qualifiedName}
                                            role="treeitem"
                                            className="tonto-child-row"
                                            onClick={() => setElementChecked(element, !checked)}
                                        >
                                            <span className="caret" aria-hidden="true" />
                                            <TriCheckbox
                                                state={checked ? "checked" : "unchecked"}
                                                onChange={() => setElementChecked(element, !checked)}
                                                ariaLabel={`Include ${element.qualifiedName}`}
                                            />
                                            <span className="tonto-child-name">{element.name}</span>
                                            <span className="tonto-child-kind">{element.kind}</span>
                                        </li>
                                    );
                                })}
                                {pkg.elements.length === 0 ? (
                                    <li className="tonto-child-row" style={{ color: "var(--fg-faint)", fontStyle: "italic" }}>
                                        (no elements)
                                    </li>
                                ) : null}
                            </ul>
                        ) : null}
                    </li>
                );
            })}
        </ul>
    );
}

function computeTriState(isImported: boolean, includedCount: number, total: number): TriState {
    if (!isImported && includedCount === 0) return "unchecked";
    if (isImported && includedCount === 0) return "checked";
    if (includedCount === total) return "checked";
    return "indeterminate";
}

function isElementIncluded(element: TontoDiagramElementContext, includeSet: Set<string>): boolean {
    return includeSet.has(element.name) || includeSet.has(element.qualifiedName);
}

function itemMatchesElement(item: string, element: TontoDiagramElementContext): boolean {
    return item === element.name || item === element.qualifiedName;
}

export function TriCheckbox({
    state,
    onChange,
    ariaLabel,
}: {
    state: TriState;
    onChange: (next: boolean) => void;
    ariaLabel: string;
}) {
    const ref = React.useRef<HTMLInputElement>(null);
    React.useEffect(() => {
        if (!ref.current) return;
        ref.current.indeterminate = state === "indeterminate";
        if (state === "indeterminate") {
            ref.current.setAttribute("data-indeterminate", "true");
        } else {
            ref.current.removeAttribute("data-indeterminate");
        }
    }, [state]);

    return (
        <input
            ref={ref}
            type="checkbox"
            className="tonto-tcb"
            aria-label={ariaLabel}
            checked={state === "checked"}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => onChange(event.target.checked)}
        />
    );
}
