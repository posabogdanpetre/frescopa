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

function renderCard(result) {
  const meta = (result.data && result.data.metadata) || {};
  const title = meta.title || meta['twitter:title'] || 'Untitled';
  const source = (result.data && result.data.source) || '#';
  const description = extractSnippet(result.data && result.data.text);
  const image = getImageUrl(result);

  const card = document.createElement('a');
  card.className = 'cmp-semantic-search__card';
  card.href = source;
  card.target = '_blank';
  card.rel = 'noopener';

  if (image) {
    const imageWrap = document.createElement('div');
    imageWrap.className = 'cmp-semantic-search__card-image';
    const img = document.createElement('img');
    img.src = image;
    img.alt = title;
    img.loading = 'lazy';
    imageWrap.append(img);
    card.append(imageWrap);
  }

  const body = document.createElement('div');
  body.className = 'cmp-semantic-search__card-body';

  const titleEl = document.createElement('div');
  titleEl.className = 'cmp-semantic-search__card-title';
  titleEl.textContent = title;
  body.append(titleEl);

  if (description) {
    const descriptionEl = document.createElement('p');
    descriptionEl.className = 'cmp-semantic-search__card-description';
    descriptionEl.textContent = description;
    body.append(descriptionEl);
  }

  card.append(body);
  return card;
}

function renderResults(resultsEl, items, layout, cursor, onLoadMore) {
  resultsEl.innerHTML = '';
  resultsEl.classList.toggle('cmp-semantic-search__results--list', layout === 'list');
  resultsEl.classList.toggle('cmp-semantic-search__results--card', layout !== 'list');

  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'cmp-semantic-search__empty';
    empty.textContent = 'No results found.';
    resultsEl.append(empty);
    return;
  }

  items.forEach((item) => resultsEl.append(renderCard(item)));

  if (cursor) {
    const pagination = document.createElement('div');
    pagination.className = 'cmp-semantic-search__pagination';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cmp-semantic-search__load-more';
    button.textContent = 'Load more results';
    button.addEventListener('click', () => {
      button.disabled = true;
      button.textContent = 'Loading…';
      onLoadMore(cursor);
    });
    pagination.append(button);
    resultsEl.append(pagination);
  }
}

function showLoading(resultsEl) {
  resultsEl.innerHTML = '';
  const loading = document.createElement('p');
  loading.className = 'cmp-semantic-search__loading';
  loading.textContent = 'Searching…';
  resultsEl.append(loading);
}

function showError(resultsEl, message) {
  resultsEl.innerHTML = '';
  const error = document.createElement('p');
  error.className = 'cmp-semantic-search__error';
  error.textContent = message;
  resultsEl.append(error);
}

export default function decorate(block) {
  const config = readBlockConfig(block);
  const placeholder = config.placeholder || 'Search…';
  const resultsSize = parseInt(config['results-size'], 10) || DEFAULT_RESULTS_SIZE;
  const resultsLayout = config['results-layout'] === 'list' ? 'list' : 'card';
  const contentSource = config['content-source'] || '';
  const { id } = config;
  const toggleVisible = config['semantic-search-toggle-visible'] !== 'false';
  const enabledByDefault = config['semantic-search-enabled-by-default'] !== 'false';

  block.innerHTML = '';
  block.classList.add('cmp-semantic-search');
  if (id) block.id = id;

  const form = document.createElement('form');
  form.className = 'cmp-semantic-search__form';
  form.setAttribute('role', 'search');

  const input = document.createElement('input');
  input.type = 'search';
  input.className = 'cmp-semantic-search__input';
  input.placeholder = placeholder;
  input.setAttribute('aria-label', placeholder);

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'cmp-semantic-search__submit';
  submit.textContent = 'Search';

  form.append(input, submit);

  let toggleInput;
  let toggleWrap;
  if (toggleVisible) {
    toggleWrap = document.createElement('label');
    toggleWrap.className = 'cmp-semantic-search__toggle';

    toggleInput = document.createElement('input');
    toggleInput.type = 'checkbox';
    toggleInput.checked = enabledByDefault;

    const toggleLabel = document.createElement('span');
    toggleLabel.textContent = 'Enable semantic search';

    toggleWrap.append(toggleInput, toggleLabel);
  }

  const resultsEl = document.createElement('div');
  resultsEl.className = 'cmp-semantic-search__results';
  resultsEl.setAttribute('role', 'status');
  resultsEl.setAttribute('aria-live', 'polite');

  async function fetchPage(query, cursor, allItems) {
    const host = getPublishHost();
    const body = { query, timestamp: Date.now() };
    if (cursor) body.cursor = cursor;
    if (contentSource) body.index = contentSource;

    try {
      const resp = await fetch(`${host}/bin/caid/semanticsearch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await resp.json();

      if (data.error) {
        showError(resultsEl, data.error);
        return;
      }

      const items = allItems.concat(data.results || []).slice(0, resultsSize);
      const nextCursor = items.length < resultsSize ? (data.cursor || null) : null;
      renderResults(
        resultsEl,
        items,
        resultsLayout,
        nextCursor,
        (nc) => fetchPage(query, nc, items),
      );
    } catch (error) {
      showError(resultsEl, 'Search failed. Please try again.');
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const query = input.value.trim();
    if (!query) return;

    const semanticOn = toggleInput ? toggleInput.checked : enabledByDefault;
    if (!semanticOn) {
      resultsEl.innerHTML = '';
      return;
    }

    showLoading(resultsEl);
    await fetchPage(query, null, []);
  });

  block.append(form);
  if (toggleWrap) block.append(toggleWrap);
  block.append(resultsEl);
}
