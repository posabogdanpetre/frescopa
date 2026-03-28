function stripOuterP(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  // If the content is a single <p>, unwrap it
  if (tmp.children.length === 1 && tmp.children[0].tagName === 'P') {
    return tmp.children[0].innerHTML;
  }
  // Multiple <p> tags — join their innerHTML
  const paragraphs = tmp.querySelectorAll(':scope > p');
  if (paragraphs.length > 0) {
    return [...paragraphs].map((p) => p.innerHTML).filter(Boolean).join(' ');
  }
  return html;
}

export default function decorate(block) {
  const rows = [...block.children];
  const props = {};
  rows.forEach((row) => {
    const cols = [...row.children];
    if (cols.length >= 2) {
      const key = cols[0].textContent.trim().toLowerCase().replace(/\s+/g, '');
      const val = cols[1].innerHTML.trim();
      props[key] = val;
    }
  });

  const kicker = stripOuterP(props.kicker || props.badge || '');
  const title = stripOuterP(props.title || props.heading || 'Fréscopa Stories');
  const description = stripOuterP(props.description || props.subtitle || '');

  block.innerHTML = '';

  const inner = document.createElement('div');
  inner.className = 'cai-hero-inner';

  if (kicker) {
    const k = document.createElement('span');
    k.className = 'cai-hero-kicker';
    // Use innerHTML then read textContent to decode HTML entities like &amp;
    const tmp = document.createElement('span');
    tmp.innerHTML = kicker;
    k.textContent = tmp.textContent;
    inner.append(k);
  }

  const h = document.createElement('h1');
  h.className = 'cai-hero-title';
  const tmpH = document.createElement('span');
  tmpH.innerHTML = title;
  h.textContent = tmpH.textContent;
  inner.append(h);

  if (description) {
    const d = document.createElement('p');
    d.className = 'cai-hero-sub';
    d.innerHTML = description; // keep <strong> tags
    inner.append(d);
  }

  block.append(inner);
}
