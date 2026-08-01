import { readBlockConfig } from '../../scripts/aem.js';
import { getConfigValue } from '../../scripts/configs.js';

function getPublishHost() {
  try {
    return getConfigValue('aem.publish') || 'https://publish-p187852-e1967098.adobeaemcloud.com';
  } catch (e) {
    return 'https://publish-p187852-e1967098.adobeaemcloud.com';
  }
}

function formatMarkdown(text) {
  if (!text) return '';
  let formatted = text.replace(/(\d+)\.\s+\*\*([^*]+)\*\*:\s*/g, '\n<li><strong>$2:</strong> ');
  formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  formatted = formatted.replace(/(?:^|\n)\s*-\s+/g, '\n<li>');

  if (formatted.includes('<li>')) {
    const firstLi = formatted.indexOf('<li>');
    const intro = formatted.substring(0, firstLi).trim();
    const listContent = formatted.substring(firstLi);
    const isOrdered = /\d+\.\s/.test(text);
    const tag = isOrdered ? 'ol' : 'ul';
    const items = listContent.split('<li>').filter((s) => s.trim());
    const listHtml = items.map((item) => `<li>${item.trim()}</li>`).join('');
    formatted = `${intro ? `<p>${intro}</p>` : ''}<${tag}>${listHtml}</${tag}>`;
  } else {
    formatted = `<p>${formatted}</p>`;
  }

  return formatted;
}

function sourceNameFromUrl(url) {
  const parts = url.split('/');
  const page = (parts[parts.length - 1] || '').replace('.html', '').replace(/-/g, ' ');
  return page ? page.charAt(0).toUpperCase() + page.slice(1) : url;
}

function renderAnswer(container, data, disclaimerText) {
  container.innerHTML = '';

  const panel = document.createElement('div');
  panel.className = 'cmp-content-ai-search__summary-card';

  const header = document.createElement('div');
  header.className = 'cmp-content-ai-search__summary-header';
  header.textContent = 'Generative Answer';
  panel.append(header);

  const text = document.createElement('div');
  text.className = 'cmp-content-ai-search__summary-text';
  text.innerHTML = formatMarkdown(data.result || '');
  panel.append(text);

  const links = (data.retrievedLinks || []).filter((l) => l.url && !l.url.endsWith('/robots.txt'));
  if (links.length) {
    const sources = document.createElement('div');
    sources.className = 'cmp-content-ai-search__sources';

    const label = document.createElement('span');
    label.className = 'cmp-content-ai-search__sources-label';
    label.textContent = 'Sources';
    sources.append(label);

    links.forEach((link) => {
      const a = document.createElement('a');
      a.className = 'cmp-content-ai-search__source-chip';
      a.href = link.url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = sourceNameFromUrl(link.url);
      sources.append(a);
    });

    panel.append(sources);
  }

  container.append(panel);

  if (disclaimerText) {
    const disclaimer = document.createElement('p');
    disclaimer.className = 'cmp-content-ai-search__disclaimer';
    disclaimer.textContent = disclaimerText;
    container.append(disclaimer);
  }
}

function showLoading(container) {
  container.innerHTML = '';
  const loading = document.createElement('p');
  loading.className = 'cmp-content-ai-search__loading';
  loading.textContent = 'Generating answer…';
  container.append(loading);
}

function showError(container, message) {
  container.innerHTML = '';
  const error = document.createElement('p');
  error.className = 'cmp-content-ai-search__error';
  error.textContent = message;
  container.append(error);
}

export default function decorate(block) {
  const config = readBlockConfig(block);
  const placeholder = config.placeholder || 'Ask a question…';
  const { id } = config;
  const toggleVisible = config['gen-search-toggle-visible'] !== 'false';
  const enabledByDefault = config['gen-search-enabled-by-default'] !== 'false';
  const errorFallback = config['gen-search-error-fallback']
    || 'Sorry, we could not generate an answer. Please try again.';
  const disclaimerText = config['disclaimer-text'] || '';
  const contentSource = config['content-source'] || '';

  block.innerHTML = '';
  block.classList.add('cmp-content-ai-search');
  if (id) block.id = id;

  const form = document.createElement('form');
  form.className = 'cmp-content-ai-search__form';
  form.setAttribute('role', 'search');

  const input = document.createElement('input');
  input.type = 'search';
  input.className = 'cmp-content-ai-search__input';
  input.placeholder = placeholder;
  input.setAttribute('aria-label', placeholder);

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'cmp-content-ai-search__submit';
  submit.textContent = 'Ask';

  form.append(input, submit);

  const summaryEl = document.createElement('div');
  summaryEl.className = 'cmp-content-ai-search__summary';
  summaryEl.setAttribute('role', 'status');
  summaryEl.setAttribute('aria-live', 'polite');

  let toggleInput;
  let toggleWrap;
  if (toggleVisible) {
    toggleWrap = document.createElement('label');
    toggleWrap.className = 'cmp-content-ai-search__toggle';

    toggleInput = document.createElement('input');
    toggleInput.type = 'checkbox';
    toggleInput.checked = enabledByDefault;

    const toggleLabel = document.createElement('span');
    toggleLabel.textContent = 'Show generative summary';

    toggleWrap.append(toggleInput, toggleLabel);
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const query = input.value.trim();
    if (!query) return;

    const summaryOn = toggleInput ? toggleInput.checked : enabledByDefault;
    if (!summaryOn) {
      summaryEl.innerHTML = '';
      return;
    }

    showLoading(summaryEl);
    const host = getPublishHost();
    const body = { query, timestamp: Date.now() };
    if (contentSource) body.clientId = contentSource;

    try {
      const resp = await fetch(`${host}/bin/caid/gensearch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await resp.json();
      if (data.error) {
        showError(summaryEl, data.error);
      } else {
        renderAnswer(summaryEl, data, disclaimerText);
      }
    } catch (error) {
      showError(summaryEl, errorFallback);
    }
  });

  block.append(form);
  if (toggleWrap) block.append(toggleWrap);
  block.append(summaryEl);
}
