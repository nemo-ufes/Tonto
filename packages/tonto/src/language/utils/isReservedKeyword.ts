export function isReservedKeyword(keyword: string): boolean {
    const reservedKeywords = new Set([

        // TypeScript reserved keywords
        "break", "case", "catch", "class", "const", "continue", "debugger", "default", "delete",
        "do", "else", "enum", "export", "extends", "false", "finally", "for", "function", "if",
        "import", "in", "instanceof", "new", "null", "return", "super", "switch", "this", "throw",
        "true", "try", "typeof", "var", "void", "while", "with", "as", "implements", "interface",
        "let", "package", "private", "protected", "public", "static", "yield", "any",
        "constructor", "declare", "get", "module", "require", "number", "set", "symbol",
        "type", "from", "of", "material", "derivation", "value",

        // Relation stereotypes
        "comparative",
        "mediation",
        "characterization",
        "externalDependence",
        "componentOf",
        "memberOf",
        "subCollectionOf",
        "subQuantityOf",
        "instantiation",
        "termination",
        "participational",
        "participation",
        "historicalDependence",
        "creation",
        "manifestation",
        "bringsAbout",
        "triggers",
        "composition",
        "aggregation",
        "inherence",
        "value",
        "formal",
        "manifestation",
        "constitution",

        // Class Stereotypes
        "individual",
        "class",
        "event", "situation", "process",
        "category", "mixin", "phaseMixin", "roleMixin", "historicalRoleMixin",
        "kind", "collective", "quantity", "quality", "mode", "intrinsicMode", "extrinsicMode", "relator", "type", "powertype",
        "subkind", "phase", "role", "historicalRole",
    ]);

    return reservedKeywords.has(keyword);
}
