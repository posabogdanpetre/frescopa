import { getConfigValue } from '../../scripts/configs.js';

let csrfToken = null;
let currentMode = 'semantic';

const MODES = {
  lexical: {
    label: 'Lexical',
    icon: '\ud83d\udcda',
    description: 'Keyword matching \u2014 finds stories that contain the exact words you type.',
  },
  semantic: {
    label: 'Semantic',
    icon: '\ud83e\udde0',
    description: 'Understands intent and concepts \u2014 finds stories relevant to your meaning, even without exact keyword matches.',
  },
  generative: {
    label: 'Generative',
    icon: '\u2728',
    description: 'AI-powered answers \u2014 reads all stories and generates a direct answer to your question.',
  },
};

const DEFAULT_INTENTS = [
  { icon: '\u2615', text: '' },
  { icon: '\ud83c\udf0d', text: '' },
  { icon: '\ud83c\udf75', text: '' },
];

function getAuthorHost() {
  try {
    return getConfigValue('aem.author') || '';
  } catch (e) {
    return 'https://publish-p187852-e1967098.adobeaemcloud.com';
  }
}

async function getCsrfToken() {
  if (csrfToken) return csrfToken;
  const host = getAuthorHost();
  try {
    const resp = await fetch(`${host}/libs/granite/csrf/token.json`, { credentials: 'include' });
    if (resp.ok) {
      const data = await resp.json();
      csrfToken = data.token;
    }
  } catch (e) { /* ignore */ }
  return csrfToken;
}

function extractSnippet(text, maxLen = 180) {
  if (!text) return '';
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '')
    .replace(/#{1,6}\s*/g, '')
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/\n+/g, ' ')
    .trim()
    .substring(0, maxLen) + (text.length > maxLen ? '\u2026' : '');
}

function getImageUrl(result) {
  const meta = (result.data && result.data.metadata) || {};
  const imgPath = meta['twitter:image'] || meta.primaryImagePath || '';
  if (!imgPath) return '';
  if (imgPath.startsWith('http')) return imgPath;
  try {
    const url = new URL((result.data && result.data.source) || '');
    return `${url.origin}${imgPath}`;
  } catch (e) { return ''; }
}

function renderGenAnswer(container, data) {
  const answer = data.result || '';
  const links = (data.retrievedLinks || []).filter((l) => l.url && !l.url.endsWith('/robots.txt'));

  let html = `<div class="cai-gen-panel">
    <div class="cai-gen-header">
      <div class="cai-gen-avatar">\u2728</div>
      <div>
        <div class="cai-gen-label">Generative Answer</div>
        <div class="cai-gen-sublabel">Powered by Content AI</div>
      </div>
    </div>
    <div class="cai-gen-body">${answer}</div>`;

  if (links.length > 0) {
    html += '<div class="cai-gen-sources"><span class="cai-gen-sources-label">Sources</span><div class="cai-gen-sources-list">';
    html += links.map((link) => {
      const parts = link.url.split('/');
      const page = parts[parts.length - 1].replace('.html', '').replace(/-/g, ' ');
      const name = page.charAt(0).toUpperCase() + page.slice(1);
      return `<a href="${link.url}" class="cai-gen-source-tag" target="_blank">${name}</a>`;
    }).join('');
    html += '</div></div>';
  }

  html += '</div>';
  container.innerHTML = html;
}

function renderSearchResults(container, data, mode) {
  const results = (data.results || []).filter((r) => {
    const src = r.data && r.data.source;
    return src && !src.endsWith('/robots.txt');
  });
  const count = results.length;
  const modeInfo = MODES[mode] || MODES.semantic;

  if (count === 0) {
    container.innerHTML = '<div class="cai-empty">No results found.</div>';
    return;
  }

  const banner = `<div class="cai-insight">
    <span class="cai-insight-icon">\ud83d\udca1</span>
    <span>${modeInfo.label} search found <strong>${count} relevant stories</strong>.</span>
  </div>`;

  const header = `<div class="cai-results-head">
    <h3 class="cai-results-title">Stories Found</h3>
    <div class="cai-results-meta">
      <span class="cai-results-count">${count} results</span>
      <span class="cai-mode-pill pill-${mode}">${modeInfo.icon} ${modeInfo.label.toUpperCase()}</span>
    </div>
  </div>`;

  const cards = `<div class="cai-stories-grid">${results.map((result) => {
    const meta = (result.data && result.data.metadata) || {};
    const title = meta.title || meta['twitter:title'] || 'Untitled';
    const source = (result.data && result.data.source) || '#';
    const snippet = extractSnippet(result.data && result.data.text);
    const imageUrl = getImageUrl(result);

    return `<a href="${source}" class="cai-story-card" target="_blank">
      ${imageUrl ? `<div class="cai-story-img"><img src="${imageUrl}" alt="${title}" loading="lazy"></div>` : '<div class="cai-story-img cai-story-img-empty"></div>'}
      <div class="cai-story-body">
        <div class="cai-story-title">${title}</div>
        <p class="cai-story-teaser">${snippet}</p>
      </div>
    </a>`;
  }).join('')}</div>`;

  container.innerHTML = banner + header + cards;
}

async function performSearch(query, resultsEl) {
  const timestamp = Date.now();
  const host = getAuthorHost();
  const token = await getCsrfToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['csrf-token'] = token;
  const fetchOpts = { method: 'POST', headers, credentials: 'include' };

  resultsEl.innerHTML = '<div class="cai-loading"><div class="cai-spinner"></div> Searching\u2026</div>';
  resultsEl.style.display = '';

  if (currentMode === 'generative') {
    try {
      const resp = await fetch(`${host}/bin/caid/gensearch`, {
        ...fetchOpts,
        body: JSON.stringify({ query, timestamp }),
      });
      const data = await resp.json();
      if (data.error) {
        resultsEl.innerHTML = `<div class="cai-error">${data.error}</div>`;
      } else {
        renderGenAnswer(resultsEl, data);
      }
    } catch (e) {
      resultsEl.innerHTML = `<div class="cai-error">Request failed: ${e.message}</div>`;
    }
  } else {
    try {
      const resp = await fetch(`${host}/bin/caid/search`, {
        ...fetchOpts,
        body: JSON.stringify({ query, timestamp }),
      });
      const data = await resp.json();
      if (data.error) {
        resultsEl.innerHTML = `<div class="cai-error">${data.error}</div>`;
      } else {
        renderSearchResults(resultsEl, data, currentMode);
      }
    } catch (e) {
      resultsEl.innerHTML = `<div class="cai-error">Search failed: ${e.message}</div>`;
    }
  }
}

function buildIntentChip(intent, inputEl, resultsEl) {
  const chip = document.createElement('div');
  chip.className = 'cai-intent-chip';

  const face = document.createElement('div');
  face.className = 'cai-intent-face';

  const icon = document.createElement('span');
  icon.className = 'cai-intent-icon';
  icon.textContent = intent.icon;

  const text = document.createElement('span');
  text.className = 'cai-intent-text';
  text.textContent = intent.text || 'Click \u270f\ufe0f to set a query';

  if (!intent.text) text.classList.add('cai-intent-empty');

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'cai-intent-edit';
  editBtn.textContent = '\u270f\ufe0f';

  const editInput = document.createElement('input');
  editInput.type = 'text';
  editInput.className = 'cai-intent-input';
  editInput.value = intent.text;
  editInput.placeholder = 'Type a query\u2026';

  face.append(icon, text, editBtn);
  chip.append(face, editInput);

  // Click face to search
  face.addEventListener('click', (e) => {
    if (e.target === editBtn) return;
    const q = intent.text;
    if (q) {
      inputEl.value = q;
      performSearch(q, resultsEl);
    }
  });

  // Click edit to show input
  editBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    face.style.display = 'none';
    editInput.style.display = 'block';
    editInput.focus();
  });

  // Save on blur or Enter
  const saveEdit = () => {
    const val = editInput.value.trim();
    intent.text = val;
    text.textContent = val || 'Click \u270f\ufe0f to set a query';
    text.classList.toggle('cai-intent-empty', !val);
    face.style.display = '';
    editInput.style.display = '';
  };

  editInput.addEventListener('blur', saveEdit);
  editInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      saveEdit();
      // Also trigger search
      if (intent.text) {
        inputEl.value = intent.text;
        performSearch(intent.text, resultsEl);
      }
    }
    if (e.key === 'Escape') saveEdit();
  });

  return chip;
}

export default function decorate(block) {
  block.innerHTML = '';

  // Results area (created early so callbacks can reference it)
  const resultsEl = document.createElement('div');
  resultsEl.className = 'cai-results-area';

  // Search input (created early so intent chips can reference it)
  const inputEl = document.createElement('input');
  inputEl.type = 'text';
  inputEl.placeholder = 'Ask a question or search\u2026';
  inputEl.className = 'cai-search-field';

  // Mode toggle
  const modeSection = document.createElement('div');
  modeSection.className = 'cai-mode-section';

  const modeLabel = document.createElement('div');
  modeLabel.className = 'cai-section-label';
  modeLabel.textContent = 'CHOOSE SEARCH MODE';

  const modeToggle = document.createElement('div');
  modeToggle.className = 'cai-mode-toggle';

  const modeDesc = document.createElement('div');
  modeDesc.className = 'cai-mode-caption';
  modeDesc.textContent = MODES[currentMode].description;

  Object.entries(MODES).forEach(([key, mode]) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `cai-mode-btn is-${key.substring(0, 3)}`;
    btn.dataset.mode = key;
    if (key === currentMode) btn.classList.add('active');
    btn.innerHTML = `${mode.icon} ${mode.label}`;
    btn.addEventListener('click', () => {
      currentMode = key;
      modeToggle.querySelectorAll('.cai-mode-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      modeDesc.textContent = mode.description;
      // Auto-search if query exists
      const q = inputEl.value.trim();
      if (q) performSearch(q, resultsEl);
    });
    modeToggle.append(btn);
  });

  modeSection.append(modeLabel, modeToggle, modeDesc);

  // Example queries
  const exSection = document.createElement('div');
  exSection.className = 'cai-examples-section';

  const exLabel = document.createElement('div');
  exLabel.className = 'cai-section-label';
  exLabel.innerHTML = 'EXAMPLE QUERIES \u2014 CLICK TO SEARCH, \u270f\ufe0f TO CUSTOMIZE';

  const exRow = document.createElement('div');
  exRow.className = 'cai-intents-grid';

  const intents = DEFAULT_INTENTS.map((i) => ({ ...i }));
  intents.forEach((intent) => {
    exRow.append(buildIntentChip(intent, inputEl, resultsEl));
  });

  exSection.append(exLabel, exRow);

  // Search bar
  const searchBar = document.createElement('div');
  searchBar.className = 'cai-search-bar';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = 'Search Stories';
  btn.className = 'cai-search-btn';

  const onSearch = () => {
    const q = inputEl.value.trim();
    if (q) performSearch(q, resultsEl);
  };

  btn.addEventListener('click', onSearch);
  inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') onSearch(); });

  searchBar.append(inputEl, btn);
  block.append(modeSection, exSection, searchBar, resultsEl);
}
