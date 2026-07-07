grammar Tonto

import "./grammar/terminals"
import "./grammar/ontological-category"
import "./grammar/ontological-natures"
import "./grammar/class-declaration"
import "./grammar/relations"
import "./grammar/attributes"
import "./grammar/datatypes"
import "./grammar/gensets"

entry Model:
	statements+=Statement*
;

Statement:
	import=Import | contextModule=ContextModule;

/**
 * A Package represents a namespace for organizing and grouping related model elements.
 * Similar to UML packages, it provides a way to structure and modularize the model.
 *
 * A Package can:
 * - Have a name that serves as its identifier
 * - Contain multiple declarations (classes, datatypes, enums, etc.)
 * - Be imported and referenced by other packages
 * - Be marked as global to be accessible throughout the model
 */
ContextModule:
	(isGlobal?='global')? 'package' (name=QualifiedName)

	(imports+=Import | declarations+=Declaration)*
;

Import:
	'import' referencedModel=[ContextModule:QualifiedName] ('as' packageAlias=ID)?
;

// <--- Declarations --->

Declaration:
	ClassDeclaration | AuxiliaryDeclaration
;

AuxiliaryDeclaration:
	DataType | Enum | GeneralizationSetImpl | GeneralizationSetShort | ExternalRelation
;
