/**
 * dom.ts — building nodes, never markup.
 *
 * Doctrine §16.7: never build HTML by concatenation where `textContent` will
 * do. Interpolating into `innerHTML` is safe only while every input is a
 * literal somebody wrote, and that condition expires quietly — the first `&` or
 * `<` in a chemical formula mis-renders, and the first value that comes from
 * anywhere else is an injection. Every helper here sets text, never markup.
 *
 * This file has no application knowledge and imports nothing.
 */

/** What {@link el} accepts besides children. */
export interface ElementOptions {
  /** Space-separated class names. */
  readonly className?: string;
  /** Text content. Set with `textContent`, so it is never parsed as markup. */
  readonly text?: string;
  /** Attributes, including ARIA ones. A value of `null` removes the attribute. */
  readonly attrs?: Readonly<Record<string, string | number | boolean | null>>;
}

/** Anything {@link el} will accept as a child. */
export type Child = Node | string | null | undefined | false;

/**
 * Build an element.
 *
 * PRECONDITION: `tag` is a real HTML tag name. Children that are strings become
 * TEXT nodes, so a formula containing `<` is shown rather than parsed.
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElementOptions = {},
  children: readonly Child[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.className !== undefined) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  for (const [name, value] of Object.entries(options.attrs ?? {})) {
    if (value === null || value === false) node.removeAttribute(name);
    else node.setAttribute(name, value === true ? '' : String(value));
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

/**
 * Empty an element without touching `innerHTML`.
 *
 * PRECONDITION: none.
 */
export function clear(node: Element): void {
  while (node.firstChild !== null) node.removeChild(node.firstChild);
}

/**
 * Replace an element's children in one go.
 *
 * PRECONDITION: none.
 */
export function fill(node: Element, children: readonly Child[]): void {
  clear(node);
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
}

/**
 * Find an element that the page is required to contain.
 *
 * PRECONDITION: `selector` matches exactly one element in the document.
 * THROWS if it matches none — a missing hook is a build mistake, and failing
 * loudly at boot beats a screen that silently does nothing when pressed.
 */
export function need<T extends Element = HTMLElement>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (found === null) throw new Error(`the page is missing ${selector}`);
  return found;
}

/**
 * Show one element of a group and hide the rest, using the `hidden` attribute
 * so hidden content is out of the accessibility tree rather than merely
 * invisible.
 *
 * PRECONDITION: `shown` is one of `all`.
 */
export function showOnly(all: readonly HTMLElement[], shown: HTMLElement): void {
  for (const node of all) node.hidden = node !== shown;
}

/**
 * Move focus to an element, and say why out loud for a screen reader by
 * letting the element's own labelling do the work.
 *
 * PRECONDITION: `node` is focusable, or carries `tabindex`.
 *
 * Focus moves on every stage change. Without it a keyboard user lands back at
 * the top of the document after each answer, and on a touch device the software
 * keyboard closes and has to be reopened by hand for every one of six stages.
 */
export function focusFirst(node: HTMLElement | null): void {
  if (node === null) return;
  node.focus({ preventScroll: false });
}
