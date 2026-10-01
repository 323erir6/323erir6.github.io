const API='https://barberpoint-api-oneone.onrender.com';
const loginCard=document.getElementById('loginCard');
const dashboard=document.getElementById('dashboard');
const loginForm=document.getElementById('loginForm');
const adminKey=document.getElementById('adminKey');
const loginStatus=document.getElementById('loginStatus');
const bookingList=document.getElementById('bookingList');
const filterDate=document.getElementById('filterDate');
const listCaption=document.getElementById('listCaption');
const serverState=document.getElementById('serverState');
const blockBarber=document.getElementById('blockBarber');
const blockForm=document.getElementById('blockForm');
const blockStatus=document.getElementById('blockStatus');
let key=sessionStorage.getItem('barber-admin-key')||'';
let bookings=[];

function localDate(){
  const d=new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
filterDate.value=localDate();
document.getElementById('blockDate').value=localDate();

async function request(path,options={}){
  const response=await fetch(API+path,{
    ...options,
    headers:{'Content-Type':'application/json',...(key?{'X-Admin-Key':key}:{}),...(options.headers||{})}
  });
  let data={};try{data=await response.json();}catch{}
  if(!response.ok){const e=new Error(data.error||'Request failed');e.status=response.status;throw e}
  return data;
}
function setStatus(el,text,type=''){el.textContent=text;el.className='status '+type}
function statusLabel(value){return {confirmed:'підтверджено',cancelled:'скасовано',completed:'завершено'}[value]||value}

async function health(){
  try{await fetch(API+'/api/health');serverState.className='server-state online'}
  catch{serverState.className='server-state offline'}
}
async function loadBarbers(){
  const rows=await fetch(API+'/api/barbers').then(r=>r.json());
  blockBarber.innerHTML=rows.map(x=>'<option value="'+x.id+'">'+x.name_uk+'</option>').join('');
}
async function loadBookings(){
  bookingList.innerHTML='<div class="empty">Завантаження...</div>';
  const qs=filterDate.value?'?date='+encodeURIComponent(filterDate.value):'';
  bookings=await request('/api/admin/bookings'+qs);
  renderBookings();
}
function renderBookings(){
  document.getElementById('countAll').textContent=bookings.length;
  document.getElementById('countConfirmed').textContent=bookings.filter(x=>x.status==='confirmed').length;
  document.getElementById('countCompleted').textContent=bookings.filter(x=>x.status==='completed').length;
  document.getElementById('countCancelled').textContent=bookings.filter(x=>x.status==='cancelled').length;
  listCaption.textContent=filterDate.value||'усі дати';
  if(!bookings.length){bookingList.innerHTML='<div class="empty">Записів немає.</div>';return}
  bookingList.innerHTML=bookings.map(b=>`
    <article class="booking-card" data-id="${b.id}">
      <div class="booking-time">${b.time}</div>
      <div class="booking-person"><b>${escapeHtml(b.name)}</b><span>${escapeHtml(b.phone)}</span></div>
      <div class="booking-service"><b>${escapeHtml(b.service.name_uk)}</b><span>${escapeHtml(b.barber.name_uk)} · ${b.duration_minutes} хв</span></div>
      <div><span class="booking-date">${b.date}</span><span class="badge ${b.status}">${statusLabel(b.status)}</span></div>
      <div class="booking-actions">
        <button class="complete" data-status="completed" type="button">Завершити</button>
        <button class="cancel" data-status="cancelled" type="button">Скасувати</button>
      </div>
    </article>`).join('');
  bookingList.querySelectorAll('[data-status]').forEach(btn=>btn.addEventListener('click',()=>changeStatus(btn)));
}
function escapeHtml(value){const d=document.createElement('div');d.textContent=value??'';return d.innerHTML}
async function changeStatus(btn){
  const card=btn.closest('.booking-card'),id=Number(card.dataset.id);
  btn.disabled=true;
  try{
    await request('/api/admin/bookings/'+id,{method:'PATCH',body:JSON.stringify({status:btn.dataset.status})});
    await loadBookings();
  }catch(e){alert(e.status===401?'Невірний admin key.':'Не вдалося оновити запис.')}
  finally{btn.disabled=false}
}
async function login(candidate){
  key=candidate;
  try{
    await request('/api/admin/bookings?date='+localDate());
    sessionStorage.setItem('barber-admin-key',key);
    loginCard.hidden=true;dashboard.hidden=false;
    setStatus(loginStatus,'');
    await Promise.all([loadBarbers(),loadBookings()]);
  }catch(e){
    key='';sessionStorage.removeItem('barber-admin-key');
    setStatus(loginStatus,e.status===401?'Невірний ключ.':'Не вдалося з’єднатися з API.','error');
  }
}
loginForm.addEventListener('submit',e=>{e.preventDefault();login(adminKey.value.trim())});
document.getElementById('logoutBtn').addEventListener('click',()=>{sessionStorage.removeItem('barber-admin-key');key='';dashboard.hidden=true;loginCard.hidden=false;adminKey.value='';adminKey.focus()});
document.getElementById('todayBtn').addEventListener('click',()=>{filterDate.value=localDate();loadBookings()});
document.getElementById('allBtn').addEventListener('click',()=>{filterDate.value='';loadBookings()});
document.getElementById('refreshBtn').addEventListener('click',loadBookings);
filterDate.addEventListener('change',loadBookings);

blockForm.addEventListener('submit',async e=>{
  e.preventDefault();setStatus(blockStatus,'Збереження...');
  try{
    await request('/api/admin/blocked-slots',{method:'POST',body:JSON.stringify({
      barber_id:Number(blockBarber.value),
      date:document.getElementById('blockDate').value,
      time:document.getElementById('blockTime').value,
      duration_minutes:Number(document.getElementById('blockDuration').value),
      reason:document.getElementById('blockReason').value.trim()
    })});
    setStatus(blockStatus,'Час заблоковано.','success');
    document.getElementById('blockReason').value='';
  }catch(e){setStatus(blockStatus,e.status===409?'Цей час уже заблокований.':'Не вдалося заблокувати час.','error')}
});

health();
if(key)login(key);
