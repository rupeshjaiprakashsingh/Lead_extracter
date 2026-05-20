let leads=[],curPage=1,totalPages=1,sending=false,sse=null,debounceTimer=null;
setInterval(()=>document.getElementById('clock').textContent=new Date().toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}),1000);

// Inject .b-purple style
(()=>{ const s=document.createElement('style');
  s.textContent='.b-purple{background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;border:none;} .b-purple:hover{opacity:.9}';
  document.head.appendChild(s); })();

// ── Quick keyword chip setter ────────────────────────────────
function setKw(keyword) {
  document.getElementById('kw').value = keyword;
  // Highlight active chip
  document.querySelectorAll('.kw-chip').forEach(c => c.classList.remove('active'));
  event.target.classList.add('active');
  // Auto-focus city field so user can change city
  document.getElementById('city').focus();
  document.getElementById('city').select();
}



// ── Tabs ────────────────────────────────────────────────────
function switchTab(t){
  document.querySelectorAll('.tab-body').forEach(e=>e.style.display='none');
  document.querySelectorAll('.tab').forEach(e=>e.classList.remove('active'));
  document.getElementById('tab-'+t).style.display='block';
  event.target.classList.add('active');
  if(t==='followup') loadFollowups();
  if(t==='social') loadSocial();
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
      `<div class="stat" title="Click to filter No Website leads" style="cursor:pointer;border:1px solid #f59e0b" onclick="applyNoWebsiteFilter()"><div class="n" style="color:#fb923c">${s.noSite}</div><div class="l" style="color:#f59e0b">🌐 No Website ▶</div></div>`+
      `<div class="stat"><div class="n" style="color:#c084fc">${s.followup}</div><div class="l">Follow-Up Due</div></div>`;

    // ── Category Breakdown Bar ───────────────────────────────
    const breakdown = s.categoryBreakdown || [];
    const catBar = document.getElementById('cat-breakdown-bar');
    if(catBar && breakdown.length){
      catBar.style.display = 'flex';
      catBar.innerHTML = '<span style="font-size:10px;color:#64748b;font-weight:700;margin-right:4px;white-space:nowrap">📊 BY CATEGORY:</span>' +
        breakdown.map(c =>
          `<span class="cat-count-chip" onclick="filterByCategory('${c.name.replace(/'/g,"\\'")}')" title="Filter: ${c.name}">
            <span class="cat-count-name">${c.name}</span>
            <span class="cat-count-num">${c.count}</span>
          </span>`
        ).join('') +
        '<span class="cat-count-chip" onclick="clearCatFilter()" style="background:#1e293b;border-color:#475569" title="Show All">All <span class="cat-count-num" style="background:#475569">'+ s.total +'</span></span>';
    }
  }catch(e){}
}

function filterByCategory(cat){
  const sel = document.getElementById('f-cat');
  if(!sel) return;
  const opt = Array.from(sel.options).find(o => o.value === cat);
  if(opt){ sel.value = cat; fetchLeads(1); }
}

function clearCatFilter(){
  const sel = document.getElementById('f-cat');
  if(sel){ sel.value = ''; fetchLeads(1); }
}


// One-click: apply No Website filter from stat card
function applyNoWebsiteFilter() {
  const cb = document.getElementById('f-no-website');
  if (cb) { cb.checked = true; fetchLeads(1); }
  // Scroll to filter bar
  document.querySelector('.filters')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ── Fetch leads (paginated) ─────────────────────────────────
async function fetchLeads(page){
  if(page) curPage=page;
  const search=document.getElementById('f-search').value;
  const cat=document.getElementById('f-cat').value;
  const status=document.getElementById('f-status').value;
  const city=document.getElementById('f-city').value;
  const limit=document.getElementById('f-limit').value;
  const skipWa=document.getElementById('f-skip-wa')?.checked?'1':'';
  const skipEmail=document.getElementById('f-skip-email')?.checked?'1':'';
  const noWebsite=document.getElementById('f-no-website')?.checked?'1':'';
  const q=new URLSearchParams({page:curPage,limit,search,category:cat,status,city,skipWaSent:skipWa,skipEmailSent:skipEmail,noWebsite});
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
    <th>#</th><th>Business</th><th>Category</th><th>Phone</th><th>Emails</th><th>Website</th>
    <th>⭐</th><th>Rev</th><th>Status</th><th>WA</th><th>Email</th><th></th>
  </tr></thead><tbody>`;
  const perPage=parseInt(document.getElementById('f-limit').value)||25;
  leads.forEach((b,i)=>{
    const num=((curPage-1)*perPage)+i+1;
    const isChecked = selectedIds.has(b._id) ? 'checked' : '';
    h+=`<tr ${isChecked ? 'style="background:rgba(124,58,237,.12);outline:1px solid rgba(124,58,237,.3)"' : ''}>
      <td><input type="checkbox" data-id="${b._id}" ${isChecked} onchange="onCheckChange(this)"></td>
      <td style="color:#64748b;font-size:10px">${num}</td>
      <td><div style="font-weight:600;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${b.name||''}">${b.name||'—'}</div>
          <div style="font-size:9px;color:#64748b">${b.city||''}</div></td>
      <td>${catBadge(b.category)}</td>
      <td style="font-family:monospace;color:#34d399;font-size:11px">${b.raw_phone||b.phone||'—'}</td>
      <td style="font-size:10px;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#cbd5e1" title="${b.email||''}">${b.email||'—'}</td>
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
  updateSelectionBar();
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

// ── Persistent cross-page selection ─────────────────────────────────
const selectedIds = new Set();

function onCheckChange(cb) {
  const id = cb.dataset.id;
  if (cb.checked) selectedIds.add(id);
  else selectedIds.delete(id);
  updateSelectionBar();
}

function toggleAll(checked) {
  document.querySelectorAll('input[data-id]').forEach(cb => {
    cb.checked = checked;
    const id = cb.dataset.id;
    if (checked) selectedIds.add(id);
    else selectedIds.delete(id);
  });
  updateSelectionBar();
}

function clearAllSelections() {
  selectedIds.clear();
  document.querySelectorAll('input[data-id]').forEach(cb => cb.checked = false);
  const hdrCb = document.querySelector('thead input[type=checkbox]');
  if (hdrCb) hdrCb.checked = false;
  updateSelectionBar();
}

function getSelected() { return [...selectedIds]; }

function updateSelectionBar() {
  const bar  = document.getElementById('sel-bar');
  const cnt  = document.getElementById('sel-count');
  if (!bar) return;
  if (selectedIds.size === 0) {
    bar.style.display = 'none';
  } else {
    bar.style.display = 'flex';
    cnt.textContent   = selectedIds.size;
  }
}


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
  const skipWaSent=document.getElementById('f-skip-wa')?.checked||false;
  if(!sel.length) return alert('Please select at least one lead to send WhatsApp messages.');
  const skipNote=skipWaSent?'\n\n✅ "Skip WA Sent" is ON — already-messaged leads will be skipped.':'';
  if(!confirm(`📝 DRAFT MODE\n\nWhatsApp Web will open and automatically pre-fill messages for all ${sel.length} leads one by one.\n\nDo NOT close the browser while it works!\n\nOnce done, go through each chat and click Send yourself — no auto-clicking, 100% safe.${skipNote}`))return;
  sending=true;
  document.getElementById('btn-autosend').disabled=true;
  document.getElementById('btn-autosend').textContent='⏳ Drafting...';
  showProgress('📝 Drafting WhatsApp messages — browser will stay open when done...');
  connectSSE();
  
  try {
      await fetch('/api/send/wa-draft',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:sel,skipWaSent})});
      plog('📝 Draft mode started — WhatsApp Web is opening each chat and pre-filling messages...','in');
  } catch(err) {
      alert('Error: ' + err.message);
      sending=false;
      document.getElementById('btn-autosend').disabled=false;
      document.getElementById('btn-autosend').textContent='📝 Draft WA Messages';
  }
}

// ── Follow-up ───────────────────────────────────────────────
async function startFollowup(channel){
  const sel=getSelected();
  if(!sel.length) return alert(`Please select at least one lead for ${channel.toUpperCase()} follow-up.`);
  
  if(channel === 'email' || channel === 'both') {
      if(!confirm(`🔄 Send Email follow-ups to ${sel.length} selected leads via API?`))return;
      showProgress('Sending Email follow-ups...');
      connectSSE();
      await fetch('/api/send/followup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:sel,channel:'email'})});
      plog('Email follow-up started','in');
  }
  
  if(channel === 'wa' || channel === 'both') {
      if(!confirm(`⚠️ Automating WhatsApp Web for ${sel.length} selected WA follow-ups. Continue?`))return;
      showProgress('Automating WA follow-ups...');
      connectSSE();
      try {
          await fetch('/api/send/followup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:sel,channel:'wa'})});
          plog('WA Follow-up started','in');
      } catch(e) {
          alert(e.message);
      }
  }
}

// ── Send Email to selected (from floating bar) ───────────────
async function sendEmailToSelected() {
  const sel = getSelected();
  if (!sel.length) return alert('Please select at least one lead to send email.');
  if (!confirm(`📧 Send AI-personalised emails to ${sel.length} selected leads?\n\nThis will use your SMTP settings to send individual emails.`)) return;
  showProgress('Sending emails...');
  connectSSE();
  try {
    await fetch('/api/send/email', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ ids: sel })
    });
    plog('Email send job started','in');
  } catch(e) {
    alert('Error: ' + e.message);
  }
}

// ── Email Extraction ─────────────────────────────────────────
async function startEmailExtraction() {
  if (sending) return alert('Already running a task');
  if (!confirm('🌐 Extract emails for ALL leads that have a website but no email? This may take some time.')) return;
  showProgress('Extracting Emails...');
  connectSSE();
  try {
    await fetch('/api/leads/extract-emails', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
  } catch(e) {
    alert('Error: ' + e.message);
  }
}

async function extractEmailsForSelected() {
  if (sending) return alert('Already running a task');
  const sel = getSelected();
  if (!sel.length) return alert('Please select at least one lead.');
  if (!confirm(`🌐 Extract emails for ${sel.length} selected leads?`)) return;
  showProgress('Extracting Emails...');
  connectSSE();
  try {
    await fetch('/api/leads/extract-emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: sel })
    });
  } catch(e) {
    alert('Error: ' + e.message);
  }
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
    // Load message templates
    if(s.wa_template)    document.getElementById('s-wa-template').value   = s.wa_template;
    if(s.email_subject)  document.getElementById('s-email-subject').value = s.email_subject;
    if(s.email_body)     document.getElementById('s-email-body').value    = s.email_body;
    // Google Contacts credentials
    if(s.google_client_id)     document.getElementById('s-google-client-id').value     = s.google_client_id;
    if(s.google_client_secret) document.getElementById('s-google-client-secret').placeholder = 'Secret saved ✓';
  }catch(e){}
}

async function saveSettings(){
  const body={
    smtp_host: document.getElementById('s-smtp-host').value,
    smtp_port: document.getElementById('s-smtp-port').value,
    smtp_secure: document.getElementById('s-smtp-secure').value,
    smtp_user: document.getElementById('s-smtp-user').value,
    smtp_from: document.getElementById('s-smtp-from').value,
    // Message templates
    wa_template:   document.getElementById('s-wa-template').value,
    email_subject: document.getElementById('s-email-subject').value,
    email_body:    document.getElementById('s-email-body').value,
    // Google OAuth credentials
    google_client_id:     document.getElementById('s-google-client-id').value.trim(),
    google_client_secret: document.getElementById('s-google-client-secret').value.trim() || undefined,
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

async function syncContacts(){
  document.getElementById('vcf-modal').style.display='flex';
  document.getElementById('vcf-step2').style.display='none';
  try {
    const s = await (await fetch('/api/contacts/stats')).json();
    document.getElementById('vcf-stat-pending').textContent = s.pending;
    document.getElementById('vcf-stat-saved').textContent   = s.saved;
    document.getElementById('vcf-stat-total').textContent   = s.total;

    const newBtn = document.getElementById('vcf-btn-new');
    const banner = document.getElementById('vcf-already-imported-banner');

    // Show warning banner if NOTHING is marked saved yet but there are many leads
    // (means user already imported manually before this tracking system existed)
    if (s.saved === 0 && s.total > 50) {
      banner.style.display = 'block';
    } else {
      banner.style.display = 'none';
    }

    if (s.pending === 0) {
      newBtn.disabled = true;
      newBtn.innerHTML = '✅ All contacts already saved — nothing new!';
      newBtn.style.opacity = '.5';
    } else {
      newBtn.disabled = false;
      newBtn.style.opacity = '1';
      newBtn.innerHTML = `⬇️ Download NEW Contacts Only <span style="background:rgba(0,0,0,.3);padding:2px 8px;border-radius:10px;font-size:11px">${s.pending} contacts</span>`;
    }
    document.getElementById('vcf-new-count').textContent = `${s.pending} contacts`;
  } catch(e) {
    console.error('Stats load error:', e);
  }
}

// One-time fix: mark ALL current leads as already saved
async function markAllAsSaved() {
  const btn = document.getElementById('vcf-mark-all-btn');
  const msg = document.getElementById('vcf-mark-all-msg');
  if (!confirm(`This will mark ALL ${document.getElementById('vcf-stat-total').textContent} leads as already saved in your phone contacts.\n\nOnly NEW leads added after today will appear in future exports.\n\nContinue?`)) return;
  btn.disabled = true;
  btn.textContent = '⏳ Marking all as saved...';
  try {
    const r = await (await fetch('/api/contacts/mark-all-saved', { method: 'POST' })).json();
    if (r.success) {
      msg.style.color = '#34d399';
      msg.textContent = `✅ Done! ${r.marked} leads marked as saved. Future exports will only include new leads.`;
      btn.style.display = 'none';
      // Refresh stats
      await syncContacts();
    } else {
      msg.style.color = '#f87171';
      msg.textContent = '❌ Error: ' + r.error;
      btn.disabled = false;
      btn.textContent = '✅ I Already Imported All These — Mark All as Saved';
    }
  } catch(e) {
    msg.style.color = '#f87171';
    msg.textContent = '❌ ' + e.message;
    btn.disabled = false;
  }
}


// ── Smart VCF downloader ─────────────────────────────────────
async function downloadVcf(newOnly = true) {
  const sel = getSelected();
  const btn = newOnly ? document.getElementById('vcf-btn-new') : null;
  const orig = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Generating...'; }

  try {
    const resp = await fetch('/api/leads/export-vcf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // If user selected specific leads → export those; else use newOnly flag
      body: JSON.stringify({
        ids:     sel.length ? sel : undefined,
        newOnly: sel.length ? false : newOnly
      })
    });

    const count = parseInt(resp.headers.get('X-Exported-Count') || '0');
    const blob  = await resp.blob();

    if (count === 0) {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '✅ All contacts already saved on your phone!';
      }
      document.getElementById('vcf-mark-msg').textContent = '✅ Nothing new to export — all leads already saved.';
      return;
    }

    // Trigger file download
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = `new_contacts_${new Date().toISOString().slice(0,10)}.vcf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Server already marked them as saved — just show confirmation
    if (btn) btn.innerHTML = `✅ Downloaded ${count} new contacts!`;
    document.getElementById('vcf-mark-msg').textContent =
      `✅ ${count} contacts saved & marked — they won't appear in future downloads`;
    document.getElementById('vcf-step2').style.display = 'block';

    // Refresh live stats
    await syncContacts();

  } catch(e) {
    if (btn) { btn.innerHTML = orig; btn.disabled = false; }
    alert('❌ Download error: ' + e.message);
  }
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
  // Google Contacts badge
  try{
    const g=await(await fetch('/api/google-status')).json();
    const badge=document.getElementById('google-badge');
    if(badge){
      badge.className='badge-sm '+(g.authorized?'s-ok':'s-err');
      badge.textContent=g.authorized?'🟢 Google Connected':'⚪ Not Connected';
    }
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

// ── Excel Import ────────────────────────────────────────────
let _xlFile = null;
let _xlPreviewRows = [];

function openExcelImport(){
  _xlFile = null;
  _xlPreviewRows = [];
  document.getElementById('xl-file-input').value = '';
  document.getElementById('xl-preview').innerHTML = '';
  document.getElementById('xl-actions').style.display = 'none';
  document.getElementById('excel-modal').style.display = 'block';
  document.body.style.overflow = 'hidden';
}

function closeExcelImport(){
  document.getElementById('excel-modal').style.display = 'none';
  document.body.style.overflow = '';
}

async function onExcelFileChosen(file){
  if(!file) return;
  _xlFile = file;
  const prev = document.getElementById('xl-preview');
  prev.innerHTML = '<div style="color:#60a5fa;font-size:13px;padding:10px 0">⏳ Parsing file...</div>';

  const fd = new FormData();
  fd.append('file', file);
  try {
    const r = await fetch('/api/leads/import-excel/preview', { method:'POST', body:fd });
    const d = await r.json();
    if(!r.ok) { prev.innerHTML = `<div style="color:#f87171;font-size:13px">❌ ${d.error||'Parse error'}</div>`; return; }
    _xlPreviewRows = d.rows || [];
    renderExcelPreview(d.rows);
  } catch(e) {
    prev.innerHTML = `<div style="color:#f87171;font-size:13px">❌ Network error: ${e.message}</div>`;
  }
}

function renderExcelPreview(rows){
  const prev = document.getElementById('xl-preview');
  if(!rows.length){
    prev.innerHTML = '<div style="color:#f87171;font-size:13px;padding:10px 0">❌ No valid rows found. Make sure columns are: Party Name, Address, Phone No</div>';
    return;
  }

  const phoneOk = rows.filter(r=>r.phone).length;
  const noPhone = rows.length - phoneOk;

  let h = `
    <div style="display:flex;gap:12px;margin-bottom:14px;flex-wrap:wrap">
      <div style="background:#1e293b;border:1px solid #334155;border-radius:8px;padding:10px 16px;font-size:12px">
        📋 <b style="color:#60a5fa">${rows.length}</b> rows found
      </div>
      <div style="background:#1e293b;border:1px solid #334155;border-radius:8px;padding:10px 16px;font-size:12px">
        📱 <b style="color:#34d399">${phoneOk}</b> with phone
      </div>
      ${noPhone > 0 ? `<div style="background:#1e293b;border:1px solid #334155;border-radius:8px;padding:10px 16px;font-size:12px">
        ⚠️ <b style="color:#fbbf24">${noPhone}</b> no phone (will still import)
      </div>` : ''}
    </div>
    <div style="max-height:320px;overflow-y:auto;border:1px solid #2d3748;border-radius:10px">
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr style="background:#1e293b;position:sticky;top:0">
        <th style="padding:8px 12px;text-align:left;color:#94a3b8;font-weight:600">#</th>
        <th style="padding:8px 12px;text-align:left;color:#94a3b8;font-weight:600">Party / Business Name</th>
        <th style="padding:8px 12px;text-align:left;color:#94a3b8;font-weight:600">Address</th>
        <th style="padding:8px 12px;text-align:left;color:#94a3b8;font-weight:600">Phone No</th>
        <th style="padding:8px 12px;text-align:left;color:#94a3b8;font-weight:600">Status</th>
      </tr></thead><tbody>`;

  rows.slice(0,200).forEach((r,i)=>{
    const hasPhone = !!r.phone;
    h += `<tr style="border-top:1px solid #1e293b">
      <td style="padding:7px 12px;color:#64748b">${i+1}</td>
      <td style="padding:7px 12px;color:#e2e8f0;font-weight:500">${esc(r.name||'—')}</td>
      <td style="padding:7px 12px;color:#94a3b8;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(r.address)}">${esc(r.address||'—')}</td>
      <td style="padding:7px 12px;color:${hasPhone?'#34d399':'#f87171'};font-family:monospace">${esc(r.raw_phone||'—')}</td>
      <td style="padding:7px 12px">${hasPhone?'<span style="color:#34d399">✅</span>':'<span style="color:#fbbf24">⚠️ No phone</span>'}</td>
    </tr>`;
  });
  if(rows.length>200) h+=`<tr><td colspan="5" style="padding:8px 12px;color:#64748b;text-align:center;font-style:italic">…and ${rows.length-200} more rows (all will be imported)</td></tr>`;
  h += '</tbody></table></div>';

  prev.innerHTML = h;
  const actions = document.getElementById('xl-actions');
  actions.style.display = 'flex';
}

function esc(s){ const d=document.createElement('div'); d.textContent=s||''; return d.innerHTML; }

async function confirmExcelImport(){
  if(!_xlFile) return;
  const btn = document.getElementById('xl-import-btn');
  const cat = document.getElementById('xl-category').value.trim() || 'Customer List';
  btn.disabled = true;
  btn.textContent = '⏳ Importing...';

  const fd = new FormData();
  fd.append('file', _xlFile);
  fd.append('category', cat);

  try {
    const r = await fetch('/api/leads/import-excel', { method:'POST', body:fd });
    const d = await r.json();
    if(r.ok && d.success){
      alert(`✅ Import complete!\n\n📥 Added: ${d.added}\n🔁 Duplicates skipped: ${d.dupes}\n⚠️ Skipped (no name/phone): ${d.skipped}\n📋 Total rows: ${d.total}`);
      closeExcelImport();
      fetchLeads(1);
      loadStats();
      loadFilters();
    } else {
      alert('❌ Import failed: ' + (d.error || 'Unknown error'));
    }
  } catch(e) {
    alert('❌ Network error: ' + e.message);
  }
  btn.disabled = false;
  btn.textContent = '✅ Import Leads';
}

// Close modal when clicking outside
document.getElementById('excel-modal').addEventListener('click', function(e){
  if(e.target === this) closeExcelImport();
});

// ── WA Template Preview ─────────────────────────────────────
async function previewWATemplate(){
  const status = document.getElementById('wa-preview-status');
  const panel  = document.getElementById('wa-preview-panel');
  const txt    = document.getElementById('wa-preview-text');
  status.textContent = '⏳ Saving & generating preview...';
  // Save first so server gets the latest template
  await saveSettings();
  // Grab any lead to preview with
  try {
    const r = await fetch('/api/leads?limit=1&page=1');
    const d = await r.json();
    if(!d.leads||!d.leads.length){ status.textContent='⚠️ Add at least one lead to preview'; return; }
    const leadId = d.leads[0]._id;
    const mr = await fetch(`/api/leads/${leadId}/message?type=wa`);
    const md = await mr.json();
    panel.style.display='block';
    txt.textContent = md.text || '(no message)';
    status.textContent = '✅ Preview generated!';
    setTimeout(()=>status.textContent='',3000);
  } catch(e) {
    status.textContent = '❌ ' + e.message;
  }
}

// ── Init ────────────────────────────────────────────────────
fetchLeads(1);
loadFilters();
loadStats();
loadSettings();
checkConnections();

// ── Auto Schedule Modal ─────────────────────────────────────
let _schedCats = [];

async function openSchedule() {
  document.getElementById('schedule-modal').style.display = 'flex';
  await loadScheduleData();
}

function closeSchedule() {
  document.getElementById('schedule-modal').style.display = 'none';
}

async function loadScheduleData() {
  try {
    const s = await (await fetch('/api/schedule')).json();
    // Status panel
    document.getElementById('sch-today-sent').textContent  = s.today_sent  || 0;
    document.getElementById('sch-today-limit').textContent = s.daily_limit || 60;
    document.getElementById('sch-total-sent').textContent  = s.total_sent  || 0;
    document.getElementById('sch-last-run').textContent    = s.last_run
      ? '⏰ Last run: ' + new Date(s.last_run).toLocaleString('en-IN', {timeZone:'Asia/Kolkata'})
      : 'Not run yet';
    // Badge
    const badge = document.getElementById('sch-enabled-badge');
    badge.textContent = s.enabled ? '🟢 ACTIVE' : '⚪ PAUSED';
    badge.style.background = s.enabled ? '#14532d' : '#1e3a5f';
    badge.style.color      = s.enabled ? '#86efac' : '#60a5fa';
    // Toggle
    document.getElementById('sch-enabled').checked = !!s.enabled;
    updateEnableVisual();
    // Limit slider
    document.getElementById('sch-limit-slider').value   = s.daily_limit || 60;
    document.getElementById('sch-limit-num').textContent = s.daily_limit || 60;
    // Options
    document.getElementById('sch-skip-sent').checked    = s.skip_sent    !== false;
    document.getElementById('sch-allow-resend').checked = !!s.allow_resend;
    // Time selectors
    if (s.morning_hour) document.getElementById('sch-morning-hour').value = s.morning_hour;
    if (s.evening_hour) document.getElementById('sch-evening-hour').value = s.evening_hour;
    // Report email
    document.getElementById('sch-report-email').value = s.report_email || '';
    // Categories
    const cats = s.categories_list || [];
    _schedCats = s.categories || [];
    const container = document.getElementById('sch-cat-list');
    container.innerHTML = '';
    cats.forEach(cat => {
      const selected = _schedCats.includes(cat);
      const chip = document.createElement('span');
      chip.textContent = cat;
      chip.style.cssText = `cursor:pointer;padding:4px 10px;border-radius:20px;font-size:11px;border:1px solid ${selected?'#7c3aed':'#334155'};background:${selected?'#4f46e5':'transparent'};color:${selected?'#fff':'#94a3b8'};transition:.2s`;
      chip.onclick = () => {
        const idx = _schedCats.indexOf(cat);
        if (idx === -1) { _schedCats.push(cat); chip.style.background='#4f46e5'; chip.style.color='#fff'; chip.style.borderColor='#7c3aed'; }
        else { _schedCats.splice(idx,1); chip.style.background='transparent'; chip.style.color='#94a3b8'; chip.style.borderColor='#334155'; }
      };
      container.appendChild(chip);
    });
  } catch(e) {
    document.getElementById('sch-msg').textContent = '❌ Load error: ' + e.message;
  }
}

function updateEnableVisual() {
  const on = document.getElementById('sch-enabled').checked;
  document.getElementById('sch-toggle-bg').style.background    = on ? '#7c3aed' : '#334155';
  document.getElementById('sch-toggle-knob').style.left        = on ? '25px' : '3px';
}

async function saveSchedule() {
  const msg = document.getElementById('sch-msg');
  msg.textContent = '⏳ Saving...';
  msg.style.color = '#64748b';
  try {
    const body = {
      enabled:      document.getElementById('sch-enabled').checked,
      categories:   _schedCats,
      daily_limit:  parseInt(document.getElementById('sch-limit-slider').value),
      skip_sent:    document.getElementById('sch-skip-sent').checked,
      allow_resend: document.getElementById('sch-allow-resend').checked,
      morning_hour: parseInt(document.getElementById('sch-morning-hour').value),
      evening_hour: parseInt(document.getElementById('sch-evening-hour').value),
      report_email: document.getElementById('sch-report-email').value.trim(),
    };
    const r = await (await fetch('/api/schedule', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(body)
    })).json();
    if (r.success) {
      msg.textContent = '✅ Schedule saved! ' + (body.enabled ? `Will send at ${body.morning_hour}:00 AM + ${body.evening_hour}:00 PM IST` : 'Scheduler is paused.');
      msg.style.color = '#34d399';
      await loadScheduleData();
    } else {
      msg.textContent = '❌ ' + (r.error || 'Save failed');
      msg.style.color = '#f87171';
    }
  } catch(e) {
    msg.textContent = '❌ ' + e.message;
    msg.style.color = '#f87171';
  }
}

async function runScheduleNow() {
  const btn = document.getElementById('sch-run-btn');
  const msg = document.getElementById('sch-msg');
  btn.disabled = true;
  btn.textContent = '⏳ Starting...';
  try {
    // Save first
    await saveSchedule();
    await new Promise(r => setTimeout(r, 500));
    const r = await (await fetch('/api/schedule/run-now', {method:'POST'})).json();
    if (r.success) {
      msg.textContent = '✅ ' + r.message;
      msg.style.color = '#34d399';
      closeSchedule();
      connectSSE();
    } else {
      msg.textContent = '⚠️ ' + (r.error || 'Could not start');
      msg.style.color = '#fbbf24';
    }
  } catch(e) {
    msg.textContent = '❌ ' + e.message;
    msg.style.color = '#f87171';
  } finally {
    btn.disabled = false;
    btn.textContent = '▶️ Run Now';
  }
}

async function testScheduleReport() {
  const msg = document.getElementById('sch-msg');
  msg.textContent = '⏳ Sending test report...';
  msg.style.color = '#64748b';
  try {
    const r = await (await fetch('/api/schedule/test-report', {method:'POST'})).json();
    msg.textContent = r.success ? '✅ Test report sent! Check your email.' : '❌ ' + r.error;
    msg.style.color = r.success ? '#34d399' : '#f87171';
  } catch(e) {
    msg.textContent = '❌ ' + e.message;
    msg.style.color = '#f87171';
  }
}

// ── Social Poster Logic ──────────────────────────────────────
let _socPreviewData = null;
let _socSelectedLog = null;

async function loadSocial() {
  try {
    const s = await (await fetch('/api/social/settings')).json();
    
    // Website and inputs
    document.getElementById('soc-website').value = s.website_url || '';
    document.getElementById('soc-topic').value = s.topic || '';
    document.getElementById('soc-title').value = s.title || '';
    document.getElementById('soc-custom').value = s.custom_content || '';
    
    // Scheduler
    document.getElementById('soc-enabled').checked = !!s.enabled;
    document.getElementById('soc-frequency').value = s.frequency || 'daily';
    document.getElementById('soc-hour').value = s.time_hour !== undefined ? s.time_hour : 10;
    
    updateSocialEnabledVisual();
    toggleSocialTimeSelect();
    
    // Channels
    const channels = s.channels || {};
    const list = ['linkedin', 'facebook', 'instagram', 'twitter', 'pinterest', 'threads', 'youtube'];
    
    list.forEach(ch => {
      const conf = channels[ch] || {};
      document.getElementById(`ch-${ch}-enabled`).checked = !!conf.enabled;
      
      const tokenInput = document.getElementById(`ch-${ch}-token`);
      if (conf.token === '••••••••') {
        tokenInput.value = '';
        tokenInput.placeholder = 'Token saved ✓ (hidden)';
      } else {
        tokenInput.value = conf.token || '';
        tokenInput.placeholder = 'Access Token';
      }
      
      // Secondary fields
      if (ch === 'linkedin' && document.getElementById('ch-linkedin-urn')) {
        document.getElementById('ch-linkedin-urn').value = conf.urn || '';
      }
      if (ch === 'facebook' && document.getElementById('ch-facebook-pageId')) {
        document.getElementById('ch-facebook-pageId').value = conf.pageId || '';
      }
      if (ch === 'instagram' && document.getElementById('ch-instagram-accountId')) {
        document.getElementById('ch-instagram-accountId').value = conf.accountId || '';
      }
      if (ch === 'twitter' && document.getElementById('ch-twitter-apiKey')) {
        document.getElementById('ch-twitter-apiKey').value = conf.apiKey || '';
      }
      if (ch === 'pinterest' && document.getElementById('ch-pinterest-boardId')) {
        document.getElementById('ch-pinterest-boardId').value = conf.boardId || '';
      }
    });

    await loadSocialLogs();
  } catch(e) {
    document.getElementById('soc-msg').textContent = '❌ Error loading settings: ' + e.message;
    document.getElementById('soc-msg').style.color = '#f87171';
  }
}

function updateSocialEnabledVisual() {
  const on = document.getElementById('soc-enabled').checked;
  const track = document.getElementById('soc-toggle-track');
  const thumb = document.getElementById('soc-toggle-thumb');
  const badge = document.getElementById('soc-scheduler-badge');
  
  if (track && thumb) {
    track.style.background = on ? '#4f8ef7' : '#2d3748';
    thumb.style.left = on ? '18px' : '2px';
  }
  if (badge) {
    badge.textContent = on ? '🟢 ACTIVE' : '⚪ PAUSED';
    badge.style.background = on ? '#14532d' : '#1e3a5f';
    badge.style.color = on ? '#86efac' : '#60a5fa';
  }
}

function toggleSocialTimeSelect() {
  const freq = document.getElementById('soc-frequency').value;
  const wrap = document.getElementById('soc-time-wrap');
  if (wrap) {
    wrap.style.display = freq === 'daily' ? 'flex' : 'none';
  }
}

async function saveSocialSettings() {
  const msg = document.getElementById('soc-msg');
  msg.textContent = '⏳ Saving settings...';
  msg.style.color = '#64748b';
  
  try {
    const list = ['linkedin', 'facebook', 'instagram', 'twitter', 'pinterest', 'threads', 'youtube'];
    const channels = {};
    
    list.forEach(ch => {
      const enabled = document.getElementById(`ch-${ch}-enabled`).checked;
      let token = document.getElementById(`ch-${ch}-token`).value;
      
      // If empty but has saved placeholder, keep existing
      if (!token && document.getElementById(`ch-${ch}-token`).placeholder.includes('saved')) {
        token = '••••••••';
      }
      
      channels[ch] = { enabled, token };
      
      if (ch === 'linkedin') channels[ch].urn = document.getElementById('ch-linkedin-urn').value.trim();
      if (ch === 'facebook') channels[ch].pageId = document.getElementById('ch-facebook-pageId').value.trim();
      if (ch === 'instagram') channels[ch].accountId = document.getElementById('ch-instagram-accountId').value.trim();
      if (ch === 'twitter') channels[ch].apiKey = document.getElementById('ch-twitter-apiKey').value.trim();
      if (ch === 'pinterest') channels[ch].boardId = document.getElementById('ch-pinterest-boardId').value.trim();
    });

    const body = {
      enabled: document.getElementById('soc-enabled').checked,
      frequency: document.getElementById('soc-frequency').value,
      time_hour: parseInt(document.getElementById('soc-hour').value),
      website_url: document.getElementById('soc-website').value.trim(),
      topic: document.getElementById('soc-topic').value.trim(),
      title: document.getElementById('soc-title').value.trim(),
      custom_content: document.getElementById('soc-custom').value.trim(),
      channels
    };

    const res = await (await fetch('/api/social/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })).json();

    if (res.success) {
      msg.textContent = '✅ Social settings saved successfully!';
      msg.style.color = '#34d399';
      setTimeout(() => { msg.textContent = ''; }, 3000);
      await loadSocial();
    } else {
      msg.textContent = '❌ Save failed: ' + (res.error || 'Unknown error');
      msg.style.color = '#f87171';
    }
  } catch(e) {
    msg.textContent = '❌ ' + e.message;
    msg.style.color = '#f87171';
  }
}

async function generateSocialPreview() {
  const btn = document.getElementById('soc-preview-btn');
  const msg = document.getElementById('soc-msg');
  const website = document.getElementById('soc-website').value.trim();
  
  if (!website) {
    msg.textContent = '⚠️ Website URL is required to generate preview.';
    msg.style.color = '#fbbf24';
    return;
  }

  btn.disabled = true;
  btn.textContent = '⏳ Scrape & Generate...';
  msg.textContent = '🌐 Reading website and calling Gemini API...';
  msg.style.color = '#60a5fa';

  try {
    const res = await (await fetch('/api/social/generate-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        website_url: website,
        topic: document.getElementById('soc-topic').value.trim(),
        title: document.getElementById('soc-title').value.trim(),
        custom_content: document.getElementById('soc-custom').value.trim()
      })
    })).json();

    if (res.success) {
      _socPreviewData = res.posts;
      msg.textContent = '✅ Preview generated successfully!';
      msg.style.color = '#34d399';
      setTimeout(() => { msg.textContent = ''; }, 3000);
      
      renderPreviewMockups(res.posts, res.webData);
    } else {
      msg.textContent = '❌ Preview failed: ' + (res.error || 'Generation failed');
      msg.style.color = '#f87171';
    }
  } catch(e) {
    msg.textContent = '❌ Error: ' + e.message;
    msg.style.color = '#f87171';
  } finally {
    btn.disabled = false;
    btn.textContent = '🔍 Generate Preview';
  }
}

function renderPreviewMockups(posts, webData) {
  // Update mock contents
  document.getElementById('mock-li-body').textContent = posts.linkedin || 'No post generated.';
  document.getElementById('mock-fb-body').textContent = posts.facebook || 'No post generated.';
  document.getElementById('mock-ig-body').textContent = posts.instagram || 'No post generated.';
  document.getElementById('mock-tw-body').textContent = posts.twitter || 'No post generated.';
  document.getElementById('mock-pin-body').textContent = posts.pinterest || 'No post generated.';
  document.getElementById('mock-th-body').textContent = posts.threads || 'No post generated.';
  document.getElementById('mock-yt-body').textContent = posts.youtube || 'No post generated.';
  
  // Custom titles
  const customTitle = document.getElementById('soc-title').value.trim() || webData.title || 'Our Company';
  document.getElementById('mock-li-title').textContent = customTitle;
  document.getElementById('mock-fb-title').textContent = customTitle;
  document.getElementById('mock-tw-title').textContent = customTitle;
  document.getElementById('mock-pin-title').textContent = customTitle + ' Board Pin';
  
  const handle = '@' + customTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
  document.getElementById('mock-tw-handle').textContent = handle;
  document.getElementById('mock-ig-title').textContent = handle.substring(1);
  document.getElementById('mock-th-title').textContent = handle.substring(1);

  // Src indicator
  const indicator = document.getElementById('preview-src-indicator');
  if (indicator) {
    indicator.textContent = `Scraped: ${webData.title ? webData.title.substring(0, 20) + '...' : 'Website Ready'}`;
    indicator.style.color = '#34d399';
  }
}

function switchPreviewPlatform(platform) {
  // Hide all mocks
  document.querySelectorAll('.mock-content').forEach(el => el.style.display = 'none');
  // Deactivate all tab buttons
  const tabsContainer = document.getElementById('preview-tabs');
  if (tabsContainer) {
    tabsContainer.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
  }
  
  // Show target mock
  const targetMock = document.getElementById(`mock-${platform}`);
  if (targetMock) targetMock.style.display = platform === 'pinterest' || platform === 'instagram' ? 'flex' : 'block';
  
  // Activate target tab button
  const targetTabBtn = document.getElementById(`tab-p-${platform}`);
  if (targetTabBtn) targetTabBtn.classList.add('active');
}

async function runSocialPostNow() {
  const btn = document.getElementById('soc-run-btn');
  const msg = document.getElementById('soc-msg');
  
  btn.disabled = true;
  btn.textContent = '⏳ Executing...';
  msg.textContent = '🌐 Starting scraping, AI post writing and simulation...';
  msg.style.color = '#60a5fa';

  try {
    // Save first
    await saveSocialSettings();
    
    const res = await (await fetch('/api/social/post-now', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        website_url: document.getElementById('soc-website').value.trim(),
        topic: document.getElementById('soc-topic').value.trim(),
        title: document.getElementById('soc-title').value.trim(),
        custom_content: document.getElementById('soc-custom').value.trim()
      })
    })).json();

    if (res.success) {
      msg.textContent = '✅ Social posting simulated successfully!';
      msg.style.color = '#34d399';
      setTimeout(() => { msg.textContent = ''; }, 4000);
      
      if (res.post && res.post.content) {
        renderPreviewMockups(res.post.content, { title: res.post.title });
      }
      
      await loadSocialLogs();
    } else {
      msg.textContent = '❌ Simulation failed: ' + (res.error || 'Posting failed');
      msg.style.color = '#f87171';
    }
  } catch(e) {
    msg.textContent = '❌ Error: ' + e.message;
    msg.style.color = '#f87171';
  } finally {
    btn.disabled = false;
    btn.textContent = '🚀 Post Now';
  }
}

async function loadSocialLogs() {
  const body = document.getElementById('soc-logs-body');
  if (!body) return;
  
  try {
    const logs = await (await fetch('/api/social/posts')).json();
    if (!logs || logs.length === 0) {
      body.innerHTML = '<tr><td colspan="5" class="empty" style="text-align:center;padding:20px;color:#64748b">No postings recorded yet.</td></tr>';
      return;
    }

    body.innerHTML = logs.map(log => {
      const date = new Date(log.createdAt || log.last_run_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' });
      const site = log.website_url ? log.website_url.replace(/^https?:\/\/(www\.)?/i, '') : 'Manual';
      const siteShort = site.length > 22 ? site.substring(0, 20) + '...' : site;
      const topic = log.topic || 'Auto Post';
      
      const channels = (log.channels_posted || []).map(ch => {
        const icons = { linkedin: '💼', facebook: '👤', instagram: '📸', twitter: '🐦', pinterest: '📌', threads: '🧵', youtube: '🎥' };
        return `<span title="${ch}">${icons[ch] || ch}</span>`;
      }).join(' ');

      const statusBadgeClass = log.status === 'Success' ? 's-ok' : (log.status === 'Simulated' ? 's-warn' : 's-err');
      const statusText = log.status || 'Simulated';
      
      // Store log in a global array or stringify directly
      const escapedLogs = (log.logs || '').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, '\\n');
      
      return `<tr style="border-bottom:1px solid #1e2433">
        <td style="padding:6px 10px;color:#94a3b8;white-space:nowrap">${date}</td>
        <td style="padding:6px 10px"><b style="color:#fff" title="${log.website_url}">${siteShort}</b><div style="font-size:9px;color:#64748b">${topic}</div></td>
        <td style="padding:6px 10px;font-size:12px">${channels || 'None'}</td>
        <td style="padding:6px 10px"><span class="badge-sm ${statusBadgeClass}" style="font-size:9px;padding:2px 6px;border-radius:4px">${statusText}</span></td>
        <td style="padding:6px 10px;text-align:center">
          <button class="btn b-gray" style="padding:2px 8px;font-size:10px;border-radius:4px" onclick="openSocialLog(\`${escapedLogs}\`)">👁️ View</button>
        </td>
      </tr>`;
    }).join('');
  } catch(e) {
    body.innerHTML = `<tr><td colspan="5" class="empty" style="text-align:center;padding:20px;color:#f87171">Error loading logs: ${e.message}</td></tr>`;
  }
}

function openSocialLog(logString) {
  const modal = document.getElementById('soc-log-modal');
  const content = document.getElementById('soc-log-content');
  if (modal && content) {
    content.textContent = logString || 'No execution logs recorded for this post.';
    modal.style.display = 'flex';
  }
}

function closeSocialLogModal() {
  const modal = document.getElementById('soc-log-modal');
  if (modal) modal.style.display = 'none';
}
