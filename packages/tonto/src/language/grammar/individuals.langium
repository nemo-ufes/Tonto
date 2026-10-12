import "class-declaration"
import "attributes"

Individual:
  'individual' name=ID ':' type=[ClassDeclaration:QualifiedName]
  '{' assignments+=AttributeAssignment* '}'
;

AttributeAssignment:
  attribute=[Attribute:QualifiedName] '='
  (values+=IndividualValue | '[' (values+=IndividualValue (',' values+=IndividualValue)*)? ']')
;

IndividualValue:
  StringLiteral | NumberLiteral | BooleanLiteral | EnumLiteral | ObjectLiteral
;

StringLiteral:
  value=STRING
;

NumberLiteral:
  value=IndividualNumber
;

IndividualNumber returns number:
  ('-' | '+')? INT ('.' INT)?
;

BooleanLiteral:
  value=IndividualBoolean
;

IndividualBoolean returns boolean:
  'true' | 'false'
;

EnumLiteral:
  member=[EnumElement:QualifiedName]
;

ObjectLiteral:
  {infer ObjectLiteral} '{' assignments+=AttributeAssignment* '}'
;
