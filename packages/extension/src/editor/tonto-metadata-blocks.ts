export type TontoMetadataBlockKind = "label" | "description";

export type TontoMetadataBlock = {
  readonly kind: TontoMetadataBlockKind;
  readonly startLine: number;
  readonly endLine: number;
};

type SourcePosition = {
  readonly offset: number;
  readonly line: number;
};

export function findTontoMetadataBlocks(source: string): TontoMetadataBlock[] {
  const blocks: TontoMetadataBlock[] = [];
  let position: SourcePosition = { offset: 0, line: 0 };

  while (position.offset < source.length) {
    const newlineEnd = consumeNewline(source, position);
    if (newlineEnd) {
      position = newlineEnd;
      continue;
    }

    if (startsWith(source, position.offset, "//")) {
      position = skipLineComment(source, position);
      continue;
    }

    if (startsWith(source, position.offset, "/*")) {
      position = skipBlockComment(source, position);
      continue;
    }

    const character = source[position.offset];
    if (character === "\"" || character === "'") {
      position = skipQuotedText(source, position, character);
      continue;
    }

    if (!isIdentifierStart(character)) {
      position = advance(position);
      continue;
    }

    const identifierEnd = findIdentifierEnd(source, position.offset);
    const identifier = source.slice(position.offset, identifierEnd);
    const kind = toMetadataBlockKind(identifier);
    position = { offset: identifierEnd, line: position.line };

    if (!kind) {
      continue;
    }

    const openingBrace = findOpeningBrace(source, position);
    if (!openingBrace) {
      continue;
    }

    const closingBrace = findClosingBrace(source, openingBrace);
    if (!closingBrace) {
      continue;
    }

    if (closingBrace.line > openingBrace.line) {
      blocks.push({
        kind,
        startLine: openingBrace.line,
        endLine: closingBrace.line,
      });
    }

    position = advance(closingBrace);
  }

  return blocks;
}

function findOpeningBrace(source: string, initialPosition: SourcePosition): SourcePosition | undefined {
  let position = initialPosition;

  while (position.offset < source.length) {
    const newlineEnd = consumeNewline(source, position);
    if (newlineEnd) {
      position = newlineEnd;
      continue;
    }

    if (isInlineWhitespace(source[position.offset])) {
      position = advance(position);
      continue;
    }

    if (startsWith(source, position.offset, "//")) {
      position = skipLineComment(source, position);
      continue;
    }

    if (startsWith(source, position.offset, "/*")) {
      position = skipBlockComment(source, position);
      continue;
    }

    return source[position.offset] === "{" ? position : undefined;
  }

  return undefined;
}

function findClosingBrace(source: string, openingBrace: SourcePosition): SourcePosition | undefined {
  let depth = 1;
  let position = advance(openingBrace);

  while (position.offset < source.length) {
    const newlineEnd = consumeNewline(source, position);
    if (newlineEnd) {
      position = newlineEnd;
      continue;
    }

    if (startsWith(source, position.offset, "//")) {
      position = skipLineComment(source, position);
      continue;
    }

    if (startsWith(source, position.offset, "/*")) {
      position = skipBlockComment(source, position);
      continue;
    }

    const character = source[position.offset];
    if (character === "\"" || character === "'") {
      position = skipQuotedText(source, position, character);
      continue;
    }

    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return position;
      }
    }

    position = advance(position);
  }

  return undefined;
}

function skipQuotedText(source: string, initialPosition: SourcePosition, quote: string): SourcePosition {
  let position = advance(initialPosition);

  while (position.offset < source.length) {
    const newlineEnd = consumeNewline(source, position);
    if (newlineEnd) {
      position = newlineEnd;
      continue;
    }

    const character = source[position.offset];
    if (character === quote) {
      return advance(position);
    }

    if (character === "\\") {
      position = advance(position);
      const escapedNewlineEnd = consumeNewline(source, position);
      position = escapedNewlineEnd ?? advance(position);
      continue;
    }

    position = advance(position);
  }

  return position;
}

function skipLineComment(source: string, initialPosition: SourcePosition): SourcePosition {
  let position = {
    offset: initialPosition.offset + 2,
    line: initialPosition.line,
  };

  while (position.offset < source.length && !isNewline(source[position.offset])) {
    position = advance(position);
  }

  return position;
}

function skipBlockComment(source: string, initialPosition: SourcePosition): SourcePosition {
  let position = {
    offset: initialPosition.offset + 2,
    line: initialPosition.line,
  };

  while (position.offset < source.length) {
    if (startsWith(source, position.offset, "*/")) {
      return {
        offset: position.offset + 2,
        line: position.line,
      };
    }

    position = consumeNewline(source, position) ?? advance(position);
  }

  return position;
}

function consumeNewline(source: string, position: SourcePosition): SourcePosition | undefined {
  const character = source[position.offset];
  if (character === "\n") {
    return {
      offset: position.offset + 1,
      line: position.line + 1,
    };
  }

  if (character !== "\r") {
    return undefined;
  }

  return {
    offset: position.offset + (source[position.offset + 1] === "\n" ? 2 : 1),
    line: position.line + 1,
  };
}

function findIdentifierEnd(source: string, startOffset: number): number {
  let offset = startOffset + 1;
  while (offset < source.length && isIdentifierCharacter(source[offset])) {
    offset += 1;
  }
  return offset;
}

function toMetadataBlockKind(identifier: string): TontoMetadataBlockKind | undefined {
  if (identifier === "label" || identifier === "description") {
    return identifier;
  }
  return undefined;
}

function isIdentifierStart(character: string | undefined): boolean {
  return character !== undefined && /[_A-Za-z]/u.test(character);
}

function isIdentifierCharacter(character: string | undefined): boolean {
  return character !== undefined && /[\w\-~$#@/]/u.test(character);
}

function isInlineWhitespace(character: string | undefined): boolean {
  return character !== undefined && /[ \t\f\v]/u.test(character);
}

function isNewline(character: string | undefined): boolean {
  return character === "\n" || character === "\r";
}

function startsWith(source: string, offset: number, value: string): boolean {
  return source.startsWith(value, offset);
}

function advance(position: SourcePosition): SourcePosition {
  return {
    offset: position.offset + 1,
    line: position.line,
  };
}
