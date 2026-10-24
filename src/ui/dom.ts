export interface ElementProps {
  className?: string;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  { className }: ElementProps = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.append(...children);
  return element;
}
