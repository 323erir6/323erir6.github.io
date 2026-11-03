const langSwitch = document.getElementById('langSwitch');
const translatable = document.querySelectorAll('[data-uk][data-en]');

function safeStorageGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
function safeStorageSet(key, value) { try { localStorage.setItem(key, value); } catch {} }

function setLanguage(lang) {
  document.documentElement.lang = lang;
  translatable.forEach((el) => {
    el.textContent = el.dataset[lang];
  });
  langSwitch.textContent = lang === 'uk' ? 'EN' : 'UA';
  safeStorageSet('oneone-language', lang);
}

const savedLanguage = safeStorageGet('oneone-language');
setLanguage(savedLanguage === 'en' ? 'en' : 'uk');

langSwitch.addEventListener('click', () => {
  setLanguage(document.documentElement.lang === 'uk' ? 'en' : 'uk');
  syncThemeLabel();
});


/* Fully themed listbox; native <select> popups cannot be animated reliably. */
const themePicker = document.getElementById('themePicker');
const themeTrigger = document.getElementById('themeTrigger');
const themeMenu = document.getElementById('themeMenu');
const themeCurrent = document.getElementById('themeCurrent');
const themeOptions = [...document.querySelectorAll('[data-theme-value]')];
const themeMeta = document.querySelector('meta[name="theme-color"]');
const themeColors = Object.freeze({
  oneone: '#090909',
  light: '#f6f8f6',
  apex: '#080a08',
  nova: '#f4efe7',
  barber: '#0d1012'
});

function syncThemeLabel() {
  const value = document.documentElement.dataset.theme || 'oneone';
  const active = themeOptions.find(option => option.dataset.themeValue === value);
  const text = active?.querySelector('span:last-child');
  if (themeCurrent) themeCurrent.textContent = text?.textContent?.trim() || 'OneOne';
  for (const option of themeOptions) {
    option.setAttribute('aria-selected', String(option === active));
  }
}

function setTheme(theme) {
  const selectedTheme = Object.hasOwn(themeColors, theme) ? theme : 'oneone';
  document.documentElement.dataset.theme = selectedTheme;
  if (themeMeta) themeMeta.setAttribute('content', themeColors[selectedTheme]);
  safeStorageSet('oneone-theme', selectedTheme);
  syncThemeLabel();
}

function openThemeMenu() {
  if (!themePicker || !themeTrigger) return;
  themePicker.classList.add('is-open');
  themeTrigger.setAttribute('aria-expanded', 'true');
  const selected = themeOptions.find(o => o.getAttribute('aria-selected') === 'true');
  (selected || themeOptions[0])?.focus();
}

function closeThemeMenu(restoreFocus = false) {
  if (!themePicker || !themeTrigger) return;
  themePicker.classList.remove('is-open');
  themeTrigger.setAttribute('aria-expanded', 'false');
  if (restoreFocus) themeTrigger.focus();
}

function chooseTheme(value) {
  setTheme(value);
  closeThemeMenu(true);
}

themeTrigger?.addEventListener('click', () => {
  if (themePicker.classList.contains('is-open')) closeThemeMenu(true);
  else openThemeMenu();
});

themeTrigger?.addEventListener('keydown', event => {
  if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
    event.preventDefault();
    if (!themePicker.classList.contains('is-open')) openThemeMenu();
    else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      themeMenu.dispatchEvent(new KeyboardEvent('keydown', {
        key: event.key,
        bubbles: true
      }));
    }
  } else if (event.key === 'Escape') {
    closeThemeMenu(true);
  }
});

themeOptions.forEach(option => {
  option.addEventListener('click', () => chooseTheme(option.dataset.themeValue));
});

themeMenu?.addEventListener('keydown', event => {
  const currentIndex = themeOptions.indexOf(document.activeElement);
  if (event.key === 'Escape') {
    event.preventDefault();
    closeThemeMenu(true);
    return;
  }
  if (event.key === 'Tab') {
    closeThemeMenu();
    return;
  }
  let nextIndex = -1;
  if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % themeOptions.length;
  if (event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + themeOptions.length) % themeOptions.length;
  if (event.key === 'Home') nextIndex = 0;
  if (event.key === 'End') nextIndex = themeOptions.length - 1;
  if (nextIndex >= 0) {
    event.preventDefault();
    themeOptions[nextIndex].focus();
  }
});

document.addEventListener('pointerdown', event => {
  if (themePicker && !themePicker.contains(event.target)) closeThemeMenu();
});
themePicker?.addEventListener('focusout', event => {
  if (!themePicker.contains(event.relatedTarget)) closeThemeMenu();
});

setTheme(document.documentElement.dataset.theme || 'oneone');

window.addEventListener('storage', event => {
  if (event.key === 'oneone-theme') setTheme(event.newValue || 'oneone');
});

function setupInfiniteMarquee(containerSelector, trackSelector, groupSelector, speed = 52) {
  const container = document.querySelector(containerSelector);
  const track = document.querySelector(trackSelector);
  const sourceGroup = track?.querySelector(groupSelector);
  if (!container || !track || !sourceGroup) return;

  let animation = null;
  let resizeFrame = null;

  const build = () => {
    animation?.cancel();
    track.style.transform = 'translate3d(0,0,0)';
    track.querySelectorAll(`${groupSelector}[data-marquee-clone]`).forEach(node => node.remove());

    const groupWidth = sourceGroup.getBoundingClientRect().width;
    const viewportWidth = container.getBoundingClientRect().width;
    if (!groupWidth || !viewportWidth) return;

    // Keep enough identical groups on the track to cover the viewport even
    // while the whole track is shifted by one complete group width.
    const requiredWidth = viewportWidth + groupWidth;
    while (track.scrollWidth < requiredWidth) {
      const clone = sourceGroup.cloneNode(true);
      clone.dataset.marqueeClone = 'true';
      clone.setAttribute('aria-hidden', 'true');
      track.appendChild(clone);
    }

    // Add one safety copy so fractional pixels or zoom never reveal an edge.
    const safetyClone = sourceGroup.cloneNode(true);
    safetyClone.dataset.marqueeClone = 'true';
    safetyClone.setAttribute('aria-hidden', 'true');
    track.appendChild(safetyClone);

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    animation = track.animate(
      [
        { transform: 'translate3d(0,0,0)' },
        { transform: `translate3d(-${groupWidth}px,0,0)` }
      ],
      {
        duration: Math.max(1, (groupWidth / speed) * 1000),
        iterations: Infinity,
        easing: 'linear'
      }
    );
  };

  if (document.fonts?.ready) document.fonts.ready.then(build);
  else build();
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(build);
  });
}

setupInfiniteMarquee('.ticker', '.ticker-track', '.ticker-group', 52);
