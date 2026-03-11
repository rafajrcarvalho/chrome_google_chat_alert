const DEFAULT_COLOR_DARK = '#750000';
const DEFAULT_COLOR_LIGHT = '#FF5C5C';
let currentTheme = 'dark';

const enabledToggle = document.getElementById('enabledToggle');
const tabs = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');
const colorPicker = document.getElementById('colorPicker');
const hexInput = document.getElementById('hexInput');
const preview = document.getElementById('preview');
const blinkToggle = document.getElementById('blinkToggle');
const btnSave = document.getElementById('btnSave');
const btnReset = document.getElementById('btnReset');
const status = document.getElementById('status');
const rulesEnabledToggle = document.getElementById('rulesEnabledToggle');
const excludeToggle = document.getElementById('excludeToggle');
const vipToggle = document.getElementById('vipToggle');
const excludeInput = document.getElementById('excludeInput');
const vipInput = document.getElementById('vipInput');
const btnAddExclude = document.getElementById('btnAddExclude');
const btnAddVip = document.getElementById('btnAddVip');
const excludeList = document.getElementById('excludeList');
const vipList = document.getElementById('vipList');
const excludeSection = document.getElementById('excludeSection');
const vipSection = document.getElementById('vipSection');
const rulesStatus = document.getElementById('rulesStatus');

// --- Tabs ---

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    tabContents.forEach(tc => tc.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
  });
});

// --- Helpers ---

function isValidHex(hex) {
  return /^#[0-9A-Fa-f]{6}$/.test(hex);
}

function getDefaultColor() {
  return currentTheme === 'light' ? DEFAULT_COLOR_LIGHT : DEFAULT_COLOR_DARK;
}

function getColorKey() {
  return currentTheme === 'light' ? 'alertColorLight' : 'alertColorDark';
}

function updatePreview(color) {
  preview.style.backgroundColor = color;
}

function syncFromPicker() {
  const color = colorPicker.value.toUpperCase();
  hexInput.value = color;
  updatePreview(color);
}

function syncFromHex() {
  let val = hexInput.value.trim();
  if (!val.startsWith('#')) val = '#' + val;
  if (isValidHex(val)) {
    colorPicker.value = val.toLowerCase();
    updatePreview(val);
  }
}

function showStatus(el, msg) {
  el.textContent = msg;
  setTimeout(() => { el.textContent = ''; }, 2000);
}

function save(data, statusEl, msg) {
  chrome.storage.sync.set(data, () => {
    if (msg) showStatus(statusEl, msg);
  });
}

// --- Name lists ---

function renderList(listEl, names, storageKey) {
  listEl.innerHTML = '';
  if (names.length === 0) {
    listEl.innerHTML = '<li class="empty-list">Nenhum nome adicionado</li>';
    return;
  }
  names.forEach((name, i) => {
    const li = document.createElement('li');
    li.className = 'name-item';
    const span = document.createElement('span');
    span.className = 'name-text';
    span.textContent = name;
    li.appendChild(span);
    const btn = document.createElement('button');
    btn.className = 'btn-remove';
    btn.textContent = '\u00d7';
    btn.addEventListener('click', () => {
      names.splice(i, 1);
      save({ [storageKey]: names });
      renderList(listEl, names, storageKey);
      showStatus(rulesStatus, 'Nome removido!');
    });
    li.appendChild(btn);
    listEl.appendChild(li);
  });
}

function addName(input, listEl, storageKey, names) {
  const name = input.value.trim();
  if (!name) return;
  if (names.includes(name)) {
    showStatus(rulesStatus, 'Nome já existe!');
    return;
  }
  names.push(name);

  // Auto-enable the corresponding toggle when adding a name
  const extraSave = {};
  if (storageKey === 'excludeNames' && !excludeToggle.checked) {
    excludeToggle.checked = true;
    vipToggle.checked = false;
    extraSave.excludeEnabled = true;
    extraSave.vipEnabled = false;
    updateRuleSections();
  } else if (storageKey === 'vipNames' && !vipToggle.checked) {
    vipToggle.checked = true;
    excludeToggle.checked = false;
    extraSave.vipEnabled = true;
    extraSave.excludeEnabled = false;
    updateRuleSections();
  }

  save({ [storageKey]: names, ...extraSave });
  renderList(listEl, names, storageKey);
  input.value = '';
  showStatus(rulesStatus, 'Nome adicionado!');
}

// --- Mutual exclusion: Exclude <-> VIP ---

function updateRuleSections() {
  const rulesOn = rulesEnabledToggle.checked;
  const excludeOn = excludeToggle.checked;
  const vipOn = vipToggle.checked;

  excludeSection.classList.toggle('disabled', !rulesOn);
  vipSection.classList.toggle('disabled', !rulesOn);

  if (rulesOn) {
    if (excludeOn) {
      vipSection.classList.add('disabled');
    } else if (vipOn) {
      excludeSection.classList.add('disabled');
    }
  }
}

// --- State ---

let savedColor = DEFAULT_COLOR_DARK;
let excludeNames = [];
let vipNames = [];

// --- Load ---

chrome.storage.local.get({ _detectedTheme: 'dark' }, (local) => {
  currentTheme = local._detectedTheme;

  chrome.storage.sync.get({
    enabled: true,
    alertColorDark: DEFAULT_COLOR_DARK,
    alertColorLight: DEFAULT_COLOR_LIGHT,
    blinkEnabled: false,
    rulesEnabled: false,
    excludeEnabled: false,
    vipEnabled: false,
    excludeNames: [],
    vipNames: []
  }, (data) => {
    const color = currentTheme === 'light' ? data.alertColorLight : data.alertColorDark;
    enabledToggle.checked = data.enabled;
    savedColor = color;
    colorPicker.value = color.toLowerCase();
    hexInput.value = color.toUpperCase();
    updatePreview(color);
    blinkToggle.checked = data.blinkEnabled;

    rulesEnabledToggle.checked = data.rulesEnabled;
    excludeToggle.checked = data.excludeEnabled;
    vipToggle.checked = data.vipEnabled;
    excludeNames = data.excludeNames;
    vipNames = data.vipNames;

    renderList(excludeList, excludeNames, 'excludeNames');
    renderList(vipList, vipNames, 'vipNames');
    updateRuleSections();
  });
});

// --- Events: Header ---

enabledToggle.addEventListener('change', () => {
  save({ enabled: enabledToggle.checked }, status,
    enabledToggle.checked ? 'Extensão ativada!' : 'Extensão desativada!');
});

// --- Events: General ---

// Live preview via port to background → content script
const previewPort = chrome.runtime.connect({ name: 'popup-preview' });
let previewTimer = null;
function previewColor(color) {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    previewPort.postMessage({ type: 'preview', color });
  }, 50);
}

colorPicker.addEventListener('input', () => {
  syncFromPicker();
  previewColor(colorPicker.value.toUpperCase());
});

hexInput.addEventListener('input', () => {
  syncFromHex();
  let val = hexInput.value.trim();
  if (!val.startsWith('#')) val = '#' + val;
  if (isValidHex(val)) previewColor(val.toUpperCase());
});

blinkToggle.addEventListener('change', () => {
  save({ blinkEnabled: blinkToggle.checked }, status,
    blinkToggle.checked ? 'Piscar ativado!' : 'Piscar desativado!');
});

btnSave.addEventListener('click', () => {
  let color = hexInput.value.trim().toUpperCase();
  if (!color.startsWith('#')) color = '#' + color;
  if (!isValidHex(color)) {
    showStatus(status, 'Hex inválido! Use #RRGGBB');
    return;
  }
  savedColor = color;
  previewPort.postMessage({ type: 'preview', color: null });
  save({ [getColorKey()]: color, blinkEnabled: blinkToggle.checked }, status, 'Configurações salvas!');
});

btnReset.addEventListener('click', () => {
  const defaultColor = getDefaultColor();
  enabledToggle.checked = true;
  colorPicker.value = defaultColor.toLowerCase();
  hexInput.value = defaultColor;
  updatePreview(defaultColor);
  blinkToggle.checked = false;
  savedColor = defaultColor;
  previewPort.postMessage({ type: 'preview', color: null });
  save({
    enabled: true,
    [getColorKey()]: defaultColor,
    blinkEnabled: false
  }, status, 'Resetado para padrão!');
});

// On popup close, the port disconnects automatically
// and content.js clears previewColor via onDisconnect

// --- Events: Rules ---

rulesEnabledToggle.addEventListener('change', () => {
  updateRuleSections();
  save({ rulesEnabled: rulesEnabledToggle.checked }, rulesStatus,
    rulesEnabledToggle.checked ? 'Regras ativadas!' : 'Regras desativadas!');
});

excludeToggle.addEventListener('change', () => {
  if (excludeToggle.checked) {
    vipToggle.checked = false;
    save({ excludeEnabled: true, vipEnabled: false });
  } else {
    save({ excludeEnabled: false });
  }
  updateRuleSections();
  showStatus(rulesStatus, excludeToggle.checked ? 'Excluir ativado!' : 'Excluir desativado!');
});

vipToggle.addEventListener('change', () => {
  if (vipToggle.checked) {
    excludeToggle.checked = false;
    save({ vipEnabled: true, excludeEnabled: false });
  } else {
    save({ vipEnabled: false });
  }
  updateRuleSections();
  showStatus(rulesStatus, vipToggle.checked ? 'VIP ativado!' : 'VIP desativado!');
});

btnAddExclude.addEventListener('click', () => addName(excludeInput, excludeList, 'excludeNames', excludeNames));
excludeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addName(excludeInput, excludeList, 'excludeNames', excludeNames);
});

btnAddVip.addEventListener('click', () => addName(vipInput, vipList, 'vipNames', vipNames));
vipInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addName(vipInput, vipList, 'vipNames', vipNames);
});
