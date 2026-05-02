let leads=[],curPage=1,totalPages=1,sending=false,sse=null,debounceTimer=null;
setInterval(()=>document.getElementById('clock').textContent=new Date().toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}),1000);

// ── Tabs ────────────────────────────────────────────────────
function switchTab(t){
  document.querySelectorAll('.tab-body').forEach(e=>e.style.display='none');
  document.querySelectorAll('.tab').forEach(e=>e.classList.remove('active'));
  document.getElementById('tab-'+t).style.display='block';
  event.target.classList.add('active');
  if(t==='followup') loadFollowups();
  if(t==='settings') loadSettings();
}

// ── Stats ───────────────────────────────────────────────────
async function loadStats(){
  try{
    const s=await(await fetch('/api/stats')).json();
    document.getElementById('stats-bar').innerHTML=
      `<div class="stat"><div class="n">${s.total}</div><div class="l">Total</div></div>`+
      `<div class="stat"><div class="n" style="color:#fbbf24">${s.pending}</div><div class="l">Pending WA</div></div>`+
      `<div class="stat"><div class="n" style="color:#34d399">${s.waSent}</div><div class="l">WA Sent</div></div>`+
      `<div class="stat"><div class="n" style="color:#f87171">${s.noSite}</div><div class="l">No Website</div></div>`+
      `<div class="stat"><div class="n" style="color:#c084fc">${s.followup}</div><div class="l">Follow-Up Due</div></div>`;
  }catch(e){}
}

// ── Fetch leads (paginated) ─────────────────────────────────
async function fetchLeads(page){
  if(page) curPage=page;
  const search=document.getElementById('f-search').value;
  const cat=document.getElementById('f-cat').value;
  const status=document.getElementById('f-status').value;
  const city=document.getElementById('f-city').value;
  const limit=document.getElementById('f-limit').value;
  const q=new URLSearchParams({page:curPage,limit,search,category:cat,status,city});
  try{
    const r=await(await fetch('/api/leads?'+q)).json();
    leads=r.leads; totalPages=r.pages; curPage=r.page;
    renderTable(); renderPager(r.total); loadStats();
  }catch(e){ document.getElementById('tbl-wrap').innerHTML='<div class="empty">Error loading</div>'; }
}

function debounceFetch(){ clearTimeout(debounceTimer); debounceTimer=setTimeout(()=>fetchLeads(1),400); }

// ── Load filters ────────────────────────────────────────────
async function loadFilters(){
  try{
    const cats=await(await fetch('/api/categories')).json();
    const sel=document.getElementById('f-cat');
    sel.innerHTML='<option value="">All Categories</option>'+cats.map(c=>`<option value="${c}">${c}</option>`).join('');
  }catch(e){}
  try{
    const cities=await(await fetch('/api/cities')).json();
    const sel=document.getElementById('f-city');
    sel.innerHTML='<option value="">All Cities</option>'+cities.map(c=>`<option value="${c}">${c}</option>`).join('');
  }catch(e){}
}

// ── Render table ────────────────────────────────────────────
function siteBadge(w){
  if(!w)return'<span class="badge br">❌ No Site</span>';
  const social=['whatsapp','wa.me','youtube','facebook','instagram'];
  if(social.some(f=>w.includes(f)))return'<span class="badge by">⚠️ Social</span>';
  return`<span class="badge bb">🌐 ${w.substring(0,18)}</span>`;
}
function statusBadge(s){
  const m={new:'bgr',contacted:'bb',followup:'by',interested:'bpur',converted:'bg',not_interested:'br',lost:'br'};
  return`<span class="badge ${m[s]||'bgr'}">${s||'new'}</span>`;
}
function catBadge(c){ return c?`<span class="badge bpur" style="font-size:9px">${c}</span>`:'' }

function renderTable(){
  const w=document.getElementById('tbl-wrap');
  if(!leads.length){w.innerHTML='<div class="empty">No leads found</div>';return;}
  let h=`<table><thead><tr>
    <th style="width:30px"><input type="checkbox" onchange="toggleAll(this.checked)"></th>
    <th>#</th><th>Business</th><th>Category</th><th>Phone</th><th>Website</th>
    <th>⭐</th><th>Rev</th><th>Status</th><th>WA</th><th>Email</th><th></th>
  </tr></thead><tbody>`;
  const perPage=parseInt(document.getElementById('f-limit').value)||25;
  leads.forEach((b,i)=>{
    const num=((curPage-1)*perPage)+i+1;
    h+=`<tr>
      <td><input type="checkbox" data-id="${b._id}"></td>
      <td style="color:#64748b;font-size:10px">${num}</td>
      <td><div style="font-weight:600;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${b.name||''}">${b.name||'—'}</div>
          <div style="font-size:9px;color:#64748b">${b.city||''}</div></td>
      <td>${catBadge(b.category)}</td>
      <td style="font-family:monospace;color:#34d399;font-size:11px">${b.raw_phone||b.phone||'—'}</td>
      <td>${siteBadge(b.website)}</td>
      <td style="color:#fbbf24;font-size:11px">${b.rating||'—'}</td>
      <td style="font-weight:600;font-size:11px">${b.reviews||'—'}</td>
      <td>${statusBadge(b.status)}</td>
      <td>${b.wa_sent?`<span class="badge bg">✅${b.wa_count>1?' ×'+b.wa_count:''}</span>`:'<span class="badge bgr">—</span>'}</td>
      <td>${b.email_sent?'<span class="badge bg">✅</span>':'<span class="badge bgr">—</span>'}</td>
      <td><button class="btn b-red" style="padding:2px 6px;font-size:9px" onclick="deleteLead('${b._id}')">🗑</button></td>
    </tr>`;
  });
  h+='</tbody></table>';
  w.innerHTML=h;
}

// ── Pagination ──────────────────────────────────────────────
function renderPager(total){
  const p=document.getElementById('pager');
  if(totalPages<=1){p.innerHTML='';return;}
  let h=`<button ${curPage<=1?'disabled':''} onclick="fetchLeads(${curPage-1})">◀</button>`;
  const start=Math.max(1,curPage-3), end=Math.min(totalPages,curPage+3);
  if(start>1) h+=`<button onclick="fetchLeads(1)">1</button><span>...</span>`;
  for(let i=start;i<=end;i++) h+=`<button class="${i===curPage?'active':''}" onclick="fetchLeads(${i})">${i}</button>`;
  if(end<totalPages) h+=`<span>...</span><button onclick="fetchLeads(${totalPages})">${totalPages}</button>`;
  h+=`<button ${curPage>=totalPages?'disabled':''} onclick="fetchLeads(${curPage+1})">▶</button>`;
  h+=`<span style="margin-left:10px">${total} leads</span>`;
  p.innerHTML=h;
}

function toggleAll(c){ document.querySelectorAll('input[data-id]').forEach(e=>e.checked=c); }
function getSelected(){ return[...document.querySelectorAll('input[data-id]:checked')].map(e=>e.dataset.id); }

// ── Scrape ──────────────────────────────────────────────────
async function doScrape(){
  const kw=document.getElementById('kw').value.trim();
  const city=document.getElementById('city').value.trim();
  const max=parseInt(document.getElementById('maxr').value)||9999;
  if(!kw||!city){alert('Enter keyword and city');return;}
  const btn=document.getElementById('btn-scrape');
  btn.disabled=true; btn.textContent='⏳ Scraping...';
  showProgress('Scraping Google Maps...');
  connectSSE();
  await fetch('/api/scrape',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({keyword:kw,city,max})});
  plog('Scrape started...','in');
  btn.disabled=false; btn.textContent='🔍 Extract';
}

// ── Auto-send WA ────────────────────────────────────────────
async function startAutoSend(){
  if(sending)return alert('Already sending');
  const sel=getSelected();
  const count=sel.length||leads.filter(b=>b.phone&&!b.wa_sent).length;
  if(!count)return alert('No pending leads');
  if(!confirm(`🚀 Send WhatsApp to ${count} leads?`))return;
  sending=true;
  document.getElementById('btn-autosend').disabled=true;
  showProgress('Sending via UltraMsg API...');
  connectSSE();
  await fetch('/api/send/wa',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:sel.length?sel:null})});
  plog('Send job started','in');
}

// ── Follow-up ───────────────────────────────────────────────
async function startFollowup(channel){
  const sel=getSelected();
  if(!confirm(`🔄 Send ${channel.toUpperCase()} follow-up to ${sel.length||'all due'} leads?`))return;
  showProgress('Sending AI follow-ups...');
  connectSSE();
  await fetch('/api/send/followup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:sel.length?sel:null,channel})});
  plog('Follow-up started','in');
}

async function loadFollowups(){
  try{
    const list=await(await fetch('/api/followups')).json();
    const el=document.getElementById('followup-list');
    if(!list.length){el.innerHTML='<div class="empty">No follow-ups due right now 🎉</div>';return;}
    let h='<table><thead><tr><th>#</th><th>Business</th><th>Phone</th><th>WA Sent</th><th>Follow-ups</th><th>Last Contact</th></tr></thead><tbody>';
    list.forEach((l,i)=>{
      h+=`<tr><td>${i+1}</td><td>${l.name}</td><td>${l.raw_phone||l.phone||'—'}</td>
        <td>${l.wa_count||0}×</td><td>${l.followup_count||0}</td>
        <td style="color:#64748b;font-size:11px">${l.wa_sent_at?new Date(l.wa_sent_at).toLocaleDateString('en-IN'):'—'}</td></tr>`;
    });
    h+='</tbody></table>';
    el.innerHTML=h;
  }catch(e){ document.getElementById('followup-list').innerHTML='<div class="empty">Error</div>'; }
}

// ── Progress / SSE ──────────────────────────────────────────
function plog(msg,cls=''){
  const b=document.getElementById('prog-log');
  const p=document.createElement('p');
  p.className=cls; p.textContent=`[${new Date().toLocaleTimeString()}] ${msg}`;
  b.appendChild(p); b.scrollTop=b.scrollHeight;
}

function showProgress(title){
  const panel=document.getElementById('progress-panel');
  panel.classList.add('show');
  document.getElementById('prog-log').innerHTML='';
  document.getElementById('prog-bar').style.width='0%';
  document.getElementById('prog-sent').textContent='0';
  document.getElementById('prog-failed').textContent='0';
  document.getElementById('prog-total').textContent='0';
  document.getElementById('prog-current').textContent='Starting...';
  document.getElementById('prog-title-txt').textContent=title;
  document.getElementById('prog-icon').className='pulse';
  document.getElementById('prog-icon').textContent='📤';
}

function connectSSE(){
  if(sse) sse.close();
  sse=new EventSource('/api/progress');
  sse.onmessage=e=>handleProgress(JSON.parse(e.data));
  sse.onerror=()=>plog('SSE error','er');
}

function handleProgress(d){
  if(d.type==='connected')return;
  if(d.type==='start'){ document.getElementById('prog-total').textContent=d.total; plog(`Starting for ${d.total} leads...`,'in'); }
  if(d.type==='status'){ plog(d.message,'in'); document.getElementById('prog-current').textContent=d.message; }
  if(d.type==='scrape_done'){ plog(d.message,'ok'); fetchLeads(1); loadFilters(); stopSending(); }
  if(d.type==='sending'){
    const pct=Math.round((d.current/d.total)*100);
    document.getElementById('prog-bar').style.width=pct+'%';
    document.getElementById('prog-sent').textContent=d.sent;
    document.getElementById('prog-failed').textContent=d.failed;
    document.getElementById('prog-current').textContent=`[${d.current}/${d.total}] → ${d.name}`;
    plog(`→ ${d.name}`);
  }
  if(d.type==='sent'){ document.getElementById('prog-sent').textContent=d.sent; plog(`✅ ${d.name}`,'ok'); }
  if(d.type==='failed'){ document.getElementById('prog-failed').textContent=d.failed; plog(`❌ ${d.name}: ${d.reason}`,'er'); }
  if(d.type==='skipped'){ plog(`⚠️ Skip: ${d.name} — ${d.reason}`,'wa'); }
  if(d.type==='waiting'){ document.getElementById('prog-current').textContent=`⏳ ${d.seconds}s...`; }
  if(d.type==='done'){
    document.getElementById('prog-bar').style.width='100%';
    document.getElementById('prog-icon').textContent='🎉';
    document.getElementById('prog-icon').className='';
    document.getElementById('prog-title-txt').textContent=`Done! Sent: ${d.sent} | Failed: ${d.failed}`;
    plog(`🎉 Complete! Sent:${d.sent} Failed:${d.failed}`,'ok');
    fetchLeads(); stopSending();
  }
  if(d.type==='error'){ plog('❌ '+d.message,'er'); stopSending(); }
}

function stopSending(){
  sending=false;
  if(sse){sse.close();sse=null;}
  document.getElementById('btn-autosend').disabled=false;
  document.getElementById('btn-autosend').textContent='🚀 Auto-Send WA';
}

// ── Settings ────────────────────────────────────────────────
async function loadSettings(){
  try{
    const s=await(await fetch('/api/settings')).json();
    if(s.ultramsg){
      document.getElementById('s-um-id').value=s.ultramsg.instanceId||'';
      if(s.ultramsg.token) document.getElementById('s-um-token').placeholder='Token saved ✓ (hidden)';
    }
    if(s.smtp_host) document.getElementById('s-smtp-host').value=s.smtp_host;
    if(s.smtp_port) document.getElementById('s-smtp-port').value=s.smtp_port;
    if(s.smtp_secure) document.getElementById('s-smtp-secure').value=s.smtp_secure;
    if(s.smtp_user) document.getElementById('s-smtp-user').value=s.smtp_user;
    if(s.smtp_from) document.getElementById('s-smtp-from').value=s.smtp_from;
    if(s.smtp_pass) document.getElementById('s-smtp-pass').placeholder='Password saved ✓ (hidden)';
  }catch(e){}
}

async function saveSettings(){
  const body={
    smtp_host: document.getElementById('s-smtp-host').value,
    smtp_port: document.getElementById('s-smtp-port').value,
    smtp_secure: document.getElementById('s-smtp-secure').value,
    smtp_user: document.getElementById('s-smtp-user').value,
    smtp_from: document.getElementById('s-smtp-from').value,
  };
  const pass=document.getElementById('s-smtp-pass').value;
  if(pass && pass!=='••••••••') body.smtp_pass=pass;
  const umId=document.getElementById('s-um-id').value.trim();
  const umTk=document.getElementById('s-um-token').value.trim();
  if(umId) body.ultramsg={instanceId:umId,token:umTk||undefined};
  await fetch('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  document.getElementById('save-status').textContent='✅ Saved!';
  setTimeout(()=>document.getElementById('save-status').textContent='',3000);
  checkConnections();
}

async function testUltraMsg(){
  document.getElementById('um-status').innerHTML='<span style="color:#60a5fa">Testing...</span>';
  const r=await(await fetch('/api/test-ultramsg',{method:'POST'})).json();
  document.getElementById('um-status').innerHTML=r.success&&r.connected
    ?'<span style="color:#34d399">✅ Connected & Authenticated!</span>'
    :`<span style="color:#f87171">❌ ${r.error||'Status: '+r.status}</span>`;
  checkConnections();
}

async function testSmtp(){
  document.getElementById('smtp-status').innerHTML='<span style="color:#60a5fa">Testing...</span>';
  const r=await(await fetch('/api/test-smtp',{method:'POST'})).json();
  document.getElementById('smtp-status').innerHTML=r.success
    ?'<span style="color:#34d399">✅ SMTP Connected!</span>'
    :`<span style="color:#f87171">❌ ${r.error}</span>`;
}

// ── Connection badges ───────────────────────────────────────
async function checkConnections(){
  try{
    const db=await(await fetch('/api/db-status')).json();
    document.getElementById('db-badge').className='badge-sm '+(db.connected?'s-ok':'s-err');
    document.getElementById('db-badge').textContent=db.connected?'🟢 DB':'🔴 DB';
  }catch(e){}
  try{
    const cfg=await(await fetch('/api/settings')).json();
    const hasCfg=cfg.ultramsg?.instanceId && cfg.ultramsg?.token;
    document.getElementById('wa-badge').className='badge-sm '+(hasCfg?'s-warn':'s-err');
    document.getElementById('wa-badge').textContent=hasCfg?'🟡 WA':'🔴 WA';
  }catch(e){}
}

// ── CRUD ────────────────────────────────────────────────────
async function deleteLead(id){
  if(!confirm('Delete?'))return;
  await fetch('/api/leads/'+id,{method:'DELETE'});
  fetchLeads();
}

async function clearAll(){
  if(!confirm('DELETE ALL LEADS?'))return;
  await fetch('/api/leads',{method:'DELETE'});
  fetchLeads();
}

async function importManual(){
  const name=prompt('Business Name:'); if(!name)return;
  const phone=prompt('Phone (10 digits):'); if(!phone)return;
  const website=prompt('Website:');
  const city=prompt('City:','Lucknow');
  const email=prompt('Email:');
  await fetch('/api/leads/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({leads:[{
    name,raw_phone:phone,phone:'91'+phone.replace(/\D/g,''),website:website||'',city:city||'',email:email||''
  }]})});
  fetchLeads();
}

// ── Init ────────────────────────────────────────────────────
fetchLeads(1);
loadFilters();
loadStats();
loadSettings();
checkConnections();
