const switcher = document.getElementById('langSwitch');
const trans = document.querySelectorAll('[data-uk][data-en]');

function safeStorageGet(key){ try { return localStorage.getItem(key); } catch { return null; } }
function safeStorageSet(key,value){ try { localStorage.setItem(key,value); } catch {} }


function currentLang(){ return document.documentElement.lang === 'en' ? 'en' : 'uk'; }

function clearFieldError(control){
  const label = control.closest('label');
  if(!label) return;
  label.classList.remove('field-invalid');
  label.querySelector('.field-error')?.remove();
}
function setFieldError(control,text){
  const label = control.closest('label');
  if(!label) return;
  clearFieldError(control);
  label.classList.add('field-invalid');
  const error=document.createElement('span');
  error.className='field-error';
  error.textContent=text;
  label.appendChild(error);
}

function createDatePicker(root) {
  const input = root.querySelector('input[type="hidden"]');
  const trigger = root.querySelector('.date-trigger');
  const value = root.querySelector('.date-value');
  const popover = root.querySelector('.calendar-popover');
  const today = new Date(); today.setHours(0,0,0,0);
  let view = new Date(today.getFullYear(), today.getMonth(), 1);
  let selected = null;
  const names = {
    uk:{months:['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'],days:['Пн','Вт','Ср','Чт','Пт','Сб','Нд'],placeholder:'Оберіть дату',prev:'Попередній місяць',next:'Наступний місяць'},
    en:{months:['January','February','March','April','May','June','July','August','September','October','November','December'],days:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],placeholder:'Choose a date',prev:'Previous month',next:'Next month'}
  };
  const pad=n=>String(n).padStart(2,'0');
  const iso=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  function formatSelected(){
    if(!selected) return names[currentLang()].placeholder;
    return new Intl.DateTimeFormat(currentLang()==='uk'?'uk-UA':'en-GB',{day:'numeric',month:'long',year:'numeric'}).format(selected);
  }
  function render(){
    const l=currentLang();
    const first=new Date(view.getFullYear(),view.getMonth(),1);
    const startOffset=(first.getDay()+6)%7;
    const count=new Date(view.getFullYear(),view.getMonth()+1,0).getDate();
    let grid=names[l].days.map(d=>`<span class="calendar-weekday">${d}</span>`).join('');
    for(let i=0;i<startOffset;i++) grid+='<span class="calendar-empty"></span>';
    for(let day=1;day<=count;day++){
      const d=new Date(view.getFullYear(),view.getMonth(),day);
      const disabled=d<today;
      const isSelected=selected&&iso(d)===iso(selected);
      const isToday=iso(d)===iso(today);
      grid+=`<button type="button" class="calendar-day${isSelected?' selected':''}${isToday?' today':''}" data-day="${day}" ${disabled?'disabled':''}>${day}</button>`;
    }
    popover.innerHTML=`<div class="calendar-head"><button type="button" class="calendar-nav prev" aria-label="${names[l].prev}">‹</button><b>${names[l].months[view.getMonth()]} ${view.getFullYear()}</b><button type="button" class="calendar-nav next" aria-label="${names[l].next}">›</button></div><div class="calendar-grid">${grid}</div>`;
    value.textContent=formatSelected();
    popover.querySelector('.prev').addEventListener('click',()=>{view=new Date(view.getFullYear(),view.getMonth()-1,1);render();});
    popover.querySelector('.next').addEventListener('click',()=>{view=new Date(view.getFullYear(),view.getMonth()+1,1);render();});
    popover.querySelectorAll('.calendar-day:not(:disabled)').forEach(btn=>btn.addEventListener('click',()=>{
      selected=new Date(view.getFullYear(),view.getMonth(),Number(btn.dataset.day));
      input.value=iso(selected);
      render();
      clearFieldError(trigger);
      close();
    }));
  }
  function open(){popover.hidden=false;trigger.setAttribute('aria-expanded','true');render();}
  function close(){popover.hidden=true;trigger.setAttribute('aria-expanded','false');}
  trigger.addEventListener('click',e=>{e.stopPropagation();popover.hidden?open():close();});
  document.addEventListener('click',e=>{if(!root.contains(e.target))close();});
  root.addEventListener('click',e=>e.stopPropagation());
  render();
  return {getValue:()=>input.value,getDisplay:()=>formatSelected(),refresh:render,reset:()=>{selected=null;input.value='';view=new Date(today.getFullYear(),today.getMonth(),1);render();close();}};
}

const datePicker = createDatePicker(document.querySelector('[data-date-picker]'));

function setLang(lang){
  document.documentElement.lang=lang;
  trans.forEach(el=>el.textContent=el.dataset[lang]);
  switcher.textContent=lang==='uk'?'EN':'UA';
  safeStorageSet('nova-language',lang);
  datePicker.refresh();
  refreshTableLabel();
}
switcher.addEventListener('click',()=>setLang(currentLang()==='uk'?'en':'uk'));

document.querySelectorAll('.filters button').forEach(btn=>btn.addEventListener('click',()=>{
  document.querySelectorAll('.filters button').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  const f=btn.dataset.filter;
  document.querySelectorAll('.menu-grid article').forEach(item=>item.classList.toggle('hidden',f!=='all'&&item.dataset.cat!==f));
}));

const tablePicker=document.getElementById('tablePicker');
const tableInput=tablePicker.querySelector('input[name="table"]');
const tableTrigger=tablePicker.querySelector('.select-trigger');
const tableValue=tablePicker.querySelector('.select-value');
const tableMenu=tablePicker.querySelector('.select-menu');
const tableOptions=[...tablePicker.querySelectorAll('.select-option')];
const tableNodes=[...document.querySelectorAll('.table-node')];
const guestPicker=document.getElementById('guestPicker');
const guestInput=guestPicker.querySelector('input[name="guests"]');

function refreshTableLabel(){
  const option=tableOptions.find(opt=>opt.dataset.value===tableInput.value)||tableOptions[0];
  tableValue.textContent=option.dataset[currentLang()]||option.textContent;
}
function closeTableMenu(){tableMenu.hidden=true;tableTrigger.setAttribute('aria-expanded','false');}
function selectTable(value){
  const option=tableOptions.find(opt=>opt.dataset.value===value);
  if(option?.disabled) return;
  const node=tableNodes.find(n=>n.dataset.table===value);
  if(node?.disabled) return;
  tableInput.value=value;
  tableNodes.forEach(n=>n.classList.toggle('selected',n.dataset.table===value));
  tableOptions.forEach(opt=>opt.classList.toggle('selected',opt.dataset.value===value));
  refreshTableLabel();
  closeTableMenu();
}
function requiredSeats(){ return guestInput.value==='5+' ? 5 : Number(guestInput.value || 1); }
function updateTableAvailability(){
  const needed=requiredSeats();
  tableNodes.forEach(node=>{
    const unavailable=Number(node.dataset.seats)<needed;
    node.disabled=unavailable;
    node.classList.toggle('unavailable',unavailable);
    node.setAttribute('aria-disabled',String(unavailable));
  });
  tableOptions.forEach(opt=>{
    if(opt.dataset.value==='any') return;
    const unavailable=Number(opt.dataset.seats)<needed;
    opt.disabled=unavailable;
    opt.classList.toggle('unavailable',unavailable);
    opt.setAttribute('aria-disabled',String(unavailable));
  });
  const selectedNode=tableNodes.find(n=>n.dataset.table===tableInput.value);
  if(selectedNode?.disabled) selectTable('any');
}

tableTrigger.addEventListener('click',e=>{e.stopPropagation();const opening=tableMenu.hidden;tableMenu.hidden=!opening;tableTrigger.setAttribute('aria-expanded',String(opening));});
tableOptions.forEach(opt=>opt.addEventListener('click',()=>selectTable(opt.dataset.value)));
tableNodes.forEach(node=>node.addEventListener('click',()=>selectTable(node.dataset.table)));
document.addEventListener('click',e=>{if(!tablePicker.contains(e.target))closeTableMenu();});

guestPicker.querySelectorAll('button').forEach(btn=>btn.addEventListener('click',()=>{
  guestPicker.querySelectorAll('button').forEach(b=>b.classList.remove('selected'));
  btn.classList.add('selected');
  guestInput.value=btn.dataset.value;
  updateTableAvailability();
}));

const timeInput=document.getElementById('reservationTime');
function normalizeTime(){
  let raw=timeInput.value.replace(/[^0-9]/g,'').slice(0,4);
  if(raw.length>=3) raw=raw.slice(0,2)+':'+raw.slice(2);
  timeInput.value=raw;
  clearFieldError(timeInput);
}
timeInput.addEventListener('input',normalizeTime);
timeInput.addEventListener('blur',()=>{
  const raw=timeInput.value.replace(/[^0-9]/g,'');
  if(raw.length===3){ timeInput.value=`0${raw[0]}:${raw.slice(1)}`; }
});

const form=document.getElementById('reserveForm');
const status=document.getElementById('status');
const nameInput=form.elements.name;
const phoneInput=form.elements.phone;
[nameInput,phoneInput].forEach(input=>input.addEventListener('input',()=>clearFieldError(input)));

const orderModal=document.getElementById('orderModal');
const orderSummary=document.getElementById('orderSummary');
let modalReturnFocus=null;
function openModal(rows){
  const l=currentLang();
  orderSummary.innerHTML=rows.map(([ukLabel,enLabel,value])=>`<div><span>${l==='uk'?ukLabel:enLabel}</span><b>${value||'—'}</b></div>`).join('');
  modalReturnFocus=document.activeElement;
  orderModal.hidden=false;
  document.body.classList.add('modal-open');
  orderModal.querySelector('.modal-ok')?.focus();
}
function closeModal(){orderModal.hidden=true;document.body.classList.remove('modal-open');modalReturnFocus?.focus?.();}
orderModal.querySelectorAll('[data-modal-close]').forEach(el=>el.addEventListener('click',closeModal));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!orderModal.hidden)closeModal();});

form.addEventListener('submit',e=>{
  e.preventDefault();
  const l=currentLang();
  status.className='status';
  form.querySelectorAll('.field-error').forEach(el=>el.remove());
  form.querySelectorAll('.field-invalid').forEach(el=>el.classList.remove('field-invalid'));
  let valid=true;
  if(!nameInput.value.trim()){setFieldError(nameInput,l==='uk'?'Вкажіть ім’я.':'Enter your name.');valid=false;}
  if(phoneInput.value.replace(/\D/g,'').length<7){setFieldError(phoneInput,l==='uk'?'Вкажіть коректний номер телефону.':'Enter a valid phone number.');valid=false;}
  if(!datePicker.getValue()){setFieldError(document.querySelector('.date-trigger'),l==='uk'?'Оберіть дату.':'Choose a date.');valid=false;}
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(timeInput.value)){
    setFieldError(timeInput,l==='uk'?'Введіть час у форматі HH:MM.':'Enter time as HH:MM.');valid=false;
  }else{
    const [hh,mm]=timeInput.value.split(':').map(Number), total=hh*60+mm;
    if(total<450||total>1230){setFieldError(timeInput,l==='uk'?'Доступний час: 07:30–20:30.':'Available time: 07:30–20:30.');valid=false;}
  }
  if(!valid){
    status.classList.add('error');
    status.textContent=l==='uk'?'Перевірте виділені поля.':'Check the highlighted fields.';
    form.querySelector('.field-invalid input, .field-invalid button')?.focus();
    return;
  }

  const tableText=tableInput.value==='any'?(l==='uk'?'Будь-який':'Any table'):tableValue.textContent;
  const rows=[
    ['Ім’я','Name',nameInput.value.trim()],
    ['Телефон','Phone',phoneInput.value.trim()],
    ['Дата','Date',datePicker.getDisplay()],
    ['Час','Time',timeInput.value],
    ['Гостей','Guests',guestInput.value],
    ['Столик','Table',tableText]
  ];
  status.classList.add('success');
  status.textContent=l==='uk'?'Бронювання успішно підтверджено.':'Reservation confirmed successfully.';
  openModal(rows);

  form.reset();
  timeInput.value='18:00';
  guestInput.value='2';
  guestPicker.querySelectorAll('button').forEach(b=>b.classList.toggle('selected',b.dataset.value==='2'));
  selectTable('any');
  updateTableAvailability();
  datePicker.reset();
});

selectTable('any');
updateTableAvailability();
setLang(safeStorageGet('nova-language')==='en'?'en':'uk');

function setupNovaInfiniteMarquee() {
  const container = document.querySelector('.marquee');
  const track = container?.querySelector('.marquee-track');
  const sourceGroup = track?.querySelector('.marquee-group');
  if (!container || !track || !sourceGroup) return;

  const speed = 48;
  let animation = null;
  let resizeFrame = null;

  const build = () => {
    animation?.cancel();
    track.style.transform = 'translate3d(0,0,0)';
    track.querySelectorAll('.marquee-group[data-marquee-clone]').forEach(node => node.remove());

    const groupWidth = sourceGroup.getBoundingClientRect().width;
    const viewportWidth = container.getBoundingClientRect().width;
    if (!groupWidth || !viewportWidth) return;

    const requiredWidth = viewportWidth + groupWidth;
    while (track.scrollWidth < requiredWidth) {
      const clone = sourceGroup.cloneNode(true);
      clone.dataset.marqueeClone = 'true';
      clone.setAttribute('aria-hidden', 'true');
      track.appendChild(clone);
    }

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

setupNovaInfiniteMarquee();
