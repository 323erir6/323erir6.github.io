const API='https://barberpoint-api-oneone.onrender.com';

const loginCard=document.getElementById('loginCard');
const dashboard=document.getElementById('dashboard');
const loginForm=document.getElementById('loginForm');
const adminKey=document.getElementById('adminKey');
const loginStatus=document.getElementById('loginStatus');
const bookingList=document.getElementById('bookingList');
const blockedList=document.getElementById('blockedList');
const barberList=document.getElementById('barberList');
const filterDate=document.getElementById('filterDate');
const filterBarber=document.getElementById('filterBarber');
const filterTime=document.getElementById('filterTime');
const listCaption=document.getElementById('listCaption');
const resultCount=document.getElementById('resultCount');
const serverState=document.getElementById('serverState');
const blockBarber=document.getElementById('blockBarber');
const blockForm=document.getElementById('blockForm');
const blockStatus=document.getElementById('blockStatus');
const barberForm=document.getElementById('barberForm');
const barberStatus=document.getElementById('barberStatus');
const calendarGrid=document.getElementById('calendarGrid');
const calendarMonthLabel=document.getElementById('calendarMonthLabel');

let key=sessionStorage.getItem('barber-admin-key')||'';
let bookings=[];
let blocked=[];
let barbers=[];
let calendarDays=new Map();

function kyivDate(){
  const parts=new Intl.DateTimeFormat('en-CA',{
    timeZone:'Europe/Kyiv',
    year:'numeric',
    month:'2-digit',
    day:'2-digit'
  }).formatToParts(new Date());
  const map=Object.fromEntries(parts.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return map.year+'-'+map.month+'-'+map.day;
}

function parseLocalDate(value){
  const [y,m,d]=value.split('-').map(Number);
  return new Date(y,m-1,d||1);
}

function pad(value){return String(value).padStart(2,'0');}
function monthKey(date){return date.getFullYear()+'-'+pad(date.getMonth()+1);}
function isoDate(date){return date.getFullYear()+'-'+pad(date.getMonth()+1)+'-'+pad(date.getDate());}

const today=kyivDate();
let calendarView=parseLocalDate(today.slice(0,7)+'-01');
filterDate.value='';
document.getElementById('blockDate').value=today;

for(let hour=10;hour<21;hour++){
  for(const minute of [0,30]){
    const value=pad(hour)+':'+pad(minute);
    const option=document.createElement('option');
    option.value=value;
    option.textContent=value;
    filterTime.appendChild(option);
  }
}

async function request(path,options={}){
  const response=await fetch(API+path,{
    ...options,
    cache:'no-store',
    headers:{
      'Content-Type':'application/json',
      ...(key?{'X-Admin-Key':key}:{}),
      ...(options.headers||{})
    }
  });
  let data={};
  try{data=await response.json();}catch{}
  if(!response.ok){
    const error=new Error(data.error||'Request failed');
    error.status=response.status;
    error.data=data;
    throw error;
  }
  return data;
}

function setStatus(el,text,type=''){
  el.textContent=text;
  el.className='status '+type;
}

function statusLabel(value){
  return {
    confirmed:'підтверджено',
    cancelled:'скасовано',
    completed:'завершено'
  }[value]||value;
}

function escapeHtml(value){
  const d=document.createElement('div');
  d.textContent=value??'';
  return d.innerHTML;
}

function selectedBarberName(){
  if(!filterBarber.value)return 'усі майстри';
  return barbers.find(x=>String(x.id)===filterBarber.value)?.name_uk||'майстер';
}

async function health(){
  const label=serverState.querySelector('span');
  try{
    const response=await fetch(API+'/api/health',{cache:'no-store'});
    const data=await response.json();
    if(!response.ok||!data.ok||data.database!=='postgresql')throw new Error('Database unavailable');
    serverState.className='server-state online';
    label.textContent='API / POSTGRESQL';
  }catch{
    serverState.className='server-state offline';
    label.textContent='API / OFFLINE';
  }
}

async function loadBarbers(){
  const previousFilter=filterBarber.value;
  const previousBlock=blockBarber.value;

  barbers=await request('/api/admin/barbers');

  filterBarber.innerHTML='<option value="">Усі майстри</option>'+
    barbers.filter(x=>x.active).map(x=>'<option value="'+x.id+'">'+escapeHtml(x.name_uk)+'</option>').join('');

  blockBarber.innerHTML=barbers.filter(x=>x.active)
    .map(x=>'<option value="'+x.id+'">'+escapeHtml(x.name_uk)+'</option>').join('');

  if([...filterBarber.options].some(o=>o.value===previousFilter))filterBarber.value=previousFilter;
  if([...blockBarber.options].some(o=>o.value===previousBlock))blockBarber.value=previousBlock;

  renderBarbers();
}

function buildBookingParams(){
  const params=new URLSearchParams();
  if(filterDate.value)params.set('date',filterDate.value);
  if(filterBarber.value)params.set('barber_id',filterBarber.value);
  if(filterTime.value)params.set('time',filterTime.value);
  return params.toString();
}

async function loadBookings(){
  bookingList.innerHTML='<div class="empty">Завантаження...</div>';
  const qs=buildBookingParams();
  bookings=await request('/api/admin/bookings'+(qs?'?'+qs:''));
  renderBookings();
}

async function loadBlocked(){
  blockedList.innerHTML='<div class="empty">Завантаження...</div>';
  const params=new URLSearchParams();
  if(filterDate.value)params.set('date',filterDate.value);
  if(filterBarber.value)params.set('barber_id',filterBarber.value);
  const qs=params.toString();
  blocked=await request('/api/admin/blocked-slots'+(qs?'?'+qs:''));
  renderBlocked();
}

async function loadCalendar(){
  const params=new URLSearchParams({month:monthKey(calendarView)});
  if(filterBarber.value)params.set('barber_id',filterBarber.value);
  const data=await request('/api/admin/calendar?'+params.toString());
  calendarDays=new Map(data.days.map(day=>[day.date,day]));
  renderCalendar();
}

function renderCalendar(){
  calendarMonthLabel.textContent=new Intl.DateTimeFormat('uk-UA',{
    month:'long',
    year:'numeric'
  }).format(calendarView).replace(/^./,c=>c.toUpperCase());

  const year=calendarView.getFullYear();
  const month=calendarView.getMonth();
  const first=new Date(year,month,1);
  const offset=(first.getDay()+6)%7;
  const total=new Date(year,month+1,0).getDate();
  const selected=filterDate.value;

  let html='';
  for(let i=0;i<offset;i++)html+='<span class="calendar-blank"></span>';

  for(let day=1;day<=total;day++){
    const date=new Date(year,month,day);
    const iso=isoDate(date);
    const stats=calendarDays.get(iso);
    const hasConfirmed=stats&&stats.confirmed>0;
    const hasCompleted=stats&&stats.completed>0;
    const onlyCancelled=stats&&stats.total===stats.cancelled;
    const markerClass=hasConfirmed?'has-active':(!onlyCancelled&&hasCompleted?'has-done':(stats?'has-cancelled':''));
    const count=stats?stats.total:0;

    html+=`
      <button type="button" class="admin-calendar-day ${markerClass}${selected===iso?' selected':''}${iso===today?' today':''}" data-date="${iso}">
        <span class="day-number">${day}</span>
        ${count?'<span class="day-count">'+count+'</span>':''}
        ${count?'<span class="day-dot"></span>':''}
      </button>
    `;
  }

  calendarGrid.innerHTML=html;
  calendarGrid.querySelectorAll('[data-date]').forEach(btn=>{
    btn.addEventListener('click',async()=>{
      filterDate.value=btn.dataset.date;
      renderCalendar();
      await Promise.all([loadBookings(),loadBlocked()]);
    });
  });
}

function renderBookings(){
  document.getElementById('countAll').textContent=bookings.length;
  document.getElementById('countConfirmed').textContent=bookings.filter(x=>x.status==='confirmed').length;
  document.getElementById('countCompleted').textContent=bookings.filter(x=>x.status==='completed').length;
  document.getElementById('countCancelled').textContent=bookings.filter(x=>x.status==='cancelled').length;
  resultCount.textContent=bookings.length+' '+(bookings.length===1?'запис':'записів');

  const parts=[];
  parts.push(filterDate.value||'усі дати');
  parts.push(selectedBarberName());
  if(filterTime.value)parts.push(filterTime.value);
  listCaption.textContent=parts.join(' / ');

  if(!bookings.length){
    bookingList.innerHTML='<div class="empty">За цими фільтрами записів немає.</div>';
    return;
  }

  bookingList.innerHTML=bookings.map(b=>`
    <article class="booking-card" data-id="${b.id}">
      <div class="booking-time">${b.time}</div>
      <div class="booking-person">
        <b>${escapeHtml(b.name)}</b>
        <span>${escapeHtml(b.phone)}</span>
      </div>
      <div class="booking-service">
        <b>${escapeHtml(b.service.name_uk)}</b>
        <span>${escapeHtml(b.barber.name_uk)} · ${b.duration_minutes} хв</span>
      </div>
      <div>
        <span class="booking-date">${b.date}</span>
        <span class="badge ${b.status}">${statusLabel(b.status)}</span>
      </div>
      <div class="booking-actions">
        ${b.status!=='completed'?'<button class="complete" data-status="completed" type="button">Завершити</button>':''}
        ${b.status!=='cancelled'?'<button class="cancel" data-status="cancelled" type="button">Скасувати</button>':''}
      </div>
    </article>
  `).join('');

  bookingList.querySelectorAll('[data-status]').forEach(btn=>{
    btn.addEventListener('click',()=>changeStatus(btn));
  });
}

function renderBlocked(){
  if(!blocked.length){
    blockedList.innerHTML='<div class="empty">Заблокованого часу за цими фільтрами немає.</div>';
    return;
  }

  blockedList.innerHTML=blocked.map(slot=>`
    <article class="blocked-card" data-id="${slot.id}">
      <div>
        <b>${slot.time}</b>
        <span>${slot.date}</span>
      </div>
      <div>
        <b>${escapeHtml(slot.barber.name_uk)}</b>
        <span>${slot.duration_minutes} хв</span>
      </div>
      <div class="blocked-reason">${escapeHtml(slot.reason||'Без причини')}</div>
      <button class="remove-block" type="button">Розблокувати</button>
    </article>
  `).join('');

  blockedList.querySelectorAll('.remove-block').forEach(btn=>{
    btn.addEventListener('click',()=>removeBlock(btn));
  });
}

function renderBarbers(){
  if(!barbers.length){
    barberList.innerHTML='<div class="empty">Майстрів немає.</div>';
    return;
  }

  barberList.innerHTML=barbers.map((barber,index)=>`
    <article class="barber-admin-card">
      <span class="barber-index">${String(index+1).padStart(2,'0')}</span>
      <div>
        <b>${escapeHtml(barber.name_uk)}</b>
        <span>${escapeHtml(barber.name_en)}</span>
      </div>
      <p>${escapeHtml(barber.specialization)}</p>
      <span class="barber-state ${barber.active?'active':'inactive'}">${barber.active?'активний':'неактивний'}</span>
    </article>
  `).join('');
}

async function changeStatus(btn){
  const card=btn.closest('.booking-card');
  const id=Number(card.dataset.id);
  btn.disabled=true;

  try{
    await request('/api/admin/bookings/'+id,{
      method:'PATCH',
      body:JSON.stringify({status:btn.dataset.status})
    });
    await Promise.all([loadBookings(),loadCalendar()]);
  }catch(error){
    alert(error.status===401?'Невірний admin key.':'Не вдалося оновити запис.');
  }finally{
    btn.disabled=false;
  }
}

async function removeBlock(btn){
  const card=btn.closest('.blocked-card');
  const id=Number(card.dataset.id);
  btn.disabled=true;

  try{
    await request('/api/admin/blocked-slots/'+id,{method:'DELETE'});
    await loadBlocked();
  }catch(error){
    alert(error.status===401?'Невірний admin key.':'Не вдалося розблокувати час.');
  }finally{
    btn.disabled=false;
  }
}

async function refreshDashboard(){
  await Promise.all([loadBookings(),loadBlocked(),loadCalendar(),health()]);
}

async function login(candidate){
  key=candidate;

  try{
    await request('/api/admin/bookings');
    sessionStorage.setItem('barber-admin-key',key);
    loginCard.hidden=true;
    dashboard.hidden=false;
    setStatus(loginStatus,'');
    await loadBarbers();
    await refreshDashboard();
  }catch(error){
    key='';
    sessionStorage.removeItem('barber-admin-key');
    setStatus(
      loginStatus,
      error.status===401?'Невірний ключ.':'Не вдалося з’єднатися з API.',
      'error'
    );
  }
}

loginForm.addEventListener('submit',e=>{
  e.preventDefault();
  login(adminKey.value.trim());
});

document.getElementById('logoutBtn').addEventListener('click',()=>{
  sessionStorage.removeItem('barber-admin-key');
  key='';
  dashboard.hidden=true;
  loginCard.hidden=false;
  adminKey.value='';
  adminKey.focus();
});

document.getElementById('todayBtn').addEventListener('click',async()=>{
  filterDate.value=today;
  calendarView=parseLocalDate(today.slice(0,7)+'-01');
  await refreshDashboard();
});

document.getElementById('allBtn').addEventListener('click',async()=>{
  filterDate.value='';
  filterBarber.value='';
  filterTime.value='';
  calendarView=parseLocalDate(today.slice(0,7)+'-01');
  await refreshDashboard();
});

document.getElementById('refreshBtn').addEventListener('click',refreshDashboard);
document.getElementById('refreshBlocksBtn').addEventListener('click',loadBlocked);

filterDate.addEventListener('change',async()=>{
  if(filterDate.value)calendarView=parseLocalDate(filterDate.value.slice(0,7)+'-01');
  await refreshDashboard();
});

filterBarber.addEventListener('change',refreshDashboard);
filterTime.addEventListener('change',loadBookings);

document.getElementById('calendarPrev').addEventListener('click',async()=>{
  calendarView=new Date(calendarView.getFullYear(),calendarView.getMonth()-1,1);
  await loadCalendar();
});

document.getElementById('calendarNext').addEventListener('click',async()=>{
  calendarView=new Date(calendarView.getFullYear(),calendarView.getMonth()+1,1);
  await loadCalendar();
});

document.getElementById('calendarToday').addEventListener('click',async()=>{
  filterDate.value=today;
  calendarView=parseLocalDate(today.slice(0,7)+'-01');
  await refreshDashboard();
});

barberForm.addEventListener('submit',async e=>{
  e.preventDefault();
  const nameUk=document.getElementById('barberNameUk');
  const nameEn=document.getElementById('barberNameEn');
  const specialization=document.getElementById('barberSpecialization');
  setStatus(barberStatus,'Додавання...');

  try{
    await request('/api/admin/barbers',{
      method:'POST',
      body:JSON.stringify({
        name_uk:nameUk.value.trim(),
        name_en:nameEn.value.trim(),
        specialization:specialization.value.trim()
      })
    });
    barberForm.reset();
    setStatus(barberStatus,'Майстра додано. Він уже доступний для онлайн-запису.','success');
    await loadBarbers();
    await loadCalendar();
  }catch(error){
    setStatus(
      barberStatus,
      error.status===400?'Перевірте ім’я та спеціалізацію.':'Не вдалося додати майстра.',
      'error'
    );
  }
});

blockForm.addEventListener('submit',async e=>{
  e.preventDefault();
  setStatus(blockStatus,'Збереження...');

  try{
    await request('/api/admin/blocked-slots',{
      method:'POST',
      body:JSON.stringify({
        barber_id:Number(blockBarber.value),
        date:document.getElementById('blockDate').value,
        time:document.getElementById('blockTime').value,
        duration_minutes:Number(document.getElementById('blockDuration').value),
        reason:document.getElementById('blockReason').value.trim()
      })
    });
    setStatus(blockStatus,'Час заблоковано.','success');
    document.getElementById('blockReason').value='';
    await loadBlocked();
  }catch(error){
    const text=error.status===409
      ?'Цей час уже заблокований.'
      :error.status===400
        ?'Перевірте дату, час і тривалість.'
        :'Не вдалося заблокувати час.';
    setStatus(blockStatus,text,'error');
  }
});

setInterval(()=>{
  if(!dashboard.hidden&&document.visibilityState==='visible'){
    Promise.all([loadBookings(),loadCalendar()]).catch(()=>{});
  }
},5000);

document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible'&&!dashboard.hidden){
    refreshDashboard().catch(()=>{});
  }
});

health();
if(key)login(key);
