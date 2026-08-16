export function createUiMessage(kind, text, scope = null) {
  if (!['info', 'success', 'warning', 'error'].includes(kind)) throw new RangeError('Unknown message kind.');
  if (scope !== null && (typeof scope !== 'string' || scope.trim() === '')) throw new TypeError('Message scope must be a non-empty string or null.');
  return Object.freeze({ kind, text: String(text), scope });
}

export function mergeUiMessage(messages, message, { replace = false, maximum = 8 } = {}) {
  if (!Array.isArray(messages)) throw new TypeError('messages must be an array.');
  if (!Number.isInteger(maximum) || maximum <= 0) throw new RangeError('maximum must be a positive integer.');
  const retained = replace
    ? []
    : messages.filter((entry) => message.scope ? entry.scope !== message.scope : entry.text !== message.text);
  return Object.freeze([...retained, message].slice(-maximum));
}

export function renderMessages(container, messages) {
  const documentRef = container.ownerDocument;
  const fragment = documentRef.createDocumentFragment();
  for (const message of messages) {
    const item = documentRef.createElement('div');
    item.className = `message message--${message.kind}`;
    item.setAttribute('role', message.kind === 'error' ? 'alert' : 'status');
    item.textContent = message.text;
    fragment.append(item);
  }
  container.replaceChildren(fragment);
}
