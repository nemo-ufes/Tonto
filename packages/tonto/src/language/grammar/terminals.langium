hidden terminal WS: /\s+/;
terminal INT returns number: /[0-9]+/;
terminal STRING: /"(\\.|[^"\\])*"|'(\\.|[^'\\])*'/;

// IDs
terminal ID: /[_a-zA-Z][\w_\-~$#@/\d]*/;

hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;

QualifiedName returns string:
	ID ('.' ID)*
;
