const langSwitch = document.getElementById('langSwitch');
const translatable = document.querySelectorAll('[data-uk][data-en]');
const bookingForm = document.getElementById('bookingForm');
const formStatus = document.getElementById('formStatus');

function safeStorageGet(key){ try { return localStorage.getItem(key); } catch { return null; } }
function safeStorageSet(key,value){ try { localStorage.setItem(key,value); } catch {} }


function currentLang() {
  return document.documentElement.lang === 'en' ? 'en' : 'uk';
}

function createDatePicker(root) {
  const input = root.querySelector('input[type="hidden"]');
  const trigger = root.querySelector('.date-trigger');
  const value = root.querySelector('.date-value');
  const popover = root.querySelector('.calendar-popover');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let view = new Date(today.getFullYear(), today.getMonth(), 1);
  let selected = null;
  const names = {
    uk: {months:['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'],days:['Пн','Вт','Ср','Чт','Пт','Сб','Нд'],placeholder:'Оберіть дату',prev:'Попередній місяць',next:'Наступний місяць'},
    en: {months:['January','February','March','April','May','June','July','August','September','October','November','December'],days:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],placeholder:'Choose a date',prev:'Previous month',next:'Next month'}
  };
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  function format() {
    if (!selected) return names[currentLang()].placeholder;
    return new Intl.DateTimeFormat(currentLang()==='uk'?'uk-UA':'en-GB',{day:'numeric',month:'long',year:'numeric'}).format(selected);
  }
  function render() {
    const l = currentLang();
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    const count = new Date(view.getFullYear(), view.getMonth()+1, 0).getDate();
    let grid = names[l].days.map(d => `<span class="calendar-weekday">${d}</span>`).join('');
    for (let i=0; i<offset; i++) grid += '<span class="calendar-empty"></span>';
    for (let day=1; day<=count; day++) {
      const d = new Date(view.getFullYear(), view.getMonth(), day);
      const disabled = d < today;
      const isSelected = selected && iso(d) === iso(selected);
      const isToday = iso(d) === iso(today);
      grid += `<button type="button" class="calendar-day${isSelected?' selected':''}${isToday?' today':''}" data-day="${day}" ${disabled?'disabled':''}>${day}</button>`;
    }
    popover.innerHTML = `<div class="calendar-head"><button type="button" class="calendar-nav prev" aria-label="${names[l].prev}">‹</button><b>${names[l].months[view.getMonth()]} ${view.getFullYear()}</b><button type="button" class="calendar-nav next" aria-label="${names[l].next}">›</button></div><div class="calendar-grid">${grid}</div>`;
    value.textContent = format();
    popover.querySelector('.prev').addEventListener('click', () => { view = new Date(view.getFullYear(), view.getMonth()-1, 1); render(); });
    popover.querySelector('.next').addEventListener('click', () => { view = new Date(view.getFullYear(), view.getMonth()+1, 1); render(); });
    popover.querySelectorAll('.calendar-day:not(:disabled)').forEach(btn => btn.addEventListener('click', () => {
      selected = new Date(view.getFullYear(), view.getMonth(), Number(btn.dataset.day));
      input.value = iso(selected);
      render();
      clearFieldError(trigger);
      close();
    }));
  }
  function open() { popover.hidden = false; trigger.setAttribute('aria-expanded', 'true'); render(); }
  function close() { popover.hidden = true; trigger.setAttribute('aria-expanded', 'false'); }
  trigger.addEventListener('click', e => { e.stopPropagation(); popover.hidden ? open() : close(); });
  document.addEventListener('click', e => { if (!root.contains(e.target)) close(); });
  root.addEventListener('click', e => e.stopPropagation());
  render();
  return {
    getValue: () => input.value,
    getDisplay: () => format(),
    refresh: render,
    reset: () => { selected = null; input.value = ''; view = new Date(today.getFullYear(), today.getMonth(), 1); render(); close(); }
  };
}

function clearFieldError(control) {
  const label = control.closest('label');
  if (!label) return;
  label.classList.remove('field-invalid');
  label.querySelector('.field-error')?.remove();
}

function setFieldError(control, text) {
  const label = control.closest('label');
  if (!label) return;
  clearFieldError(control);
  label.classList.add('field-invalid');
  const error = document.createElement('span');
  error.className = 'field-error';
  error.textContent = text;
  label.appendChild(error);
}

const datePicker = createDatePicker(document.querySelector('[data-date-picker]'));

const servicePicker = document.getElementById('servicePicker');
const serviceInput = servicePicker.querySelector('input[name="service"]');
const serviceTrigger = servicePicker.querySelector('.select-trigger');
const serviceValue = servicePicker.querySelector('.select-value');
const serviceMenu = servicePicker.querySelector('.select-menu');
const serviceOptions = [...servicePicker.querySelectorAll('.select-option')];

function serviceLabel(option) {
  return option.dataset[currentLang()] || option.dataset.value;
}
function refreshServiceLabel() {
  const option = serviceOptions.find(o => o.dataset.value === serviceInput.value) || serviceOptions[0];
  serviceValue.textContent = serviceLabel(option);
}
function closeServiceMenu() {
  serviceMenu.hidden = true;
  serviceTrigger.setAttribute('aria-expanded', 'false');
}
function selectService(value) {
  serviceInput.value = value;
  serviceOptions.forEach(o => o.classList.toggle('selected', o.dataset.value === value));
  refreshServiceLabel();
  closeServiceMenu();
}
serviceTrigger.addEventListener('click', e => {
  e.stopPropagation();
  const opening = serviceMenu.hidden;
  serviceMenu.hidden = !opening;
  serviceTrigger.setAttribute('aria-expanded', String(opening));
});
serviceOptions.forEach(option => option.addEventListener('click', () => selectService(option.dataset.value)));
document.addEventListener('click', e => { if (!servicePicker.contains(e.target)) closeServiceMenu(); });
selectService('Essential');

function setLanguage(lang) {
  document.documentElement.lang = lang;
  translatable.forEach(el => { el.textContent = el.dataset[lang]; });
  langSwitch.textContent = lang === 'uk' ? 'EN' : 'UA';
  safeStorageSet('apex-language', lang);
  datePicker.refresh();
  refreshServiceLabel();
}
setLanguage(safeStorageGet('apex-language') === 'en' ? 'en' : 'uk');
langSwitch.addEventListener('click', () => setLanguage(currentLang() === 'uk' ? 'en' : 'uk'));

bookingForm.querySelectorAll('input').forEach(input => input.addEventListener('input', () => clearFieldError(input)));

const orderModal = document.getElementById('orderModal');
const orderSummary = document.getElementById('orderSummary');
let modalReturnFocus = null;
function openModal(rows) {
  const l = currentLang();
  orderSummary.innerHTML = rows.map(([ukLabel,enLabel,value]) => `<div><span>${l==='uk'?ukLabel:enLabel}</span><b>${value || '—'}</b></div>`).join('');
  modalReturnFocus = document.activeElement;
  orderModal.hidden = false;
  document.body.classList.add('modal-open');
  orderModal.querySelector('.modal-ok')?.focus();
}
function closeModal() {
  orderModal.hidden = true;
  document.body.classList.remove('modal-open');
  modalReturnFocus?.focus?.();
}
orderModal.querySelectorAll('[data-modal-close]').forEach(el => el.addEventListener('click', closeModal));
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !orderModal.hidden) closeModal(); });

bookingForm.addEventListener('submit', event => {
  event.preventDefault();
  formStatus.className = 'form-status';
  bookingForm.querySelectorAll('.field-error').forEach(el => el.remove());
  bookingForm.querySelectorAll('.field-invalid').forEach(el => el.classList.remove('field-invalid'));

  const nameInput = bookingForm.elements.name;
  const phoneInput = bookingForm.elements.phone;
  const carInput = bookingForm.elements.car;
  const l = currentLang();
  let valid = true;
  if (!nameInput.value.trim()) { setFieldError(nameInput, l==='uk'?'Вкажіть ім’я.':'Enter your name.'); valid = false; }
  const phoneDigits = phoneInput.value.replace(/\D/g, '');
  if (phoneDigits.length < 7) { setFieldError(phoneInput, l==='uk'?'Вкажіть коректний номер телефону.':'Enter a valid phone number.'); valid = false; }
  if (!datePicker.getValue()) { setFieldError(document.querySelector('.date-trigger'), l==='uk'?'Оберіть дату.':'Choose a date.'); valid = false; }
  if (!valid) {
    formStatus.classList.add('error');
    formStatus.textContent = l==='uk'?'Перевірте виділені поля.':'Check the highlighted fields.';
    bookingForm.querySelector('.field-invalid input, .field-invalid button')?.focus();
    return;
  }

  const summaryRows = [
    ['Ім’я','Name',nameInput.value.trim()],
    ['Телефон','Phone',phoneInput.value.trim()],
    ['Послуга','Service',serviceValue.textContent],
    ['Автомобіль','Car',carInput.value.trim() || (l==='uk'?'Не вказано':'Not specified')],
    ['Дата','Date',datePicker.getDisplay()]
  ];
  formStatus.classList.add('success');
  formStatus.textContent = l==='uk' ? 'Заявку успішно надіслано.' : 'Request sent successfully.';
  openModal(summaryRows);

  bookingForm.reset();
  selectService('Essential');
  datePicker.reset();
});
