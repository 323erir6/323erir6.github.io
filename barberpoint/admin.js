const API='https://barberpoint-api-oneone.onrender.com';
const loginCard=document.getElementById('loginCard');
const dashboard=document.getElementById('dashboard');
const loginForm=document.getElementById('loginForm');
const adminKey=document.getElementById('adminKey');
const loginStatus=document.getElementById('loginStatus');
const bookingList=document.getElementById('bookingList');
const blockedList=document.getElementById('blockedList');
const filterDate=document.getElementById('filterDate');
const listCaption=document.getElementById('listCaption');
const serverState=document.getElementById('serverState');
const blockBarber=document.getElementById('blockBarber');
const blockForm=document.getElementById('blockForm');
const blockStatus=document.getElementById('blockStatus');
let key=sessionStorage.getItem('barber-admin-key')||'';
let bookings=[];
let blocked=[];

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

filterDate.value=kyivDate();
document.getElementById('blockDate').value=kyivDate();

async function request(path,options={}){
  const response=await fetch(API+path,{
    ...options,
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

async function health(){
  const text=serverState.querySelector('span');
  try{
    const response=await fetch(API+'/api/health',{cache:'no-store'});
    const data=await response.json();
    if(!response.ok||!data.ok||data.database!=='postgresql')throw new Error('Database unavailable');
    serverState.className='server-state online';
    text.textContent='API / POSTGRESQL';
  }catch{
    serverState.className='server-state offline';
    text.textContent='API / OFFLINE';
  }
}

async function loadBarbers(){
  const response=await fetch(API+'/api/barbers',{cache:'no-store'});
  if(!response.ok)throw new Error('Could not load barbers');
  const rows=await response.json();
  blockBarber.innerHTML=rows.map(x=>'<option value="'+x.id+'">'+escapeHtml(x.name_uk)+'</option>').join('');
}

async function loadBookings(){
  bookingList.innerHTML='<div class="empty">Завантаження...</div>';
  const qs=filterDate.value?'?date='+encodeURIComponent(filterDate.value):'';
  bookings=await request('/api/admin/bookings'+qs);
  renderBookings();
}

async function loadBlocked(){
  blockedList.innerHTML='<div class="empty">Завантаження...</div>';
  const qs=filterDate.value?'?date='+encodeURIComponent(filterDate.value):'';
  blocked=await request('/api/admin/blocked-slots'+qs);
  renderBlocked();
}

function renderBookings(){
  document.getElementById('countAll').textContent=bookings.length;
  document.getElementById('countConfirmed').textContent=bookings.filter(x=>x.status==='confirmed').length;
  document.getElementById('countCompleted').textContent=bookings.filter(x=>x.status==='completed').length;
  document.getElementById('countCancelled').textContent=bookings.filter(x=>x.status==='cancelled').length;
  listCaption.textContent=filterDate.value||'усі дати';

  if(!bookings.length){
    bookingList.innerHTML='<div class="empty">Записів немає.</div>';
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
        <button class="complete" data-status="completed" type="button">Завершити</button>
        <button class="cancel" data-status="cancelled" type="button">Скасувати</button>
      </div>
    </article>
  `).join('');

  bookingList.querySelectorAll('[data-status]').forEach(btn=>{
    btn.addEventListener('click',()=>changeStatus(btn));
  });
}

function renderBlocked(){
  if(!blocked.length){
    blockedList.innerHTML='<div class="empty">Заблокованого часу немає.</div>';
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

async function changeStatus(btn){
  const card=btn.closest('.booking-card');
  const id=Number(card.dataset.id);
  btn.disabled=true;
  try{
    await request('/api/admin/bookings/'+id,{
      method:'PATCH',
      body:JSON.stringify({status:btn.dataset.status})
    });
    await loadBookings();
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
  await Promise.all([loadBookings(),loadBlocked(),health()]);
}

async function login(candidate){
  key=candidate;
  try{
    await request('/api/admin/bookings?date='+kyivDate());
    sessionStorage.setItem('barber-admin-key',key);
    loginCard.hidden=true;
    dashboard.hidden=false;
    setStatus(loginStatus,'');
    await Promise.all([loadBarbers(),loadBookings(),loadBlocked(),health()]);
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

document.getElementById('todayBtn').addEventListener('click',()=>{
  filterDate.value=kyivDate();
  refreshDashboard();
});

document.getElementById('allBtn').addEventListener('click',()=>{
  filterDate.value='';
  refreshDashboard();
});

document.getElementById('refreshBtn').addEventListener('click',refreshDashboard);
document.getElementById('refreshBlocksBtn').addEventListener('click',loadBlocked);
filterDate.addEventListener('change',refreshDashboard);

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

health();
if(key)login(key);
