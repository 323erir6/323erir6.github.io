const API_BASE='https://barberpoint-api-oneone.onrender.com';

const switcher=document.getElementById('langSwitch');
const trans=document.querySelectorAll('[data-uk][data-en]');
let step=1;
const state={service:'',serviceId:null,barber:'',barberId:null,time:''};
const panels=[...document.querySelectorAll('.panel')];
const stepBtns=[...document.querySelectorAll('.steps button')];
const stepsNav=document.querySelector('.steps');
const prev=document.getElementById('prevBtn');
const next=document.getElementById('nextBtn');
const submit=document.getElementById('submitBtn');
const status=document.getElementById('status');
const bookingForm=document.getElementById('bookingForm');
const serviceChoices=document.getElementById('serviceChoices');
const barberChoices=document.getElementById('barberChoices');
const timeChoices=document.getElementById('timeChoices');

const labels={service:{},barber:{}};

function safeStorageGet(key){try{return localStorage.getItem(key);}catch{return null;}}
function safeStorageSet(key,value){try{localStorage.setItem(key,value);}catch{}}
function currentLang(){return document.documentElement.lang==='en'?'en':'uk';}
function message(uk,en,type='error'){status.className='status '+type;status.textContent=currentLang()==='uk'?uk:en;}
function clearMessage(){status.className='status';status.textContent='';}

async function api(path,options={}){
  const response=await fetch(API_BASE+path,{
    ...options,
    headers:{'Content-Type':'application/json',...(options.headers||{})}
  });
  let data={};
  try{data=await response.json();}catch{}
  if(!response.ok){
    const error=new Error(data.error||('HTTP '+response.status));
    error.status=response.status;
    error.data=data;
    throw error;
  }
  return data;
}

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

function createDatePicker(root){
  const input=root.querySelector('input[type="hidden"]');
  const trigger=root.querySelector('.date-trigger');
  const value=root.querySelector('.date-value');
  const popover=root.querySelector('.calendar-popover');
  const today=new Date(); today.setHours(0,0,0,0);
  let view=new Date(today.getFullYear(),today.getMonth(),1),selected=null;
  const names={
    uk:{months:['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'],days:['Пн','Вт','Ср','Чт','Пт','Сб','Нд'],placeholder:'Оберіть дату',prev:'Попередній місяць',next:'Наступний місяць'},
    en:{months:['January','February','March','April','May','June','July','August','September','October','November','December'],days:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],placeholder:'Choose a date',prev:'Previous month',next:'Next month'}
  };
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
    popover.querySelectorAll('.calendar-day:not(:disabled)').forEach(btn=>btn.addEventListener('click',async()=>{
      selected=new Date(view.getFullYear(),view.getMonth(),Number(btn.dataset.day));
      input.value=iso(selected);
      render();
      clearFieldError(trigger);
      state.time='';
      updateSummary();
      close();
      await loadSlots();
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
  renderRemoteLabels();
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
    if(active)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');
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

function bindChoices(container,key){
  container.querySelectorAll('button[data-value]').forEach(btn=>btn.addEventListener('click',async()=>{
    container.querySelectorAll('button').forEach(b=>b.classList.remove('selected'));
    btn.classList.add('selected');
    state[key]=btn.dataset.value;
    state[key+'Id']=Number(btn.dataset.id);
    clearMessage();
    if(key==='service'||key==='barber'){
      state.time='';
      if(datePicker.getValue()&&state.serviceId&&state.barberId)await loadSlots();
    }
    updateSummary();
  }));
}

function renderRemoteLabels(){
  const l=currentLang();
  serviceChoices.querySelectorAll('button[data-value]').forEach(btn=>{
    const item=labels.service[btn.dataset.value];
    if(item)btn.querySelector('span').textContent=item[l];
  });
  barberChoices.querySelectorAll('button[data-value]').forEach(btn=>{
    const item=labels.barber[btn.dataset.value];
    if(item)btn.querySelector('span').textContent=item[l];
  });
}

async function loadCatalog(){
  try{
    const [services,barbers]=await Promise.all([api('/api/services'),api('/api/barbers')]);

    services.forEach(item=>{
      labels.service[item.code]={uk:item.name_uk,en:item.name_en};
      const btn=serviceChoices.querySelector(`button[data-value="${item.code}"]`);
      if(btn){
        btn.dataset.id=item.id;
        const price=btn.querySelector('b');
        if(price)price.textContent=item.price+' ₴';
      }
    });

    barbers.forEach(item=>{
      labels.barber[item.code]={uk:item.name_uk,en:item.name_en};
      const btn=barberChoices.querySelector(`button[data-value="${item.code}"]`);
      if(btn)btn.dataset.id=item.id;
    });

    renderRemoteLabels();
    bindChoices(serviceChoices,'service');
    bindChoices(barberChoices,'barber');
  }catch(error){
    message('Сервер тимчасово недоступний. Спробуйте ще раз за кілька секунд.','Server is temporarily unavailable. Try again in a few seconds.');
    serviceChoices.querySelectorAll('button').forEach(b=>b.disabled=true);
    barberChoices.querySelectorAll('button').forEach(b=>b.disabled=true);
  }
}

async function loadSlots(){
  timeChoices.innerHTML='';
  state.time='';
  if(!state.serviceId||!state.barberId||!datePicker.getValue()){
    timeChoices.innerHTML=`<span class="api-placeholder">${currentLang()==='uk'?'Спочатку оберіть послугу, майстра і дату.':'Choose a service, barber and date first.'}</span>`;
    return;
  }

  timeChoices.innerHTML=`<span class="api-placeholder">${currentLang()==='uk'?'Завантаження вільного часу...':'Loading available times...'}</span>`;

  try{
    const params=new URLSearchParams({
      barber_id:String(state.barberId),
      service_id:String(state.serviceId),
      date:datePicker.getValue()
    });
    const data=await api('/api/available-slots?'+params.toString());
    if(!data.slots.length){
      timeChoices.innerHTML=`<span class="api-placeholder">${currentLang()==='uk'?'На цю дату вільного часу немає.':'No available times on this date.'}</span>`;
      return;
    }
    timeChoices.innerHTML=data.slots.map(slot=>`<button type="button" data-value="${slot}">${slot}</button>`).join('');
    timeChoices.querySelectorAll('button').forEach(btn=>btn.addEventListener('click',()=>{
      timeChoices.querySelectorAll('button').forEach(b=>b.classList.remove('selected'));
      btn.classList.add('selected');
      state.time=btn.dataset.value;
      clearMessage();
      updateSummary();
    }));
  }catch(error){
    timeChoices.innerHTML=`<span class="api-placeholder">${currentLang()==='uk'?'Не вдалося отримати вільний час.':'Could not load available times.'}</span>`;
  }
}

function canEnterStep(target){
  if(target<=1)return true;
  if(target>=2&&!state.service){message('Оберіть послугу.','Choose a service.');return false;}
  if(target>=3&&!state.barber){message('Оберіть майстра.','Choose a barber.');return false;}
  if(target>=4&&(!datePicker.getValue()||!state.time)){message('Оберіть дату і час.','Choose a date and time.');return false;}
  return true;
}

stepBtns.forEach(btn=>btn.addEventListener('click',()=>{
  const target=Number(btn.dataset.step);
  if(target===step||!canEnterStep(target))return;
  const direction=target<step?'back':'forward';
  step=target;clearMessage();render(direction);
}));

next.addEventListener('click',()=>{
  if(step===1&&!state.service)return message('Оберіть послугу.','Choose a service.');
  if(step===2&&!state.barber)return message('Оберіть майстра.','Choose a barber.');
  if(step===3&&(!datePicker.getValue()||!state.time))return message('Оберіть дату і час.','Choose a date and time.');
  clearMessage();
  step=Math.min(4,step+1);
  render('forward');
});
prev.addEventListener('click',()=>{clearMessage();step=Math.max(1,step-1);render('back');});

function updateSummary(){
  const s=document.getElementById('summary');if(!s)return;
  const l=currentLang();
  const service=state.service&&labels.service[state.service]?labels.service[state.service][l]:'—';
  const barber=state.barber&&labels.barber[state.barber]?labels.barber[state.barber][l]:'—';
  const date=datePicker.getValue()?datePicker.getDisplay():'—';
  s.innerHTML=`<b>${l==='uk'?'Ваш запис':'Your booking'}</b><br>${service} · ${barber} · ${date} · ${state.time||'—'}`;
}

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

bookingForm.addEventListener('submit',async e=>{
  e.preventDefault();
  const l=currentLang();
  clearFieldError(clientName);clearFieldError(clientPhone);
  let valid=true;
  if(!clientName.value.trim()){setFieldError(clientName,l==='uk'?'Вкажіть ім’я.':'Enter your name.');valid=false;}
  if(clientPhone.value.replace(/\D/g,'').length<7){setFieldError(clientPhone,l==='uk'?'Вкажіть коректний номер телефону.':'Enter a valid phone number.');valid=false;}
  if(!valid){message('Перевірте виділені поля.','Check the highlighted fields.');bookingForm.querySelector('.field-invalid input')?.focus();return;}

  submit.disabled=true;
  submit.textContent=l==='uk'?'Збереження...':'Saving...';

  try{
    const result=await api('/api/bookings',{
      method:'POST',
      body:JSON.stringify({
        name:clientName.value.trim(),
        phone:clientPhone.value.trim(),
        service_id:state.serviceId,
        barber_id:state.barberId,
        date:datePicker.getValue(),
        time:state.time
      })
    });

    const booking=result.booking;
    const serviceName=booking.service[l==='uk'?'name_uk':'name_en'];
    const barberName=booking.barber[l==='uk'?'name_uk':'name_en'];

    const rows=[
      ['Номер запису','Booking ID','#'+booking.id],
      ['Ім’я','Name',booking.name],
      ['Телефон','Phone',booking.phone],
      ['Послуга','Service',serviceName],
      ['Майстер','Barber',barberName],
      ['Дата','Date',datePicker.getDisplay()],
      ['Час','Time',booking.time]
    ];

    message('Запис збережено на сервері.','Booking saved on the server.','success');
    openModal(rows);
    await loadSlots();
  }catch(error){
    if(error.status===409){
      message('Цей час щойно зайняли. Оберіть інший.','That time was just booked. Choose another one.');
      await loadSlots();
    }else{
      message('Не вдалося зберегти запис. Спробуйте ще раз.','Could not save the booking. Try again.');
    }
  }finally{
    submit.disabled=false;
    submit.textContent=l==='uk'?'Підтвердити запис':'Confirm booking';
  }
});

setLang(safeStorageGet('barber-language')==='en'?'en':'uk');
switcher.addEventListener('click',async()=>{
  setLang(currentLang()==='uk'?'en':'uk');
  await loadSlots();
});
render();
loadSlots();
loadCatalog();
