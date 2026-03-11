const DEFAULT_COLOR_DARK = '#750000';
const DEFAULT_COLOR_LIGHT = '#FF5C5C';
const STYLE_ID = 'gca-blink-style';

// Detect Google Chat theme by walking up the DOM tree to find a solid background.
// Skips elements styled by us (inline bg or gca-blink class) to avoid false reads.
function detectTheme() {
  const target = document.querySelector('[jsname="K0co3b"][role="region"]');
  let el = target || document.body;
  while (el) {
    if (el === target && el.style.backgroundColor) {
      el = el.parentElement;
      continue;
    }
    if (el.classList && el.classList.contains('gca-blink')) {
      el = el.parentElement;
      continue;
    }
    const bg = getComputedStyle(el).backgroundColor;
    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
      const match = bg.match(/\d+/g);
      if (match) {
        const [r, g, b] = match.map(Number);
        const luminance = (r * 299 + g * 587 + b * 114) / 1000;
        return luminance > 128 ? 'light' : 'dark';
      }
    }
    el = el.parentElement;
  }
  return 'dark';
}

let currentTheme = 'dark';
let enabled = true;
let alertColorDark = DEFAULT_COLOR_DARK;
let alertColorLight = DEFAULT_COLOR_LIGHT;
let previewColor = null;
let blinkEnabled = false;
let alertActive = false;
let removeTimeout = null;

let rulesEnabled = false;
let excludeEnabled = false;
let vipEnabled = false;
let excludeNames = [];
let vipNames = [];

function getAlertColor() {
  if (previewColor) return previewColor;
  return currentTheme === 'light' ? alertColorLight : alertColorDark;
}

// Migrate legacy key alertColor → alertColorDark (v0.1 → v0.2)
chrome.storage.sync.get({ alertColor: null }, (old) => {
  if (old.alertColor) {
    chrome.storage.sync.set({ alertColorDark: old.alertColor });
    chrome.storage.sync.remove('alertColor');
  }
});

// Load settings, then start monitoring
let configLoaded = false;
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
  enabled = data.enabled;
  alertColorDark = data.alertColorDark;
  alertColorLight = data.alertColorLight;
  blinkEnabled = data.blinkEnabled;
  rulesEnabled = data.rulesEnabled;
  excludeEnabled = data.excludeEnabled;
  vipEnabled = data.vipEnabled;
  excludeNames = data.excludeNames;
  vipNames = data.vipNames;
  currentTheme = detectTheme();
  chrome.storage.local.set({ _detectedTheme: currentTheme });
  configLoaded = true;
  check();
});

// Receive live preview color from background (relayed from popup)
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'preview') {
    previewColor = msg.color;
    if (alertActive) applyAlert();
  }
});

// Sync state when user changes settings in the popup
chrome.storage.onChanged.addListener((changes) => {
  if (changes.enabled) {
    enabled = changes.enabled.newValue;
    if (!enabled) removeAlert(); else check();
  }
  if (changes.alertColorDark) {
    alertColorDark = changes.alertColorDark.newValue;
    if (alertActive && currentTheme === 'dark') applyAlert();
  }
  if (changes.alertColorLight) {
    alertColorLight = changes.alertColorLight.newValue;
    if (alertActive && currentTheme === 'light') applyAlert();
  }
  if (changes.blinkEnabled) {
    blinkEnabled = changes.blinkEnabled.newValue;
    if (alertActive) applyAlert();
  }
  if (changes.rulesEnabled) rulesEnabled = changes.rulesEnabled.newValue;
  if (changes.excludeEnabled) excludeEnabled = changes.excludeEnabled.newValue;
  if (changes.vipEnabled) vipEnabled = changes.vipEnabled.newValue;
  if (changes.excludeNames) excludeNames = changes.excludeNames.newValue;
  if (changes.vipNames) vipNames = changes.vipNames.newValue;

  // Re-evaluate alert when rules change
  if (changes.rulesEnabled || changes.excludeEnabled || changes.vipEnabled ||
      changes.excludeNames || changes.vipNames) {
    if (alertActive) {
      if (!shouldAlert()) removeAlert();
    } else {
      check();
    }
  }
});

function getTarget() {
  return document.querySelector('[jsname="K0co3b"][role="region"]');
}

function injectBlinkStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes gca-blink {
      0%, 100% { background-color: var(--gca-color); }
      50% { background-color: transparent; }
    }
    .gca-blink {
      animation: gca-blink 1.5s ease-in-out infinite;
    }
  `;
  document.head.appendChild(style);
}

function applyAlert() {
  const target = getTarget();
  if (!target) return;
  clearTimeout(removeTimeout);
  injectBlinkStyle();

  const color = getAlertColor();
  if (blinkEnabled) {
    target.style.setProperty('--gca-color', color);
    target.style.backgroundColor = '';
    target.classList.add('gca-blink');
  } else {
    target.classList.remove('gca-blink');
    target.style.backgroundColor = color;
  }
  alertActive = true;
}

function removeAlert() {
  const target = getTarget();
  if (target) {
    target.style.backgroundColor = '';
    target.classList.remove('gca-blink');
  }
  alertActive = false;
}

// Extract sender names from unread messages (title + list items)
function getUnreadSenders() {
  const senders = [];

  const titleMatch = document.title.match(/^(.+?)\s+enviou\s+uma\s+mensagem/i) ||
                     document.title.match(/^(.+?)\s+sent\s+you\s+a\s+message/i);
  if (titleMatch) senders.push(titleMatch[1].trim());

  const listItems = document.querySelectorAll('[role="listitem"]');
  for (const item of listItems) {
    const hasUnreadClass = item.classList.contains('H7du2');
    const countBadge = item.querySelector('.SaMfhe');
    const hasCount = countBadge && parseInt(countBadge.textContent) > 0;

    if (hasUnreadClass || hasCount) {
      const nameEl = item.querySelector('.njhDLd');
      if (nameEl) senders.push(nameEl.textContent.trim());
    }
  }

  return [...new Set(senders)];
}

function nameMatches(senderName, ruleNames) {
  const senderLower = senderName.toLowerCase();
  return ruleNames.some(name => senderLower.includes(name.toLowerCase()));
}

function passesRules(senders) {
  if (!rulesEnabled) return true;

  if (excludeEnabled && excludeNames.length > 0) {
    const allExcluded = senders.length > 0 &&
      senders.every(s => nameMatches(s, excludeNames));
    if (allExcluded) return false;
  }

  if (vipEnabled && vipNames.length > 0) {
    const anyVip = senders.some(s => nameMatches(s, vipNames));
    if (!anyVip) return false;
  }

  return true;
}

function hasUnread() {
  const els = document.querySelectorAll('[aria-label]');
  for (const el of els) {
    const label = el.getAttribute('aria-label');
    if (/\d+\s+mensag/i.test(label)) return true;
    if (/\d+\s+unread/i.test(label)) return true;
  }

  if (/\(\d+\)/.test(document.title)) return true;
  if (/enviou uma mensagem|sent you a message/i.test(document.title)) return true;

  return false;
}

function shouldAlert() {
  if (!hasUnread()) return false;
  const senders = getUnreadSenders();
  return passesRules(senders);
}

function isAlertVisible() {
  const target = getTarget();
  if (!target) return false;
  return target.style.backgroundColor !== '' || target.classList.contains('gca-blink');
}

function checkThemeChange() {
  const newTheme = detectTheme();
  if (newTheme !== currentTheme) {
    currentTheme = newTheme;
    chrome.storage.local.set({ _detectedTheme: currentTheme });
    if (alertActive) applyAlert();
  }
}

function check() {
  if (!configLoaded || !enabled) return;

  checkThemeChange();

  const shouldShow = shouldAlert();
  const visible = isAlertVisible();

  if (shouldShow && !visible) {
    clearTimeout(removeTimeout);
    applyAlert();
  } else if (!shouldShow && visible) {
    // Debounce: title may flicker between "Chat" and "X sent you a message"
    if (!removeTimeout) {
      removeTimeout = setTimeout(() => {
        removeTimeout = null;
        if (!shouldAlert()) removeAlert();
      }, 1500);
    }
  } else if (shouldShow && visible) {
    clearTimeout(removeTimeout);
    removeTimeout = null;
  }
}

// Throttle MutationObserver to one check() per animation frame
let checkScheduled = false;
function throttledCheck() {
  if (checkScheduled) return;
  checkScheduled = true;
  requestAnimationFrame(() => {
    checkScheduled = false;
    check();
  });
}

const observer = new MutationObserver(throttledCheck);
observer.observe(document.body, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['aria-label']
});

setInterval(check, 1000);
check();
