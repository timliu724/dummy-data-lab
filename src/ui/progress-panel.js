export function progressModel(update = {}) {
  const total = Number.isFinite(update.total) && update.total > 0 ? update.total : null;
  const current = Number.isFinite(update.current) && update.current >= 0 ? update.current : null;
  return Object.freeze({
    phase: update.phase ?? 'IDLE',
    message: update.message ?? 'Ready.',
    current,
    total,
    percent: total && current !== null ? Math.min(100, Math.round(current / total * 100)) : null,
  });
}

export function renderProgress(container, update, visible = true) {
  const model = progressModel(update);
  container.hidden = !visible;
  const label = container.querySelector('[data-progress-label]');
  const bar = container.querySelector('[data-progress-bar]');
  label.textContent = model.message;
  bar.style.width = `${model.percent ?? 18}%`;
  bar.classList.toggle('is-indeterminate', model.percent === null);
  container.dataset.phase = model.phase;
}
