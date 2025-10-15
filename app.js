const CONFIG = {
  API_BASE_URL: "https://REPLACE_ME.api",
  DEMO_MODE: true,
  POLL_INTERVAL_MS: 2000,
  MAX_POLL_MINUTES: 20,
  ACCENT: "#7C83FF"
};

const state = {
  demoMode: CONFIG.DEMO_MODE,
  polling: new Map(),
  demoScripts: new Map(),
  logPaused: new Set(),
  recentJobs: loadRecentJobs(),
  currentTab: 'jwst',
  resultsBase: [],
  resultsIndex: 0
};

const endpoints = {
  jwst: 'jwst-nircam',
  eso: 'eso-vlt-params',
  alma: 'alma-moments'
};

let revealObserver;
let resultsObserver;
let parallaxRaf = null;
const reduceMotionQuery = typeof window !== 'undefined' && 'matchMedia' in window
  ? window.matchMedia('(prefers-reduced-motion: reduce)')
  : null;

document.addEventListener('DOMContentLoaded', init);

function init() {
  document.getElementById('current-year').textContent = new Date().getFullYear();
  setupNav();
  setupTabs();
  setupDemoToggle();
  setupForms();
  setupAISection();
  setupContactForm();
  setupParallax();
  setupScrollTopButton();
  setupScrollProgress();
  setupRevealAnimations();
  hydrateRecentJobs();
  loadSelectedResults();
}

function setupNav() {
  const menuToggle = document.getElementById('menu-toggle');
  const mobileNav = document.getElementById('mobile-nav');
  if (!menuToggle || !mobileNav) return;
  menuToggle.addEventListener('click', () => {
    const expanded = menuToggle.getAttribute('aria-expanded') === 'true';
    menuToggle.setAttribute('aria-expanded', String(!expanded));
    mobileNav.hidden = expanded;
  });

  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', evt => {
      const targetId = anchor.getAttribute('href').slice(1);
      const section = document.getElementById(targetId);
      if (section) {
        evt.preventDefault();
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        closeMobileNav();
      }
    });
  });

  function closeMobileNav() {
    mobileNav.hidden = true;
    menuToggle.setAttribute('aria-expanded', 'false');
  }
}

function setupTabs() {
  const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
  const panels = Array.from(document.querySelectorAll('[role="tabpanel"]'));
  tabs.forEach(tab => {
    tab.addEventListener('click', () => activateTab(tab.id));
    tab.addEventListener('keydown', event => handleTabKeyboard(event, tabs));
  });

  function activateTab(tabId) {
    tabs.forEach(tab => {
      const selected = tab.id === tabId;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    panels.forEach(panel => {
      panel.hidden = panel.getAttribute('aria-labelledby') !== tabId;
    });
    state.currentTab = tabId.replace('tab-', '');
  }

  activateTab('tab-jwst');
}

function handleTabKeyboard(event, tabs) {
  const idx = tabs.indexOf(event.currentTarget);
  if (idx < 0) return;
  if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
  }
  if (event.key === 'ArrowRight') {
    tabs[(idx + 1) % tabs.length].focus();
    tabs[(idx + 1) % tabs.length].click();
  } else if (event.key === 'ArrowLeft') {
    tabs[(idx - 1 + tabs.length) % tabs.length].focus();
    tabs[(idx - 1 + tabs.length) % tabs.length].click();
  } else if (event.key === 'Home') {
    tabs[0].focus();
    tabs[0].click();
  } else if (event.key === 'End') {
    tabs[tabs.length - 1].focus();
    tabs[tabs.length - 1].click();
  }
}

function setupDemoToggle() {
  const toggle = document.getElementById('demo-mode-toggle');
  if (!toggle) return;
  toggle.checked = state.demoMode;
  toggle.addEventListener('change', () => {
    state.demoMode = toggle.checked;
    showToast(state.demoMode ? 'Demo mode enabled' : 'Demo mode disabled', 'info');
  });
}

function setupForms() {
  const formMap = {
    jwst: document.getElementById('form-jwst'),
    eso: document.getElementById('form-eso'),
    alma: document.getElementById('form-alma')
  };

  Object.entries(formMap).forEach(([app, form]) => {
    if (!form) return;
    form.addEventListener('submit', event => {
      event.preventDefault();
      const payload = formToJSON(new FormData(form));
      if (!validateForm(form)) {
        showToast('Please complete required fields.', 'error');
        return;
      }
      submitJob(app, payload, form);
    });
  });
}

function setupAISection() {
  document.querySelectorAll('.copy-prompt').forEach(button => {
    button.addEventListener('click', async () => {
      const prompt = button.dataset.prompt || '';
      try {
        await navigator.clipboard.writeText(prompt);
        showToast('Prompt copied to clipboard.', 'success');
      } catch (err) {
        console.error(err);
        showToast('Clipboard copy failed. Select manually.', 'error');
      }
    });
  });
}

function setupContactForm() {
  const form = document.getElementById('contact-form');
  if (!form) return;
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!validateForm(form)) {
      showToast('Fill in your name, email, and message.', 'error');
      return;
    }
    if (state.demoMode) {
      form.reset();
      showToast('Contact message queued (demo).', 'success');
    } else {
      showToast('Contact endpoint not configured.', 'error');
    }
  });
}

function setupParallax() {
  const hero = document.getElementById('hero');
  if (!hero || (reduceMotionQuery && reduceMotionQuery.matches)) return;
  const bg = hero.querySelector('.parallax-bg');
  const heroCard = hero.querySelector('.hero-card');
  if (!bg) return;

  const update = () => {
    const rect = hero.getBoundingClientRect();
    const progress = Math.min(1, Math.max(0, -rect.top / Math.max(rect.height, 1)));
    bg.style.transform = `translate3d(0, ${progress * 120}px, 0) scale(${1.05 + progress * 0.08})`;
    if (heroCard) {
      heroCard.style.transform = `translate3d(0, ${progress * 24}px, 0)`;
    }
    parallaxRaf = null;
  };

  const onScroll = () => {
    if (parallaxRaf !== null) return;
    parallaxRaf = window.requestAnimationFrame(update);
  };

  update();
  window.addEventListener('scroll', onScroll, { passive: true });
}

function setupScrollTopButton() {
  const button = document.getElementById('scroll-top');
  if (!button) return;
  const toggle = () => {
    if (window.scrollY > 360) {
      button.classList.add('visible');
    } else {
      button.classList.remove('visible');
    }
  };
  button.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  toggle();
  window.addEventListener('scroll', toggle, { passive: true });
}

function setupScrollProgress() {
  if (reduceMotionQuery && reduceMotionQuery.matches) {
    const bar = document.querySelector('.scroll-progress');
    if (bar) bar.style.display = 'none';
    return;
  }
  const update = () => updateScrollProgress();
  update();
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
}

function setupRevealAnimations() {
  const elements = document.querySelectorAll('[data-reveal]');
  if (!elements.length) return;
  if (reduceMotionQuery && reduceMotionQuery.matches) {
    elements.forEach(el => {
      el.classList.add('reveal', 'in-view', 'reveal-initialized');
    });
    return;
  }
  if (!('IntersectionObserver' in window)) {
    elements.forEach(el => {
      el.classList.add('reveal', 'in-view', 'reveal-initialized');
    });
    return;
  }
  revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.2, rootMargin: '0px 0px -10% 0px' });
  elements.forEach(stageRevealElement);
}

function stageRevealElement(el) {
  if (!el || el.classList.contains('reveal-initialized')) return;
  el.classList.add('reveal', 'reveal-initialized');
  if (!revealObserver || (reduceMotionQuery && reduceMotionQuery.matches)) {
    el.classList.add('in-view');
    return;
  }
  revealObserver.observe(el);
}

async function submitJob(app, payload, form) {
  setSubmitting(form, true);
  const endpoint = endpoints[app];
  const statusEl = document.querySelector(`.job-status[data-app="${app}"]`);
  renderJobStatus(statusEl, { status: 'Queued' });
  try {
    const response = await api.postJob(app, endpoint, payload);
    showToast(`Job ${response.jobId} submitted.`, 'success');
    renderJobStatus(statusEl, response.initialStatus || { jobId: response.jobId, status: 'Queued' });
    startPolling(app, response.jobId, statusEl);
    form.reset();
  } catch (err) {
    console.error(err);
    showToast(`Failed to submit job: ${err.message}`, 'error');
    renderJobStatus(statusEl, { status: 'Failed', error: err.message });
  } finally {
    setSubmitting(form, false);
  }
}

function startPolling(app, jobId, statusEl) {
  stopPolling(jobId);
  const maxPolls = (CONFIG.MAX_POLL_MINUTES * 60 * 1000) / CONFIG.POLL_INTERVAL_MS;
  let polls = 0;
  const interval = setInterval(async () => {
    polls += 1;
    if (polls > maxPolls) {
      showToast(`Job ${jobId} polling timeout.`, 'error');
      stopPolling(jobId);
      return;
    }
    try {
      const job = await api.getJob(app, jobId);
      renderJobStatus(statusEl, job);
      if (['Succeeded', 'Failed'].includes(job.status)) {
        stopPolling(jobId);
        persistRecentJob(job, app);
        hydrateRecentJobs();
        if (job.public) {
          appendSelectedResult(job, app);
        }
      }
    } catch (err) {
      console.error(err);
      showToast(`Polling error: ${err.message}`, 'error');
      stopPolling(jobId);
    }
  }, CONFIG.POLL_INTERVAL_MS);
  state.polling.set(jobId, interval);
}

function stopPolling(jobId) {
  if (state.polling.has(jobId)) {
    clearInterval(state.polling.get(jobId));
    state.polling.delete(jobId);
  }
}

const api = {
  async postJob(app, endpoint, payload) {
    if (state.demoMode) {
      return demo.postJob(app, payload);
    }
    const res = await fetch(`${CONFIG.API_BASE_URL}/jobs/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    return { jobId: data.jobId };
  },
  async getJob(app, jobId) {
    if (state.demoMode) {
      return demo.getJob(app, jobId);
    }
    const res = await fetch(`${CONFIG.API_BASE_URL}/jobs/${jobId}`);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return res.json();
  }
};

const demo = {
  async postJob(app, payload) {
    const jobId = `${app}-${Date.now()}`;
    const running = await loadMock(`${app}-running.json`);
    const outcomeChance = Math.random();
    const success = await loadMock(`${app}-success.json`);
    const failure = await loadMock(`${app}-failed.json`).catch(() => null);
    const script = [];
    script.push(withJobDefaults(running, jobId));
    if (outcomeChance > 0.2 && success) {
      script.push(withJobDefaults(success, jobId));
    } else if (failure) {
      script.push(withJobDefaults(failure, jobId));
    }
    state.demoScripts.set(jobId, {
      app,
      payload,
      pollCount: 0,
      script
    });
    return { jobId, initialStatus: script[0] };
  },
  async getJob(app, jobId) {
    const info = state.demoScripts.get(jobId);
    if (!info) {
      // fallback to success sample
      return loadMock(`${app}-success.json`).then(data => withJobDefaults(data, jobId));
    }
    info.pollCount += 1;
    const idx = info.pollCount >= 3 && info.script[1] ? 1 : 0;
    const entry = info.script[Math.min(idx, info.script.length - 1)];
    if (entry.status === 'Succeeded' || entry.status === 'Failed') {
      entry.completedAt = entry.completedAt || new Date().toISOString();
    }
    entry.updatedAt = new Date().toISOString();
    return entry;
  }
};

async function loadMock(filename) {
  const res = await fetch(`mock-data/${filename}`);
  if (!res.ok) throw new Error(`Missing mock ${filename}`);
  return res.json();
}

function withJobDefaults(job, jobId) {
  return {
    jobId,
    status: job.status || 'Running',
    startedAt: job.startedAt || new Date(Date.now() - 90_000).toISOString(),
    updatedAt: job.updatedAt || new Date().toISOString(),
    logs: job.logs || 'Bootstrapping pipeline...\nPulling calibration reference files...',
    artifacts: job.artifacts || [],
    public: Boolean(job.public),
    report: job.report || null,
    summary: job.summary || null
  };
}

function renderJobStatus(container, job) {
  if (!container) return;
  container.innerHTML = '';
  if (!job) {
    container.innerHTML = '<p>No job activity yet. Submit a job to view status.</p>';
    return;
  }

  const statusClass = getStatusClass(job.status);
  const statusPill = document.createElement('span');
  statusPill.className = `status-pill ${statusClass}`;
  statusPill.textContent = job.status || 'Unknown';

  const meta = document.createElement('div');
  meta.className = 'job-meta';
  meta.innerHTML = [
    job.jobId ? `<strong>Job ID:</strong> ${job.jobId}` : '',
    `<strong>Started:</strong> ${formatDate(job.startedAt)}`,
    `<strong>Updated:</strong> ${formatDate(job.updatedAt)}`,
    `<strong>Runtime:</strong> ${formatRuntime(job.startedAt, job.updatedAt)}`
  ].filter(Boolean).join('<br>');

  const statusHeader = document.createElement('div');
  statusHeader.append(statusPill);
  container.append(statusHeader, meta);

  const logActions = document.createElement('div');
  logActions.className = 'log-actions';
  const logTitle = document.createElement('h4');
  logTitle.textContent = 'Logs';
  const pauseBtn = document.createElement('button');
  pauseBtn.type = 'button';
  pauseBtn.className = 'btn ghost';
  pauseBtn.textContent = state.logPaused.has(job.jobId) ? 'Resume' : 'Pause';
  pauseBtn.addEventListener('click', () => {
    if (state.logPaused.has(job.jobId)) {
      state.logPaused.delete(job.jobId);
      pauseBtn.textContent = 'Pause';
      logViewer.classList.remove('paused');
    } else {
      state.logPaused.add(job.jobId);
      pauseBtn.textContent = 'Resume';
      logViewer.classList.add('paused');
    }
  });
  logActions.append(logTitle, pauseBtn);

  const logViewer = document.createElement('pre');
  logViewer.className = 'log-viewer';
  logViewer.innerHTML = ansiToHtml(job.logs || '');

  if (!state.logPaused.has(job.jobId)) {
    logViewer.scrollTop = logViewer.scrollHeight;
  }

  const artifacts = document.createElement('div');
  artifacts.className = 'artifact-grid';
  const artifactsTitle = document.createElement('h4');
  artifactsTitle.textContent = 'Artifacts';

  if (Array.isArray(job.artifacts) && job.artifacts.length) {
    job.artifacts.forEach(item => {
      const card = document.createElement('article');
      card.className = 'artifact-card';
      card.setAttribute('data-reveal', '');
      const name = document.createElement('h4');
      name.textContent = item.name;
      const metaText = document.createElement('p');
      metaText.className = 'artifact-meta';
      metaText.textContent = `${item.type || 'file'} · ${formatBytes(item.size)}`;
      const actions = document.createElement('div');
      const download = document.createElement('a');
      download.href = item.url;
      download.target = '_blank';
      download.rel = 'noopener';
      download.className = 'btn outline';
      download.innerHTML = `<svg aria-hidden="true" width="16" height="16"><use href="#icon-download"></use></svg>Download`;
      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'btn ghost';
      copyBtn.innerHTML = `<svg aria-hidden="true" width="16" height="16"><use href="#icon-copy"></use></svg>Copy link`;
      copyBtn.addEventListener('click', () => copyToClipboard(item.url));
      actions.className = 'cta-row';
      actions.append(download, copyBtn);
      card.append(name, metaText, actions);
      artifacts.append(card);
      stageRevealElement(card);
    });
  } else {
    const empty = document.createElement('p');
    empty.className = 'artifact-meta';
    empty.textContent = 'Artifacts will appear once the job completes.';
    artifacts.append(empty);
  }

  container.append(logActions, logViewer, artifactsTitle, artifacts);
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast('Link copied.', 'success');
  }).catch(err => {
    console.error(err);
    showToast('Copy failed.', 'error');
  });
}

function ansiToHtml(log) {
  if (!log) return '';
  return log
    .replace(/\u001b\[[0-9;]*m/g, ansi => {
      const code = ansi.replace(/\u001b\[|m/g, '');
      if (code === '0') return '</span>';
      const color = {
        '31': '#f87171',
        '32': '#38f59b',
        '33': '#facc15',
        '34': '#7c83ff',
        '35': '#f472b6',
        '36': '#67e8f9'
      }[code];
      return color ? `<span style="color:${color}">` : '';
    })
    .replace(/\n/g, '\n');
}

function validateForm(form) {
  return Array.from(form.elements).every(el => {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
      if (el.hasAttribute('required')) {
        return Boolean(el.value.trim());
      }
    }
    return true;
  });
}

function formToJSON(formData) {
  const data = {};
  formData.forEach((value, key) => {
    data[key] = value;
  });
  return data;
}

function setSubmitting(form, isSubmitting) {
  const button = form.querySelector('button[type="submit"]');
  if (button) {
    button.disabled = isSubmitting;
    button.textContent = isSubmitting ? 'Submitting…' : 'Submit Job';
  }
}

function getStatusClass(status = '') {
  if (/success/i.test(status)) return 'success';
  if (/fail|error/i.test(status)) return 'failed';
  if (/queue|run|progress/i.test(status)) return 'running';
  return '';
}

function formatDate(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch (err) {
    return value;
  }
}

function formatRuntime(start, end) {
  if (!start) return '—';
  const startDate = new Date(start);
  const endDate = end ? new Date(end) : new Date();
  const diff = Math.max(0, endDate - startDate);
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function formatBytes(bytes) {
  if (!bytes) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, idx)).toFixed(1)} ${units[idx]}`;
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.dataset.type = type;
  toast.innerHTML = `<span>${message}</span>`;
  const close = document.createElement('button');
  close.type = 'button';
  close.setAttribute('aria-label', 'Dismiss notification');
  close.textContent = '×';
  close.addEventListener('click', () => container.removeChild(toast));
  toast.append(close);
  container.append(toast);
  setTimeout(() => {
    if (container.contains(toast)) {
      toast.classList.add('hidden');
      setTimeout(() => container.contains(toast) && container.removeChild(toast), 300);
    }
  }, 5000);
}

function loadRecentJobs() {
  try {
    const stored = JSON.parse(localStorage.getItem('aas_recent_jobs') || '[]');
    return Array.isArray(stored) ? stored : [];
  } catch (err) {
    console.warn('Failed to read recent jobs', err);
    return [];
  }
}

function persistRecentJob(job, app) {
  const entry = {
    jobId: job.jobId,
    app,
    status: job.status,
    updatedAt: job.updatedAt,
    artifacts: job.artifacts,
    report: job.report,
    public: job.public,
    summary: job.summary || job.report?.summary || null
  };
  state.recentJobs = [entry, ...state.recentJobs.filter(item => item.jobId !== job.jobId)].slice(0, 12);
  localStorage.setItem('aas_recent_jobs', JSON.stringify(state.recentJobs));
}

function hydrateRecentJobs() {
  const host = document.getElementById('recent-jobs');
  if (!host) return;
  host.innerHTML = '';
  if (!state.recentJobs.length) {
    host.innerHTML = '<p>No jobs yet. Submit a job to populate recent activity.</p>';
    return;
  }
  state.recentJobs.forEach(job => {
    const card = document.createElement('article');
    card.className = 'job-card';
    card.setAttribute('data-reveal', '');
    const title = document.createElement('h4');
    title.textContent = `${labelForApp(job.app)} · ${job.status}`;
    const meta = document.createElement('p');
    meta.className = 'artifact-meta';
    meta.textContent = `Job ${job.jobId} · ${formatDate(job.updatedAt)}`;
    card.append(title, meta);
    if (job.summary) {
      const summary = document.createElement('p');
      summary.textContent = job.summary;
      card.append(summary);
    }
    if (Array.isArray(job.artifacts) && job.artifacts.length) {
      const list = document.createElement('ul');
      job.artifacts.slice(0, 3).forEach(item => {
        const li = document.createElement('li');
        li.textContent = `${item.name} (${item.type || 'file'})`;
        list.append(li);
      });
      card.append(list);
    }
    host.append(card);
    stageRevealElement(card);
  });
}

function labelForApp(app) {
  return {
    jwst: 'JWST NIRCam',
    eso: 'ESO VLT',
    alma: 'ALMA Moments'
  }[app] || app;
}

async function loadSelectedResults() {
  const grid = document.getElementById('result-grid');
  const sentinel = document.getElementById('results-sentinel');
  if (!grid) return;
  grid.innerHTML = '';
  if (resultsObserver) {
    resultsObserver.disconnect();
    resultsObserver = null;
  }
  state.resultsBase = [];
  state.resultsIndex = 0;
  const apps = ['jwst', 'eso', 'alma'];
  for (const app of apps) {
    try {
      const manifest = await loadMock(`${app}-success.json`);
      if (manifest.public) {
        state.resultsBase.push({ app, ...manifest });
      }
    } catch (err) {
      console.warn('Missing result manifest for', app);
    }
  }
  if (!state.resultsBase.length) {
    grid.innerHTML = '<p class="artifact-meta">No public results published yet.</p>';
    if (sentinel) sentinel.hidden = true;
    updateScrollProgress();
    return;
  }
  if (sentinel) sentinel.hidden = false;
  renderResultsBatch(4);
  setupInfiniteResults();
}

function setupInfiniteResults() {
  const sentinel = document.getElementById('results-sentinel');
  if (!sentinel || !state.resultsBase.length) return;
  if (!('IntersectionObserver' in window)) {
    // Fallback: load several batches at once.
    renderResultsBatch(6);
    return;
  }
  if (resultsObserver) {
    resultsObserver.disconnect();
  }
  resultsObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        resultsObserver.unobserve(entry.target);
        renderResultsBatch();
        requestAnimationFrame(() => resultsObserver && resultsObserver.observe(entry.target));
      }
    });
  }, { rootMargin: '160px' });
  resultsObserver.observe(sentinel);
}

function renderResultsBatch(batchSize = 3) {
  const grid = document.getElementById('result-grid');
  if (!grid || !state.resultsBase.length) return;
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < batchSize; i += 1) {
    const result = composeResultVariant(state.resultsIndex);
    if (!result) break;
    state.resultsIndex += 1;
    const card = buildResultCard(result);
    fragment.append(card);
  }
  grid.append(fragment);
  updateScrollProgress();
}

function composeResultVariant(index) {
  if (!state.resultsBase.length) return null;
  const base = state.resultsBase[index % state.resultsBase.length];
  if (!base) return null;
  const cycle = Math.floor(index / state.resultsBase.length) + 1;
  const timestamp = base.updatedAt || base.completedAt || new Date().toISOString();
  const summary = base.summary || base.report?.summary || 'Result published from automation studio.';
  return {
    ...base,
    jobId: `${base.jobId || `${base.app}-result`}-${index + 1}`,
    summary: cycle > 1 ? `${summary} · iteration ${cycle}` : summary,
    status: base.status || 'Succeeded',
    releasedAt: timestamp
  };
}

function buildResultCard(job) {
  const card = document.createElement('article');
  card.className = 'result-card';
  card.setAttribute('data-reveal', '');
  const title = document.createElement('h3');
  title.textContent = `${labelForApp(job.app)} · ${job.status || 'Result'}`;
  const summary = document.createElement('p');
  summary.textContent = job.summary || job.report?.summary || 'Result published from automation studio.';
  const tech = document.createElement('p');
  tech.className = 'artifact-meta';
  const artifactPreview = Array.isArray(job.artifacts) ? job.artifacts.map(a => a.name).slice(0, 3).join(', ') : '—';
  tech.textContent = `Artifacts: ${artifactPreview}`;
  const links = document.createElement('div');
  links.className = 'cta-row';
  if (Array.isArray(job.artifacts)) {
    job.artifacts.slice(0, 3).forEach(item => {
      const link = document.createElement('a');
      link.href = item.url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.className = 'btn outline';
      link.textContent = item.name;
      links.append(link);
    });
  }
  card.append(title, summary, tech, links);
  stageRevealElement(card);
  return card;
}

function appendSelectedResult(job, app) {
  if (!job.public) return;
  const grid = document.getElementById('result-grid');
  if (!grid) return;
  state.resultsBase = [{ app, ...job }, ...state.resultsBase];
  const card = buildResultCard({ ...job, app });
  grid.prepend(card);
  updateScrollProgress();
}

function updateScrollProgress() {
  const bar = document.querySelector('.scroll-progress__bar');
  if (!bar) return;
  const doc = document.documentElement;
  const scrollTop = window.scrollY || doc.scrollTop || 0;
  const maxScroll = doc.scrollHeight - window.innerHeight;
  const progress = maxScroll > 0 ? Math.min(1, scrollTop / maxScroll) : 0;
  bar.style.transform = `scaleX(${progress})`;
}
