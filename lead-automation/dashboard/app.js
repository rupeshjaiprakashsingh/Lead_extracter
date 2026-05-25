let leads=[],curPage=1,totalPages=1,sending=false,sse=null,debounceTimer=null;
setInterval(()=>document.getElementById('clock').textContent=new Date().toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}),1000);

// Inject .b-purple style
(()=>{ const s=document.createElement('style');
  s.textContent='.b-purple{background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;border:none;} .b-purple:hover{opacity:.9}';
  document.head.appendChild(s); })();

const kwCategoryMap = {
  'clinic': 'Health & Medicine',
  'doctor': 'Health & Medicine',
  'hospital': 'Health & Medicine',
  'coaching center': 'Education & Coaching',
  'tuition classes': 'Education & Coaching',
  'real estate agent': 'Real Estate',
  'property dealer': 'Real Estate',
  'beauty salon': 'Beauty & Wellness',
  'gym fitness': 'Fitness & Sports',
  'hotel': 'Hospitality & Hotels',
  'restaurant': 'Restaurants & Cafes',
  'car dealer': 'Automotive',
  'ca firm chartered accountant': 'Finance & Accounting',
  'law firm advocate': 'Legal Services',
  'travel agency': 'Travel & Tourism',
  'interior designer': 'Interior Design'
};

function setKw(keyword) {
  document.getElementById('kw').value = keyword;
  // Highlight active chip
  document.querySelectorAll('.kw-chip').forEach(c => c.classList.remove('active'));
  if (window.event && window.event.target) {
    window.event.target.classList.add('active');
  }
  // Auto-fill category
  const catInput = document.getElementById('scrape-category');
  if (catInput) {
    catInput.value = kwCategoryMap[keyword.toLowerCase().trim()] || '';
  }
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
  if(t==='settings') {
    loadSettings();
    loadLogs();
    loadSmtpAccounts();
  }
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
    const phoneVal = (b.raw_phone||b.phone||'').replace(/'/g,"&#39;");
    const emailVal = (b.email||'').replace(/'/g,"&#39;");
    h+=`<tr ${isChecked ? 'style="background:rgba(124,58,237,.12);outline:1px solid rgba(124,58,237,.3)"' : ''}>
      <td><input type="checkbox" data-id="${b._id}" ${isChecked} onchange="onCheckChange(this)"></td>
      <td style="color:#64748b;font-size:10px">${num}</td>
      <td><div style="font-weight:600;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${b.name||''}">${b.name||'—'}</div>
          <div style="font-size:9px;color:#64748b">${b.city||''}</div></td>
      <td>${catBadge(b.category)}</td>
      <td style="padding:2px 4px">
        <div class="inline-edit-wrap" id="wrap-phone-${b._id}">
          <input type="text" class="inline-edit-input phone-input"
            data-id="${b._id}" data-field="phone"
            value="${phoneVal}"
            placeholder="Add phone..."
            onblur="inlineUpdateLead(this)"
            onkeydown="if(event.key==='Enter')this.blur()"
            title="Click to edit phone"
          >
          <span class="inline-save-indicator" id="ind-phone-${b._id}"></span>
        </div>
      </td>
      <td style="padding:2px 4px">
        <div class="inline-edit-wrap" id="wrap-email-${b._id}">
          <input type="email" class="inline-edit-input email-input"
            data-id="${b._id}" data-field="email"
            value="${emailVal}"
            placeholder="Add email..."
            onblur="inlineUpdateLead(this)"
            onkeydown="if(event.key==='Enter')this.blur()"
            title="Click to edit email"
          >
          <span class="inline-save-indicator" id="ind-email-${b._id}"></span>
        </div>
      </td>
      <td>${siteBadge(b.website)}</td>
      <td style="color:#fbbf24;font-size:11px">${b.rating||'—'}</td>
      <td style="font-weight:600;font-size:11px">${b.reviews||'—'}</td>
      <td>${statusBadge(b.status)}</td>
      <td>${b.wa_sent?`<span class="badge bg">✅${b.wa_count>1?' ×'+b.wa_count:''}</span>`:'<span class="badge bgr">—</span>'}</td>
      <td>${b.email_sent?'<span class="badge bg">✅</span>':'<span class="badge bgr">—</span>'}</td>
      <td><button class="btn" style="background:#1e3a5f;color:#60a5fa;border:1px solid #1e3a5f;padding:2px 6px;font-size:9px;border-radius:5px;margin-bottom:2px;display:block;width:100%" onclick="openFuModal('${b._id}','${(b.name||'').replace(/'/g,"\\'")}')">🔔 Follow-Up</button><button class="btn" style="background:#047857;color:#a7f3d0;border:1px solid #047857;padding:2px 6px;font-size:9px;border-radius:5px;margin-bottom:2px;display:block;width:100%" onclick="editLead('${b._id}')">✏️ Edit</button><button class="btn b-red" style="padding:2px 6px;font-size:9px;display:block;width:100%" onclick="deleteLead('${b._id}')">🗑</button></td>
    </tr>`;
  });
  h+='</tbody></table>';
  w.innerHTML=h;
  updateSelectionBar();
}

// ── Inline field save (phone / email) ────────────────────────
async function inlineUpdateLead(input) {
  const id    = input.dataset.id;
  const field = input.dataset.field;  // 'phone' or 'email'
  const val   = input.value.trim();

  // Find the lead in our local cache to check if value actually changed
  const lead  = leads.find(function(l){ return l._id === id; });
  const oldVal = field === 'phone'
    ? (lead ? (lead.raw_phone || lead.phone || '') : '')
    : (lead ? (lead.email || '') : '');

  if (val === oldVal) return; // no change — skip API call

  const indId = 'ind-' + field + '-' + id;
  const indEl = document.getElementById(indId);
  if (indEl) { indEl.textContent = '\u23f3'; indEl.style.color = '#60a5fa'; }

  const body = field === 'phone'
    ? { phone: val, raw_phone: val }
    : { email: val };

  try {
    const res = await fetch('/api/leads/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (res.ok) {
      // Update local cache so repeated edits compare correctly
      if (lead) {
        if (field === 'phone') { lead.phone = val; lead.raw_phone = val; }
        else { lead.email = val; }
      }
      if (indEl) {
        indEl.textContent = '\u2705';
        indEl.style.color = '#34d399';
        input.style.borderColor = '#34d399';
        setTimeout(function(){
          if (indEl) indEl.textContent = '';
          input.style.borderColor = '';
        }, 1800);
      }
      loadStats(); // refresh stats bar counts
    } else {
      if (indEl) { indEl.textContent = '\u274c'; indEl.style.color = '#f87171'; }
      input.style.borderColor = '#f87171';
      setTimeout(function(){ if (indEl) indEl.textContent = ''; input.style.borderColor = ''; }, 2500);
    }
  } catch(e) {
    if (indEl) { indEl.textContent = '\u274c'; indEl.style.color = '#f87171'; }
  }
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
  const category=document.getElementById('scrape-category')?.value.trim()||'';
  if(!kw||!city){alert('Enter keyword and city');return;}
  const btn=document.getElementById('btn-scrape');
  btn.disabled=true; btn.textContent='⏳ Scraping...';
  showProgress('Scraping Google Maps...');
  connectSSE();
  await fetch('/api/scrape',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({keyword:kw,city,max,category})
  });
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
  if(!confirm(`📱 AUTO-SEND MODE\n\nWhatsApp Web will open and automatically SEND messages to all ${sel.length} selected leads one by one.\n\nDo NOT close the browser while it works!${skipNote}`))return;
  sending=true;
  document.getElementById('btn-autosend').disabled=true;
  document.getElementById('btn-autosend').textContent='⏳ Sending...';
  showProgress('🚀 Auto-sending WhatsApp messages...');
  connectSSE();
  
  try {
      await fetch('/api/send/wa',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:sel,skipWaSent})});
      plog('🚀 Auto-send started — WhatsApp Web is opening each chat and sending messages...','in');
  } catch(err) {
      alert('Error: ' + err.message);
      sending=false;
      document.getElementById('btn-autosend').disabled=false;
      document.getElementById('btn-autosend').textContent='🚀 Auto-Send WA';
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

// ── Follow-Up Manager ─────────────────────────────────────────
let fuSelectedIds = new Set();
let fuDebounceTimer = null;

function debounceFuSearch() {
  clearTimeout(fuDebounceTimer);
  fuDebounceTimer = setTimeout(() => loadFollowups(), 350);
}

async function loadFollowups() {
  const search = document.getElementById('fu-search')?.value || '';
  const status = document.getElementById('fu-status')?.value || '';
  const q = new URLSearchParams({ search, status });
  try {
    const list = await (await fetch('/api/followups?' + q)).json();
    const badge = document.getElementById('fu-count-badge');
    if (badge) badge.textContent = list.length + ' lead' + (list.length !== 1 ? 's' : '');
    renderFollowupTable(list);
  } catch(e) {
    const wrap = document.getElementById('fu-table-wrap');
    if (wrap) wrap.innerHTML = '<div class="empty" style="padding:40px;text-align:center;color:#f87171">❌ Error loading follow-ups</div>';
  }
}

function renderFollowupTable(list) {
  const wrap = document.getElementById('fu-table-wrap');
  if (!wrap) return;

  if (!list.length) {
    wrap.innerHTML = `
      <div style="text-align:center;padding:60px 20px;color:#64748b">
        <div style="font-size:48px;margin-bottom:16px">🔔</div>
        <div style="font-size:16px;font-weight:600;color:#94a3b8;margin-bottom:8px">No Follow-Up Leads Yet</div>
        <div style="font-size:12px;line-height:1.8">Go to the <b style="color:#60a5fa">Leads</b> tab → find an interested lead<br>→ click the <b style="color:#60a5fa">🔔 Follow-Up</b> button to add them here.</div>
      </div>`;
    return;
  }

  const statusColors = { new:'#94a3b8', contacted:'#60a5fa', followup:'#fbbf24', interested:'#a78bfa', converted:'#34d399', not_interested:'#f87171', lost:'#f87171' };

  let h = `<table style="width:100%;border-collapse:collapse;font-size:12px">
    <thead>
      <tr style="background:#0d1526;border-bottom:2px solid #1e293b;position:sticky;top:0;z-index:10">
        <th style="padding:10px 12px;text-align:left;width:32px"><input type="checkbox" id="fu-hdr-cb" onchange="fuToggleAll(this.checked)" style="accent-color:#7c3aed"></th>
        <th style="padding:10px 12px;text-align:left;color:#94a3b8;font-weight:600">#</th>
        <th style="padding:10px 12px;text-align:left;color:#94a3b8;font-weight:600">Business</th>
        <th style="padding:10px 12px;text-align:left;color:#94a3b8;font-weight:600">Phone</th>
        <th style="padding:10px 12px;text-align:left;color:#94a3b8;font-weight:600">Email</th>
        <th style="padding:10px 12px;text-align:left;color:#94a3b8;font-weight:600">Status</th>
        <th style="padding:10px 12px;text-align:left;color:#94a3b8;font-weight:600">Note</th>
        <th style="padding:10px 12px;text-align:left;color:#94a3b8;font-weight:600">Scheduled</th>
        <th style="padding:10px 12px;text-align:left;color:#94a3b8;font-weight:600">WA/Email</th>
        <th style="padding:10px 12px;text-align:center;color:#94a3b8;font-weight:600">Actions</th>
      </tr>
    </thead>
    <tbody>`;

  list.forEach((l, i) => {
    const isChecked = fuSelectedIds.has(l._id);
    const sColor = statusColors[l.status] || '#94a3b8';
    const schedDate = l.followup_scheduled_at
      ? new Date(l.followup_scheduled_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' })
      : '—';
    const isOverdue = l.followup_scheduled_at && new Date(l.followup_scheduled_at) < new Date();
    const rowBg = isChecked ? 'background:rgba(124,58,237,.1);outline:1px solid rgba(124,58,237,.3)' : (isOverdue ? 'background:rgba(239,68,68,.05)' : '');

    h += `<tr style="border-bottom:1px solid #1a2233;${rowBg}" id="fu-row-${l._id}">
      <td style="padding:10px 12px">
        <input type="checkbox" data-fu-id="${l._id}" ${isChecked ? 'checked' : ''} onchange="fuOnCheck(this)" style="accent-color:#7c3aed;width:14px;height:14px">
      </td>
      <td style="padding:10px 12px;color:#64748b;font-size:10px">${i+1}</td>
      <td style="padding:10px 12px">
        <div style="font-weight:600;color:#e2e8f0;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(l.name)}">${esc(l.name)}</div>
        <div style="font-size:10px;color:#64748b">${esc(l.city || '')}</div>
        ${l.category ? `<div style="font-size:9px;color:#a78bfa;margin-top:2px">${esc(l.category)}</div>` : ''}
      </td>
      <td style="padding:10px 12px;font-family:monospace;color:#34d399;font-size:11px">${l.raw_phone || l.phone || '—'}</td>
      <td style="padding:10px 12px;font-size:10px;color:#94a3b8;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(l.email || '')}">${l.email || '<span style="color:#475569">—</span>'}</td>
      <td style="padding:10px 12px">
        <span style="background:${sColor}22;color:${sColor};border:1px solid ${sColor}44;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:600">${l.status || 'new'}</span>
      </td>
      <td style="padding:10px 12px;color:#cbd5e1;font-size:11px;max-width:180px">
        ${l.followup_note
          ? `<div style="background:#1e293b;border-left:2px solid #7c3aed;padding:4px 8px;border-radius:0 4px 4px 0;font-size:10px;line-height:1.5;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(l.followup_note)}">${esc(l.followup_note)}</div>`
          : '<span style="color:#475569;font-size:10px">No note</span>'}
      </td>
      <td style="padding:10px 12px;font-size:10px;white-space:nowrap;${isOverdue ? 'color:#f87171;font-weight:700' : 'color:#94a3b8'}">${schedDate}${isOverdue ? ' ⚠️' : ''}</td>
      <td style="padding:10px 12px;font-size:10px;color:#64748b">
        <div>WA: ${l.wa_count > 0 ? `<span style="color:#34d399">${l.wa_count}×</span>` : '<span>—</span>'}</div>
        <div>Email: ${l.followup_count > 0 ? `<span style="color:#60a5fa">${l.followup_count}×</span>` : '<span>—</span>'}</div>
      </td>
      <td style="padding:10px 12px;text-align:center">
        <div style="display:flex;flex-direction:column;gap:4px;align-items:center">
          <button class="btn b-green" style="padding:3px 8px;font-size:9px;width:80px" onclick="fuSendWA('${l._id}')">📱 WA</button>
          <button class="btn b-blue" style="padding:3px 8px;font-size:9px;width:80px;${l.email ? '' : 'opacity:.4;cursor:not-allowed'}" onclick="fuSendEmail('${l._id}','${esc(l.email || '')}')" ${!l.email ? 'disabled' : ''}>📧 Email</button>
          <button class="btn" style="padding:3px 8px;font-size:9px;width:80px;background:#1e293b;color:#94a3b8;border:1px solid #334155" onclick="fuRemove('${l._id}','${esc(l.name)}')">🗑 Remove</button>
        </div>
      </td>
    </tr>`;
  });

  h += '</tbody></table>';
  wrap.innerHTML = h;

  // Sync select-all checkbox
  const hdrCb = document.getElementById('fu-hdr-cb');
  const allCb = document.getElementById('fu-select-all');
  const allChecked = list.length > 0 && list.every(l => fuSelectedIds.has(l._id));
  if (hdrCb) hdrCb.checked = allChecked;
  if (allCb) allCb.checked = allChecked;
}

function fuOnCheck(cb) {
  const id = cb.dataset.fuId;
  if (cb.checked) fuSelectedIds.add(id);
  else fuSelectedIds.delete(id);
}

function fuToggleAll(checked) {
  document.querySelectorAll('input[data-fu-id]').forEach(cb => {
    cb.checked = checked;
    if (checked) fuSelectedIds.add(cb.dataset.fuId);
    else fuSelectedIds.delete(cb.dataset.fuId);
  });
  const hdrCb = document.getElementById('fu-hdr-cb');
  const allCb = document.getElementById('fu-select-all');
  if (hdrCb) hdrCb.checked = checked;
  if (allCb) allCb.checked = checked;
}

function fuGetSelected() {
  return [...fuSelectedIds];
}

// ── Per-row: Send WA ─────────────────────────────────────────
async function fuSendWA(id) {
  if (!confirm('📱 Open WhatsApp Web and pre-fill follow-up message for this lead?')) return;
  showProgress('Drafting follow-up WA...');
  connectSSE();
  try {
    const r = await fetch(`/api/leads/${id}/followup-send-wa`, { method: 'POST', headers: {'Content-Type':'application/json'} });
    const d = await r.json();
    if (d.success) plog('📱 Follow-up WA draft started', 'ok');
    else plog('❌ ' + (d.error || 'Failed'), 'er');
  } catch(e) { plog('❌ ' + e.message, 'er'); }
}

// ── Per-row: Send Email ───────────────────────────────────────
async function fuSendEmail(id, email) {
  if (!email) return alert('This lead has no email address.');
  if (!confirm(`📧 Send follow-up email to ${email}?`)) return;
  try {
    const r = await fetch(`/api/leads/${id}/followup-send-email`, { method: 'POST', headers: {'Content-Type':'application/json'} });
    const d = await r.json();
    if (d.success) { alert('✅ Follow-up email sent!'); loadFollowups(); }
    else alert('❌ ' + (d.error || 'Failed'));
  } catch(e) { alert('❌ ' + e.message); }
}

// ── Per-row: Remove from queue ────────────────────────────────
async function fuRemove(id, name) {
  if (!confirm(`Remove "${name}" from follow-up list?`)) return;
  try {
    await fetch(`/api/leads/${id}/remove-followup`, { method: 'DELETE' });
    fuSelectedIds.delete(id);
    loadFollowups();
  } catch(e) { alert('❌ ' + e.message); }
}

// ── Bulk: Send WA ─────────────────────────────────────────────
async function fuBulkSendWA() {
  const sel = fuGetSelected();
  if (!sel.length) return alert('Please select at least one lead first.');
  if (!confirm(`📱 Open WhatsApp Web and draft follow-up messages for ${sel.length} selected leads?`)) return;
  showProgress('Drafting follow-up WA messages...');
  connectSSE();
  // Switch to leads tab so progress panel is visible
  try {
    const r = await fetch('/api/followups/send-wa', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ids: sel }) });
    const d = await r.json();
    plog(d.success ? '📱 Follow-up WA drafts started' : '❌ ' + d.error, d.success ? 'ok' : 'er');
  } catch(e) { plog('❌ ' + e.message, 'er'); }
}

// ── Bulk: Send Email ──────────────────────────────────────────
async function fuBulkSendEmail() {
  const sel = fuGetSelected();
  if (!sel.length) return alert('Please select at least one lead first.');
  if (!confirm(`📧 Send follow-up emails to ${sel.length} selected leads?`)) return;
  showProgress('Sending follow-up emails...');
  connectSSE();
  try {
    await fetch('/api/followups/send-email', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ids: sel }) });
    plog('📧 Follow-up email batch started', 'ok');
  } catch(e) { plog('❌ ' + e.message, 'er'); }
}

// ── Bulk: Remove ──────────────────────────────────────────────
async function fuBulkRemove() {
  const sel = fuGetSelected();
  if (!sel.length) return alert('Please select at least one lead first.');
  if (!confirm(`Remove ${sel.length} selected leads from follow-up list?`)) return;
  try {
    await Promise.all(sel.map(id => fetch(`/api/leads/${id}/remove-followup`, { method: 'DELETE' })));
    fuSelectedIds.clear();
    loadFollowups();
  } catch(e) { alert('❌ ' + e.message); }
}

// ── Add to Follow-Up Modal ────────────────────────────────────
let _fuModalLeadId = null;

function openFuModal(id, name) {
  _fuModalLeadId = id;
  document.getElementById('fu-modal-leadname').textContent = name;
  document.getElementById('fu-modal-note').value = '';
  document.getElementById('fu-modal-msg').textContent = '';
  // Default scheduled date = now + 2 days
  const d = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  document.getElementById('fu-modal-date').value = d.toISOString().slice(0, 16);
  document.getElementById('fu-add-modal').style.display = 'flex';
}

function closeFuModal() {
  document.getElementById('fu-add-modal').style.display = 'none';
  _fuModalLeadId = null;
}

async function confirmAddToFollowup() {
  if (!_fuModalLeadId) return;
  const note = document.getElementById('fu-modal-note').value.trim();
  const scheduled_at = document.getElementById('fu-modal-date').value;
  const msg = document.getElementById('fu-modal-msg');
  const btn = document.getElementById('fu-modal-save-btn');
  btn.disabled = true;
  btn.textContent = '⏳ Adding...';
  msg.textContent = '';
  try {
    const r = await fetch(`/api/leads/${_fuModalLeadId}/add-followup`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ note, scheduled_at })
    });
    const d = await r.json();
    if (d.success) {
      msg.style.color = '#34d399';
      msg.textContent = '✅ Added to follow-up list!';
      setTimeout(() => { closeFuModal(); fetchLeads(); }, 800);
    } else {
      msg.style.color = '#f87171';
      msg.textContent = '❌ ' + (d.error || 'Failed');
    }
  } catch(e) {
    msg.style.color = '#f87171';
    msg.textContent = '❌ ' + e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = '🔔 Add to Follow-Up';
  }
}

// Close modal on backdrop click
document.getElementById('fu-add-modal').addEventListener('click', function(e) {
  if (e.target === this) closeFuModal();
});


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
    // Restore secure: stored as 'true'/'false' string or boolean
    if(s.smtp_secure !== undefined) {
      document.getElementById('s-smtp-secure').value = (s.smtp_secure === true || s.smtp_secure === 'true') ? 'true' : 'false';
    } else {
      // Default: port 587 → false, port 465 → true
      const port = parseInt(s.smtp_port) || 587;
      document.getElementById('s-smtp-secure').value = port === 465 ? 'true' : 'false';
    }
    if(s.smtp_user) document.getElementById('s-smtp-user').value=s.smtp_user;
    if(s.smtp_from) document.getElementById('s-smtp-from').value=s.smtp_from;
    if(s.smtp_pass) {
      const passEl = document.getElementById('s-smtp-pass');
      passEl.value = '';
      passEl.placeholder = 'Password saved ✓ (hidden)';
      smtpPassChanged = false;
    }
    // Load message templates
    if(s.wa_template)    document.getElementById('s-wa-template').value   = s.wa_template;
    if(s.email_subject)  document.getElementById('s-email-subject').value = s.email_subject;
    if(s.email_body)     document.getElementById('s-email-body').value    = s.email_body;
    // Google Contacts credentials
    const gcId = document.getElementById('s-google-client-id');
    const gcSec = document.getElementById('s-google-client-secret');
    if(gcId && s.google_client_id)     gcId.value = s.google_client_id;
    if(gcSec && s.google_client_secret) gcSec.placeholder = 'Secret saved ✓';
  }catch(e){}
}

async function saveSettings(){
  try {
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
      google_client_id:     document.getElementById('s-google-client-id')?.value.trim() || undefined,
      google_client_secret: document.getElementById('s-google-client-secret')?.value.trim() || undefined,
    };
    const pass=document.getElementById('s-smtp-pass').value;
    if(pass && pass!=='••••••••') body.smtp_pass=pass;
    const umId=document.getElementById('s-um-id').value.trim();
    const umTk=document.getElementById('s-um-token').value.trim();
    if(umId) body.ultramsg={instanceId:umId,token:umTk||undefined};

    const res = await fetch('/api/settings',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body)
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Server error saving settings');
    }
    
    document.getElementById('save-status').textContent='✅ Saved!';
    setTimeout(()=>document.getElementById('save-status').textContent='',3000);
    checkConnections();
  } catch(e) {
    console.error("Error saving settings:", e);
    document.getElementById('save-status').innerHTML = `<span style="color:#f87171">❌ Error: ${e.message}</span>`;
  }
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
  const statusEl = document.getElementById('smtp-status');
  statusEl.innerHTML = '<span style="color:#60a5fa">⏳ Testing connection...</span>';

  const host   = document.getElementById('s-smtp-host').value.trim();
  const port   = document.getElementById('s-smtp-port').value.trim();
  const secure = document.getElementById('s-smtp-secure').value;
  const user   = document.getElementById('s-smtp-user').value.trim();
  const passEl = document.getElementById('s-smtp-pass');
  const pass   = passEl.value.trim();

  // Validate required fields first
  if (!user) {
    statusEl.innerHTML = '<span style="color:#f87171">❌ Enter your Gmail address first.</span>';
    return;
  }

  const isSaved = passEl.placeholder.includes('saved');

  if (!pass) {
    if (!isSaved) {
      statusEl.innerHTML = '<span style="color:#f87171">❌ Please enter your 16-character App Password first.</span>';
      return;
    }
    // No new password typed — test with existing DB password
    statusEl.innerHTML = '<span style="color:#60a5fa">⏳ Testing with saved password...</span>';
    const r = await (await fetch('/api/test-smtp', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({}) })).json();
    statusEl.innerHTML = r.success
      ? '<span style="color:#34d399">✅ SMTP Connected! Email is working.</span>'
      : `<span style="color:#f87171">❌ ${r.error}</span>`;
    return;
  }

  // Pass all credentials inline — no need to save first
  const r = await (await fetch('/api/test-smtp', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ host, port: parseInt(port), secure, user, pass })
  })).json();

  if (r.success) {
    statusEl.innerHTML = '<span style="color:#34d399">✅ SMTP Connected! Saving settings...</span>';
    // Auto-save now that we know it works
    await saveSettings();
    statusEl.innerHTML = '<span style="color:#34d399">✅ SMTP Connected & Saved! Emails will work.</span>';
    
    // Immediate UI feedback for saved password
    passEl.value = '';
    passEl.placeholder = 'Password saved ✓ (hidden)';
    smtpPassChanged = false; // Reset dirty flag
  } else {
    statusEl.innerHTML = `<span style="color:#f87171">❌ ${r.error}</span>`;
  }
}

// ── SMTP port ↔ secure auto-sync ──────────────────────────────
function smtpPortChanged(port) {
  const sel = document.getElementById('s-smtp-secure');
  if (!sel) return;
  port = parseInt(port);
  if (port === 465) {
    sel.value = 'true';  // SSL
  } else if (port === 587 || port === 25 || port === 2525) {
    sel.value = 'false'; // TLS/STARTTLS
  }
}

function smtpSecureChanged(val) {
  const portEl = document.getElementById('s-smtp-port');
  if (!portEl) return;
  const curPort = parseInt(portEl.value);
  if (val === 'true' && curPort !== 465) {
    portEl.value = '465'; // Switch to SSL port
  } else if (val === 'false' && curPort === 465) {
    portEl.value = '587'; // Switch to STARTTLS port
  }
}

function exportExcel() {
  const cat = document.getElementById('f-cat')?.value || '';
  const q = cat ? '?category=' + encodeURIComponent(cat) : '';
  window.location.href = '/api/leads/export' + q;
}

async function syncContacts(){
  document.getElementById('vcf-modal').style.display='flex';
  document.getElementById('vcf-step2').style.display='none';
  try {
    const cat = document.getElementById('f-cat')?.value || '';
    const q = cat ? '?category=' + encodeURIComponent(cat) : '';
    const s = await (await fetch('/api/contacts/stats' + q)).json();
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
  const cat = document.getElementById('f-cat')?.value || '';
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
        newOnly: sel.length ? false : newOnly,
        category: cat || undefined
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
  selectedIds.delete(id);
  fetchLeads();
}

async function bulkDeleteLeads() {
  const ids = getSelected();
  if (!ids.length) return alert('Please select at least one lead.');
  if (!confirm(`Are you sure you want to delete ${ids.length} selected leads?`)) return;
  try {
    const res = await fetch('/api/leads/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids })
    });
    if (res.ok) {
      clearAllSelections();
      fetchLeads();
    } else {
      const err = await res.json();
      alert('Delete failed: ' + (err.error || 'Unknown error'));
    }
  } catch(e) {
    alert('Error: ' + e.message);
  }
}

function editLead(id) {
  const lead = leads.find(l => l._id === id);
  if (!lead) return;
  
  document.getElementById('edit-lead-id').value = id;
  document.getElementById('edit-lead-name').value = lead.name || '';
  document.getElementById('edit-lead-category').value = lead.category || '';
  document.getElementById('edit-lead-phone').value = lead.raw_phone || lead.phone || '';
  document.getElementById('edit-lead-email').value = lead.email || '';
  document.getElementById('edit-lead-website').value = lead.website || '';
  document.getElementById('edit-lead-rating').value = lead.rating || '';
  document.getElementById('edit-lead-reviews').value = lead.reviews || 0;
  document.getElementById('edit-lead-status').value = lead.status || 'new';
  
  document.getElementById('edit-lead-modal').style.display = 'flex';
}

async function saveLeadEdit() {
  const id = document.getElementById('edit-lead-id').value;
  const body = {
    name: document.getElementById('edit-lead-name').value.trim(),
    category: document.getElementById('edit-lead-category').value.trim(),
    phone: document.getElementById('edit-lead-phone').value.trim(),
    raw_phone: document.getElementById('edit-lead-phone').value.trim(),
    email: document.getElementById('edit-lead-email').value.trim(),
    website: document.getElementById('edit-lead-website').value.trim(),
    rating: document.getElementById('edit-lead-rating').value.trim(),
    reviews: parseInt(document.getElementById('edit-lead-reviews').value) || 0,
    status: document.getElementById('edit-lead-status').value
  };
  
  try {
    const res = await fetch('/api/leads/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (res.ok) {
      document.getElementById('edit-lead-modal').style.display = 'none';
      fetchLeads();
    } else {
      const err = await res.json();
      alert('Error updating: ' + (err.error || 'Unknown error'));
    }
  } catch(e) {
    alert('Error: ' + e.message);
  }
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

async function loadUserSession() {
  try {
    const res = await fetch('/auth/status');
    const data = await res.json();
    if (data.isAuthenticated) {
      document.getElementById('hdr-user-name').textContent = data.username || 'User';
      document.getElementById('hdr-user-company').textContent = data.company || 'My Company';
      
      const firstLetter = (data.username || 'U').charAt(0).toUpperCase();
      document.getElementById('hdr-user-avatar').textContent = firstLetter;
      
      document.getElementById('hdr-user-badge').style.display = 'flex';
      
      if (data.role === 'admin') {
        document.getElementById('hdr-admin-btn').style.display = 'inline-flex';
      } else {
        document.getElementById('hdr-admin-btn').style.display = 'none';
      }
    } else {
      window.location.href = '/login';
    }
  } catch (e) {
    console.error('Error loading user session:', e);
  }
}

// ── Init ────────────────────────────────────────────────────
loadUserSession();
fetchLeads(1);
loadFilters();
loadStats();
loadSettings();
checkConnections();

// ── Auto Schedule Modal ─────────────────────────────────────
let _schedules = [];
let _categoriesList = [];
let _selectedCategories = [];

async function openSchedule() {
  document.getElementById('schedule-modal').style.display = 'flex';
  await loadScheduleData();
  showScheduleList();
}

function closeSchedule() {
  document.getElementById('schedule-modal').style.display = 'none';
}

async function loadScheduleData() {
  const container = document.getElementById('sch-rules-container');
  container.innerHTML = '<div style="text-align:center;padding:20px;color:#64748b">Loading schedules...</div>';
  try {
    const res = await fetch('/api/schedule');
    const data = await res.json();
    _schedules = data.list || [];
    _categoriesList = data.categories_list || [];
    
    // Calculate cumulative progress
    const active = _schedules.some(s => s.enabled);
    const todaySent = _schedules.reduce((sum, s) => sum + (s.today_sent || 0), 0);
    const totalLimit = _schedules.reduce((sum, s) => sum + (s.daily_limit || 0), 0);
    const totalSent = _schedules.reduce((sum, s) => sum + (s.total_sent || 0), 0);
    
    let maxLastRun = null;
    _schedules.forEach(s => {
      if (s.last_run) {
        const d = new Date(s.last_run);
        if (!maxLastRun || d > maxLastRun) maxLastRun = d;
      }
    });
    
    // Update status panel
    document.getElementById('sch-today-sent').textContent = todaySent;
    document.getElementById('sch-today-limit').textContent = totalLimit;
    document.getElementById('sch-total-sent').textContent = totalSent;
    
    const lastRunEl = document.getElementById('sch-last-run');
    if (maxLastRun) {
      lastRunEl.textContent = '⏰ Last run: ' + maxLastRun.toLocaleString('en-IN', {timeZone: 'Asia/Kolkata'});
    } else {
      lastRunEl.textContent = 'Not run yet';
    }
    
    const badge = document.getElementById('sch-enabled-badge');
    badge.textContent = active ? '🟢 ACTIVE' : '⚪ PAUSED';
    badge.style.background = active ? '#14532d' : '#1e3a5f';
    badge.style.color = active ? '#86efac' : '#60a5fa';
    
    renderScheduleRules();
  } catch(e) {
    console.error('Error loading schedule data:', e);
    container.innerHTML = `<div style="text-align:center;padding:20px;color:#f87171">❌ Error: ${e.message}</div>`;
  }
}

function renderScheduleRules() {
  const container = document.getElementById('sch-rules-container');
  container.innerHTML = '';
  if (!_schedules.length) {
    container.innerHTML = '<div style="text-align:center;padding:30px;color:#64748b;font-size:13px">No schedule rules found. Click "Add Schedule Rule" to create one.</div>';
    return;
  }
  
  _schedules.forEach(s => {
    const card = document.createElement('div');
    card.style.cssText = `background:#1e293b;border:1px solid #334155;border-radius:12px;padding:16px;display:flex;justify-content:space-between;align-items:center;transition:all 0.2s ease;gap:15px`;
    
    card.onmouseover = () => { card.style.borderColor = '#4f46e5'; card.style.transform = 'translateY(-1px)'; };
    card.onmouseout = () => { card.style.borderColor = '#334155'; card.style.transform = 'none'; };
    
    const hoursFormatted = (s.send_hours || []).map(h => {
      const ampm = h >= 12 ? 'PM' : 'AM';
      const disp = h % 12 || 12;
      return `${disp}:00 ${ampm}`;
    }).join(', ') || 'None';
    
    const catsStr = (s.categories && s.categories.length) ? s.categories.join(', ') : 'All Categories';
    const citiesStr = (s.cities && s.cities.length) ? s.cities.join(', ') : 'All Cities';
    
    const infoCol = document.createElement('div');
    infoCol.style.cssText = `flex:1;display:flex;flex-direction:column;gap:4px`;
    infoCol.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-weight:700;color:#f8fafc;font-size:14px">${s.name || 'Unnamed Schedule'}</span>
        <span style="font-size:10px;padding:2px 8px;border-radius:12px;font-weight:600;background:${s.enabled ? '#065f46' : '#374151'};color:${s.enabled ? '#34d399' : '#9ca3af'}">
          ${s.enabled ? 'ACTIVE' : 'PAUSED'}
        </span>
      </div>
      <div style="font-size:11px;color:#94a3b8">
        🏷️ <b>Categories:</b> ${catsStr} &bull; 🌆 <b>Cities:</b> ${citiesStr}
      </div>
      <div style="font-size:11px;color:#94a3b8">
        🕐 <b>Send Hours (IST):</b> ${hoursFormatted}
      </div>
      <div style="font-size:11px;color:#64748b;margin-top:2px">
        📈 Sent today: <span style="color:#34d399;font-weight:600">${s.today_sent || 0}</span> / <span style="color:#60a5fa;font-weight:600">${s.daily_limit || 60}</span>
        ${s.last_run ? `&nbsp;&bull;&nbsp; Last run: ${new Date(s.last_run).toLocaleDateString('en-IN')} ${new Date(s.last_run).toLocaleTimeString('en-IN', {hour:'2-digit', minute:'2-digit'})}` : ''}
      </div>
    `;
    
    const actionsCol = document.createElement('div');
    actionsCol.style.cssText = `display:flex;gap:8px;align-items:center`;
    
    const editBtn = document.createElement('button');
    editBtn.className = 'btn b-blue';
    editBtn.style.cssText = `padding:6px 12px;font-size:12px`;
    editBtn.textContent = '✏️ Edit';
    editBtn.onclick = () => editScheduleRuleForm(s._id);
    
    const runNowBtn = document.createElement('button');
    runNowBtn.className = 'btn b-green';
    runNowBtn.style.cssText = `padding:6px 12px;font-size:12px`;
    runNowBtn.textContent = '🚀 Run Now';
    runNowBtn.onclick = async () => {
      runNowBtn.disabled = true;
      runNowBtn.textContent = '⏳ Starting...';
      try {
        const res = await (await fetch(`/api/schedule/${s._id}/run-now`, { method: 'POST' })).json();
        if (res.success) {
          alert('✅ Success: ' + res.message);
          closeSchedule();
          connectSSE();
        } else {
          alert('⚠️ Warning: ' + (res.error || 'Could not start'));
        }
      } catch (err) {
        alert('❌ Error: ' + err.message);
      } finally {
        runNowBtn.disabled = false;
        runNowBtn.textContent = '🚀 Run Now';
      }
    };
    
    actionsCol.appendChild(editBtn);
    actionsCol.appendChild(runNowBtn);
    
    card.appendChild(infoCol);
    card.appendChild(actionsCol);
    container.appendChild(card);
  });
}

function openNewScheduleForm() {
  document.getElementById('sch-list-view').style.display = 'none';
  document.getElementById('sch-form-view').style.display = 'block';
  document.getElementById('sch-form-title').textContent = '➕ Create New Schedule Rule';
  document.getElementById('sch-edit-id').value = '';
  
  document.getElementById('sch-name').value = '';
  document.getElementById('sch-enabled').checked = true;
  updateEnableVisual();
  
  _selectedCategories = [];
  renderFormCategories();
  
  document.getElementById('sch-cities').value = '';
  
  document.getElementById('sch-limit-slider').value = 60;
  document.getElementById('sch-limit-num').textContent = '60';
  
  const hourCheckboxes = document.querySelectorAll('input[name="sch-hour"]');
  hourCheckboxes.forEach(cb => {
    const val = parseInt(cb.value);
    cb.checked = (val === 10 || val === 16);
  });
  
  document.getElementById('sch-skip-sent').checked = true;
  document.getElementById('sch-allow-resend').checked = false;
  document.getElementById('sch-report-email').value = '';
  
  document.getElementById('sch-delete-btn').style.display = 'none';
  document.getElementById('sch-msg').textContent = '';
  triggerSchedulePreview();
}

function editScheduleRuleForm(id) {
  const s = _schedules.find(item => item._id === id);
  if (!s) return;
  
  document.getElementById('sch-list-view').style.display = 'none';
  document.getElementById('sch-form-view').style.display = 'block';
  document.getElementById('sch-form-title').textContent = '✏️ Edit Schedule Rule';
  document.getElementById('sch-edit-id').value = id;
  
  document.getElementById('sch-name').value = s.name || '';
  document.getElementById('sch-enabled').checked = !!s.enabled;
  updateEnableVisual();
  
  _selectedCategories = [...(s.categories || [])];
  renderFormCategories();
  
  document.getElementById('sch-cities').value = (s.cities || []).join(', ');
  
  document.getElementById('sch-limit-slider').value = s.daily_limit || 60;
  document.getElementById('sch-limit-num').textContent = s.daily_limit || 60;
  
  const hours = s.send_hours || [10, 16];
  const hourCheckboxes = document.querySelectorAll('input[name="sch-hour"]');
  hourCheckboxes.forEach(cb => {
    cb.checked = hours.includes(parseInt(cb.value));
  });
  
  document.getElementById('sch-skip-sent').checked = s.skip_sent !== false;
  document.getElementById('sch-allow-resend').checked = !!s.allow_resend;
  document.getElementById('sch-report-email').value = s.report_email || '';
  
  document.getElementById('sch-delete-btn').style.display = 'inline-block';
  document.getElementById('sch-msg').textContent = '';
  triggerSchedulePreview();
}

function renderFormCategories() {
  const container = document.getElementById('sch-cat-list');
  container.innerHTML = '';
  if (!_categoriesList.length) {
    container.innerHTML = '<div style="color:#64748b;font-size:11px">No categories available.</div>';
    return;
  }
  _categoriesList.forEach(cat => {
    const selected = _selectedCategories.includes(cat);
    const chip = document.createElement('span');
    chip.textContent = cat;
    chip.style.cssText = `cursor:pointer;padding:4px 10px;border-radius:20px;font-size:11px;border:1px solid ${selected?'#7c3aed':'#334155'};background:${selected?'#4f46e5':'transparent'};color:${selected?'#fff':'#94a3b8'};transition:.2s`;
    chip.onclick = () => {
      const idx = _selectedCategories.indexOf(cat);
      if (idx === -1) {
        _selectedCategories.push(cat);
        chip.style.background = '#4f46e5';
        chip.style.color = '#fff';
        chip.style.borderColor = '#7c3aed';
      } else {
        _selectedCategories.splice(idx, 1);
        chip.style.background = 'transparent';
        chip.style.color = '#94a3b8';
        chip.style.borderColor = '#334155';
      }
      triggerSchedulePreview();
    };
    container.appendChild(chip);
  });
}

function showScheduleList() {
  document.getElementById('sch-form-view').style.display = 'none';
  document.getElementById('sch-list-view').style.display = 'block';
  loadScheduleData();
}

function updateEnableVisual() {
  const on = document.getElementById('sch-enabled').checked;
  document.getElementById('sch-toggle-bg').style.background    = on ? '#7c3aed' : '#334155';
  document.getElementById('sch-toggle-knob').style.left        = on ? '25px' : '3px';
}

let _previewTimeout = null;
function triggerSchedulePreview() {
  if (_previewTimeout) clearTimeout(_previewTimeout);
  _previewTimeout = setTimeout(fetchSchedulePreview, 250);
}

async function fetchSchedulePreview() {
  const previewList = document.getElementById('sch-preview-list');
  const previewCount = document.getElementById('sch-preview-count');
  
  const categories = _selectedCategories;
  const citiesStr = document.getElementById('sch-cities').value;
  const cities = citiesStr ? citiesStr.split(',').map(c => c.trim()).filter(Boolean) : [];
  const skip_sent = document.getElementById('sch-skip-sent').checked;
  const allow_resend = document.getElementById('sch-allow-resend').checked;
  const daily_limit = parseInt(document.getElementById('sch-limit-slider').value) || 60;
  
  const hourCheckboxes = document.querySelectorAll('input[name="sch-hour"]:checked');
  const send_hours = Array.from(hourCheckboxes).map(cb => parseInt(cb.value));
  
  try {
    const res = await fetch('/api/schedule/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categories, cities, skip_sent, allow_resend, daily_limit, send_hours })
    });
    const data = await res.json();
    if (data.success) {
      previewCount.textContent = `${data.count} matching`;
      previewList.innerHTML = '';
      if (!data.leads || !data.leads.length) {
        previewList.innerHTML = '<div style="color:#64748b;font-size:11px;text-align:center;padding:10px">No matching leads. Adjust filters to load preview.</div>';
        return;
      }
      data.leads.forEach(lead => {
        const item = document.createElement('div');
        item.style.cssText = `display:flex;justify-content:space-between;padding:6px 10px;border-bottom:1px solid #1e293b;font-size:11px;color:#cbd5e1`;
        
        const info = document.createElement('div');
        info.innerHTML = `<b>${lead.name || 'No Name'}</b> <span style="color:#64748b">(${lead.phone})</span>`;
        
        const meta = document.createElement('div');
        meta.style.cssText = `display:flex;gap:6px;align-items:center`;
        
        if (lead.category) {
          meta.innerHTML += `<span style="background:#334155;color:#94a3b8;padding:1px 6px;border-radius:4px;font-size:9px">${lead.category}</span>`;
        }
        if (lead.city) {
          meta.innerHTML += `<span style="background:#1e3a5f;color:#60a5fa;padding:1px 6px;border-radius:4px;font-size:9px">${lead.city}</span>`;
        }
        if (lead.wa_sent) {
          meta.innerHTML += `<span style="color:#34d399;font-size:9px">✔ Sent</span>`;
        }
        
        item.appendChild(info);
        item.appendChild(meta);
        previewList.appendChild(item);
      });
    } else {
      previewCount.textContent = '0 matching';
      previewList.innerHTML = `<div style="color:#f87171;font-size:11px;text-align:center;padding:10px">Preview error: ${data.error}</div>`;
    }
  } catch (e) {
    previewCount.textContent = '0 matching';
    previewList.innerHTML = `<div style="color:#f87171;font-size:11px;text-align:center;padding:10px">Preview error: ${e.message}</div>`;
  }
}

async function saveScheduleRule() {
  const id = document.getElementById('sch-edit-id').value;
  const msg = document.getElementById('sch-msg');
  msg.textContent = '⏳ Saving rule...';
  msg.style.color = '#64748b';
  
  const name = document.getElementById('sch-name').value.trim() || 'New Schedule';
  const enabled = document.getElementById('sch-enabled').checked;
  const categories = _selectedCategories;
  const citiesStr = document.getElementById('sch-cities').value;
  const cities = citiesStr ? citiesStr.split(',').map(c => c.trim()).filter(Boolean) : [];
  const daily_limit = parseInt(document.getElementById('sch-limit-slider').value) || 60;
  
  const hourCheckboxes = document.querySelectorAll('input[name="sch-hour"]:checked');
  const send_hours = Array.from(hourCheckboxes).map(cb => parseInt(cb.value));
  
  const skip_sent = document.getElementById('sch-skip-sent').checked;
  const allow_resend = document.getElementById('sch-allow-resend').checked;
  const report_email = document.getElementById('sch-report-email').value.trim();
  
  if (!send_hours.length) {
    msg.textContent = '⚠️ Please select at least one Send Time checkbox.';
    msg.style.color = '#fbbf24';
    return;
  }
  
  const body = { name, enabled, categories, cities, daily_limit, send_hours, skip_sent, allow_resend, report_email };
  const url = id ? `/api/schedule/${id}` : '/api/schedule';
  const method = id ? 'PUT' : 'POST';
  
  try {
    const res = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const r = await res.json();
    if (r.success) {
      msg.textContent = id ? '✅ Rule updated successfully!' : '✅ New rule created successfully!';
      msg.style.color = '#34d399';
      setTimeout(() => {
        showScheduleList();
      }, 1000);
    } else {
      msg.textContent = '❌ ' + (r.error || 'Failed to save rule');
      msg.style.color = '#f87171';
    }
  } catch (e) {
    msg.textContent = '❌ ' + e.message;
    msg.style.color = '#f87171';
  }
}

async function deleteScheduleRule() {
  const id = document.getElementById('sch-edit-id').value;
  if (!id) return;
  if (!confirm('Are you sure you want to delete this schedule rule?')) return;
  
  const msg = document.getElementById('sch-msg');
  msg.textContent = '⏳ Deleting...';
  msg.style.color = '#64748b';
  
  try {
    const res = await fetch(`/api/schedule/${id}`, { method: 'DELETE' });
    const r = await res.json();
    if (r.success) {
      msg.textContent = '🗑️ Rule deleted successfully!';
      msg.style.color = '#34d399';
      setTimeout(() => {
        showScheduleList();
      }, 1000);
    } else {
      msg.textContent = '❌ ' + (r.error || 'Delete failed');
      msg.style.color = '#f87171';
    }
  } catch (e) {
    msg.textContent = '❌ ' + e.message;
    msg.style.color = '#f87171';
  }
}

async function runScheduleRuleNow() {
  const id = document.getElementById('sch-edit-id').value;
  const btn = document.getElementById('sch-run-btn');
  const msg = document.getElementById('sch-msg');
  
  btn.disabled = true;
  btn.textContent = '⏳ Starting...';
  msg.textContent = '⏳ Saving rule and executing...';
  msg.style.color = '#64748b';
  
  const name = document.getElementById('sch-name').value.trim() || 'New Schedule';
  const enabled = document.getElementById('sch-enabled').checked;
  const categories = _selectedCategories;
  const citiesStr = document.getElementById('sch-cities').value;
  const cities = citiesStr ? citiesStr.split(',').map(c => c.trim()).filter(Boolean) : [];
  const daily_limit = parseInt(document.getElementById('sch-limit-slider').value) || 60;
  
  const hourCheckboxes = document.querySelectorAll('input[name="sch-hour"]:checked');
  const send_hours = Array.from(hourCheckboxes).map(cb => parseInt(cb.value));
  
  const skip_sent = document.getElementById('sch-skip-sent').checked;
  const allow_resend = document.getElementById('sch-allow-resend').checked;
  const report_email = document.getElementById('sch-report-email').value.trim();
  
  if (!send_hours.length) {
    msg.textContent = '⚠️ Please select at least one Send Time checkbox.';
    msg.style.color = '#fbbf24';
    btn.disabled = false;
    btn.textContent = '🚀 Run Now';
    return;
  }
  
  const body = { name, enabled, categories, cities, daily_limit, send_hours, skip_sent, allow_resend, report_email };
  const saveUrl = id ? `/api/schedule/${id}` : '/api/schedule';
  const saveMethod = id ? 'PUT' : 'POST';
  
  try {
    const saveRes = await fetch(saveUrl, {
      method: saveMethod,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const saveR = await saveRes.json();
    if (!saveR.success) {
      msg.textContent = '❌ Failed to save rule before running: ' + (saveR.error || 'Unknown error');
      msg.style.color = '#f87171';
      btn.disabled = false;
      btn.textContent = '🚀 Run Now';
      return;
    }
    
    const targetId = id || (saveR.schedule && saveR.schedule._id);
    if (!targetId) {
      msg.textContent = '❌ Error retrieving schedule ID.';
      msg.style.color = '#f87171';
      btn.disabled = false;
      btn.textContent = '🚀 Run Now';
      return;
    }
    
    const runRes = await fetch(`/api/schedule/${targetId}/run-now`, { method: 'POST' });
    const runR = await runRes.json();
    if (runR.success) {
      msg.textContent = '✅ ' + runR.message;
      msg.style.color = '#34d399';
      setTimeout(() => {
        closeSchedule();
        connectSSE();
      }, 1500);
    } else {
      msg.textContent = '⚠️ ' + (runR.error || 'Could not start');
      msg.style.color = '#fbbf24';
    }
  } catch (e) {
    msg.textContent = '❌ ' + e.message;
    msg.style.color = '#f87171';
  } finally {
    btn.disabled = false;
    btn.textContent = '🚀 Run Now';
  }
}

async function testScheduleRuleReport() {
  const id = document.getElementById('sch-edit-id').value;
  if (!id) {
    alert('Please save the rule first before testing the report email.');
    return;
  }
  const msg = document.getElementById('sch-msg');
  msg.textContent = '⏳ Sending test report...';
  msg.style.color = '#64748b';
  
  try {
    const res = await fetch(`/api/schedule/${id}/test-report`, { method: 'POST' });
    const r = await res.json();
    if (r.success) {
      msg.textContent = '✅ Test report sent! Check your email.';
      msg.style.color = '#34d399';
    } else {
      msg.textContent = '❌ ' + (r.error || 'Failed to send test report');
      msg.style.color = '#f87171';
    }
  } catch (e) {
    msg.textContent = '❌ ' + e.message;
    msg.style.color = '#f87171';
  }
}

// ── Email Auto Schedule Modal ─────────────────────────────────────
let _emailSchedules = [];
let _emailCategoriesList = [];
let _emailSelectedCategories = [];

async function openEmailSchedule() {
  document.getElementById('email-schedule-modal').style.display = 'flex';
  await loadEmailScheduleData();
  showEmailScheduleList();
}

function closeEmailSchedule() {
  document.getElementById('email-schedule-modal').style.display = 'none';
}

async function loadEmailScheduleData() {
  const container = document.getElementById('esch-rules-container');
  container.innerHTML = '<div style="text-align:center;padding:20px;color:#64748b">Loading schedules...</div>';
  try {
    const res = await fetch('/api/email-schedule');
    const data = await res.json();
    _emailSchedules = data.list || [];
    _emailCategoriesList = data.categories_list || [];
    
    // Calculate cumulative progress
    const active = _emailSchedules.some(s => s.enabled);
    const todaySent = _emailSchedules.reduce((sum, s) => sum + (s.today_sent || 0), 0);
    const totalLimit = _emailSchedules.reduce((sum, s) => sum + (s.daily_limit || 0), 0);
    const totalSent = _emailSchedules.reduce((sum, s) => sum + (s.total_sent || 0), 0);
    
    let maxLastRun = null;
    _emailSchedules.forEach(s => {
      if (s.last_run) {
        const d = new Date(s.last_run);
        if (!maxLastRun || d > maxLastRun) maxLastRun = d;
      }
    });
    
    // Update status panel
    document.getElementById('esch-today-sent').textContent = todaySent;
    document.getElementById('esch-today-limit').textContent = totalLimit;
    document.getElementById('esch-total-sent').textContent = totalSent;
    
    const lastRunEl = document.getElementById('esch-last-run');
    if (maxLastRun) {
      lastRunEl.textContent = '⏰ Last run: ' + maxLastRun.toLocaleString('en-IN', {timeZone: 'Asia/Kolkata'});
    } else {
      lastRunEl.textContent = 'Not run yet';
    }
    
    const badge = document.getElementById('esch-enabled-badge');
    badge.textContent = active ? '🟢 ACTIVE' : '⚪ PAUSED';
    badge.style.background = active ? '#14532d' : '#1e3a5f';
    badge.style.color = active ? '#86efac' : '#60a5fa';
    
    renderEmailScheduleRules();
  } catch(e) {
    console.error('Error loading email schedule data:', e);
    container.innerHTML = `<div style="text-align:center;padding:20px;color:#f87171">❌ Error: ${e.message}</div>`;
  }
}

function renderEmailScheduleRules() {
  const container = document.getElementById('esch-rules-container');
  container.innerHTML = '';
  if (!_emailSchedules.length) {
    container.innerHTML = '<div style="text-align:center;padding:30px;color:#64748b;font-size:13px">No schedule rules found. Click "Add Schedule Rule" to create one.</div>';
    return;
  }
  
  _emailSchedules.forEach(s => {
    const card = document.createElement('div');
    card.style.cssText = `background:#1e293b;border:1px solid #334155;border-radius:12px;padding:16px;display:flex;justify-content:space-between;align-items:center;transition:all 0.2s ease;gap:15px`;
    
    card.onmouseover = () => { card.style.borderColor = '#2563eb'; card.style.transform = 'translateY(-1px)'; };
    card.onmouseout = () => { card.style.borderColor = '#334155'; card.style.transform = 'none'; };
    
    const hoursFormatted = (s.send_hours || []).map(h => {
      const ampm = h >= 12 ? 'PM' : 'AM';
      const disp = h % 12 || 12;
      return `${disp}:00 ${ampm}`;
    }).join(', ') || 'None';
    
    const catsStr = (s.categories && s.categories.length) ? s.categories.join(', ') : 'All Categories';
    const citiesStr = (s.cities && s.cities.length) ? s.cities.join(', ') : 'All Cities';
    
    const infoCol = document.createElement('div');
    infoCol.style.cssText = `flex:1;display:flex;flex-direction:column;gap:4px`;
    infoCol.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-weight:700;color:#f8fafc;font-size:14px">${s.name || 'Unnamed Schedule'}</span>
        <span style="font-size:10px;padding:2px 8px;border-radius:12px;font-weight:600;background:${s.enabled ? '#1e3a5f' : '#374151'};color:${s.enabled ? '#60a5fa' : '#9ca3af'}">
          ${s.enabled ? 'ACTIVE' : 'PAUSED'}
        </span>
      </div>
      <div style="font-size:11px;color:#94a3b8">
        🏷️ <b>Categories:</b> ${catsStr} &bull; 🌆 <b>Cities:</b> ${citiesStr}
      </div>
      <div style="font-size:11px;color:#94a3b8">
        🕐 <b>Send Hours (IST):</b> ${hoursFormatted}
      </div>
      <div style="font-size:11px;color:#64748b;margin-top:2px">
        📈 Sent today: <span style="color:#34d399;font-weight:600">${s.today_sent || 0}</span> / <span style="color:#60a5fa;font-weight:600">${s.daily_limit || 60}</span>
        ${s.last_run ? `&nbsp;&bull;&nbsp; Last run: ${new Date(s.last_run).toLocaleDateString('en-IN')} ${new Date(s.last_run).toLocaleTimeString('en-IN', {hour:'2-digit', minute:'2-digit'})}` : ''}
      </div>
    `;
    
    const actionsCol = document.createElement('div');
    actionsCol.style.cssText = `display:flex;gap:8px;align-items:center`;
    
    const editBtn = document.createElement('button');
    editBtn.className = 'btn b-blue';
    editBtn.style.cssText = `padding:6px 12px;font-size:12px`;
    editBtn.textContent = '✏️ Edit';
    editBtn.onclick = () => editEmailScheduleRuleForm(s._id);
    
    const runNowBtn = document.createElement('button');
    runNowBtn.className = 'btn b-green';
    runNowBtn.style.cssText = `padding:6px 12px;font-size:12px`;
    runNowBtn.textContent = '🚀 Run Now';
    runNowBtn.onclick = async () => {
      runNowBtn.disabled = true;
      runNowBtn.textContent = '⏳ Starting...';
      try {
        const res = await (await fetch(`/api/email-schedule/${s._id}/run-now`, { method: 'POST' })).json();
        if (res.success) {
          alert('✅ Success: ' + res.message);
          closeEmailSchedule();
          connectSSE();
        } else {
          alert('⚠️ Warning: ' + (res.error || 'Could not start'));
        }
      } catch (err) {
        alert('❌ Error: ' + err.message);
      } finally {
        runNowBtn.disabled = false;
        runNowBtn.textContent = '🚀 Run Now';
      }
    };
    
    actionsCol.appendChild(editBtn);
    actionsCol.appendChild(runNowBtn);
    
    card.appendChild(infoCol);
    card.appendChild(actionsCol);
    container.appendChild(card);
  });
}

async function adjustEmailScheduleLimitSlider(currentValue) {
  const slider = document.getElementById('esch-limit-slider');
  const numLabel = document.getElementById('esch-limit-num');
  if (!slider) return;

  try {
    const r = await fetch('/api/smtp-accounts');
    const d = await r.json();
    const accounts = d.accounts || [];
    const count = accounts.length;
    const maxLimit = Math.max(1, count) * 450;

    slider.max = maxLimit;
    
    // Set slider value. If currentValue is provided, use it (clamped to maxLimit),
    // otherwise use the maxLimit itself as the default.
    const val = currentValue !== undefined ? Math.min(currentValue, maxLimit) : maxLimit;
    slider.value = val;
    if (numLabel) numLabel.textContent = val;
  } catch (e) {
    console.error('Error fetching SMTP accounts for slider limit:', e);
    slider.max = 450;
    const val = currentValue !== undefined ? Math.min(currentValue, 450) : 450;
    slider.value = val;
    if (numLabel) numLabel.textContent = val;
  }
}

function openNewEmailScheduleForm() {
  document.getElementById('esch-list-view').style.display = 'none';
  document.getElementById('esch-form-view').style.display = 'block';
  document.getElementById('esch-form-title').textContent = '➕ Create New Email Schedule Rule';
  document.getElementById('esch-edit-id').value = '';
  
  document.getElementById('esch-name').value = '';
  document.getElementById('esch-enabled').checked = true;
  updateEmailEnableVisual();
  
  _emailSelectedCategories = [];
  renderEmailFormCategories();
  
  document.getElementById('esch-cities').value = '';
  
  adjustEmailScheduleLimitSlider();
  
  const hourCheckboxes = document.querySelectorAll('input[name="esch-hour"]');
  hourCheckboxes.forEach(cb => {
    const val = parseInt(cb.value);
    cb.checked = (val === 10 || val === 16);
  });
  
  document.getElementById('esch-skip-sent').checked = true;
  document.getElementById('esch-allow-resend').checked = false;
  document.getElementById('esch-report-email').value = '';
  
  document.getElementById('esch-delete-btn').style.display = 'none';
  document.getElementById('esch-msg').textContent = '';
  triggerEmailSchedulePreview();
}

function editEmailScheduleRuleForm(id) {
  const s = _emailSchedules.find(item => item._id === id);
  if (!s) return;
  
  document.getElementById('esch-list-view').style.display = 'none';
  document.getElementById('esch-form-view').style.display = 'block';
  document.getElementById('esch-form-title').textContent = '✏️ Edit Email Schedule Rule';
  document.getElementById('esch-edit-id').value = id;
  
  document.getElementById('esch-name').value = s.name || '';
  document.getElementById('esch-enabled').checked = !!s.enabled;
  updateEmailEnableVisual();
  
  _emailSelectedCategories = [...(s.categories || [])];
  renderEmailFormCategories();
  
  document.getElementById('esch-cities').value = (s.cities || []).join(', ');
  
  adjustEmailScheduleLimitSlider(s.daily_limit);
  
  const hours = s.send_hours || [10, 16];
  const hourCheckboxes = document.querySelectorAll('input[name="esch-hour"]');
  hourCheckboxes.forEach(cb => {
    cb.checked = hours.includes(parseInt(cb.value));
  });
  
  document.getElementById('esch-skip-sent').checked = s.skip_sent !== false;
  document.getElementById('esch-allow-resend').checked = !!s.allow_resend;
  document.getElementById('esch-report-email').value = s.report_email || '';
  
  document.getElementById('esch-delete-btn').style.display = 'inline-block';
  document.getElementById('esch-msg').textContent = '';
  triggerEmailSchedulePreview();
}

function renderEmailFormCategories() {
  const container = document.getElementById('esch-cat-list');
  container.innerHTML = '';
  if (!_emailCategoriesList.length) {
    container.innerHTML = '<div style="color:#64748b;font-size:11px">No categories available.</div>';
    return;
  }
  _emailCategoriesList.forEach(cat => {
    const selected = _emailSelectedCategories.includes(cat);
    const chip = document.createElement('span');
    chip.textContent = cat;
    chip.style.cssText = `cursor:pointer;padding:4px 10px;border-radius:20px;font-size:11px;border:1px solid ${selected?'#2563eb':'#334155'};background:${selected?'#2563eb':'transparent'};color:${selected?'#fff':'#94a3b8'};transition:.2s`;
    chip.onclick = () => {
      const idx = _emailSelectedCategories.indexOf(cat);
      if (idx === -1) {
        _emailSelectedCategories.push(cat);
        chip.style.background = '#2563eb';
        chip.style.color = '#fff';
        chip.style.borderColor = '#2563eb';
      } else {
        _emailSelectedCategories.splice(idx, 1);
        chip.style.background = 'transparent';
        chip.style.color = '#94a3b8';
        chip.style.borderColor = '#334155';
      }
      triggerEmailSchedulePreview();
    };
    container.appendChild(chip);
  });
}

function showEmailScheduleList() {
  document.getElementById('esch-form-view').style.display = 'none';
  document.getElementById('esch-list-view').style.display = 'block';
  loadEmailScheduleData();
}

function updateEmailEnableVisual() {
  const on = document.getElementById('esch-enabled').checked;
  document.getElementById('esch-toggle-bg').style.background    = on ? '#2563eb' : '#334155';
  document.getElementById('esch-toggle-knob').style.left        = on ? '25px' : '3px';
}

let _emailPreviewTimeout = null;
function triggerEmailSchedulePreview() {
  if (_emailPreviewTimeout) clearTimeout(_emailPreviewTimeout);
  _emailPreviewTimeout = setTimeout(fetchEmailSchedulePreview, 250);
}

async function fetchEmailSchedulePreview() {
  const previewList = document.getElementById('esch-preview-list');
  const previewCount = document.getElementById('esch-preview-count');
  
  const categories = _emailSelectedCategories;
  const citiesStr = document.getElementById('esch-cities').value;
  const cities = citiesStr ? citiesStr.split(',').map(c => c.trim()).filter(Boolean) : [];
  const skip_sent = document.getElementById('esch-skip-sent').checked;
  const allow_resend = document.getElementById('esch-allow-resend').checked;
  const daily_limit = parseInt(document.getElementById('esch-limit-slider').value) || 450;
  
  const hourCheckboxes = document.querySelectorAll('input[name="esch-hour"]:checked');
  const send_hours = Array.from(hourCheckboxes).map(cb => parseInt(cb.value));
  
  try {
    const res = await fetch('/api/email-schedule/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categories, cities, skip_sent, allow_resend, daily_limit, send_hours })
    });
    const data = await res.json();
    if (data.success) {
      previewCount.textContent = `${data.count} matching`;
      previewList.innerHTML = '';
      if (!data.leads || !data.leads.length) {
        previewList.innerHTML = '<div style="color:#64748b;font-size:11px;text-align:center;padding:10px">No matching leads. Adjust filters to load preview.</div>';
        return;
      }
      data.leads.forEach(lead => {
        const item = document.createElement('div');
        item.style.cssText = `display:flex;justify-content:space-between;padding:6px 10px;border-bottom:1px solid #1e293b;font-size:11px;color:#cbd5e1`;
        
        const info = document.createElement('div');
        info.innerHTML = `<b>${lead.name || 'No Name'}</b> <span style="color:#64748b">(${lead.email})</span>`;
        
        const meta = document.createElement('div');
        meta.style.cssText = `display:flex;gap:6px;align-items:center`;
        
        if (lead.category) {
          meta.innerHTML += `<span style="background:#334155;color:#94a3b8;padding:1px 6px;border-radius:4px;font-size:9px">${lead.category}</span>`;
        }
        if (lead.city) {
          meta.innerHTML += `<span style="background:#1e3a5f;color:#60a5fa;padding:1px 6px;border-radius:4px;font-size:9px">${lead.city}</span>`;
        }
        if (lead.email_sent) {
          meta.innerHTML += `<span style="color:#60a5fa;font-size:9px">✉ Sent</span>`;
        }
        
        item.appendChild(info);
        item.appendChild(meta);
        previewList.appendChild(item);
      });
    } else {
      previewCount.textContent = '0 matching';
      previewList.innerHTML = `<div style="color:#f87171;font-size:11px;text-align:center;padding:10px">Preview error: ${data.error}</div>`;
    }
  } catch (e) {
    previewCount.textContent = '0 matching';
    previewList.innerHTML = `<div style="color:#f87171;font-size:11px;text-align:center;padding:10px">Preview error: ${e.message}</div>`;
  }
}

async function saveEmailScheduleRule() {
  const id = document.getElementById('esch-edit-id').value;
  const msg = document.getElementById('esch-msg');
  msg.textContent = '⏳ Saving rule...';
  msg.style.color = '#64748b';
  
  const name = document.getElementById('esch-name').value.trim() || 'New Email Schedule';
  const enabled = document.getElementById('esch-enabled').checked;
  const categories = _emailSelectedCategories;
  const citiesStr = document.getElementById('esch-cities').value;
  const cities = citiesStr ? citiesStr.split(',').map(c => c.trim()).filter(Boolean) : [];
  const daily_limit = parseInt(document.getElementById('esch-limit-slider').value) || 450;
  
  const hourCheckboxes = document.querySelectorAll('input[name="esch-hour"]:checked');
  const send_hours = Array.from(hourCheckboxes).map(cb => parseInt(cb.value));
  
  const skip_sent = document.getElementById('esch-skip-sent').checked;
  const allow_resend = document.getElementById('esch-allow-resend').checked;
  const report_email = document.getElementById('esch-report-email').value.trim();
  
  if (!send_hours.length) {
    msg.textContent = '⚠️ Please select at least one Send Time checkbox.';
    msg.style.color = '#fbbf24';
    return;
  }
  
  const body = { name, enabled, categories, cities, daily_limit, send_hours, skip_sent, allow_resend, report_email };
  const url = id ? `/api/email-schedule/${id}` : '/api/email-schedule';
  const method = id ? 'PUT' : 'POST';
  
  try {
    const res = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const r = await res.json();
    if (r.success) {
      msg.textContent = id ? '✅ Rule updated successfully!' : '✅ New rule created successfully!';
      msg.style.color = '#34d399';
      setTimeout(() => {
        showEmailScheduleList();
      }, 1000);
    } else {
      msg.textContent = '❌ ' + (r.error || 'Failed to save rule');
      msg.style.color = '#f87171';
    }
  } catch (e) {
    msg.textContent = '❌ ' + e.message;
    msg.style.color = '#f87171';
  }
}

async function deleteEmailScheduleRule() {
  const id = document.getElementById('esch-edit-id').value;
  if (!id) return;
  if (!confirm('Are you sure you want to delete this email schedule rule?')) return;
  
  const msg = document.getElementById('esch-msg');
  msg.textContent = '⏳ Deleting...';
  msg.style.color = '#64748b';
  
  try {
    const res = await fetch(`/api/email-schedule/${id}`, { method: 'DELETE' });
    const r = await res.json();
    if (r.success) {
      msg.textContent = '🗑️ Rule deleted successfully!';
      msg.style.color = '#34d399';
      setTimeout(() => {
        showEmailScheduleList();
      }, 1000);
    } else {
      msg.textContent = '❌ ' + (r.error || 'Delete failed');
      msg.style.color = '#f87171';
    }
  } catch (e) {
    msg.textContent = '❌ ' + e.message;
    msg.style.color = '#f87171';
  }
}

async function runEmailScheduleRuleNow() {
  const id = document.getElementById('esch-edit-id').value;
  const btn = document.getElementById('esch-run-btn');
  const msg = document.getElementById('esch-msg');
  
  btn.disabled = true;
  btn.textContent = '⏳ Starting...';
  msg.textContent = '⏳ Saving rule and executing...';
  msg.style.color = '#64748b';
  
  const name = document.getElementById('esch-name').value.trim() || 'New Email Schedule';
  const enabled = document.getElementById('esch-enabled').checked;
  const categories = _emailSelectedCategories;
  const citiesStr = document.getElementById('esch-cities').value;
  const cities = citiesStr ? citiesStr.split(',').map(c => c.trim()).filter(Boolean) : [];
  const daily_limit = parseInt(document.getElementById('esch-limit-slider').value) || 450;
  
  const hourCheckboxes = document.querySelectorAll('input[name="esch-hour"]:checked');
  const send_hours = Array.from(hourCheckboxes).map(cb => parseInt(cb.value));
  
  const skip_sent = document.getElementById('esch-skip-sent').checked;
  const allow_resend = document.getElementById('esch-allow-resend').checked;
  const report_email = document.getElementById('esch-report-email').value.trim();
  
  if (!send_hours.length) {
    msg.textContent = '⚠️ Please select at least one Send Time checkbox.';
    msg.style.color = '#fbbf24';
    btn.disabled = false;
    btn.textContent = '🚀 Run Now';
    return;
  }
  
  const body = { name, enabled, categories, cities, daily_limit, send_hours, skip_sent, allow_resend, report_email };
  const saveUrl = id ? `/api/email-schedule/${id}` : '/api/email-schedule';
  const saveMethod = id ? 'PUT' : 'POST';
  
  try {
    const saveRes = await fetch(saveUrl, {
      method: saveMethod,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const saveR = await saveRes.json();
    if (!saveR.success) {
      msg.textContent = '❌ Failed to save rule before running: ' + (saveR.error || 'Unknown error');
      msg.style.color = '#f87171';
      btn.disabled = false;
      btn.textContent = '🚀 Run Now';
      return;
    }
    
    const targetId = id || (saveR.schedule && saveR.schedule._id);
    if (!targetId) {
      msg.textContent = '❌ Error retrieving schedule ID.';
      msg.style.color = '#f87171';
      btn.disabled = false;
      btn.textContent = '🚀 Run Now';
      return;
    }
    
    const runRes = await fetch(`/api/email-schedule/${targetId}/run-now`, { method: 'POST' });
    const runR = await runRes.json();
    if (runR.success) {
      msg.textContent = '✅ ' + runR.message;
      msg.style.color = '#34d399';
      setTimeout(() => {
        closeEmailSchedule();
        connectSSE();
      }, 1500);
    } else {
      msg.textContent = '⚠️ ' + (runR.error || 'Could not start');
      msg.style.color = '#fbbf24';
    }
  } catch (e) {
    msg.textContent = '❌ ' + e.message;
    msg.style.color = '#f87171';
  } finally {
    btn.disabled = false;
    btn.textContent = '🚀 Run Now';
  }
}

async function testEmailScheduleRuleReport() {
  const id = document.getElementById('esch-edit-id').value;
  if (!id) {
    alert('Please save the rule first before testing the report email.');
    return;
  }
  const msg = document.getElementById('esch-msg');
  msg.textContent = '⏳ Sending test report...';
  msg.style.color = '#64748b';
  
  try {
    const res = await fetch(`/api/email-schedule/${id}/test-report`, { method: 'POST' });
    const r = await res.json();
    if (r.success) {
      msg.textContent = '✅ Test report sent! Check your email.';
      msg.style.color = '#34d399';
    } else {
      msg.textContent = '❌ ' + (r.error || 'Failed to send test report');
      msg.style.color = '#f87171';
    }
  } catch (e) {
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

// ── Email & System Log Viewer ──────────────────────────────────
async function loadLogs() {
  const viewer = document.getElementById('log-viewer');
  if (!viewer) return;
  viewer.textContent = '⏳ Loading logs...';
  try {
    const r = await fetch('/api/logs');
    const text = await r.text();
    viewer.textContent = text || 'No logs recorded yet.';
    viewer.scrollTop = viewer.scrollHeight;
  } catch(e) {
    viewer.textContent = '❌ Failed to load logs: ' + e.message;
  }
}

async function clearLogs() {
  if (!confirm('Are you sure you want to clear the logs file?')) return;
  try {
    const r = await fetch('/api/logs', { method: 'DELETE' });
    const d = await r.json();
    if (d.success) {
      document.getElementById('log-viewer').textContent = 'No logs recorded yet.';
    } else {
      alert('Failed to clear logs: ' + (d.error || 'Unknown error'));
    }
  } catch(e) {
    alert('Error clearing logs: ' + e.message);
  }
}


// ═══════════════════════════════════════════════════════════════
// ── SMTP Email Accounts — Multi-Account Load Balancer ──────────
// ═══════════════════════════════════════════════════════════════

// Load and render all SMTP accounts
async function loadSmtpAccounts() {
  try {
    const r = await fetch('/api/smtp-accounts');
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Failed to load accounts');
    renderSmtpAccounts(d.accounts || []);
    updateLbStatusBar(d.summary || {});
  } catch(e) {
    const list = document.getElementById('smtp-accounts-list');
    if (list) list.innerHTML = `<div style="color:#f87171;font-size:12px;padding:12px">❌ ${e.message}</div>`;
  }
}

// Update the load balancer status bar stats
function updateLbStatusBar(summary) {
  const dot = document.getElementById('lb-dot');
  const txt = document.getElementById('lb-status-txt');
  const activeEl = document.getElementById('lb-active-count');
  const capEl    = document.getElementById('lb-capacity');
  const sentEl   = document.getElementById('lb-sent-today');
  const remEl    = document.getElementById('lb-remaining');
  if (!dot) return;

  const active = summary.active || 0;
  const cap    = summary.totalCapacity || 0;
  const sent   = summary.totalSentToday || 0;
  const rem    = summary.remainingToday || 0;

  dot.style.background = active > 0 ? '#34d399' : '#f87171';
  dot.style.boxShadow  = active > 0 ? '0 0 8px #34d399' : '0 0 8px #f87171';
  txt.textContent = active > 0
    ? `Load Balancer ACTIVE — ${active} account${active > 1 ? 's' : ''} distributing emails`
    : 'No active email accounts — add one below';

  if (activeEl) activeEl.textContent = active;
  if (capEl)    capEl.textContent    = cap;
  if (sentEl)   sentEl.textContent   = sent;
  if (remEl)    remEl.textContent    = rem;
}

// Render account cards
function renderSmtpAccounts(accounts) {
  const list = document.getElementById('smtp-accounts-list');
  if (!list) return;

  if (!accounts.length) {
    list.innerHTML = `
      <div style="text-align:center;padding:32px 20px;border:2px dashed #1e293b;border-radius:12px">
        <div style="font-size:36px;margin-bottom:10px">📭</div>
        <div style="font-size:14px;color:#94a3b8;font-weight:600;margin-bottom:6px">No Email Accounts Yet</div>
        <div style="font-size:12px;color:#64748b;margin-bottom:16px">Add your first Gmail account to start sending emails via the load balancer</div>
        <button class="btn b-green" onclick="openAddSmtpModal()" style="padding:9px 20px;font-size:12px">➕ Add First Account</button>
      </div>`;
    return;
  }

  list.innerHTML = accounts.map(a => {
    const pct   = a.daily_limit > 0 ? Math.min(100, Math.round((a.daily_sent / a.daily_limit) * 100)) : 0;
    const color = pct >= 90 ? '#f87171' : pct >= 70 ? '#fbbf24' : '#34d399';
    const host  = (a.smtp_host || 'smtp.gmail.com').replace('smtp.', '');
    const lastUsed = a.last_used_at
      ? new Date(a.last_used_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' })
      : 'Never used';

    return `
    <div class="smtp-acct-card ${a.isActive ? 'active-card' : 'inactive-card'}" id="smtp-card-${a._id}">
      <div class="smtp-acct-avatar">📧</div>

      <div class="smtp-acct-info">
        <div class="smtp-acct-label">${esc(a.label || 'Gmail Account')}</div>
        <div class="smtp-acct-email">${esc(a.smtp_user)}</div>
        <div class="smtp-acct-meta">
          ${host} · Port ${a.smtp_port} · ${a.smtp_secure ? 'SSL' : 'STARTTLS'} · From: "${esc(a.smtp_from || '')}"
          &nbsp;·&nbsp; Last used: ${lastUsed}
        </div>
      </div>

      <!-- Daily usage bar -->
      <div class="smtp-usage-bar-wrap">
        <div class="smtp-usage-label">
          <span style="color:${color};font-weight:700">${a.daily_sent}</span>
          <span>/ ${a.daily_limit}/day</span>
        </div>
        <div class="smtp-usage-track">
          <div class="smtp-usage-fill" style="width:${pct}%;background:${color}"></div>
        </div>
        <div style="font-size:9px;color:#64748b;margin-top:3px;text-align:right">${pct}% used · ${a.daily_limit - a.daily_sent} remaining</div>
      </div>

      <!-- Actions -->
      <div class="smtp-acct-actions">
        <!-- Active toggle -->
        <label class="smtp-toggle-label" title="Enable/disable this account in the load balancer">
          <input type="checkbox" ${a.isActive ? 'checked' : ''}
            onchange="toggleSmtpAccount('${a._id}', this.checked)"
            style="accent-color:#34d399;width:14px;height:14px">
          <span>${a.isActive ? '<span style="color:#34d399">Active</span>' : '<span style="color:#64748b">Paused</span>'}</span>
        </label>

        <!-- Test button -->
        <button class="btn b-blue" style="padding:5px 10px;font-size:10px;min-width:60px"
          onclick="testExistingSmtpAccount('${a._id}', this)">
          🔌 Test
        </button>

        <!-- Delete button -->
        <button class="btn b-red" style="padding:5px 10px;font-size:10px;background:#7f1d1d;color:#fca5a5;border:1px solid #991b1b"
          onclick="deleteSmtpAccount('${a._id}', '${esc(a.smtp_user)}')"
          title="Remove this account">
          🗑
        </button>
      </div>

      <!-- Per-account test result inline -->
      <div id="test-result-${a._id}" style="width:100%;font-size:11px;min-height:0"></div>
    </div>`;
  }).join('');
}

// ── Open / Close Add Modal ──────────────────────────────────
function openAddSmtpModal() {
  document.getElementById('add-smtp-label').value   = '';
  document.getElementById('add-smtp-user').value    = '';
  document.getElementById('add-smtp-pass').value    = '';
  document.getElementById('add-smtp-from').value    = 'Digital Growth Team';
  document.getElementById('add-smtp-host').value    = 'smtp.gmail.com';
  document.getElementById('add-smtp-port').value    = '587';
  document.getElementById('add-smtp-secure').value  = 'false';
  document.getElementById('add-smtp-limit').value   = '450';
  document.getElementById('add-smtp-status').innerHTML = '';
  document.getElementById('add-smtp-modal').style.display = 'flex';
}

function closeAddSmtpModal() {
  document.getElementById('add-smtp-modal').style.display = 'none';
}

// Close modal on backdrop click
document.getElementById('add-smtp-modal').addEventListener('click', function(e) {
  if (e.target === this) closeAddSmtpModal();
});

// ── Test new account inline (before saving) ────────────────
async function testNewSmtpAccount() {
  const statusEl  = document.getElementById('add-smtp-status');
  const testBtn   = document.getElementById('add-smtp-test-btn');
  const user = document.getElementById('add-smtp-user').value.trim();
  const pass = document.getElementById('add-smtp-pass').value.trim();
  const host = document.getElementById('add-smtp-host').value.trim();
  const port = document.getElementById('add-smtp-port').value.trim();
  const secure = document.getElementById('add-smtp-secure').value;

  if (!user) { statusEl.innerHTML = '<span style="color:#f87171">❌ Enter your Gmail address.</span>'; return; }
  if (!pass) { statusEl.innerHTML = '<span style="color:#f87171">❌ Enter your 16-character App Password.</span>'; return; }

  testBtn.disabled = true;
  testBtn.textContent = '⏳ Testing...';
  statusEl.innerHTML = '<span style="color:#60a5fa">⏳ Connecting to Gmail SMTP...</span>';

  try {
    const r = await fetch('/api/smtp-accounts/test-inline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ smtp_host: host, smtp_port: parseInt(port), smtp_secure: secure === 'true', smtp_user: user, smtp_pass: pass })
    });
    const d = await r.json();
    if (d.success) {
      statusEl.innerHTML = `<span style="color:#34d399">✅ ${d.message || 'Connection successful!'}</span>`;
    } else {
      statusEl.innerHTML = `<span style="color:#f87171">❌ ${d.error}</span>`;
    }
  } catch(e) {
    statusEl.innerHTML = `<span style="color:#f87171">❌ Network error: ${e.message}</span>`;
  } finally {
    testBtn.disabled = false;
    testBtn.textContent = '🔌 Test Connection';
  }
}

// ── Save new account ────────────────────────────────────────
async function saveNewSmtpAccount() {
  const statusEl = document.getElementById('add-smtp-status');
  const saveBtn  = document.getElementById('add-smtp-save-btn');

  const smtp_user  = document.getElementById('add-smtp-user').value.trim();
  const smtp_pass  = document.getElementById('add-smtp-pass').value.trim();
  const label      = document.getElementById('add-smtp-label').value.trim() || 'Gmail Account';
  const smtp_from  = document.getElementById('add-smtp-from').value.trim() || 'Digital Growth Team';
  const smtp_host  = document.getElementById('add-smtp-host').value.trim();
  const smtp_port  = parseInt(document.getElementById('add-smtp-port').value) || 587;
  const smtp_secure= document.getElementById('add-smtp-secure').value === 'true';
  const daily_limit= parseInt(document.getElementById('add-smtp-limit').value) || 450;

  if (!smtp_user) { statusEl.innerHTML = '<span style="color:#f87171">❌ Gmail address is required.</span>'; return; }
  if (!smtp_pass) { statusEl.innerHTML = '<span style="color:#f87171">❌ App Password is required.</span>'; return; }

  saveBtn.disabled = true;
  saveBtn.textContent = '⏳ Saving...';

  try {
    const r = await fetch('/api/smtp-accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, smtp_from, daily_limit })
    });
    const d = await r.json();
    if (d.success) {
      statusEl.innerHTML = '<span style="color:#34d399">✅ Account saved! Refreshing...</span>';
      setTimeout(() => {
        closeAddSmtpModal();
        loadSmtpAccounts();
      }, 800);
    } else {
      statusEl.innerHTML = `<span style="color:#f87171">❌ ${d.error}</span>`;
    }
  } catch(e) {
    statusEl.innerHTML = `<span style="color:#f87171">❌ ${e.message}</span>`;
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = '💾 Save Account';
  }
}

// ── Test existing (saved) account ────────────────────────────
async function testExistingSmtpAccount(id, btn) {
  const resultEl = document.getElementById('test-result-' + id);
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = '⏳';
  if (resultEl) resultEl.innerHTML = '<span style="color:#60a5fa">⏳ Testing...</span>';

  try {
    const r = await fetch(`/api/smtp-accounts/${id}/test`, { method: 'POST' });
    const d = await r.json();
    if (resultEl) {
      resultEl.innerHTML = d.success
        ? `<span style="color:#34d399">✅ ${d.message}</span>`
        : `<span style="color:#f87171">❌ ${d.error}</span>`;
      setTimeout(() => { if (resultEl) resultEl.innerHTML = ''; }, 6000);
    }
  } catch(e) {
    if (resultEl) resultEl.innerHTML = `<span style="color:#f87171">❌ ${e.message}</span>`;
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

// ── Toggle active / paused ────────────────────────────────────
async function toggleSmtpAccount(id, isActive) {
  try {
    await fetch(`/api/smtp-accounts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive })
    });
    // Refresh cards without full page reload
    await loadSmtpAccounts();
  } catch(e) {
    alert('Error updating account: ' + e.message);
  }
}

// ── Delete account ────────────────────────────────────────────
async function deleteSmtpAccount(id, email) {
  if (!confirm(`🗑 Remove email account "${email}" from the load balancer?\n\nThis cannot be undone.`)) return;
  try {
    const r = await fetch(`/api/smtp-accounts/${id}`, { method: 'DELETE' });
    const d = await r.json();
    if (d.success) {
      await loadSmtpAccounts();
    } else {
      alert('❌ Delete failed: ' + (d.error || 'Unknown error'));
    }
  } catch(e) {
    alert('❌ ' + e.message);
  }
}
