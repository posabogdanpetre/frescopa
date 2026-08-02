import { readBlockConfig } from '../../scripts/aem.js';
import { getConfigValue } from '../../scripts/configs.js';

const DEFAULT_RESULTS_SIZE = 10;

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

function extractSnippet(text, maxLen = 180) {
  if (!text) return '';
  const cleaned = text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '')
    .replace(/#{1,6}\s*/g, '')
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/\n+/g, ' ')
    .trim();
  return cleaned.substring(0, maxLen) + (cleaned.length > maxLen ? '…' : '');
}

const DEFAULT_IMAGE = '/default-meta-image.png?width=1200&format=pjpg&optimize=medium';

function getImageUrl(result) {
  const meta = (result.data && result.data.metadata) || {};
  const imgPath = meta['twitter:image'] || meta.primaryImagePath || '';
  if (!imgPath) return DEFAULT_IMAGE;
  if (imgPath.startsWith('http')) return imgPath;
  try {
    const url = new URL((result.data && result.data.source) || '');
    return `${url.origin}${imgPath}`;
  } catch (e) {
    return DEFAULT_IMAGE;
  }
}

function renderResultCard(result) {
  const meta = (result.data && result.data.metadata) || {};
  const title = meta.title || meta['twitter:title'] || 'Untitled';
  const source = (result.data && result.data.source) || '#';
  const description = extractSnippet(result.data && result.data.text);
  const image = getImageUrl(result);

  const card = document.createElement('a');
  card.className = 'cmp-content-ai-search__result-card';
  card.href = source;
  card.target = '_blank';
  card.rel = 'noopener';

  if (image) {
    const imageWrap = document.createElement('div');
    imageWrap.className = 'cmp-content-ai-search__result-card-image';
    const img = document.createElement('img');
    img.src = image;
    img.alt = title;
    img.loading = 'lazy';
    imageWrap.append(img);
    card.append(imageWrap);
  }

  const body = document.createElement('div');
  body.className = 'cmp-content-ai-search__result-card-body';

  const titleEl = document.createElement('div');
  titleEl.className = 'cmp-content-ai-search__result-card-title';
  titleEl.textContent = title;
  body.append(titleEl);

  if (description) {
    const descriptionEl = document.createElement('p');
    descriptionEl.className = 'cmp-content-ai-search__result-card-description';
    descriptionEl.textContent = description;
    body.append(descriptionEl);
  }

  card.append(body);
  return card;
}

function renderAnswer(container, genData, searchData, resultsSize, resultsLayout, disclaimerText) {
  container.innerHTML = '';

  const panel = document.createElement('div');
  panel.className = 'cmp-content-ai-search__summary-card';

  const header = document.createElement('div');
  header.className = 'cmp-content-ai-search__summary-header';
  header.textContent = 'Generative Answer';
  panel.append(header);

  const text = document.createElement('div');
  text.className = 'cmp-content-ai-search__summary-text';
  text.innerHTML = formatMarkdown(genData.result || '');
  panel.append(text);

  const links = (genData.retrievedLinks || []).filter((l) => l.url && !l.url.endsWith('/robots.txt'));
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

  const results = (searchData && searchData.results) || [];
  if (results.length) {
    const resultsHeader = document.createElement('div');
    resultsHeader.className = 'cmp-content-ai-search__results-header';
    resultsHeader.textContent = 'Related Results';
    container.append(resultsHeader);

    const grid = document.createElement('div');
    grid.className = 'cmp-content-ai-search__results-grid';
    grid.classList.toggle('cmp-content-ai-search__results-grid--list', resultsLayout === 'list');
    grid.classList.toggle('cmp-content-ai-search__results-grid--card', resultsLayout !== 'list');
    results.slice(0, resultsSize).forEach((result) => grid.append(renderResultCard(result)));
    container.append(grid);
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
  const resultsSize = parseInt(config['results-size'], 10) || DEFAULT_RESULTS_SIZE;
  const resultsLayout = config['results-layout'] === 'list' ? 'list' : 'card';

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
    const genBody = { query, timestamp: Date.now() };
    if (contentSource) genBody.clientId = contentSource;
    const searchBody = { query, timestamp: Date.now() };
    if (contentSource) searchBody.index = contentSource;

    try {
      const [genResp, searchResp] = await Promise.all([
        fetch(`${host}/bin/caid/gensearch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(genBody),
        }),
        fetch(`${host}/bin/caid/semanticsearch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(searchBody),
        }),
      ]);
      const genData = await genResp.json();
      const searchData = await searchResp.json();

      if (genData.error) {
        showError(summaryEl, genData.error);
      } else {
        renderAnswer(
          summaryEl,
          genData,
          searchData.error ? null : searchData,
          resultsSize,
          resultsLayout,
          disclaimerText,
        );
      }
    } catch (error) {
      showError(summaryEl, errorFallback);
    }
  });

  block.append(form);
  if (toggleWrap) block.append(toggleWrap);
  block.append(summaryEl);
}
