// Adapted from Tonto Visualizer 0.1.53, MIT licensed; see THIRD-PARTY-NOTICES.md.
/**
 * Identity for diagram elements.
 *
 * A saved position, a selection and a hidden-element list all name an element,
 * and they are written to a file that outlives the session. So an id must be
 * derived from what the model *says*, never from where a declaration happens to
 * sit: inserting a class at the top of a file must not move every box below it.
 *
 * A declaration's id is its qualified name. A relation has no name of its own
 * in general, so its id is what distinguishes it from its neighbours -- the two
 * ends, the stereotype and the name it may have -- with an occurrence suffix for
 * the case a model genuinely declares the same relation twice.
 */

export function qualify(packageName: string | undefined, name: string): string {
  return packageName ? `${packageName}::${name}` : name;
}

/** The package part of a qualified id, or `undefined` for a bare name. */
export function packageOf(id: string): string | undefined {
  const separator = id.lastIndexOf("::");
  return separator > 0 ? id.slice(0, separator) : undefined;
}

/** The name part of a qualified id. */
export function nameOf(id: string): string {
  const separator = id.lastIndexOf("::");
  return separator >= 0 ? id.slice(separator + 2) : id;
}

export function generalizationId(specific: string, general: string): string {
  return `gen:${specific}->${general}`;
}

export function instantiationId(instance: string, type: string): string {
  return `inst:${instance}->${type}`;
}

export function gensetId(packageName: string | undefined, name: string): string {
  return `set:${qualify(packageName, name)}`;
}

/**
 * Hands out relation ids, keeping a count per shape so that two relations that
 * say the same thing between the same pair still get different ids -- in the
 * order they are declared, which is the only thing that tells them apart.
 */
export class RelationIds {
  private readonly seen = new Map<string, number>();

  next(source: string, target: string, stereotype?: string, name?: string): string {
    const shape = `rel:${source}->${target}:${stereotype ?? ""}:${name ?? ""}`;
    const count = this.seen.get(shape) ?? 0;
    this.seen.set(shape, count + 1);
    return count === 0 ? shape : `${shape}#${count + 1}`;
  }
}
