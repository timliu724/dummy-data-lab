let tooltipSequence = 0;

export function createInfoTooltip(documentRef, {
  label,
  content,
  placement = 'below-left',
} = {}) {
  if (!documentRef?.createElement) throw new TypeError('A document is required.');
  if (!label || !content) throw new TypeError('Tooltip label and content are required.');

  tooltipSequence += 1;
  const tooltipId = 'info-tooltip-' + tooltipSequence;
  const tooltip = documentRef.createElement('button');
  tooltip.type = 'button';
  tooltip.className = `info-tooltip info-tooltip--${placement}`;
  tooltip.setAttribute('aria-label', label);
  tooltip.setAttribute('aria-describedby', tooltipId);
  tooltip.setAttribute('aria-expanded', 'false');

  const trigger = documentRef.createElement('span');
  trigger.className = 'info-tooltip__trigger';
  trigger.setAttribute('aria-hidden', 'true');
  trigger.textContent = 'i';

  const body = documentRef.createElement('span');
  body.id = tooltipId;
  body.className = 'info-tooltip__content';
  body.setAttribute('role', 'tooltip');
  body.textContent = content;

  tooltip.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const open = !tooltip.classList.contains('is-open');
    tooltip.classList.toggle('is-open', open);
    tooltip.setAttribute('aria-expanded', String(open));
  });
  tooltip.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      tooltip.classList.remove('is-open');
      tooltip.setAttribute('aria-expanded', 'false');
      tooltip.focus();
    }
  });
  tooltip.append(trigger, body);
  return tooltip;
}
