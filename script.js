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
