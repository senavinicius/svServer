/**
 * Utilitários para manipulação do DOM
 */

/**
 * Obtém um elemento pelo ID (com type-safety)
 */
export function getElement<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Element with id "${id}" not found`);
  }
  return element as T;
}

/**
 * Obtém um elemento pelo ID (retorna null se não existir)
 */
export function queryElement<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

/**
 * Adiciona listener de evento a um elemento (se existir)
 */
export function addEventListener<K extends keyof HTMLElementEventMap>(
  elementId: string,
  event: K,
  handler: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any
): void {
  const element = queryElement(elementId);
  if (element) {
    element.addEventListener(event, handler);
  }
}

/**
 * Adiciona listeners de evento para múltiplos elementos com data-attribute
 */
export function addDataAttributeListeners<K extends keyof HTMLElementEventMap>(
  dataAttribute: string,
  event: K,
  handler: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any
): void {
  document.querySelectorAll(`[${dataAttribute}]`).forEach(element => {
    if (element instanceof HTMLElement) {
      element.addEventListener(event, handler);
    }
  });
}

/**
 * Toggle classe CSS de um elemento
 */
export function toggleClass(elementId: string, className: string, force?: boolean): void {
  const element = queryElement(elementId);
  if (element) {
    element.classList.toggle(className, force);
  }
}

/**
 * Adiciona classe CSS a um elemento
 */
export function addClass(elementId: string, className: string): void {
  const element = queryElement(elementId);
  if (element) {
    element.classList.add(className);
  }
}

/**
 * Remove classe CSS de um elemento
 */
export function removeClass(elementId: string, className: string): void {
  const element = queryElement(elementId);
  if (element) {
    element.classList.remove(className);
  }
}

/**
 * Obtém valor de um input
 */
export function getInputValue(elementId: string): string {
  const element = queryElement<HTMLInputElement>(elementId);
  return element?.value || '';
}

/**
 * Define valor de um input
 */
export function setInputValue(elementId: string, value: string): void {
  const element = queryElement<HTMLInputElement>(elementId);
  if (element) {
    element.value = value;
  }
}

/**
 * Obtém dados de um FormData
 */
export function getFormData(formId: string): FormData | null {
  const form = queryElement<HTMLFormElement>(formId);
  return form ? new FormData(form) : null;
}
