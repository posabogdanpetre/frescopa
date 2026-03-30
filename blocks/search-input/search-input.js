import { getConfigValue } from '../../scripts/configs.js';

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

function getPublishHost() {
  try {
    return getConfigValue('aem.publish') || 'https://publish-p187852-e1967098.adobeaemcloud.com';
  } catch (e) {
    return 'https://publish-p187852-e1967098.adobeaemcloud.com';
  }
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

const DEFAULT_IMAGE = '/default-meta-image.png?width=1200&format=pjpg&optimize=medium';

function getImageUrl(result) {
  const meta = (result.data && result.data.metadata) || {};
  const imgPath = meta['twitter:image'] || meta.primaryImagePath || '';
  if (!imgPath) return DEFAULT_IMAGE;
  if (imgPath.startsWith('http')) return imgPath;
  try {
    const url = new URL((result.data && result.data.source) || '');
    return `${url.origin}${imgPath}`;
  } catch (e) { return DEFAULT_IMAGE; }
}

function formatMarkdown(text) {
  if (!text) return '';
  // Split numbered items like "1. **Title**: description" into list items
  let formatted = text.replace(/(\d+)\.\s+\*\*([^*]+)\*\*:\s*/g, '\n<li><strong>$2:</strong> ');
  // Handle remaining **bold** markers
  formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Handle bullet points "- text"
  formatted = formatted.replace(/(?:^|\n)\s*-\s+/g, '\n<li>');

  // If we have list items, wrap them in an <ol> or <ul>
  if (formatted.includes('<li>')) {
    // Split into intro text and list content
    const firstLi = formatted.indexOf('<li>');
    const intro = formatted.substring(0, firstLi).trim();
    const listContent = formatted.substring(firstLi);

    // Determine if ordered (numbered) or unordered
    const isOrdered = /\d+\.\s/.test(text);
    const tag = isOrdered ? 'ol' : 'ul';

    // Close each <li> before the next one and at the end
    let items = listContent.split('<li>').filter((s) => s.trim());
    const listHtml = items.map((item) => `<li>${item.trim()}</li>`).join('');

    formatted = (intro ? `<p>${intro}</p>` : '') + `<${tag}>${listHtml}</${tag}>`;
  } else {
    formatted = `<p>${formatted}</p>`;
  }

  return formatted;
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
    <div class="cai-gen-body">${formatMarkdown(answer)}</div>`;

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

const PAGE_SIZE = 8;

function renderSearchResults(container, data, mode, query) {
  const results = (data.results || []).filter((r) => {
    const src = r.data && r.data.source;
    return src && !src.endsWith('/robots.txt');
  });
  const totalCount = results.length;
  const modeInfo = MODES[mode] || MODES.semantic;

  if (totalCount === 0) {
    container.innerHTML = '<div class="cai-empty">No results found.</div>';
    return;
  }

  let currentPage = 1;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  function renderPage() {
    const start = (currentPage - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    const pageResults = results.slice(start, end);

    const banner = `<div class="cai-insight">
      <span class="cai-insight-icon">\ud83d\udca1</span>
      <span>${modeInfo.label} search found <strong>${totalCount} relevant stories</strong>.</span>
    </div>`;

    const header = `<div class="cai-results-head">
      <h3 class="cai-results-title">Stories Found</h3>
      <div class="cai-results-meta">
        <span class="cai-results-count">${totalCount} results</span>
        <span class="cai-mode-pill pill-${mode}">${modeInfo.icon} ${modeInfo.label.toUpperCase()}</span>
      </div>
    </div>`;

    const cards = `<div class="cai-stories-grid">${pageResults.map((result) => {
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

    let pagination = '';
    if (totalPages > 1) {
      pagination = `<div class="cai-pagination">
        <button class="cai-page-btn cai-page-prev" ${currentPage === 1 ? 'disabled' : ''}>Previous</button>
        <span class="cai-page-info">Page ${currentPage} of ${totalPages}</span>
        <button class="cai-page-btn cai-page-next" ${currentPage === totalPages ? 'disabled' : ''}>Next</button>
      </div>`;
    }

    container.innerHTML = banner + header + cards + pagination;

    // Bind pagination buttons
    const prevBtn = container.querySelector('.cai-page-prev');
    const nextBtn = container.querySelector('.cai-page-next');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (currentPage > 1) { currentPage -= 1; renderPage(); }
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (currentPage < totalPages) { currentPage += 1; renderPage(); }
      });
    }
  }

  renderPage();
}

async function performSearch(query, resultsEl) {
  const timestamp = Date.now();
  const host = getPublishHost();
  const headers = { 'Content-Type': 'application/json' };
  const fetchOpts = { method: 'POST', headers };

  resultsEl.style.display = '';

  resultsEl.innerHTML = '<div class="cai-loading"><div class="cai-spinner"></div> Searching\u2026</div>';

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
  } else if (currentMode === 'lexical') {
    try {
      const resp = await fetch(`${host}/bin/caid/lexicalsearch`, {
        ...fetchOpts,
        body: JSON.stringify({ query, timestamp }),
      });
      const data = await resp.json();
      if (data.error) {
        resultsEl.innerHTML = `<div class="cai-error">${data.error}</div>`;
      } else {
        renderSearchResults(resultsEl, data, currentMode, query);
      }
    } catch (e) {
      resultsEl.innerHTML = `<div class="cai-error">Search failed: ${e.message}</div>`;
    }
  } else {
    try {
      const resp = await fetch(`${host}/bin/caid/semanticsearch`, {
        ...fetchOpts,
        body: JSON.stringify({ query, timestamp }),
      });
      const data = await resp.json();
      if (data.error) {
        resultsEl.innerHTML = `<div class="cai-error">${data.error}</div>`;
      } else {
        renderSearchResults(resultsEl, data, currentMode, query);
      }
    } catch (e) {
      resultsEl.innerHTML = `<div class="cai-error">Search failed: ${e.message}</div>`;
    }
  }
}

function buildIntentChip(intent, inputEl, resultsEl, index) {
  const chip = document.createElement('div');
  chip.className = 'cai-intent-chip';

  const badge = document.createElement('span');
  badge.className = 'cai-intent-badge';
  badge.textContent = index;

  const face = document.createElement('div');
  face.className = 'cai-intent-face';

  const text = document.createElement('span');
  text.className = 'cai-intent-text';
  text.textContent = intent.text || 'Click to set a query';

  if (!intent.text) text.classList.add('cai-intent-empty');

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'cai-intent-edit';
  editBtn.style.backgroundImage = `url(${window.hlx.codeBasePath}/blocks/search-input/edit-pencil.png)`;
  editBtn.setAttribute('aria-label', 'Edit query');

  const editInput = document.createElement('input');
  editInput.type = 'text';
  editInput.className = 'cai-intent-input';
  editInput.value = intent.text;
  editInput.placeholder = 'Type a query\u2026';

  face.append(text, editBtn);
  chip.append(badge, face, editInput);

  // Click face to search
  face.addEventListener('click', (e) => {
    if (editBtn.contains(e.target)) return;
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
    text.textContent = val || 'Click to set a query';
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

  // Mode toggle (inline in search bar)
  const modeToggle = document.createElement('div');
  modeToggle.className = 'cai-mode-toggle';

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
      // Auto-search if query exists
      const q = inputEl.value.trim();
      if (q) performSearch(q, resultsEl);
    });
    modeToggle.append(btn);
  });

  // Example queries
  const exSection = document.createElement('div');
  exSection.className = 'cai-examples-section';

  const exLabel = document.createElement('div');
  exLabel.className = 'cai-section-label';
  exLabel.textContent = 'Example Queries. Click box to search, \ud83d\udd8a\ufe0f to personalize.';

  const exRow = document.createElement('div');
  exRow.className = 'cai-intents-grid';

  const intents = DEFAULT_INTENTS.map((i) => ({ ...i }));
  intents.forEach((intent, idx) => {
    exRow.append(buildIntentChip(intent, inputEl, resultsEl, idx + 1));
  });

  exSection.append(exLabel, exRow);

  // Search box with input and search icon
  const searchBox = document.createElement('div');
  searchBox.className = 'cai-search-box';

  const searchIcon = document.createElement('button');
  searchIcon.type = 'button';
  searchIcon.className = 'cai-search-icon-btn';
  searchIcon.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';

  const onSearch = () => {
    const q = inputEl.value.trim();
    if (q) performSearch(q, resultsEl);
  };

  searchIcon.addEventListener('click', onSearch);
  inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') onSearch(); });

  searchBox.append(inputEl, searchIcon);

  // Mode selector row below search box
  const modeRow = document.createElement('div');
  modeRow.className = 'cai-mode-row';

  const modeLabel = document.createElement('span');
  modeLabel.className = 'cai-mode-label';
  modeLabel.textContent = 'Select Search Mode';

  modeRow.append(modeLabel, modeToggle);

  block.append(exSection, searchBox, modeRow, resultsEl);
}
