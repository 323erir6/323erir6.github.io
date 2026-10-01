const switcher=document.getElementById('langSwitch');
const trans=document.querySelectorAll('[data-uk][data-en]');
let step=1;
const state={service:'',barber:'',time:''};
const panels=[...document.querySelectorAll('.panel')];
const stepBtns=[...document.querySelectorAll('.steps button')];
const stepsNav=document.querySelector('.steps');
const prev=document.getElementById('prevBtn');
const next=document.getElementById('nextBtn');
const submit=document.getElementById('submitBtn');
const status=document.getElementById('status');
const bookingForm=document.getElementById('bookingForm');

const labels={
  service:{haircut:{uk:'Чоловіча стрижка',en:'Haircut'},beard:{uk:'Борода',en:'Beard trim'},combo:{uk:'Стрижка + борода',en:'Haircut + Beard'},buzz:{uk:'Стрижка машинкою',en:'Buzz cut'}},
  barber:{andrii:{uk:'Андрій',en:'Andrii'},max:{uk:'Максим',en:'Max'},oleksii:{uk:'Олексій',en:'Oleksii'}}
};
function safeStorageGet(key){ try { return localStorage.getItem(key); } catch { return null; } }
function safeStorageSet(key,value){ try { localStorage.setItem(key,value); } catch {} }
function currentLang(){return document.documentElement.lang==='en'?'en':'uk';}

function clearFieldError(control){
  const label=control.closest('label');
  if(!label)return;
  label.classList.remove('field-invalid');
  label.querySelector('.field-error')?.remove();
}
function setFieldError(control,text){
  const label=control.closest('label');
  if(!label)return;
  clearFieldError(control);
  label.classList.add('field-invalid');
  const error=document.createElement('span');
  error.className='field-error';
  error.textContent=text;
  label.appendChild(error);
}

function createDatePicker(root) {
  const input=root.querySelector('input[type="hidden"]');
  const trigger=root.querySelector('.date-trigger');
  const value=root.querySelector('.date-value');
  const popover=root.querySelector('.calendar-popover');
  const today=new Date(); today.setHours(0,0,0,0);
  let view=new Date(today.getFullYear(),today.getMonth(),1), selected=null;
  const names={uk:{months:['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'],days:['Пн','Вт','Ср','Чт','Пт','Сб','Нд'],placeholder:'Оберіть дату',prev:'Попередній місяць',next:'Наступний місяць'},en:{months:['January','February','March','April','May','June','July','August','September','October','November','December'],days:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],placeholder:'Choose a date',prev:'Previous month',next:'Next month'}};
  const pad=n=>String(n).padStart(2,'0');
  const iso=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  function format(){return selected?new Intl.DateTimeFormat(currentLang()==='uk'?'uk-UA':'en-GB',{day:'numeric',month:'long',year:'numeric'}).format(selected):names[currentLang()].placeholder;}
  function render(){
    const l=currentLang(),first=new Date(view.getFullYear(),view.getMonth(),1),offset=(first.getDay()+6)%7,count=new Date(view.getFullYear(),view.getMonth()+1,0).getDate();
    let grid=names[l].days.map(d=>`<span class="calendar-weekday">${d}</span>`).join('');
    for(let i=0;i<offset;i++)grid+='<span class="calendar-empty"></span>';
    for(let day=1;day<=count;day++){
      const d=new Date(view.getFullYear(),view.getMonth(),day),disabled=d<today,isSelected=selected&&iso(d)===iso(selected),isToday=iso(d)===iso(today);
      grid+=`<button type="button" class="calendar-day${isSelected?' selected':''}${isToday?' today':''}" data-day="${day}" ${disabled?'disabled':''}>${day}</button>`;
    }
    popover.innerHTML=`<div class="calendar-head"><button type="button" class="calendar-nav prev" aria-label="${names[l].prev}">‹</button><b>${names[l].months[view.getMonth()]} ${view.getFullYear()}</b><button type="button" class="calendar-nav next" aria-label="${names[l].next}">›</button></div><div class="calendar-grid">${grid}</div>`;
    value.textContent=format();
    popover.querySelector('.prev').addEventListener('click',()=>{view=new Date(view.getFullYear(),view.getMonth()-1,1);render();});
    popover.querySelector('.next').addEventListener('click',()=>{view=new Date(view.getFullYear(),view.getMonth()+1,1);render();});
    popover.querySelectorAll('.calendar-day:not(:disabled)').forEach(btn=>btn.addEventListener('click',()=>{
      selected=new Date(view.getFullYear(),view.getMonth(),Number(btn.dataset.day));
      input.value=iso(selected);
      render();
      clearFieldError(trigger);
      updateSummary();
      close();
    }));
  }
  function open(){popover.hidden=false;trigger.setAttribute('aria-expanded','true');render();}
  function close(){popover.hidden=true;trigger.setAttribute('aria-expanded','false');}
  trigger.addEventListener('click',e=>{e.stopPropagation();popover.hidden?open():close();});
  document.addEventListener('click',e=>{if(!root.contains(e.target))close();});
  root.addEventListener('click',e=>e.stopPropagation());
  render();
  return{getValue:()=>input.value,getDisplay:()=>format(),refresh:render};
}
const datePicker=createDatePicker(document.querySelector('[data-date-picker]'));

function setLang(lang){
  document.documentElement.lang=lang;
  trans.forEach(el=>el.textContent=el.dataset[lang]);
  switcher.textContent=lang==='uk'?'EN':'UA';
  safeStorageSet('barber-language',lang);
  datePicker.refresh();
  updateSummary();
}

function render(direction='forward'){
  panels.forEach(p=>{
    const active=+p.dataset.panel===step;
    p.classList.toggle('active',active);
    p.classList.remove('enter-forward','enter-back');
    if(active){void p.offsetWidth;p.classList.add(direction==='back'?'enter-back':'enter-forward');}
  });
  stepBtns.forEach(b=>{
    const active=+b.dataset.step===step;
    b.classList.toggle('active',active);
    if(active) b.setAttribute('aria-current','step'); else b.removeAttribute('aria-current');
  });
  const activeStep=stepBtns.find(b=>+b.dataset.step===step);
  if(activeStep&&stepsNav&&stepsNav.scrollWidth>stepsNav.clientWidth){
    const target=activeStep.offsetLeft-(stepsNav.clientWidth-activeStep.offsetWidth)/2;
    stepsNav.scrollTo({left:Math.max(0,target),behavior:'smooth'});
  }
  prev.style.visibility=step===1?'hidden':'visible';
  next.classList.toggle('hidden',step===4);
  submit.classList.toggle('hidden',step!==4);
  if(step===4)updateSummary();
}
function pick(group,key){
  document.querySelectorAll(group+' button').forEach(btn=>btn.addEventListener('click',()=>{
    document.querySelectorAll(group+' button').forEach(b=>b.classList.remove('selected'));
    btn.classList.add('selected');
    state[key]=btn.dataset.value;
    status.className='status';status.textContent='';
    if(key==='time') updateSummary();
  }));
}
function message(uk,en,type='error'){status.className='status '+type;status.textContent=currentLang()==='uk'?uk:en;}
function updateSummary(){
  const s=document.getElementById('summary'); if(!s)return;
  const l=currentLang(), service=state.service?labels.service[state.service][l]:'—', barber=state.barber?labels.barber[state.barber][l]:'—';
  const date=datePicker.getValue()?datePicker.getDisplay():'—';
  s.innerHTML=`<b>${l==='uk'?'Ваш запис':'Your booking'}</b><br>${service} · ${barber} · ${date} · ${state.time||'—'}`;
}

pick('#serviceChoices','service');
pick('#barberChoices','barber');
pick('#timeChoices','time');

function canEnterStep(target){
  if(target<=1) return true;
  if(target>=2&&!state.service){message('Оберіть послугу.','Choose a service.');return false;}
  if(target>=3&&!state.barber){message('Оберіть майстра.','Choose a barber.');return false;}
  if(target>=4&&(!datePicker.getValue()||!state.time)){message('Оберіть дату і час.','Choose a date and time.');return false;}
  return true;
}
stepBtns.forEach(btn=>btn.addEventListener('click',()=>{
  const target=Number(btn.dataset.step);
  if(target===step||!canEnterStep(target)) return;
  const direction=target<step?'back':'forward';
  step=target;status.className='status';status.textContent='';render(direction);
}));

next.addEventListener('click',()=>{
  if(step===1&&!state.service)return message('Оберіть послугу.','Choose a service.');
  if(step===2&&!state.barber)return message('Оберіть майстра.','Choose a barber.');
  if(step===3&&(!datePicker.getValue()||!state.time))return message('Оберіть дату і час.','Choose a date and time.');
  status.className='status';status.textContent='';
  step=Math.min(4,step+1);render('forward');
});
prev.addEventListener('click',()=>{status.className='status';status.textContent='';step=Math.max(1,step-1);render('back');});

const clientName=document.getElementById('clientName');
const clientPhone=document.getElementById('clientPhone');
[clientName,clientPhone].forEach(input=>input.addEventListener('input',()=>clearFieldError(input)));

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

bookingForm.addEventListener('submit',e=>{
  e.preventDefault();
  const l=currentLang();
  clearFieldError(clientName);clearFieldError(clientPhone);
  let valid=true;
  if(!clientName.value.trim()){setFieldError(clientName,l==='uk'?'Вкажіть ім’я.':'Enter your name.');valid=false;}
  if(clientPhone.value.replace(/\D/g,'').length<7){setFieldError(clientPhone,l==='uk'?'Вкажіть коректний номер телефону.':'Enter a valid phone number.');valid=false;}
  if(!valid){message('Перевірте виділені поля.','Check the highlighted fields.');bookingForm.querySelector('.field-invalid input')?.focus();return;}

  const rows=[
    ['Ім’я','Name',clientName.value.trim()],
    ['Телефон','Phone',clientPhone.value.trim()],
    ['Послуга','Service',labels.service[state.service][l]],
    ['Майстер','Barber',labels.barber[state.barber][l]],
    ['Дата','Date',datePicker.getDisplay()],
    ['Час','Time',state.time]
  ];
  message('Запис успішно підтверджено.','Booking confirmed successfully.','success');
  openModal(rows);
});

setLang(safeStorageGet('barber-language')==='en'?'en':'uk');
switcher.addEventListener('click',()=>setLang(currentLang()==='uk'?'en':'uk'));
render();
