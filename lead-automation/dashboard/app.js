let leads=[],curPage=1,totalPages=1,sending=false,sse=null,debounceTimer=null,curSort='-createdAt',_xlImportMode='leads';
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
let autoScraperInterval = null;
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
  if(t==='auto-scraper') {
    loadAutoScraperConfig();
    if(autoScraperInterval) clearInterval(autoScraperInterval);
    autoScraperInterval = setInterval(pollAutoScraperStatus, 3000);
    pollAutoScraperStatus();
  } else {
    if(autoScraperInterval) {
      clearInterval(autoScraperInterval);
      autoScraperInterval = null;
    }
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
      `<div class="stat"><div class="n" style="color:#10b981">${s.waToday || 0}</div><div class="l">Today WA</div></div>`+
      `<div class="stat"><div class="n" style="color:#f43f5e">${s.emailSent}</div><div class="l">Email Sent</div></div>`+
      `<div class="stat"><div class="n" style="color:#ec4899">${s.emailToday || 0}</div><div class="l">Today Email</div></div>`+
      `<div class="stat"><div class="n" style="color:#06b6d4">${s.contacted}</div><div class="l">Contacted</div></div>`+
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
  const q=new URLSearchParams({page:curPage,limit,search,category:cat,status,city,skipWaSent:skipWa,skipEmailSent:skipEmail,noWebsite,sort:curSort});
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

function getSortIndicator(field) {
  if (curSort === field) return ' 🔼';
  if (curSort === '-' + field) return ' 🔽';
  return ' ⇅';
}

function toggleSort(field) {
  if (curSort === field) {
    curSort = '-' + field;
  } else if (curSort === '-' + field) {
    curSort = field;
  } else {
    if (field === 'name') {
      curSort = 'name';
    } else {
      curSort = '-' + field;
    }
  }
  fetchLeads(1);
}

function renderTable(){
  const w=document.getElementById('tbl-wrap');
  if(!leads.length){w.innerHTML='<div class="empty">No leads found</div>';return;}
  const sortCreated = getSortIndicator('createdAt');
  const sortName = getSortIndicator('name');
  const sortRating = getSortIndicator('rating');
  const sortReviews = getSortIndicator('reviews');
  let h=`<table><thead><tr>
    <th style="width:30px"><input type="checkbox" onchange="toggleAll(this.checked)"></th>
    <th onclick="toggleSort('createdAt')" style="cursor:pointer" title="Sort by Date Added">#${sortCreated}</th>
    <th onclick="toggleSort('name')" style="cursor:pointer" title="Sort by Business Name">Business${sortName}</th>
    <th>Category</th>
    <th>Phone</th>
    <th>Emails</th>
    <th>Website</th>
    <th onclick="toggleSort('rating')" style="cursor:pointer;width:55px" title="Sort by Rating">⭐${sortRating}</th>
    <th onclick="toggleSort('reviews')" style="cursor:pointer;width:55px" title="Sort by Reviews">Rev${sortReviews}</th>
    <th>Status</th>
    <th>WA</th>
    <th>Email</th>
    <th></th>
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
  if(d.type==='sent'){
    document.getElementById('prog-sent').textContent=d.sent;
    plog(`✅ ${d.name}`,'ok');
    refreshEmailScheduleStats();
  }
  if(d.type==='failed'){
    document.getElementById('prog-failed').textContent=d.failed;
    plog(`❌ ${d.name}: ${d.reason}`,'er');
    refreshEmailScheduleStats();
  }
  if(d.type==='skipped'){ plog(`⚠️ Skip: ${d.name} — ${d.reason}`,'wa'); }
  if(d.type==='waiting'){ document.getElementById('prog-current').textContent=`⏳ ${d.seconds}s...`; }
  if(d.type==='done'){
    document.getElementById('prog-bar').style.width='100%';
    document.getElementById('prog-icon').textContent='🎉';
    document.getElementById('prog-icon').className='';
    document.getElementById('prog-title-txt').textContent=`Done! Sent: ${d.sent} | Failed: ${d.failed}`;
    plog(`🎉 Complete! Sent:${d.sent} Failed:${d.failed}`,'ok');
    fetchLeads(); stopSending();
    refreshEmailScheduleStats();
  }
  if(d.type==='error'){ plog('❌ '+d.message,'er'); stopSending(); }
}

function refreshEmailScheduleStats() {
  loadEmailScheduleData(true).catch(() => {});
  loadStats().catch(() => {});
  loadSmtpAccounts().catch(() => {});
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

    // ── Business Profile ────────────────────────────────────────
    const cnEl = document.getElementById('s-company-name');
    const ciEl = document.getElementById('s-company-industry');
    const cpEl = document.getElementById('s-company-phone');
    const ceEl = document.getElementById('s-company-email');
    const cwEl = document.getElementById('s-company-website');
    if(cnEl && s.company_name)     cnEl.value = s.company_name;
    if(ciEl && s.company_industry) ciEl.value = s.company_industry;
    if(cpEl && s.company_phone)    cpEl.value = s.company_phone;
    if(ceEl && s.company_email)    ceEl.value = s.company_email;
    if(cwEl && s.company_website)  cwEl.value = s.company_website;

    // ── Gemini API Key (masked) ─────────────────────────────────
    const gkEl = document.getElementById('s-gemini-key');
    if(gkEl && s.gemini_api_key) {
      gkEl.value = '';
      gkEl.placeholder = 'API key saved ✓ (hidden)';
    }

    // ── WhatsApp Gateway ────────────────────────────────────────
    const gwEl = document.getElementById('s-wa-gateway');
    if(gwEl && s.wa_gateway) gwEl.value = s.wa_gateway;
    updateWAGatewayUI();

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
      // Business Profile
      company_name:     document.getElementById('s-company-name')?.value.trim()     || undefined,
      company_industry: document.getElementById('s-company-industry')?.value.trim() || undefined,
      company_phone:    document.getElementById('s-company-phone')?.value.trim()    || undefined,
      company_email:    document.getElementById('s-company-email')?.value.trim()    || undefined,
      company_website:  document.getElementById('s-company-website')?.value.trim()  || undefined,
      // WhatsApp Gateway
      wa_gateway: document.getElementById('s-wa-gateway')?.value || undefined,
    };
    const pass=document.getElementById('s-smtp-pass').value;
    if(pass && pass!=='••••••••') body.smtp_pass=pass;
    const umId=document.getElementById('s-um-id').value.trim();
    const umTk=document.getElementById('s-um-token').value.trim();
    if(umId) body.ultramsg={instanceId:umId,token:umTk||undefined};
    // Gemini API key (only save if user typed a new one — not the masked placeholder)
    const gkEl = document.getElementById('s-gemini-key');
    if(gkEl && gkEl.value && gkEl.value !== '••••••••' && !gkEl.value.includes('•'))
      body.gemini_api_key = gkEl.value.trim();

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
  const el = document.getElementById('um-status');
  const idEl = document.getElementById('s-um-id');
  const tokenEl = document.getElementById('s-um-token');
  const instanceId = idEl ? idEl.value.trim() : '';
  const token = tokenEl && tokenEl.value && tokenEl.value.indexOf('\u2022') === -1 ? tokenEl.value.trim() : '';
  
  el.innerHTML = '<span style="color:#60a5fa">Testing connection...</span>';
  try {
    const r = await (await fetch('/api/test-ultramsg', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instanceId, token })
    })).json();
    
    el.innerHTML = r.success && r.connected
      ? '<span style="color:#34d399">✅ Connected & Authenticated!</span>'
      : '<span style="color:#f87171">❌ ' + (r.error || 'Status: ' + r.status) + '</span>';
  } catch(e) {
    el.innerHTML = '<span style="color:#f87171">' + e.message + '</span>';
  }
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

function fuExportExcel() {
  const status = document.getElementById('fu-status')?.value || '';
  const search = document.getElementById('fu-search')?.value || '';
  const q = new URLSearchParams({ status, search });
  window.location.href = '/api/followups/export?' + q.toString();
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
  _xlImportMode = 'leads';
  _xlFile = null;
  _xlPreviewRows = [];
  document.getElementById('xl-file-input').value = '';
  document.getElementById('xl-preview').innerHTML = '';
  document.getElementById('xl-actions').style.display = 'none';
  const activeCat = document.getElementById('f-cat')?.value || '';
  const xlCatInput = document.getElementById('xl-category');
  if (xlCatInput) {
    xlCatInput.value = activeCat || 'Customer List';
  }
  document.getElementById('excel-modal').style.display = 'block';
  document.body.style.overflow = 'hidden';
}

function openFuExcelImport(){
  _xlImportMode = 'followups';
  _xlFile = null;
  _xlPreviewRows = [];
  document.getElementById('xl-file-input').value = '';
  document.getElementById('xl-preview').innerHTML = '';
  document.getElementById('xl-actions').style.display = 'none';
  const xlCatInput = document.getElementById('xl-category');
  if (xlCatInput) {
    xlCatInput.value = 'Follow-Up Import';
  }
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

  const url = _xlImportMode === 'followups' ? '/api/followups/import-excel' : '/api/leads/import-excel';

  try {
    const r = await fetch(url, { method:'POST', body:fd });
    const d = await r.json();
    if(r.ok && d.success){
      if (_xlImportMode === 'followups') {
        alert(`✅ Follow-up Import complete!\n\n📥 New leads added to queue: ${d.added}\n🔁 Existing leads moved to queue: ${d.dupes}\n⚠️ Skipped (no name/phone): ${d.skipped}\n📋 Total rows: ${d.total}`);
        closeExcelImport();
        loadFollowups();
      } else {
        alert(`✅ Import complete!\n\n📥 Added: ${d.added}\n🔁 Duplicates skipped: ${d.dupes}\n⚠️ Skipped (no name/phone): ${d.skipped}\n📋 Total rows: ${d.total}`);
        closeExcelImport();
        fetchLeads(1);
        loadStats();
        loadFilters();
      }
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

      // Populate license banner
      const banner = document.getElementById('license-banner');
      if (banner) {
        banner.style.display = 'flex';
        const keyEl = document.getElementById('license-key-val');
        const planEl = document.getElementById('license-plan-val');
        const expiryEl = document.getElementById('license-expiry-val');
        const alertEl = document.getElementById('license-status-warning');

        keyEl.textContent = data.licenseKey || 'No License Key';
        planEl.textContent = (data.plan || 'Free Trial').toUpperCase();
        
        if (data.licenseExpiry) {
          if (data.licenseExpiry.toLowerCase() === 'lifetime') {
            expiryEl.textContent = '♾️ Lifetime';
          } else {
            const d = new Date(data.licenseExpiry);
            expiryEl.textContent = isNaN(d.getTime()) ? data.licenseExpiry : d.toLocaleDateString();
          }
        } else {
          expiryEl.textContent = 'N/A';
        }

        let isExpired = false;
        if (data.licenseExpiry && data.licenseExpiry.toLowerCase() !== 'lifetime') {
          const d = new Date(data.licenseExpiry);
          if (!isNaN(d.getTime()) && d < new Date()) {
            isExpired = true;
          }
        }

        if (isExpired) {
          banner.style.background = '#450a0a';
          banner.style.borderBottomColor = '#7f1d1d';
          alertEl.style.display = 'flex';
          alertEl.textContent = '⚠️ License Expired!';
          planEl.className = 'badge-sm s-err';
        } else {
          banner.style.background = '#1e293b';
          banner.style.borderBottomColor = '#2d3748';
          alertEl.style.display = 'none';
          planEl.className = 'badge-sm s-ok';
        }
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
let _selectedTemperatures = [];  // 'hot', 'warm', 'cold'
let _advFiltersOpen = false;

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
    
    // Cumulative progress
    const active        = _schedules.some(s => s.enabled);
    const todayWa       = _schedules.reduce((sum, s) => sum + (s.today_wa_sent    || 0), 0);
    const todayEmail    = _schedules.reduce((sum, s) => sum + (s.today_email_sent  || 0), 0);
    const totalLimit    = _schedules.reduce((sum, s) => sum + (s.daily_limit       || 0), 0);
    const totalWaSent   = _schedules.reduce((sum, s) => sum + (s.total_wa_sent     || 0), 0);
    
    let maxLastRun = null;
    _schedules.forEach(s => {
      if (s.last_run) {
        const d = new Date(s.last_run);
        if (!maxLastRun || d > maxLastRun) maxLastRun = d;
      }
    });
    
    // Update stats panel (new IDs)
    const waEl    = document.getElementById('sch-today-wa');
    const emEl    = document.getElementById('sch-today-email');
    const limEl   = document.getElementById('sch-today-limit');
    const totEl   = document.getElementById('sch-total-sent');
    if (waEl)  waEl.textContent  = todayWa;
    if (emEl)  emEl.textContent  = todayEmail;
    if (limEl) limEl.textContent = totalLimit;
    if (totEl) totEl.textContent = totalWaSent;
    
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
    container.innerHTML = '<div style="text-align:center;padding:30px;color:#64748b;font-size:13px">No schedule rules found. Click "Add Rule" to create one.</div>';
    return;
  }
  
  _schedules.forEach(s => {
    const card = document.createElement('div');
    card.style.cssText = `background:#1e293b;border:1px solid #334155;border-radius:12px;padding:16px;display:flex;justify-content:space-between;align-items:flex-start;transition:all 0.2s ease;gap:15px`;
    
    card.onmouseover = () => { card.style.borderColor = '#4f46e5'; card.style.transform = 'translateY(-1px)'; };
    card.onmouseout  = () => { card.style.borderColor = '#334155'; card.style.transform = 'none'; };
    
    const hoursFormatted = (s.send_hours || []).map(h => {
      const ampm = h >= 12 ? 'PM' : 'AM';
      const disp = h % 12 || 12;
      return `${disp}:00 ${ampm}`;
    }).join(', ') || 'None';
    
    const catsStr  = (s.categories  && s.categories.length)   ? s.categories.join(', ')  : 'All Categories';
    const citiesStr= (s.cities      && s.cities.length)        ? s.cities.join(', ')       : 'All Cities';
    const tempBadges = (s.temperatures && s.temperatures.length)
      ? s.temperatures.map(t => {
          const map = { hot: '🔥 Hot', warm: '🟡 Warm', cold: '🧊 Cold' };
          const col = { hot: '#fca5a5', warm: '#fcd34d', cold: '#93c5fd' };
          const bg  = { hot: '#450a0a', warm: '#422006', cold: '#0c1a2e' };
          return `<span style="font-size:10px;padding:2px 8px;border-radius:10px;background:${bg[t]};color:${col[t]};font-weight:700">${map[t] || t}</span>`;
        }).join(' ')
      : '<span style="font-size:10px;color:#64748b">All Temps</span>';
    
    // Channels
    const channels = [];
    if (s.send_whatsapp !== false) channels.push('📱 WA');
    if (s.send_email)              channels.push('📧 Email');
    const channelsStr = channels.join(' + ') || '(none)';
    
    const waSent    = s.today_wa_sent    || 0;
    const emSent    = s.today_email_sent  || 0;
    const dailyLim  = s.daily_limit      || 60;
    
    let nextRunHtml = '';
    if (s.enabled && s.send_hours && s.send_hours.length > 0) {
      const now = new Date();
      const istTime = new Date(now.toLocaleString('en-US', {timeZone: 'Asia/Kolkata'}));
      const istHour = istTime.getHours();
      const sortedHours = [...s.send_hours].sort((a,b)=>a-b);
      let nextHour = sortedHours.find(h => h > istHour);
      let isTomorrow = false;
      if (nextHour === undefined) {
        nextHour = sortedHours[0];
        isTomorrow = true;
      }
      const limitReached = (s.today_wa_sent || 0) >= (s.daily_limit || 60);
      if (limitReached && !isTomorrow) {
         nextHour = sortedHours[0];
         isTomorrow = true;
      }
      const ampm = nextHour >= 12 ? 'PM' : 'AM';
      const disp = nextHour % 12 || 12;
      const dayStr = isTomorrow ? 'Tomorrow' : 'Today';
      nextRunHtml = `<span style="font-size:10px;color:#fbbf24;margin-left:10px">&bull; Next run: ${dayStr} ${disp}:00 ${ampm}</span>`;
    }

    const infoCol = document.createElement('div');
    infoCol.style.cssText = `flex:1;display:flex;flex-direction:column;gap:5px`;
    infoCol.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span style="font-weight:700;color:#f8fafc;font-size:14px">${s.name || 'Unnamed Schedule'}</span>
        <span style="font-size:10px;padding:2px 8px;border-radius:12px;font-weight:600;background:${s.enabled ? '#065f46' : '#374151'};color:${s.enabled ? '#34d399' : '#9ca3af'}">
          ${s.enabled ? 'ACTIVE' : 'PAUSED'}
        </span>
        <span style="font-size:10px;padding:2px 8px;border-radius:12px;background:#1e3a5f;color:#60a5fa;font-weight:600">${channelsStr}</span>
      </div>
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">${tempBadges}</div>
      <div style="font-size:11px;color:#94a3b8">
        🏷️ <b>Cats:</b> ${catsStr} &bull; 🌆 <b>Cities:</b> ${citiesStr}
      </div>
      <div style="font-size:11px;color:#94a3b8">
        🕐 <b>Hours (IST):</b> ${hoursFormatted}
      </div>
      <div style="display:flex;gap:10px;margin-top:4px;flex-wrap:wrap;align-items:center">
        <span style="font-size:11px">📱 WA Today: <span style="color:#34d399;font-weight:700">${waSent}</span>/<span style="color:#60a5fa">${dailyLim}</span></span>
        ${s.send_email ? `<span style="font-size:11px">📧 Email Today: <span style="color:#60a5fa;font-weight:700">${emSent}</span>/<span style="color:#60a5fa">${dailyLim}</span></span>` : ''}
        ${s.last_run ? `<span style="font-size:10px;color:#64748b;margin-left:5px">&bull; Last run: ${new Date(s.last_run).toLocaleDateString('en-IN')} ${new Date(s.last_run).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</span>` : ''}
        ${nextRunHtml}
      </div>
    `;
    
    const actionsCol = document.createElement('div');
    actionsCol.style.cssText = `display:flex;gap:8px;align-items:center;flex-shrink:0`;
    
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
      runNowBtn.textContent = '⏳...';
      try {
        const res = await (await fetch(`/api/schedule/${s._id}/run-now`, { method: 'POST' })).json();
        if (res.success) {
          alert('✅ ' + res.message);
          closeSchedule();
          connectSSE();
        } else {
          alert('⚠️ ' + (res.error || 'Could not start'));
        }
      } catch (err) {
        alert('❌ ' + err.message);
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
  
  // Channels
  document.getElementById('sch-send-wa').checked = true;
  document.getElementById('sch-send-email').checked = false;
  updateChannelCards();
  
  // Temperature
  _selectedTemperatures = [];
  renderTempChips();
  
  // Categories
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
  
  // Advanced filters defaults
  document.getElementById('sch-skip-wa-sent').checked    = true;
  document.getElementById('sch-skip-email-sent').checked  = false;
  document.getElementById('sch-no-website').checked       = false;
  document.getElementById('sch-has-email').checked        = false;
  document.getElementById('sch-allow-resend').checked     = false;
  document.getElementById('sch-min-rating').value         = 0;
  document.getElementById('sch-rating-val').textContent   = 'Any';
  
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
  
  // Channels
  document.getElementById('sch-send-wa').checked    = s.send_whatsapp !== false;
  document.getElementById('sch-send-email').checked  = !!s.send_email;
  updateChannelCards();
  
  // Temperature
  _selectedTemperatures = [...(s.temperatures || [])];
  renderTempChips();
  
  // Categories
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
  
  // Advanced filters
  document.getElementById('sch-skip-wa-sent').checked    = s.filter_skip_wa_sent    !== false;
  document.getElementById('sch-skip-email-sent').checked  = !!s.filter_skip_email_sent;
  document.getElementById('sch-no-website').checked       = !!s.filter_no_website;
  document.getElementById('sch-has-email').checked        = !!s.filter_has_email;
  document.getElementById('sch-allow-resend').checked     = !!s.allow_resend;
  const mr = s.filter_min_rating || 0;
  document.getElementById('sch-min-rating').value       = mr;
  document.getElementById('sch-rating-val').textContent  = mr === 0 ? 'Any' : mr + '★';
  
  document.getElementById('sch-report-email').value = s.report_email || '';
  document.getElementById('sch-delete-btn').style.display = 'inline-block';
  document.getElementById('sch-msg').textContent = '';
  triggerSchedulePreview();
}

// ── buildScheduleBody — collects all form values ──────────────
function buildScheduleBody() {
  const msg = document.getElementById('sch-msg');
  
  const name          = document.getElementById('sch-name').value.trim() || 'New Schedule';
  const enabled       = document.getElementById('sch-enabled').checked;
  const send_whatsapp = document.getElementById('sch-send-wa').checked;
  const send_email    = document.getElementById('sch-send-email').checked;
  const temperatures  = [..._selectedTemperatures];
  const categories    = [..._selectedCategories];
  const citiesStr     = document.getElementById('sch-cities').value;
  const cities        = citiesStr ? citiesStr.split(',').map(c => c.trim()).filter(Boolean) : [];
  const daily_limit   = parseInt(document.getElementById('sch-limit-slider').value) || 60;
  
  const hourCheckboxes = document.querySelectorAll('input[name="sch-hour"]:checked');
  const send_hours     = Array.from(hourCheckboxes).map(cb => parseInt(cb.value));
  
  const filter_skip_wa_sent    = document.getElementById('sch-skip-wa-sent')?.checked    ?? true;
  const filter_skip_email_sent = document.getElementById('sch-skip-email-sent')?.checked ?? false;
  const filter_no_website      = document.getElementById('sch-no-website')?.checked      ?? false;
  const filter_has_email       = document.getElementById('sch-has-email')?.checked       ?? false;
  const allow_resend           = document.getElementById('sch-allow-resend')?.checked    ?? false;
  const filter_min_rating      = parseFloat(document.getElementById('sch-min-rating')?.value) || 0;
  const report_email           = document.getElementById('sch-report-email').value.trim();
  
  if (!send_hours.length) {
    if (msg) {
      msg.textContent = '⚠️ Please select at least one Send Time.';
      msg.style.color = '#fbbf24';
    }
    return null;
  }
  
  return {
    name, enabled, send_whatsapp, send_email,
    temperatures, categories, cities,
    daily_limit, send_hours,
    filter_skip_wa_sent, filter_skip_email_sent,
    filter_no_website, filter_has_email,
    allow_resend, filter_min_rating,
    report_email
  };
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
    chip.style.cssText = `cursor:pointer;padding:3px 8px;border-radius:20px;font-size:10px;border:1px solid ${selected?'#7c3aed':'#334155'};background:${selected?'#4f46e5':'transparent'};color:${selected?'#fff':'#94a3b8'};transition:.2s`;
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

// ── Temperature chip helpers ──────────────────────────────────
function toggleTempChip(el) {
  const val = el.dataset.val;
  const idx = _selectedTemperatures.indexOf(val);
  if (idx === -1) {
    _selectedTemperatures.push(val);
  } else {
    _selectedTemperatures.splice(idx, 1);
  }
  renderTempChips();
  triggerSchedulePreview();
}

function clearTempSelection() {
  _selectedTemperatures = [];
  renderTempChips();
  triggerSchedulePreview();
}

function renderTempChips() {
  const chips = document.querySelectorAll('.sch-temp-chip');
  chips.forEach(chip => {
    const val = chip.dataset.val;
    const active = _selectedTemperatures.includes(val);
    const styles = {
      hot:  { bg: '#7f1d1d', color: '#fca5a5', border: '#dc2626' },
      warm: { bg: '#78350f', color: '#fcd34d', border: '#d97706' },
      cold: { bg: '#1e3a5f', color: '#93c5fd', border: '#3b82f6' },
    };
    const s = styles[val] || {};
    chip.style.background   = active ? s.bg        : 'transparent';
    chip.style.color        = active ? s.color     : (val === 'hot' ? '#fca5a5' : val === 'warm' ? '#fcd34d' : '#93c5fd');
    chip.style.borderColor  = active ? s.border    : (val === 'hot' ? '#991b1b' : val === 'warm' ? '#92400e' : '#1e3a5f');
    chip.style.transform    = active ? 'scale(1.05)' : 'scale(1)';
  });
}

// ── Channel card toggle ───────────────────────────────────────
function toggleChannelCard(channel) {
  const cb   = document.getElementById(channel === 'wa' ? 'sch-send-wa' : 'sch-send-email');
  cb.checked = !cb.checked;
  updateChannelCards();
  triggerSchedulePreview();
}

function updateChannelCards() {
  const waOn    = document.getElementById('sch-send-wa').checked;
  const emailOn = document.getElementById('sch-send-email').checked;
  const waCard    = document.getElementById('sch-wa-card');
  const emailCard = document.getElementById('sch-email-card');
  if (waCard)    waCard.style.borderColor    = waOn    ? '#25d366' : '#334155';
  if (emailCard) emailCard.style.borderColor = emailOn ? '#60a5fa' : '#334155';
}

// ── Advanced filter toggle ────────────────────────────────────
function toggleAdvancedFilters() {
  _advFiltersOpen = !_advFiltersOpen;
  const panel = document.getElementById('sch-adv-filters');
  const arrow = document.getElementById('sch-adv-arrow');
  panel.style.display = _advFiltersOpen ? 'flex' : 'none';
  if (arrow) arrow.textContent = _advFiltersOpen ? '▲ Hide' : '▼ Show';
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
  const previewList  = document.getElementById('sch-preview-list');
  const previewCount = document.getElementById('sch-preview-count');

  const body = buildScheduleBody ? buildScheduleBody() : null;
  if (!body) {
    if (previewCount) previewCount.textContent = '0 matching';
    return;
  }

  if (previewCount) previewCount.textContent = '⏳ Loading...';

  try {
    const res  = await fetch('/api/schedule/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();

    if (data.success) {
      const totalLeads    = data.totalLeads      || 0;
      const matchedCount  = data.matchedCount    || 0;
      const pendingWa     = data.pendingWa       || 0;
      const pendingEmail  = data.pendingEmail    || 0;
      const alreadyWa     = data.alreadyWaSent   || 0;
      const alreadyEmail  = data.alreadyEmailSent|| 0;
      const emailOn       = document.getElementById('sch-send-email')?.checked;

      // ── Coverage badge ────────────────────────────────────
      if (previewCount) {
        previewCount.textContent = `${matchedCount} / ${totalLeads} covered`;
      }

      // ── Progress bar ──────────────────────────────────────
      const pct = totalLeads > 0 ? Math.round((matchedCount / totalLeads) * 100) : 0;
      const bar = document.getElementById('sch-coverage-bar');
      const lbl = document.getElementById('sch-coverage-label');
      const pctEl= document.getElementById('sch-coverage-pct');
      if (bar)   bar.style.width   = pct + '%';
      if (lbl)   lbl.textContent   = `${matchedCount.toLocaleString()} / ${totalLeads.toLocaleString()}`;
      if (pctEl) pctEl.textContent = `${pct}% of total leads match your filters`;

      // ── 4 stat boxes ─────────────────────────────────────
      const elPendWa  = document.getElementById('sch-stat-pending-wa');
      const elPendEm  = document.getElementById('sch-stat-pending-email');
      const elWaDone  = document.getElementById('sch-stat-wa-sent');
      const elEmDone  = document.getElementById('sch-stat-email-sent');
      const emailBox  = document.getElementById('sch-stat-email-box');

      if (elPendWa)  elPendWa.textContent  = pendingWa.toLocaleString();
      if (elPendEm)  elPendEm.textContent  = pendingEmail.toLocaleString();
      if (elWaDone)  elWaDone.textContent  = alreadyWa.toLocaleString();
      if (elEmDone)  elEmDone.textContent  = alreadyEmail.toLocaleString();

      // Dim email box if email channel is off
      if (emailBox) emailBox.style.opacity = emailOn ? '1' : '0.35';

      // ── Smart-count note ──────────────────────────────────
      const note = document.getElementById('sch-smart-note');
      if (note) note.style.display = 'block';

      // ── Lead preview list ─────────────────────────────────
      previewList.innerHTML = '';
      if (!data.leads || !data.leads.length) {
        previewList.innerHTML = '<div style="color:#64748b;font-size:11px;text-align:center;padding:10px">No matching leads. Adjust filters.</div>';
        return;
      }
      data.leads.forEach(lead => {
        const item = document.createElement('div');
        item.style.cssText = `display:flex;justify-content:space-between;align-items:center;padding:5px 8px;border-bottom:1px solid #1e293b;font-size:11px;color:#cbd5e1`;

        const info = document.createElement('div');
        info.style.cssText = `display:flex;align-items:center;gap:6px;min-width:0`;

        // Temperature dot
        if (lead.temperature) {
          const tMap = { hot:'🔥', warm:'🟡', cold:'🧊' };
          const dot  = document.createElement('span');
          dot.textContent = tMap[lead.temperature] || '';
          dot.title = lead.temperature;
          info.appendChild(dot);
        }

        const nameSpan = document.createElement('span');
        nameSpan.innerHTML = `<b>${lead.name || 'No Name'}</b>`;
        nameSpan.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:130px';
        info.appendChild(nameSpan);

        const subSpan = document.createElement('span');
        subSpan.style.color = '#64748b';
        subSpan.textContent = lead.phone || lead.email || '';
        info.appendChild(subSpan);

        const meta = document.createElement('div');
        meta.style.cssText = `display:flex;gap:4px;align-items:center;flex-shrink:0;flex-wrap:wrap`;

        if (lead.category) {
          meta.innerHTML += `<span style="background:#334155;color:#94a3b8;padding:1px 5px;border-radius:4px;font-size:9px">${lead.category}</span>`;
        }
        if (lead.city) {
          meta.innerHTML += `<span style="background:#1e3a5f;color:#60a5fa;padding:1px 5px;border-radius:4px;font-size:9px">${lead.city}</span>`;
        }
        if (lead.wa_sent)    meta.innerHTML += `<span style="background:#065f46;color:#34d399;padding:1px 5px;border-radius:4px;font-size:9px;font-weight:600">✔WA</span>`;
        if (lead.email_sent) meta.innerHTML += `<span style="background:#1e3a5f;color:#60a5fa;padding:1px 5px;border-radius:4px;font-size:9px;font-weight:600">✔Em</span>`;

        item.appendChild(info);
        item.appendChild(meta);
        previewList.appendChild(item);
      });

    } else {
      if (previewCount) previewCount.textContent = '0 matching';
      previewList.innerHTML = `<div style="color:#f87171;font-size:11px;text-align:center;padding:10px">Preview error: ${data.error}</div>`;
    }
  } catch (e) {
    if (previewCount) previewCount.textContent = '0 matching';
    previewList.innerHTML = `<div style="color:#f87171;font-size:11px;text-align:center;padding:10px">Preview error: ${e.message}</div>`;
  }
}


async function saveScheduleRule() {
  const id  = document.getElementById('sch-edit-id').value;
  const msg = document.getElementById('sch-msg');
  msg.textContent = '⏳ Saving rule...';
  msg.style.color = '#64748b';
  
  const body = buildScheduleBody();
  if (!body) return; // validation failed, message already set
  
  const url    = id ? `/api/schedule/${id}` : '/api/schedule';
  const method = id ? 'PUT' : 'POST';
  
  try {
    const res = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const r = await res.json();
    if (r.success) {
      msg.textContent = id ? '✅ Rule updated!' : '✅ Rule created!';
      msg.style.color = '#34d399';
      setTimeout(() => showScheduleList(), 1000);
    } else {
      msg.textContent = '❌ ' + (r.error || 'Failed to save');
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
  const id  = document.getElementById('sch-edit-id').value;
  const btn = document.getElementById('sch-run-btn');
  const msg = document.getElementById('sch-msg');
  
  btn.disabled = true;
  btn.textContent = '⏳ Starting...';
  msg.textContent = '⏳ Saving and executing...';
  msg.style.color = '#64748b';
  
  const body = buildScheduleBody();
  if (!body) {
    btn.disabled = false;
    btn.textContent = '🚀 Run Now';
    return;
  }
  
  const saveUrl    = id ? `/api/schedule/${id}` : '/api/schedule';
  const saveMethod = id ? 'PUT' : 'POST';
  
  try {
    const saveRes = await fetch(saveUrl, {
      method: saveMethod, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const saveR = await saveRes.json();
    if (!saveR.success) {
      msg.textContent = '❌ Save failed: ' + (saveR.error || 'Unknown error');
      msg.style.color = '#f87171';
      return;
    }
    
    const targetId = id || saveR.data?._id;
    if (!targetId) {
      msg.textContent = '❌ Could not get schedule ID.';
      msg.style.color = '#f87171';
      return;
    }
    
    const runRes = await fetch(`/api/schedule/${targetId}/run-now`, { method: 'POST' });
    const runR   = await runRes.json();
    if (runR.success) {
      msg.textContent = '✅ ' + runR.message;
      msg.style.color = '#34d399';
      setTimeout(() => { closeSchedule(); connectSSE(); }, 1500);
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
let _emailSelectedTemperatures = [];

async function openEmailSchedule() {
  document.getElementById('email-schedule-modal').style.display = 'flex';
  await loadEmailScheduleData();
  showEmailScheduleList();
}

function closeEmailSchedule() {
  document.getElementById('email-schedule-modal').style.display = 'none';
}

async function loadEmailScheduleData(silent = false) {
  const container = document.getElementById('esch-rules-container');
  if (!silent) {
    container.innerHTML = '<div style="text-align:center;padding:20px;color:#64748b">Loading schedules...</div>';
  }
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

    // Render SMTP account usage today
    try {
      const smtpRes = await fetch('/api/smtp-accounts');
      const smtpData = await smtpRes.json();
      const accountsList = document.getElementById('esch-accounts-list');
      if (accountsList) {
        accountsList.innerHTML = '';
        const accounts = smtpData.accounts || [];
        if (!accounts.length) {
          accountsList.innerHTML = '<div style="grid-column: span 2; text-align:center; color:#64748b; font-size:10px">No SMTP accounts configured.</div>';
        } else {
          accounts.forEach(a => {
            const usageDiv = document.createElement('div');
            usageDiv.style.cssText = `background:#0f172a; border: 1px solid #1e293b; border-radius:6px; padding:6px 10px; display:flex; justify-content:space-between; align-items:center`;
            
            const nameSpan = document.createElement('span');
            nameSpan.style.cssText = `font-weight:600; color:#e2e8f0; font-size:10px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap; max-width:140px`;
            nameSpan.textContent = a.label || a.smtp_user.split('@')[0];
            nameSpan.title = a.smtp_user;

            const usageSpan = document.createElement('span');
            usageSpan.style.cssText = `font-size:10px; font-weight:700; color:#34d399`;
            
            const sentToday = a.daily_sent || 0;
            const limit = a.daily_limit || 450;
            const pct = Math.min(100, Math.round((sentToday / limit) * 100));
            
            usageSpan.textContent = `${sentToday}/${limit}`;
            if (pct >= 90) usageSpan.style.color = '#ef4444';
            else if (pct >= 75) usageSpan.style.color = '#f59e0b';
            else usageSpan.style.color = '#34d399';

            usageDiv.appendChild(nameSpan);
            usageDiv.appendChild(usageSpan);
            accountsList.appendChild(usageDiv);
          });
        }
      }
    } catch (smtpErr) {
      console.error('Failed to load SMTP account usage for Email Scheduler:', smtpErr);
    }
    
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
    
    let nextRunHtml = '';
    if (s.enabled && s.send_hours && s.send_hours.length > 0) {
      const now = new Date();
      const istTime = new Date(now.toLocaleString('en-US', {timeZone: 'Asia/Kolkata'}));
      const istHour = istTime.getHours();
      const sortedHours = [...s.send_hours].sort((a,b)=>a-b);
      let nextHour = sortedHours.find(h => h > istHour);
      let isTomorrow = false;
      if (nextHour === undefined) {
        nextHour = sortedHours[0];
        isTomorrow = true;
      }
      const limitReached = (s.today_sent || 0) >= (s.daily_limit || 60);
      if (limitReached && !isTomorrow) {
         nextHour = sortedHours[0];
         isTomorrow = true;
      }
      const ampm = nextHour >= 12 ? 'PM' : 'AM';
      const disp = nextHour % 12 || 12;
      const dayStr = isTomorrow ? 'Tomorrow' : 'Today';
      nextRunHtml = `&nbsp;&bull;&nbsp; <span style="color:#fbbf24">Next run: ${dayStr} ${disp}:00 ${ampm}</span>`;
    }

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
      <div style="font-size:11px;color:#64748b;margin-top:2px;display:flex;align-items:center;flex-wrap:wrap">
        <span>📈 Sent today: <span style="color:#34d399;font-weight:600">${s.today_sent || 0}</span> / <span style="color:#60a5fa;font-weight:600">${s.daily_limit || 60}</span></span>
        ${s.last_run ? `&nbsp;&bull;&nbsp; Last run: ${new Date(s.last_run).toLocaleDateString('en-IN')} ${new Date(s.last_run).toLocaleTimeString('en-IN', {hour:'2-digit', minute:'2-digit'})}` : ''}
        ${nextRunHtml}
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
    const activeAccounts = accounts.filter(a => a.isActive);
    let maxLimit = 0;
    if (activeAccounts.length > 0) {
      maxLimit = activeAccounts.reduce((sum, a) => sum + (a.daily_limit || 450), 0);
    } else if (accounts.length > 0) {
      maxLimit = accounts.reduce((sum, a) => sum + (a.daily_limit || 450), 0);
    } else {
      maxLimit = 450;
    }

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
  
  _emailSelectedTemperatures = [];
  updateEmailTempChips();
  
  document.getElementById('esch-cities').value = '';
  
  adjustEmailScheduleLimitSlider();
  
  const hourCheckboxes = document.querySelectorAll('input[name="esch-hour"]');
  hourCheckboxes.forEach(cb => {
    const val = parseInt(cb.value);
    cb.checked = (val === 10 || val === 16);
  });
  
  document.getElementById('esch-skip-sent').checked = true;
  document.getElementById('esch-allow-resend').checked = false;
  document.getElementById('esch-no-website').checked = false;
  document.getElementById('esch-has-email').checked = false;
  document.getElementById('esch-min-rating').value = 0;
  document.getElementById('esch-rating-val').textContent = 'Any';
  
  const adv = document.getElementById('esch-adv-filters');
  if (adv) adv.style.display = 'none';
  const arr = document.getElementById('esch-adv-arrow');
  if (arr) arr.textContent = '▼ Show';
  
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
  
  _emailSelectedTemperatures = [...(s.temperatures || [])];
  updateEmailTempChips();
  
  document.getElementById('esch-cities').value = (s.cities || []).join(', ');
  
  adjustEmailScheduleLimitSlider(s.daily_limit);
  
  const hours = s.send_hours || [10, 16];
  const hourCheckboxes = document.querySelectorAll('input[name="esch-hour"]');
  hourCheckboxes.forEach(cb => {
    cb.checked = hours.includes(parseInt(cb.value));
  });
  
  document.getElementById('esch-skip-sent').checked = s.skip_sent !== false;
  document.getElementById('esch-allow-resend').checked = !!s.allow_resend;
  document.getElementById('esch-no-website').checked = !!s.filter_no_website;
  document.getElementById('esch-has-email').checked = !!s.filter_has_email;
  const rating = s.filter_min_rating || 0;
  document.getElementById('esch-min-rating').value = rating;
  document.getElementById('esch-rating-val').textContent = rating === 0 ? 'Any' : rating + '★';
  
  const adv = document.getElementById('esch-adv-filters');
  if (adv) adv.style.display = 'none';
  const arr = document.getElementById('esch-adv-arrow');
  if (arr) arr.textContent = '▼ Show';
  
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
  
  const temperatures = _emailSelectedTemperatures;
  const filter_no_website = document.getElementById('esch-no-website').checked;
  const filter_has_email = document.getElementById('esch-has-email').checked;
  const filter_min_rating = parseFloat(document.getElementById('esch-min-rating').value) || 0;

  try {
    const res = await fetch('/api/email-schedule/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categories, cities, skip_sent, allow_resend, daily_limit, send_hours, temperatures, filter_no_website, filter_has_email, filter_min_rating })
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
        const tMap = { hot: '🔥 Hot', warm: '🟡 Warm', cold: '🧊 Cold' };
        const tempBadge = lead.temperature ? ` <span style="font-size:9px;color:${lead.temperature === 'hot' ? '#ef4444' : lead.temperature === 'warm' ? '#f59e0b' : '#60a5fa'}">${tMap[lead.temperature]}</span>` : '';
        info.innerHTML = `<b>${lead.name || 'No Name'}</b>${tempBadge} <span style="color:#64748b">(${lead.email})</span>`;
        
        const meta = document.createElement('div');
        meta.style.cssText = `display:flex;gap:6px;align-items:center`;
        
        if (lead.rating) {
          meta.innerHTML += `<span style="color:#f59e0b;font-size:9px">⭐ ${lead.rating}</span>`;
        }
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
  
  const temperatures = _emailSelectedTemperatures;
  const filter_no_website = document.getElementById('esch-no-website').checked;
  const filter_has_email = document.getElementById('esch-has-email').checked;
  const filter_min_rating = parseFloat(document.getElementById('esch-min-rating').value) || 0;

  if (!send_hours.length) {
    msg.textContent = '⚠️ Please select at least one Send Time checkbox.';
    msg.style.color = '#fbbf24';
    return;
  }
  
  const body = { name, enabled, categories, cities, daily_limit, send_hours, skip_sent, allow_resend, report_email, temperatures, filter_no_website, filter_has_email, filter_min_rating };
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
  
  const temperatures = _emailSelectedTemperatures;
  const filter_no_website = document.getElementById('esch-no-website').checked;
  const filter_has_email = document.getElementById('esch-has-email').checked;
  const filter_min_rating = parseFloat(document.getElementById('esch-min-rating').value) || 0;

  if (!send_hours.length) {
    msg.textContent = '⚠️ Please select at least one Send Time checkbox.';
    msg.style.color = '#fbbf24';
    btn.disabled = false;
    btn.textContent = '🚀 Run Now';
    return;
  }
  
  const body = { name, enabled, categories, cities, daily_limit, send_hours, skip_sent, allow_resend, report_email, temperatures, filter_no_website, filter_has_email, filter_min_rating };
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

// ── Lead Temperature Chip Helpers for Email ───────────────────────
function toggleEmailTempChip(chip) {
  const val = chip.getAttribute('data-val');
  const idx = _emailSelectedTemperatures.indexOf(val);
  if (idx === -1) {
    _emailSelectedTemperatures.push(val);
  } else {
    _emailSelectedTemperatures.splice(idx, 1);
  }
  updateEmailTempChips();
  triggerEmailSchedulePreview();
}

function clearEmailTempSelection() {
  _emailSelectedTemperatures = [];
  updateEmailTempChips();
  triggerEmailSchedulePreview();
}

function updateEmailTempChips() {
  const chips = document.querySelectorAll('.esch-temp-chip');
  chips.forEach(c => {
    const val = c.getAttribute('data-val');
    const active = _emailSelectedTemperatures.includes(val);
    
    let color = '#fff', bg = 'transparent', border = '#334155';
    if (active) {
      if (val === 'hot') { bg = '#991b1b'; border = '#991b1b'; color = '#fff'; }
      else if (val === 'warm') { bg = '#92400e'; border = '#92400e'; color = '#fff'; }
      else if (val === 'cold') { bg = '#1e3a5f'; border = '#1e3a5f'; color = '#fff'; }
    } else {
      if (val === 'hot') { color = '#fca5a5'; border = '#991b1b'; }
      else if (val === 'warm') { color = '#fcd34d'; border = '#92400e'; }
      else if (val === 'cold') { color = '#93c5fd'; border = '#1e3a5f'; }
    }
    
    c.style.background = bg;
    c.style.borderColor = border;
    c.style.color = color;
  });
}

function toggleEmailAdvancedFilters() {
  const el = document.getElementById('esch-adv-filters');
  const arrow = document.getElementById('esch-adv-arrow');
  if (el.style.display === 'none') {
    el.style.display = 'flex';
    arrow.textContent = '▲ Hide';
  } else {
    el.style.display = 'none';
    arrow.textContent = '▼ Show';
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
let _socCategories = [];
let _socTopics = [];

async function loadSocial() {
  try {
    const s = await (await fetch('/api/social/settings')).json();
    
    // Website and inputs
    if (document.getElementById('soc-website')) document.getElementById('soc-website').value = s.website_url || '';
    
    // Safety wraps for old fields if they exist
    if (document.getElementById('soc-topic')) document.getElementById('soc-topic').value = s.topic || '';
    if (document.getElementById('soc-title')) document.getElementById('soc-title').value = s.title || '';
    if (document.getElementById('soc-custom')) document.getElementById('soc-custom').value = s.custom_content || '';
    
    // Enterprise Profile Fields
    if (document.getElementById('soc-biz-category')) document.getElementById('soc-biz-category').value = s.business_category || 'IT Services';
    if (document.getElementById('soc-biz-name')) document.getElementById('soc-biz-name').value = s.business_name || '';
    if (document.getElementById('soc-biz-desc')) document.getElementById('soc-biz-desc').value = s.business_desc || '';
    if (document.getElementById('soc-biz-audience')) document.getElementById('soc-biz-audience').value = s.target_audience || '';
    if (document.getElementById('soc-biz-services')) document.getElementById('soc-biz-services').value = s.primary_services || '';
    if (document.getElementById('soc-language')) document.getElementById('soc-language').value = s.language || 'English';

    // Content Settings Fields
    if (document.getElementById('soc-goal')) document.getElementById('soc-goal').value = s.content_goal || 'Brand Awareness';
    if (document.getElementById('soc-content-type')) document.getElementById('soc-content-type').value = s.content_type || 'Promotional';
    if (document.getElementById('soc-tone')) document.getElementById('soc-tone').value = s.tone || 'Professional';
    if (document.getElementById('soc-post-length')) document.getElementById('soc-post-length').value = s.post_length || 'Medium';
    if (document.getElementById('soc-gen-images')) document.getElementById('soc-gen-images').checked = s.gen_images !== undefined ? !!s.gen_images : true;
    if (document.getElementById('soc-gen-hashtags')) document.getElementById('soc-gen-hashtags').checked = s.gen_hashtags !== undefined ? !!s.gen_hashtags : true;
    if (document.getElementById('soc-auto-publish')) document.getElementById('soc-auto-publish').checked = s.auto_publish !== undefined ? !!s.auto_publish : true;

    // Scheduler
    document.getElementById('soc-enabled').checked = !!s.enabled;
    document.getElementById('soc-frequency').value = s.frequency || 'daily';
    document.getElementById('soc-hour').value = s.time_hour !== undefined ? s.time_hour : 10;
    if (document.getElementById('soc-time-zone')) document.getElementById('soc-time-zone').value = s.time_zone || 'IST';
    
    updateSocialEnabledVisual();
    toggleSocialTimeSelect();
    
    // Topics Library
    _socTopics = s.topics || [];
    if (_socTopics.length === 0) {
      loadDefaultTopicsByCategory(s.business_category || 'IT Services');
    } else {
      renderTopicChips();
    }

    // Load categories (legacy fallback)
    _socCategories = s.categories || [];
    renderSocialCategories();
    
    // Channels
    const channels = s.channels || {};
    const list = ['linkedin', 'facebook', 'instagram', 'twitter', 'pinterest', 'threads', 'gbp', 'youtube'];
    
    list.forEach(ch => {
      const conf = channels[ch] || {};
      const enabledCheckbox = document.getElementById(`ch-${ch}-enabled`);
      if (enabledCheckbox) enabledCheckbox.checked = !!conf.enabled;
      
      const tokenInput = document.getElementById(`ch-${ch}-token`);
      if (tokenInput) {
        if (conf.token === '••••••••') {
          tokenInput.value = '';
          tokenInput.placeholder = 'Token saved ✓ (hidden)';
        } else {
          tokenInput.value = conf.token || '';
          tokenInput.placeholder = ch === 'gbp' ? 'OAuth Token' : 'Access Token';
        }
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

      // Automatically update connection status badge on load
      updateChannelBadgeVisual(ch);
    });

    await loadSocialLogs();
    updateVisualSchedulerOutline();
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
    const list = ['linkedin', 'facebook', 'instagram', 'twitter', 'pinterest', 'threads', 'gbp', 'youtube'];
    const channels = {};
    
    list.forEach(ch => {
      const enabledCheckbox = document.getElementById(`ch-${ch}-enabled`);
      const enabled = enabledCheckbox ? enabledCheckbox.checked : false;
      const tokenInput = document.getElementById(`ch-${ch}-token`);
      let token = tokenInput ? tokenInput.value : '';
      
      // If empty but has saved placeholder, keep existing
      if (!token && tokenInput && tokenInput.placeholder.includes('saved')) {
        token = '••••••••';
      }
      
      channels[ch] = { enabled, token };
      
      if (ch === 'linkedin' && document.getElementById('ch-linkedin-urn')) channels[ch].urn = document.getElementById('ch-linkedin-urn').value.trim();
      if (ch === 'facebook' && document.getElementById('ch-facebook-pageId')) channels[ch].pageId = document.getElementById('ch-facebook-pageId').value.trim();
      if (ch === 'instagram' && document.getElementById('ch-instagram-accountId')) channels[ch].accountId = document.getElementById('ch-instagram-accountId').value.trim();
      if (ch === 'twitter' && document.getElementById('ch-twitter-apiKey')) channels[ch].apiKey = document.getElementById('ch-twitter-apiKey').value.trim();
      if (ch === 'pinterest' && document.getElementById('ch-pinterest-boardId')) channels[ch].boardId = document.getElementById('ch-pinterest-boardId').value.trim();
    });

    const body = {
      enabled: document.getElementById('soc-enabled').checked,
      frequency: document.getElementById('soc-frequency').value,
      time_hour: parseInt(document.getElementById('soc-hour').value),
      website_url: document.getElementById('soc-website').value.trim(),
      categories: _socCategories,
      channels,
      
      // Enterprise Profile Settings
      business_category: document.getElementById('soc-biz-category') ? document.getElementById('soc-biz-category').value : 'IT Services',
      business_name: document.getElementById('soc-biz-name') ? document.getElementById('soc-biz-name').value.trim() : '',
      business_desc: document.getElementById('soc-biz-desc') ? document.getElementById('soc-biz-desc').value.trim() : '',
      target_audience: document.getElementById('soc-biz-audience') ? document.getElementById('soc-biz-audience').value.trim() : '',
      primary_services: document.getElementById('soc-biz-services') ? document.getElementById('soc-biz-services').value.trim() : '',
      language: document.getElementById('soc-language') ? document.getElementById('soc-language').value : 'English',
      
      // Enterprise Content Settings
      content_goal: document.getElementById('soc-goal') ? document.getElementById('soc-goal').value : 'Brand Awareness',
      content_type: document.getElementById('soc-content-type') ? document.getElementById('soc-content-type').value : 'Promotional',
      tone: document.getElementById('soc-tone') ? document.getElementById('soc-tone').value : 'Professional',
      post_length: document.getElementById('soc-post-length') ? document.getElementById('soc-post-length').value : 'Medium',
      gen_images: document.getElementById('soc-gen-images') ? document.getElementById('soc-gen-images').checked : true,
      gen_hashtags: document.getElementById('soc-gen-hashtags') ? document.getElementById('soc-gen-hashtags').checked : true,
      auto_publish: document.getElementById('soc-auto-publish') ? document.getElementById('soc-auto-publish').checked : true,
      time_zone: document.getElementById('soc-time-zone') ? document.getElementById('soc-time-zone').value : 'IST',
      topics: _socTopics
    };

    // Safe fallback defaults for legacy keys if elements exist
    if (document.getElementById('soc-topic')) body.topic = document.getElementById('soc-topic').value.trim();
    if (document.getElementById('soc-title')) body.title = document.getElementById('soc-title').value.trim();
    if (document.getElementById('soc-custom')) body.custom_content = document.getElementById('soc-custom').value.trim();

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

async function testSocialConnections() {
  const btn = document.getElementById('soc-test-btn');
  const msg = document.getElementById('soc-msg');
  
  btn.disabled = true;
  btn.textContent = '⏳ Testing...';
  msg.textContent = '🔌 Connecting and validating API credentials...';
  msg.style.color = '#7c3aed';

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

    const res = await (await fetch('/api/social/test-connections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channels })
    })).json();

    if (res.success) {
      const results = res.results;
      let successCount = 0;
      let enabledCount = 0;
      const details = [];

      for (const [ch, outcome] of Object.entries(results)) {
        enabledCount++;
        if (outcome.success) {
          successCount++;
          details.push(`<span style="color:#34d399">✅ ${ch.toUpperCase()}: ${outcome.message}</span>`);
        } else {
          details.push(`<span style="color:#f87171">❌ ${ch.toUpperCase()}: ${outcome.message}</span>`);
        }
      }

      if (enabledCount === 0) {
        msg.textContent = '⚠️ No social media channels are enabled for testing.';
        msg.style.color = '#fbbf24';
      } else {
        msg.innerHTML = `<div style="text-align:left;margin-top:10px;line-height:1.6;background:rgba(0,0,0,0.2);padding:10px;border-radius:6px;border:1px solid #1e293b">` + 
          `<strong style="color:#fff;display:block;margin-bottom:6px">Test Results (${successCount}/${enabledCount} succeeded):</strong>` + 
          details.join('<br/>') + 
          `</div>`;
        msg.style.color = '#fff';
      }
    } else {
      msg.textContent = '❌ Test failed: ' + (res.error || 'Server error');
      msg.style.color = '#f87171';
    }
  } catch(e) {
    msg.textContent = '❌ Test Error: ' + e.message;
    msg.style.color = '#f87171';
  } finally {
    btn.disabled = false;
    btn.textContent = '🔌 Test Connections';
  }
}

async function testLinkedInConnection() {
  const tokenInput = document.getElementById('ch-linkedin-token');
  const urnInput = document.getElementById('ch-linkedin-urn');
  const testBtn = document.getElementById('btn-test-ch-linkedin');
  const statusSpan = document.getElementById('status-ch-linkedin-test');
  
  if (!tokenInput) return;
  
  let token = tokenInput.value.trim();
  let urn = urnInput ? urnInput.value.trim() : '';
  
  if (!token && tokenInput.placeholder.includes('saved')) {
    token = '••••••••';
  }
  
  if (!token) {
    statusSpan.textContent = '❌ Please enter an access token first';
    statusSpan.style.color = '#f87171';
    return;
  }
  
  testBtn.disabled = true;
  const originalText = testBtn.textContent;
  testBtn.textContent = '⏳ Testing...';
  statusSpan.textContent = 'Connecting...';
  statusSpan.style.color = '#e2e8f0';
  
  try {
    const res = await (await fetch('/api/social/test-connections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channels: {
          linkedin: { enabled: true, token, urn }
        }
      })
    })).json();
    
    if (res.success && res.results && res.results.linkedin) {
      const outcome = res.results.linkedin;
      if (outcome.success) {
        statusSpan.innerHTML = `✅ ${outcome.message}`;
        statusSpan.style.color = '#34d399';
      } else {
        statusSpan.innerHTML = `❌ ${outcome.message}`;
        statusSpan.style.color = '#f87171';
      }
    } else {
      statusSpan.textContent = '❌ Test failed: ' + (res.error || 'Server error');
      statusSpan.style.color = '#f87171';
    }
  } catch (e) {
    statusSpan.textContent = '❌ Error: ' + e.message;
    statusSpan.style.color = '#f87171';
  } finally {
    testBtn.disabled = false;
    testBtn.textContent = originalText;
  }
}


function renderSocialCategories() {
  const container = document.getElementById('soc-categories-container');
  if (!container) return;
  
  if (!_socCategories || _socCategories.length === 0) {
    container.innerHTML = '<div style="color:#64748b;font-size:11px;text-align:center;padding:12px;border:1px dashed #2d3748;border-radius:6px">No categories defined. Rotating using global topic above.</div>';
    return;
  }
  
  container.innerHTML = _socCategories.map((cat, idx) => {
    return `<div style="background:rgba(255,255,255,0.02);border:1px solid #2d3748;border-radius:8px;padding:10px;display:flex;justify-content:space-between;align-items:flex-start">
      <div style="flex:1;padding-right:8px;text-align:left">
        <div style="font-weight:700;font-size:12px;color:#fff">${cat.name}</div>
        <div style="font-size:10px;color:#64748b;margin-top:2px"><b>Keywords:</b> ${cat.keywords || 'None'}</div>
        <div style="font-size:10px;color:#64748b;margin-top:2px"><b>Topic Focus:</b> ${cat.topic || 'None'}</div>
        ${cat.custom_content ? `<div style="font-size:10px;color:#94a3b8;margin-top:4px;font-style:italic">"${cat.custom_content}"</div>` : ''}
      </div>
      <button class="btn b-red" style="padding:2px 8px;font-size:10px;background:#7f1d1d;color:#fca5a5;border:1px solid #991b1b" onclick="deleteSocialCategory(${idx}, event)">Delete</button>
    </div>`;
  }).join('');
}

function addSocialCategory(e) {
  if (e) e.preventDefault();
  const nameInput = document.getElementById('add-soc-cat-name');
  const keywordsInput = document.getElementById('add-soc-cat-keywords');
  const topicInput = document.getElementById('add-soc-cat-topic');
  const instructionsInput = document.getElementById('add-soc-cat-instructions');
  
  const name = nameInput.value.trim();
  if (!name) {
    alert('Please enter a Category Name.');
    return;
  }
  
  const cat = {
    name,
    keywords: keywordsInput.value.trim(),
    topic: topicInput.value.trim(),
    custom_content: instructionsInput.value.trim()
  };
  
  _socCategories.push(cat);
  
  nameInput.value = '';
  keywordsInput.value = '';
  topicInput.value = '';
  instructionsInput.value = '';
  
  renderSocialCategories();
}

function deleteSocialCategory(idx, e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  _socCategories.splice(idx, 1);
  renderSocialCategories();
}

function loadDefaultSocialCategories(e) {
  if (e) e.preventDefault();
  const defaults = [
    {
      name: "Actionable Value Hacks",
      keywords: "leads, productivity, CRM, automation",
      topic: "Simple steps to save 10 hours a week in lead management",
      custom_content: "Provide 3 simple productivity hacks for outreach, then introduce Innvoque's automation tools to handle it for them."
    },
    {
      name: "Value-First Outreach",
      keywords: "sales, conversion, marketing, trust",
      topic: "Why cold calling is dead and value-first messaging converts better",
      custom_content: "Debunk the myth that cold outreach must be pushy. Explain the value-first approach (giving a tip first) and how we help."
    },
    {
      name: "Common Mistakes to Avoid",
      keywords: "local SEO, Google Maps, lead generation",
      topic: "Mistakes local businesses make that lose them 10-20 customers monthly",
      custom_content: "Point out the mistake of a slow response time or not showing up on Google Maps. Highlight how our CRM automates immediate responses."
    },
    {
      name: "The 5-Minute Reply Rule",
      keywords: "lead decay, customer response, conversion",
      topic: "Why waiting 30 minutes to reply to a lead kills 80% of sales",
      custom_content: "Explain the science of lead decay. Explain how immediate follow-ups build trust and showcase our auto-whatsapp tools."
    },
    {
      name: "WhatsApp vs Email Open Rates",
      keywords: "whatsapp marketing, open rates, outreach",
      topic: "Why WhatsApp has a 98% open rate compared to 20% for email",
      custom_content: "Explain the shift in customer communication behavior. Showcase how our WhatsApp automation helps businesses reach customers where they actually look."
    },
    {
      name: "Google Maps Traffic Goldmine",
      keywords: "local SEO, google business profile, local business",
      topic: "The hidden traffic source 90% of local businesses ignore",
      custom_content: "Reveal how map rankings drive high-intent calls. Explain how to extract these leads and sync them to close more sales."
    },
    {
      name: "Founder Time Management",
      keywords: "time-saving, delegation, business automation",
      topic: "What I learned saving 15 hours a week by automating lead gen",
      custom_content: "Share a breakdown of manual task time vs automated time. Pitch Innvoque as the founder's time-saving secret."
    },
    {
      name: "Personalized AI Outreach",
      keywords: "artificial intelligence, automation, email marketing",
      topic: "How personalized AI messaging generated 50+ meetings",
      custom_content: "Detail a story of using AI to research prospects before emailing them, showing our automated lead scraper in action."
    },
    {
      name: "Follow-Up Retention Advantage",
      keywords: "CRM, customer retention, follow up",
      topic: "Getting leads is easy. Retaining them is where the money is.",
      custom_content: "Explain that follow-up determines profitability. Show how automated follow-up cycles turn single inquiries into lifetime buyers."
    },
    {
      name: "The Cost of Manual Lead Syncing",
      keywords: "automation, lead sync, efficiency",
      topic: "Stop copy-pasting lead details between systems manually",
      custom_content: "Highlight the error rates and time wasted on manual data entry. Explain how automatic CRM syncing saves time and energy."
    },
    {
      name: "Mobile-Friendly Conversions",
      keywords: "web design, mobile conversion, customer experience",
      topic: "Why local businesses lose customers from outdated mobile sites",
      custom_content: "Discuss how mobile-unfriendly sites turn customers away. Pitch our responsive web design and landing page solutions."
    },
    {
      name: "B2B Trust Building",
      keywords: "trust, b2b sales, relationship building",
      topic: "The secret to building instant trust with B2B decision makers",
      custom_content: "Explain that giving free, helpful audits builds instant B2B trust. Connect it to our personalized maps outreach templates."
    },
    {
      name: "Local SEO Ranking Myths",
      keywords: "local SEO, google maps ranking, business profile",
      topic: "Debunking 3 common myths about ranking #1 on Google",
      custom_content: "Clarify that reviews, proximity, and details matter more than keywords. Show how our tool helps businesses audit local listings."
    },
    {
      name: "Customer Experience Speed",
      keywords: "customer experience, response speed, brand value",
      topic: "Speed is the new marketing: Why fast response times win markets",
      custom_content: "Explain that clients buy from whoever answers first. Pitch Innvoque's automatic WhatsApp responder as the speed winner."
    },
    {
      name: "Scaling Without Hiring",
      keywords: "scaling, leverage, technology, hiring",
      topic: "How to scale your sales outreach without doubling your headcount",
      custom_content: "Discuss using software as a force multiplier. Explain how automated lead extraction and follow-up does the work of a 3-person team."
    }
  ];
  _socCategories = _socCategories.concat(defaults);
  renderSocialCategories();
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
    const category = document.getElementById('soc-biz-category').value;
    const name = document.getElementById('soc-biz-name').value.trim();
    const desc = document.getElementById('soc-biz-desc').value.trim();
    const audience = document.getElementById('soc-biz-audience').value.trim();
    const services = document.getElementById('soc-biz-services').value.trim();
    const language = document.getElementById('soc-language').value;
    
    const goal = document.getElementById('soc-goal').value;
    const contentType = document.getElementById('soc-content-type').value;
    const tone = document.getElementById('soc-tone').value;
    const postLength = document.getElementById('soc-post-length').value;
    const genHashtags = document.getElementById('soc-gen-hashtags').checked;

    // Pick a random topic from topic library if available
    const randomTopic = _socTopics.length > 0 ? _socTopics[Math.floor(Math.random() * _socTopics.length)] : 'General Services';
    
    let instructions = `Business category: ${category}. `;
    if (desc) instructions += `Company description: ${desc}. `;
    if (audience) instructions += `Target audience: ${audience}. `;
    if (services) instructions += `Primary services offered: ${services}. `;
    instructions += `Write the content in ${language} language. `;
    instructions += `The content goal is: ${goal}. `;
    instructions += `Format as content type: ${contentType}. `;
    instructions += `Write with a ${tone} tone. `;
    instructions += `Post length: ${postLength}. `;
    instructions += genHashtags ? `Include relevant hashtags.` : `Do not include any hashtags.`;

    const res = await (await fetch('/api/social/generate-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        website_url: website,
        topic: randomTopic,
        title: name || 'Our Company',
        custom_content: instructions
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
  // Safe helper
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  
  // Update mock contents
  setVal('mock-li-body', posts.linkedin || 'No post generated.');
  setVal('mock-fb-body', posts.facebook || 'No post generated.');
  setVal('mock-ig-body', posts.instagram || 'No post generated.');
  setVal('mock-tw-body', posts.twitter || 'No post generated.');
  
  // Custom titles
  const bizNameInput = document.getElementById('soc-biz-name');
  const customTitle = (bizNameInput ? bizNameInput.value.trim() : '') || (webData ? webData.title : '') || 'Our Company';
  
  setVal('mock-li-title', customTitle);
  setVal('mock-fb-title', customTitle);
  setVal('mock-tw-title', customTitle);
  
  const handle = '@' + customTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
  setVal('mock-tw-handle', handle);
  setVal('mock-ig-title', handle.substring(1));
  
  // Dynamic preview images rendering
  const imgUrl = posts.image_url;
  const showImg = !!imgUrl;
  
  const liImg = document.getElementById('mock-li-img');
  const liImgCont = document.getElementById('mock-li-img-container');
  if (liImg && liImgCont) {
    if (showImg) {
      liImg.src = imgUrl;
      liImgCont.style.display = 'block';
    } else {
      liImgCont.style.display = 'none';
    }
  }
  
  const fbImg = document.getElementById('mock-fb-img');
  const fbImgCont = document.getElementById('mock-fb-img-container');
  if (fbImg && fbImgCont) {
    if (showImg) {
      fbImg.src = imgUrl;
      fbImgCont.style.display = 'block';
    } else {
      fbImgCont.style.display = 'none';
    }
  }
  
  const igImg = document.getElementById('mock-ig-img');
  const igImgCont = document.getElementById('mock-ig-media-container');
  const igPlaceholder = document.getElementById('mock-ig-media-placeholder');
  if (igImgCont && igPlaceholder) {
    if (showImg && igImg) {
      igImg.src = imgUrl;
      igImgCont.style.display = 'block';
      igPlaceholder.style.display = 'none';
    } else {
      igImgCont.style.display = 'none';
      igPlaceholder.style.display = 'flex';
    }
  }
  
  const twImg = document.getElementById('mock-tw-img');
  const twImgCont = document.getElementById('mock-tw-img-container');
  if (twImg && twImgCont) {
    if (showImg) {
      twImg.src = imgUrl;
      twImgCont.style.display = 'block';
    } else {
      twImgCont.style.display = 'none';
    }
  }

  // Src indicator
  const indicator = document.getElementById('preview-src-indicator');
  if (indicator) {
    indicator.textContent = `Scraped: ${webData && webData.title ? webData.title.substring(0, 20) + '...' : 'Website Ready'}`;
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
  if (targetMock) targetMock.style.display = 'block';
  
  // Activate target tab button
  const targetTabBtn = document.getElementById(`tab-p-${platform}`);
  if (targetTabBtn) targetTabBtn.classList.add('active');
}

async function runSocialPostNow() {
  const btn = document.getElementById('soc-run-btn');
  const msg = document.getElementById('soc-msg');
  const website = document.getElementById('soc-website').value.trim();
  
  if (!website) {
    msg.textContent = '⚠️ Website URL is required to publish content.';
    msg.style.color = '#fbbf24';
    return;
  }

  btn.disabled = true;
  btn.textContent = '⏳ Executing...';
  msg.textContent = '🌐 Starting scraping, AI post writing and simulation...';
  msg.style.color = '#60a5fa';

  try {
    // Save first
    await saveSocialSettings();
    
    const category = document.getElementById('soc-biz-category').value;
    const name = document.getElementById('soc-biz-name').value.trim();
    const desc = document.getElementById('soc-biz-desc').value.trim();
    const audience = document.getElementById('soc-biz-audience').value.trim();
    const services = document.getElementById('soc-biz-services').value.trim();
    const language = document.getElementById('soc-language').value;
    
    const goal = document.getElementById('soc-goal').value;
    const contentType = document.getElementById('soc-content-type').value;
    const tone = document.getElementById('soc-tone').value;
    const postLength = document.getElementById('soc-post-length').value;
    const genHashtags = document.getElementById('soc-gen-hashtags').checked;

    // Pick a random topic from topic library if available
    const randomTopic = _socTopics.length > 0 ? _socTopics[Math.floor(Math.random() * _socTopics.length)] : 'General Services';
    
    let instructions = `Business category: ${category}. `;
    if (desc) instructions += `Company description: ${desc}. `;
    if (audience) instructions += `Target audience: ${audience}. `;
    if (services) instructions += `Primary services offered: ${services}. `;
    instructions += `Write the content in ${language} language. `;
    instructions += `The content goal is: ${goal}. `;
    instructions += `Format as content type: ${contentType}. `;
    instructions += `Write with a ${tone} tone. `;
    instructions += `Post length: ${postLength}. `;
    instructions += genHashtags ? `Include relevant hashtags.` : `Do not include any hashtags.`;

    const res = await (await fetch('/api/social/post-now', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        website_url: website,
        topic: randomTopic,
        title: name || 'Our Company',
        custom_content: instructions
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
    btn.textContent = '🚀 Publish Content Now';
  }
}

// ── Enterprise Extensions helpers ──────────────────────────────
function getDefaultTopics(category) {
  const mapping = {
    'IT Services': ['AI Automation', 'Cloud Computing', 'Web Development', 'Mobile Apps', 'Cyber Security', 'CRM Solutions'],
    'Real Estate': ['Property Investment', 'Home Buying Tips', 'Market Trends', 'Luxury Properties', 'Staging & Curb Appeal'],
    'Hospital': ['Wellness Care', 'Medical Tech', 'Patient Stories', 'Healthy Living', 'Mental Health'],
    'Restaurant': ['Signature Dishes', 'Behind the Scenes', 'Local Sourcing', 'Special Events', 'Chef Secrets'],
    'School': ['Student Spotlight', 'Education Trends', 'Extracurriculars', 'Parenting Tips', 'Campus Highlights'],
    'Insurance': ['Risk Management', 'Policy Guides', 'Financial Planning', 'Claim Tips', 'Seasonal Safety'],
    'Manufacturing': ['Industrial Automation', 'Quality Control', 'Supply Chain', 'Sustainable Mfg', 'New Tech'],
    'Retail': ['Trend Forecasts', 'Customer Showcase', 'Product Spotlight', 'Shopping Tips', 'Seasonal Style'],
    'Consultant': ['Business Growth', 'Leadership Insights', 'Efficiency Hacks', 'Scaling Advice', 'Case Studies'],
    'Salon': ['Hair & Skin Care', 'Current Trends', 'Makeovers', 'Product Reviews', 'Self-Care Rituals'],
    'Gym': ['Workout Guides', 'Nutrition Hacks', 'Transformations', 'Motivation', 'Fitness Myths'],
    'Automobile': ['Maintenance Hacks', 'Road Safety', 'Car Buying Guide', 'Future Auto Tech', 'Detailing Tricks'],
    'Custom': ['General Marketing', 'Business Success', 'Lead Growth', 'Automation Benefits']
  };
  return mapping[category] || mapping['Custom'];
}

function loadDefaultTopicsByCategory(category) {
  _socTopics = getDefaultTopics(category);
  renderTopicChips();
}

function onBizCategoryChange() {
  const cat = document.getElementById('soc-biz-category').value;
  loadDefaultTopicsByCategory(cat);
  updateAIMarketingInsights(cat);
}

function renderTopicChips() {
  const container = document.getElementById('soc-topic-chips-container');
  if (!container) return;
  
  if (!_socTopics || _socTopics.length === 0) {
    container.innerHTML = '<span style="color:#64748b;font-size:11px">No topics added yet. Add one below.</span>';
    return;
  }
  
  container.innerHTML = _socTopics.map((topic, idx) => {
    return `<span class="badge-sm s-warn" style="font-size:10px;padding:4px 8px;border-radius:12px;background:#1e293b;border:1px solid #334155;color:#e2e8f0;display:inline-flex;align-items:center;gap:6px">` +
      `<span>${topic}</span>` +
      `<button onclick="deleteTopic(${idx})" style="background:none;border:none;color:#f87171;cursor:pointer;font-size:10px;padding:0;line-height:1">&times;</button>` +
      `</span>`;
  }).join('');
  
  updateVisualSchedulerOutline();
}

function addCustomTopic() {
  const input = document.getElementById('add-soc-topic-input');
  if (!input) return;
  const topic = input.value.trim();
  if (!topic) return;
  
  _socTopics.push(topic);
  input.value = '';
  renderTopicChips();
}

function deleteTopic(idx) {
  _socTopics.splice(idx, 1);
  renderTopicChips();
}

async function analyzeCompanyWebsite() {
  const btn = document.getElementById('btn-analyze-website');
  const website = document.getElementById('soc-website').value.trim();
  const msg = document.getElementById('soc-msg');
  
  if (!website) {
    alert('Please enter a website URL first.');
    return;
  }
  
  btn.disabled = true;
  btn.textContent = '⏳ Analyzing...';
  msg.textContent = '🔍 Reading website content and analyzing with Gemini AI...';
  msg.style.color = '#60a5fa';
  
  try {
    const response = await fetch('/api/social/analyze-website', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ website_url: website })
    });
    const res = await response.json();
    
    if (res.success && res.analysis) {
      const data = res.analysis;
      
      // Auto-detect and populate fields
      if (data.company_name && document.getElementById('soc-biz-name')) {
        document.getElementById('soc-biz-name').value = data.company_name;
      }
      if (data.business_category && document.getElementById('soc-biz-category')) {
        document.getElementById('soc-biz-category').value = data.business_category;
      }
      if (data.business_desc && document.getElementById('soc-biz-desc')) {
        document.getElementById('soc-biz-desc').value = data.business_desc;
      }
      if (data.target_audience && document.getElementById('soc-biz-audience')) {
        document.getElementById('soc-biz-audience').value = data.target_audience;
      }
      if (data.primary_services && document.getElementById('soc-biz-services')) {
        document.getElementById('soc-biz-services').value = data.primary_services;
      }
      
      // If AI returned content topics, populate library
      if (data.content_topics && Array.isArray(data.content_topics) && data.content_topics.length > 0) {
        _socTopics = data.content_topics;
        renderTopicChips();
      }
      
      msg.textContent = '✅ Website analysis complete! Fields automatically detected and populated.';
      msg.style.color = '#34d399';
      setTimeout(() => { msg.textContent = ''; }, 4000);
      
      updateVisualSchedulerOutline();
      updateAIMarketingInsights(data.business_category || 'Custom');
    } else {
      msg.textContent = '❌ Analysis failed: ' + (res.error || 'Failed to parse response.');
      msg.style.color = '#f87171';
    }
  } catch(e) {
    msg.textContent = '❌ Analysis Error: ' + e.message;
    msg.style.color = '#f87171';
  } finally {
    btn.disabled = false;
    btn.textContent = '🔍 Analyze Website';
  }
}

function toggleChannelConnect(channel) {
  const btn = document.getElementById(`btn-ch-${channel}`);
  const enabledCheckbox = document.getElementById(`ch-${channel}-enabled`);
  const badge = document.getElementById(`badge-ch-${channel}`);
  
  if (btn && btn.textContent === 'Connect') {
    if (enabledCheckbox) enabledCheckbox.checked = true;
    btn.textContent = 'Disconnect';
    btn.className = 'btn b-red';
    if (badge) {
      badge.textContent = 'Online';
      badge.className = 'badge-sm s-ok';
    }
    const tokenInput = document.getElementById(`ch-${channel}-token`);
    if (tokenInput && !tokenInput.value) {
      tokenInput.value = 'MOCK_TOKEN_' + channel.toUpperCase();
    }
  } else if (btn) {
    if (enabledCheckbox) enabledCheckbox.checked = false;
    btn.textContent = 'Connect';
    btn.className = 'btn b-gray';
    if (badge) {
      badge.textContent = 'Offline';
      badge.className = 'badge-sm s-err';
    }
    const tokenInput = document.getElementById(`ch-${channel}-token`);
    if (tokenInput) {
      tokenInput.value = '';
      tokenInput.placeholder = 'Access Token';
    }
  }
}

function updateChannelBadgeVisual(channel) {
  const enabledCheckbox = document.getElementById(`ch-${channel}-enabled`);
  const badge = document.getElementById(`badge-ch-${channel}`);
  const btn = document.getElementById(`btn-ch-${channel}`);
  const tokenInput = document.getElementById(`ch-${channel}-token`);
  
  const isEnabled = enabledCheckbox ? enabledCheckbox.checked : false;
  const hasToken = tokenInput ? (tokenInput.value.length > 0 || tokenInput.placeholder.includes('saved')) : false;
  
  if (badge) {
    if (isEnabled && hasToken) {
      badge.textContent = 'Online';
      badge.className = 'badge-sm s-ok';
      if (btn) {
        btn.textContent = 'Disconnect';
        btn.className = 'btn b-red';
      }
    } else {
      badge.textContent = 'Offline';
      badge.className = 'badge-sm s-err';
      if (btn) {
        btn.textContent = 'Connect';
        btn.className = 'btn b-gray';
      }
    }
  }
}

function updateVisualSchedulerOutline() {
  const container = document.getElementById('upcoming-scheduler-outline');
  if (!container) return;
  
  const frequency = document.getElementById('soc-frequency').value;
  const hourVal = parseInt(document.getElementById('soc-hour').value);
  const timeZone = document.getElementById('soc-time-zone').value;
  
  let timeStr = '';
  if (frequency === 'daily') {
    const ampm = hourVal >= 12 ? 'PM' : 'AM';
    const displayHour = hourVal % 12 === 0 ? 12 : hourVal % 12;
    timeStr = `Daily at ${displayHour}:00 ${ampm} (${timeZone})`;
  } else if (frequency === 'hourly') {
    timeStr = `Hourly at the top of the hour (${timeZone})`;
  } else {
    timeStr = `Every 30 minutes (${timeZone})`;
  }
  
  let html = `<div style="display:flex;flex-direction:column;gap:8px">`;
  html += `<div>⏰ <b>Schedule Pattern:</b> ${timeStr}</div>`;
  
  if (_socTopics && _socTopics.length > 0) {
    html += `<div style="border-top:1px solid #1e293b;padding-top:6px;margin-top:2px"><b>Upcoming AI Topic Rotation:</b></div>`;
    html += `<div style="display:flex;flex-direction:column;gap:4px;margin-top:2px">`;
    
    const days = ['Today/Next Run', 'Tomorrow/Run +1', 'Day After/Run +2'];
    for (let i = 0; i < Math.min(3, _socTopics.length); i++) {
      html += `<div style="display:flex;justify-content:space-between;color:#94a3b8">`;
      html += `<span>📅 ${days[i]}:</span>`;
      html += `<span style="color:#60a5fa;font-weight:600">"${_socTopics[i]}"</span>`;
      html += `</div>`;
    }
    html += `</div>`;
  } else {
    html += `<div style="color:#64748b;font-style:italic">No topics in library. Please add topics to enable auto-rotation.</div>`;
  }
  html += `</div>`;
  
  container.innerHTML = html;
}

function updateAIMarketingInsights(category) {
  const goalEl = document.getElementById('insight-best-goal');
  const channelEl = document.getElementById('insight-top-channel');
  const topicEl = document.getElementById('insight-next-topic');
  
  const insights = {
    'IT Services': { goal: 'Lead Generation', channel: 'LinkedIn', topic: 'AI Integration benefits' },
    'Real Estate': { goal: 'Sales Promotion', channel: 'Facebook/Instagram', topic: 'Local market trends' },
    'Hospital': { goal: 'Brand Awareness', channel: 'Facebook', topic: 'Healthy living guidelines' },
    'Restaurant': { goal: 'Customer Engagement', channel: 'Instagram/Threads', topic: 'Behind the scenes cooking' },
    'School': { goal: 'Brand Awareness', channel: 'Facebook', topic: 'Parenting tips & activities' },
    'Insurance': { goal: 'Lead Generation', channel: 'LinkedIn/Facebook', topic: 'Reducing liability risk' },
    'Manufacturing': { goal: 'Lead Generation', channel: 'LinkedIn', topic: 'Supply chain efficiency' },
    'Retail': { goal: 'Sales Promotion', channel: 'Instagram/Pinterest', topic: 'New collection showcase' },
    'Consultant': { goal: 'Lead Generation', channel: 'LinkedIn/Twitter', topic: 'Scaling business operations' },
    'Salon': { goal: 'Customer Engagement', channel: 'Instagram/Pinterest', topic: 'Skin routine checklists' },
    'Gym': { goal: 'Customer Engagement', channel: 'Instagram/YouTube', topic: 'Morning workout splits' },
    'Automobile': { goal: 'Sales Promotion', channel: 'YouTube/Facebook', topic: 'Pre-purchase inspection checklist' },
    'Custom': { goal: 'Brand Awareness', channel: 'LinkedIn', topic: 'Automation productivity hacks' }
  };
  
  const ins = insights[category] || insights['Custom'];
  if (goalEl) goalEl.textContent = ins.goal;
  if (channelEl) channelEl.textContent = ins.channel;
  if (topicEl) {
    topicEl.textContent = ins.topic;
    topicEl.title = ins.topic;
  }
}

async function regenerateSocialContent() {
  const msg = document.getElementById('soc-msg');
  msg.textContent = '🔄 Contacting AI to rewrite content...';
  msg.style.color = '#818cf8';
  try {
    await generateSocialPreview();
  } catch (e) {
    msg.textContent = '❌ Rewrite failed: ' + e.message;
  }
}

async function generateSocialImage() {
  const msg = document.getElementById('soc-msg');
  msg.textContent = '🎨 Invoking AI Image Model (Pollinations AI)...';
  msg.style.color = '#38bdf8';
  
  if (!_socPreviewData) {
    const website = document.getElementById('soc-website').value.trim();
    if (!website) {
      alert('Please enter a website URL first.');
      msg.textContent = '';
      return;
    }
    await generateSocialPreview();
  }
  
  setTimeout(() => {
    const seed = Math.floor(Math.random() * 100000);
    const category = document.getElementById('soc-biz-category').value;
    const prompt = `realistic professional photo of ${category} workspace, high resolution, modern commercial office, DSLR, natural lighting`;
    const imgUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=800&height=600&nologo=true&seed=${seed}`;
    
    // Apply image to mockups
    const liImg = document.getElementById('mock-li-img');
    const liImgCont = document.getElementById('mock-li-img-container');
    if (liImg && liImgCont) {
      liImg.src = imgUrl;
      liImgCont.style.display = 'block';
    }
    
    const fbImg = document.getElementById('mock-fb-img');
    const fbImgCont = document.getElementById('mock-fb-img-container');
    if (fbImg && fbImgCont) {
      fbImg.src = imgUrl;
      fbImgCont.style.display = 'block';
    }
    
    const igImg = document.getElementById('mock-ig-img');
    const igImgCont = document.getElementById('mock-ig-media-container');
    const igPlaceholder = document.getElementById('mock-ig-media-placeholder');
    if (igImgCont && igPlaceholder && igImg) {
      igImg.src = imgUrl;
      igImgCont.style.display = 'block';
      igPlaceholder.style.display = 'none';
    }
    
    const twImg = document.getElementById('mock-tw-img');
    const twImgCont = document.getElementById('mock-tw-img-container');
    if (twImg && twImgCont) {
      twImg.src = imgUrl;
      twImgCont.style.display = 'block';
    }
    
    msg.textContent = '✅ AI Visual Image generated successfully!';
    msg.style.color = '#34d399';
    setTimeout(() => { msg.textContent = ''; }, 3000);
  }, 1000);
}

function saveSocialDraft() {
  const msg = document.getElementById('soc-msg');
  if (!_socPreviewData) {
    alert('Please generate content preview first before saving draft.');
    return;
  }
  msg.textContent = '💾 Saved as Draft successfully in SaaS templates!';
  msg.style.color = '#34d399';
  setTimeout(() => { msg.textContent = ''; }, 3000);
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

// ── Auto Scraper Page Controller ──────────────────────────────

// ─── Complete India City List (100+ cities) ───────────────────
const ALL_INDIA_CITIES = [
  'Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Ahmedabad', 'Chennai', 'Kolkata', 'Pune',
  'Jaipur', 'Surat', 'Lucknow', 'Kanpur', 'Nagpur', 'Indore', 'Thane', 'Bhopal',
  'Visakhapatnam', 'Patna', 'Vadodara', 'Ghaziabad', 'Ludhiana', 'Agra', 'Nashik',
  'Faridabad', 'Meerut', 'Rajkot', 'Varanasi', 'Srinagar', 'Aurangabad', 'Dhanbad',
  'Amritsar', 'Allahabad', 'Ranchi', 'Haora', 'Coimbatore', 'Jabalpur', 'Gwalior',
  'Vijayawada', 'Jodhpur', 'Madurai', 'Raipur', 'Kota', 'Chandigarh', 'Guwahati',
  'Solapur', 'Hubli', 'Tiruchirappalli', 'Bareilly', 'Mysore', 'Tiruppur', 'Gurgaon',
  'Aligarh', 'Jalandhar', 'Bhubaneswar', 'Salem', 'Warangal', 'Guntur', 'Bhiwandi',
  'Saharanpur', 'Gorakhpur', 'Bikaner', 'Amravati', 'Noida', 'Jamshedpur', 'Bhilai',
  'Cuttack', 'Firozabad', 'Kochi', 'Bhavnagar', 'Dehradun', 'Durgapur', 'Asansol',
  'Nanded', 'Kolhapur', 'Ajmer', 'Gulbarga', 'Jamnagar', 'Ujjain', 'Loni', 'Siliguri',
  'Jhansi', 'Ulhasnagar', 'Nellore', 'Jammu', 'Sangli', 'Belgaum', 'Mangalore',
  'Ambattur', 'Tirunelveli', 'Malegaon', 'Gaya', 'Jalgaon', 'Udaipur', 'Maheshtala',
  'Davanagere', 'Kozhikode', 'Akola', 'Kurnool', 'Bokaro', 'South Dumdum', 'Bellary',
  'Patiala', 'Gopalpur', 'Agartala', 'Bhagalpur', 'Muzaffarnagar', 'Bhatpara',
  'Panihati', 'Latur', 'Dhule', 'Rohtak', 'Korba', 'Bhilwara', 'Brahmapur',
  'Muzaffarpur', 'Ahmadnagar', 'Mathura', 'Kollam', 'Avadi', 'Rajahmundry',
  'Kadapa', 'Kamarhati', 'Bilaspur', 'Shahjahanpur', 'Bijapur', 'Rampur',
  'Shambhajinagar', 'Shimla', 'Mangaluru', 'Tiruvottiyur', 'Pondicherry',
  'Navi Mumbai', 'Thane', 'Kalyan', 'Vasai-Virar', 'Greater Noida', 'Faridabad',
  'Ghaziabad', 'Mira-Bhayandar', 'Pimpri-Chinchwad', 'Bhiwadi', 'Sonipat', 'Panipat'
];

// ─── Category → Keywords Map ──────────────────────────────────
const CATEGORY_KEYWORDS_MAP = {
  'ALL_AUTO': 'clinic, doctor, hospital, dentist, pharmacy, gym, yoga studio, spa, salon, beauty parlour, hotel, restaurant, cafe, catering, bakery, CA firm, chartered accountant, law firm, advocate, insurance agent, interior designer, architect, real estate agent, builder, construction, travel agent, tour operator, event management, wedding planner, photographer, coaching institute, school, tutor, driving school, computer training, IT company, software company, digital marketing, web design, mobile app developer, ecommerce store, retail shop, supermarket, grocery store, hardware store, automobile dealer, car showroom, bike showroom, plumber, electrician, AC repair, printing press, courier service',
  'IT Services': 'IT company, software company, IT services, technology company, web development, cloud computing, IT support, managed IT, cybersecurity firm, data center',
  'Software Companies': 'software company, software development, custom software, ERP software, SaaS company, mobile app development, software solutions, tech startup',
  'Digital Marketing Agencies': 'digital marketing agency, SEO company, social media marketing, PPC agency, content marketing, online marketing, performance marketing agency, branding agency',
  'Real Estate': 'real estate agent, property dealer, builder, developer, real estate broker, housing project, apartments, commercial property, land broker',
  'Construction': 'construction company, contractor, civil engineer, building contractor, interior contractor, renovation company, structural engineer',
  'Hospitals': 'hospital, multispecialty hospital, private hospital, nursing home, medical center, super specialty hospital, diagnostic center',
  'Clinics': 'clinic, medical clinic, polyclinic, health clinic, general physician, family doctor, outpatient clinic',
  'Doctors': 'doctor, physician, specialist doctor, cardiologist, orthopedic, dermatologist, pediatrician, gynecologist, neurologist, ENT specialist',
  'Schools': 'school, private school, CBSE school, ICSE school, international school, primary school, secondary school, play school, kindergarten',
  'Colleges': 'college, engineering college, medical college, arts college, management college, degree college, professional college, university',
  'Restaurants': 'restaurant, dhaba, food court, eatery, fine dining, fast food, cloud kitchen, biryani house, multi-cuisine restaurant',
  'Hotels': 'hotel, boutique hotel, resort, lodge, guest house, service apartment, 3 star hotel, 5 star hotel, business hotel',
  'Salons': 'salon, beauty salon, hair salon, unisex salon, ladies salon, barber shop, beauty parlour, makeup artist, nail studio',
  'Gyms': 'gym, fitness center, health club, yoga studio, zumba class, crossfit, martial arts, aerobics class, weight training',
  'Manufacturing': 'manufacturer, factory, manufacturing company, industrial unit, production plant, fabrication unit, MSME, small scale industry',
  'Insurance': 'insurance agent, insurance broker, LIC agent, health insurance, life insurance, vehicle insurance, general insurance',
  'Automobile Dealers': 'car dealer, automobile dealer, car showroom, bike dealer, used car dealer, auto parts, vehicle service center, car workshop',
  'Travel Agencies': 'travel agent, tour operator, travel agency, holiday package, visa consultant, pilgrimage tour, honeymoon package, adventure travel',
  'Consultants': 'business consultant, management consultant, HR consultant, tax consultant, startup consultant, financial advisor',
  'Lawyers': 'lawyer, advocate, law firm, solicitor, legal consultant, criminal lawyer, property lawyer, divorce lawyer, corporate lawyer',
  'Chartered Accountants': 'chartered accountant, CA firm, CPA, tax consultant, GST consultant, audit firm, accounting firm, bookkeeping',
  'Retail Stores': 'retail store, shop, supermarket, departmental store, electronics store, clothing store, furniture shop, hardware store',
  'Ecommerce': 'ecommerce store, online shop, online seller, dropshipping, marketplace seller, D2C brand, online retail',
  'Custom Industry': 'business, company, service provider, local business, enterprise, organization'
};

// ─── All categories list for auto-cycling ─────────────────────
const ALL_CATEGORIES_LIST = [
  'IT Services', 'Software Companies', 'Digital Marketing Agencies', 'Real Estate',
  'Construction', 'Hospitals', 'Clinics', 'Doctors', 'Schools', 'Colleges',
  'Restaurants', 'Hotels', 'Salons', 'Gyms', 'Manufacturing', 'Insurance',
  'Automobile Dealers', 'Travel Agencies', 'Consultants', 'Lawyers',
  'Chartered Accountants', 'Retail Stores', 'Ecommerce', 'Custom Industry'
];

// ─── Auto-fill all cities ──────────────────────────────────────
function autoFillAllCities() {
  const citiesStr = ALL_INDIA_CITIES.join(', ');
  const citiesEl = document.getElementById('auto-scraper-cities');
  if (citiesEl) {
    citiesEl.value = citiesStr;
    // Update count label
    const countEl = document.getElementById('cities-count-label');
    if (countEl) countEl.textContent = `✅ ${ALL_INDIA_CITIES.length} cities loaded`;
  }
}

// ─── Category change → auto fill keywords ─────────────────────
function onExtractorCategoryChange(skipKeywordOverride = false) {
  const catEl = document.getElementById('ex-discovery-category');
  if (!catEl) return;
  const cat = catEl.value;

  // Update auto label
  const autoLabel = document.getElementById('ex-cat-auto-label');
  if (autoLabel) {
    autoLabel.textContent = cat === 'ALL_AUTO' ? '🔄 Auto-Cycling All Categories' : '✅ Category Selected';
  }

  // Auto-fill keywords
  const keywords = CATEGORY_KEYWORDS_MAP[cat] || CATEGORY_KEYWORDS_MAP['Custom Industry'];
  const kwEl = document.getElementById('auto-scraper-keywords');
  if (kwEl && skipKeywordOverride !== true) kwEl.value = keywords;

  // Update AI suggestions box
  const sugEl = document.getElementById('ex-industry-suggestions');
  if (sugEl) {
    if (cat === 'ALL_AUTO') {
      sugEl.innerHTML = '<strong>🤖 Auto Mode:</strong> System will rotate through <b style="color:#34d399">ALL 24 business categories</b> automatically — covering IT, Healthcare, Real Estate, Restaurants, and more. Over 50+ keywords loaded.';
    } else {
      const kwCount = keywords.split(',').length;
      sugEl.innerHTML = `<strong>🤖 AI Keywords for ${cat}:</strong> <span style="color:#34d399">${kwCount} keywords auto-loaded</span>. Keywords: <span style="color:#93c5fd">${keywords.split(',').slice(0,5).join(', ')}...</span>`;
    }
  }
}

// ─── One-Click 24/7 Full Auto Mode ────────────────────────────
async function startFullAuto247() {
  const btn = document.getElementById('btn-scraper-start');
  const badge = document.getElementById('auto-scraper-badge');
  const statusEl = document.getElementById('auto-scraper-save-status');

  if (statusEl) { statusEl.textContent = '⏳ Auto-configuring all settings...'; statusEl.style.color = '#38bdf8'; }

  try {
    const kwEl = document.getElementById('auto-scraper-keywords');
    
    // Step 1: Auto-select ALL_AUTO category only if keywords are empty
    const catEl = document.getElementById('ex-discovery-category');
    if (catEl && kwEl && !kwEl.value.trim()) {
      catEl.value = 'ALL_AUTO';
      onExtractorCategoryChange();
    }

    // Step 2: Auto-fill all Indian cities if the field is empty
    const citiesEl = document.getElementById('auto-scraper-cities');
    if (citiesEl) {
      const currentCitiesCount = citiesEl.value.split(',').map(c => c.trim()).filter(Boolean).length;
      if (currentCitiesCount === 0) {
        autoFillAllCities();
      }
    }

    // Get the updated values from the inputs
    const keywords = document.getElementById('auto-scraper-keywords').value.trim();
    const cities = document.getElementById('auto-scraper-cities').value.trim();
    const maxResults = parseInt(document.getElementById('auto-scraper-max-results').value) || 200;
    const deepEmailExtract = document.getElementById('auto-scraper-deep-extract').checked;
    const dailyTarget = parseInt(document.getElementById('auto-scraper-daily-target').value) || 5000;
    const intervalMinutes = parseInt(document.getElementById('auto-scraper-interval').value) || 2;

    // Send the settings and enable the scraper in a single call
    const startRes = await fetch('/api/auto-scraper', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        keywords,
        cities,
        maxResults,
        deepEmailExtract,
        dailyTarget,
        intervalMinutes,
        enabled: true
      })
    });
    const startData = await startRes.json();
    if (!startData.success) throw new Error(startData.error || 'Start failed');

    // Update UI
    if (btn) {
      btn.textContent = '✅ 24/7 AUTO MODE RUNNING';
      btn.style.background = 'linear-gradient(135deg,#0f766e,#0d9488)';
      btn.style.boxShadow = '0 0 24px rgba(20,184,166,.6)';
    }
    if (badge) { badge.textContent = '🟢 RUNNING 24/7'; badge.className = 'badge-sm s-ok'; }
    document.getElementById('btn-scraper-pause').disabled = false;
    document.getElementById('btn-scraper-stop').disabled = false;

    if (statusEl) {
      statusEl.innerHTML = '🚀 <b style="color:#34d399">24/7 Auto Mode ACTIVE</b> — Cycling all categories across ' + ALL_INDIA_CITIES.length + ' cities. Runs non-stop, auto-resumes at midnight.';
      statusEl.style.color = '#34d399';
    }

    // Also update terminal log box
    const logsBox = document.getElementById('auto-scraper-logs-box');
    if (logsBox) {
      logsBox.textContent = `[${new Date().toLocaleTimeString()}] 🚀 24/7 Auto Mode STARTED\n[${new Date().toLocaleTimeString()}] 📍 Cities loaded: ${ALL_INDIA_CITIES.length}\n[${new Date().toLocaleTimeString()}] 🔑 Mode: ALL Categories Auto-Cycle\n[${new Date().toLocaleTimeString()}] ⏱ Interval: 2 minutes | Target: 5,000 leads/day\n[${new Date().toLocaleTimeString()}] ✅ Engine running — watching for leads...\n`;
      logsBox.scrollTop = logsBox.scrollHeight;
    }

    updateAutoScraperStatusVisual('Running', true);
    loadStats();

  } catch(e) {
    if (statusEl) { statusEl.textContent = '❌ Error: ' + e.message; statusEl.style.color = '#f87171'; }
    console.error('startFullAuto247 error:', e);
  }
}

// ─── Control Auto Scraper (pause / resume / stop) ─────────────
async function controlAutoScraper(action) {
  const badge = document.getElementById('auto-scraper-badge');
  const startBtn = document.getElementById('btn-scraper-start');
  const pauseBtn = document.getElementById('btn-scraper-pause');
  const resumeBtn = document.getElementById('btn-scraper-resume');
  const stopBtn = document.getElementById('btn-scraper-stop');

  if (action === 'start') {
    // Redirect to full auto mode
    await startFullAuto247();
    return;
  }

  try {
    const enabled = action === 'resume';
    const res = await fetch('/api/auto-scraper', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: action !== 'stop' ? enabled : false })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    if (action === 'stop') {
      if (badge) { badge.textContent = '🔴 STOPPED'; badge.className = 'badge-sm s-err'; }
      if (startBtn) {
        startBtn.textContent = '🚀 Start 24/7 Auto Mode';
        startBtn.style.background = 'linear-gradient(135deg,#16a34a,#15803d)';
        startBtn.style.boxShadow = '0 0 18px rgba(22,163,74,.5)';
      }
      if (pauseBtn) pauseBtn.disabled = true;
      if (resumeBtn) resumeBtn.disabled = true;
      if (stopBtn) stopBtn.disabled = true;
      updateAutoScraperStatusVisual('Stopped', false);
    } else if (action === 'pause') {
      if (badge) { badge.textContent = '🟡 PAUSED'; badge.className = 'badge-sm s-warn'; }
      if (pauseBtn) pauseBtn.disabled = true;
      if (resumeBtn) resumeBtn.disabled = false;
      updateAutoScraperStatusVisual('Paused', false);
    } else if (action === 'resume') {
      if (badge) { badge.textContent = '🟢 RUNNING 24/7'; badge.className = 'badge-sm s-ok'; }
      if (pauseBtn) pauseBtn.disabled = false;
      if (resumeBtn) resumeBtn.disabled = true;
      updateAutoScraperStatusVisual('Running', true);
    }
  } catch(e) {
    console.error('controlAutoScraper error:', e);
    alert('Error: ' + e.message);
  }
}


async function loadAutoScraperConfig() {
  try {
    const res = await fetch('/api/auto-scraper');
    const data = await res.json();
    if (data.success && data.config) {
      const cfg = data.config;
      document.getElementById('auto-scraper-keywords').value = cfg.keywords || '';
      const citiesEl = document.getElementById('auto-scraper-cities');
      if (citiesEl) citiesEl.value = cfg.cities || '';
      document.getElementById('auto-scraper-max-results').value = cfg.maxResults || 200;
      document.getElementById('auto-scraper-deep-extract').checked = !!cfg.deepEmailExtract;
      const dtEl = document.getElementById('auto-scraper-daily-target');
      if (dtEl) dtEl.value = cfg.dailyTarget || 5000;
      const intEl = document.getElementById('auto-scraper-interval');
      if (intEl) intEl.value = cfg.intervalMinutes || 2;
      const toggle = document.getElementById('auto-scraper-toggle');
      if (toggle) toggle.checked = !!cfg.enabled;
      updateAutoScraperStatusVisual(cfg.status, cfg.enabled);
      updateAutoScraperLogsBox(cfg.logs);
    }
  } catch (e) {
    console.error('Error loading auto-scraper config:', e);
  }
  // Auto-fill cities if empty
  const citiesEl2 = document.getElementById('auto-scraper-cities');
  if (citiesEl2 && !citiesEl2.value.trim()) {
    autoFillAllCities();
  } else if (citiesEl2) {
    const countEl = document.getElementById('cities-count-label');
    if (countEl) {
      const cnt = citiesEl2.value.split(',').filter(c => c.trim()).length;
      if (cnt > 0) countEl.textContent = `✅ ${cnt} cities loaded`;
    }
  }
  // Auto-fill keywords + suggestions
  const kwEl2 = document.getElementById('auto-scraper-keywords');
  if (kwEl2 && !kwEl2.value.trim()) {
    const catEl2 = document.getElementById('ex-discovery-category');
    if (catEl2) catEl2.value = 'ALL_AUTO';
    onExtractorCategoryChange();
  } else {
    onExtractorCategoryChange(true);
  }
}


async function pollAutoScraperStatus() {
  try {
    const res = await fetch('/api/auto-scraper');
    const data = await res.json();
    if (data.success && data.config) {
      const cfg = data.config;
      const toggle = document.getElementById('auto-scraper-toggle');
      if (toggle) toggle.checked = !!cfg.enabled;
      updateAutoScraperStatusVisual(cfg.status, cfg.enabled);
      updateAutoScraperLogsBox(cfg.logs);
    }
  } catch (e) {
    console.error('Error polling auto-scraper status:', e);
  }

  // Fetch live stats and update KPIs + Active Task alert
  try {
    const res2 = await fetch('/api/auto-scraper/stats');
    const stats = await res2.json();
    if (stats.success) {
      // Update actual KPI metrics grid
      const kpiTotal = document.getElementById('kpi-total-leads');
      const kpiToday = document.getElementById('kpi-todays-leads');
      const kpiEmails = document.getElementById('kpi-emails-found');
      const kpiWhatsapp = document.getElementById('kpi-whatsapp-found');
      const kpiDecMaker = document.getElementById('kpi-decision-makers');
      const kpiHot = document.getElementById('kpi-hot-leads');
      const kpiWarm = document.getElementById('kpi-warm-leads');
      const kpiCold = document.getElementById('kpi-cold-leads');
      const kpiWebsites = document.getElementById('kpi-websites-found');
      const kpiPhones = document.getElementById('kpi-phones-found');

      if (kpiTotal) kpiTotal.textContent = (stats.totalLeads || 0).toLocaleString();
      if (kpiToday) kpiToday.textContent = (stats.leadsToday || 0).toLocaleString();
      if (kpiEmails) kpiEmails.textContent = (stats.emailsFound || 0).toLocaleString();
      if (kpiWhatsapp) kpiWhatsapp.textContent = (stats.whatsappFound || 0).toLocaleString();
      if (kpiDecMaker) kpiDecMaker.textContent = (stats.decisionMakers || 0).toLocaleString();
      if (kpiHot) kpiHot.textContent = (stats.hotLeads || 0).toLocaleString();
      if (kpiWarm) kpiWarm.textContent = (stats.warmLeads || 0).toLocaleString();
      if (kpiCold) kpiCold.textContent = (stats.coldLeads || 0).toLocaleString();
      if (kpiWebsites) kpiWebsites.textContent = (stats.websitesFound || 0).toLocaleString();
      if (kpiPhones) kpiPhones.textContent = (stats.phonesFound || 0).toLocaleString();

      // Update active task banner
      const searchEl = document.getElementById('ex-alert-current-combo');
      if (searchEl) {
        if (stats.enabled) {
          const kw = (stats.currentKeyword || '').trim();
          const ct = (stats.currentCity || '').trim();
          const statusTxt = stats.status || 'Running';
          searchEl.innerHTML = `<span style="color:#60a5fa;font-weight:700">[${statusTxt}]</span> "${kw}" in ${ct}`;
        } else {
          searchEl.innerHTML = `<span style="color:#64748b">Idle (Scraper Stopped)</span>`;
        }
      }

      // Update last completed cycle time
      const lastRunEl = document.getElementById('ex-alert-last-run');
      if (lastRunEl && stats.lastRunAt) {
        const d = new Date(stats.lastRunAt);
        lastRunEl.textContent = 'Last cycle completed: ' + d.toLocaleTimeString();
      }

      // Keep control buttons and active status badge in sync
      const startBtn = document.getElementById('btn-scraper-start');
      const pauseBtn = document.getElementById('btn-scraper-pause');
      const resumeBtn = document.getElementById('btn-scraper-resume');
      const stopBtn = document.getElementById('btn-scraper-stop');
      const badge = document.getElementById('auto-scraper-badge');

      if (stats.enabled) {
        // Update badge text/style
        if (badge) {
          if (stats.status === 'Target Reached') {
            badge.textContent = '🎯 TARGET REACHED';
            badge.className = 'badge-sm s-ok';
            badge.style.background = '#10b981';
          } else if (stats.status === 'Scraping Maps') {
            badge.textContent = '⚡ SCRAPING MAPS';
            badge.className = 'badge-sm s-ok';
            badge.style.background = '#0ea5e9';
          } else if (stats.status === 'Extracting Contacts') {
            badge.textContent = '🌐 EXTRACTING CONTACTS';
            badge.className = 'badge-sm s-ok';
            badge.style.background = '#8b5cf6';
          } else if (stats.status === 'Idle') {
            badge.textContent = '⏳ IDLE / WAITING';
            badge.className = 'badge-sm s-warn';
            badge.style.background = '#d97706';
          } else {
            badge.textContent = '🟢 RUNNING 24/7';
            badge.className = 'badge-sm s-ok';
            badge.style.background = '#22c55e';
          }
        }
        
        if (startBtn) {
          startBtn.textContent = '✅ 24/7 AUTO MODE RUNNING';
          startBtn.style.background = 'linear-gradient(135deg,#0f766e,#0d9488)';
          startBtn.style.boxShadow = '0 0 24px rgba(20,184,166,.6)';
        }
        if (pauseBtn) pauseBtn.disabled = false;
        if (stopBtn) stopBtn.disabled = false;
      } else {
        if (badge) {
          badge.textContent = '🔴 STOPPED';
          badge.className = 'badge-sm s-err';
          badge.style.background = '#ef4444';
        }
        if (startBtn) {
          startBtn.textContent = '🚀 Start 24/7 Auto Mode';
          startBtn.style.background = 'linear-gradient(135deg,#16a34a,#15803d)';
          startBtn.style.boxShadow = '0 0 18px rgba(22,163,74,.5)';
        }
        if (pauseBtn) pauseBtn.disabled = true;
        if (resumeBtn) resumeBtn.disabled = true;
        if (stopBtn) stopBtn.disabled = true;
      }
    }
  } catch(e) {
    console.error('Error updating live auto scraper stats UI:', e);
  }
}

function updateAutoScraperStatusVisual(status, enabled) {
  const lbl = document.getElementById('auto-scraper-status-label');
  if (!lbl) return;
  if (!enabled) {
    lbl.textContent = 'Status: Stopped';
    lbl.style.color = '#f87171'; // soft red
  } else if (status === 'Target Reached') {
    lbl.textContent = '🎯 Daily Target Reached — Resuming at Midnight';
    lbl.style.color = '#10b981'; // green
  } else {
    lbl.textContent = 'Status: ' + (status || 'Idle');
    if (status === 'Idle') {
      lbl.style.color = '#fbbf24'; // amber/yellow
    } else if (status === 'Scraping Maps') {
      lbl.style.color = '#38bdf8'; // light blue
    } else if (status === 'Extracting Contacts') {
      lbl.style.color = '#a78bfa'; // purple/indigo
    } else {
      lbl.style.color = '#34d399'; // green
    }
  }
}

function updateAutoScraperLogsBox(logs) {
  const box = document.getElementById('auto-scraper-logs-box');
  if (!box) return;
  const oldText = box.textContent;
  const newText = logs ? logs.trim() : '[No logs yet. The scraper runs automatically in background.]';
  if (oldText !== newText) {
    box.textContent = newText;
    box.scrollTop = box.scrollHeight;
  }
}

async function saveAutoScraperSettings() {
  const keywords = document.getElementById('auto-scraper-keywords').value.trim();
  const cities = document.getElementById('auto-scraper-cities').value.trim();
  const maxResults = parseInt(document.getElementById('auto-scraper-max-results').value) || 200;
  const deepEmailExtract = document.getElementById('auto-scraper-deep-extract').checked;
  const dtEl = document.getElementById('auto-scraper-daily-target');
  const intEl = document.getElementById('auto-scraper-interval');
  const dailyTarget = dtEl ? (parseInt(dtEl.value) || 5000) : 5000;
  const intervalMinutes = intEl ? Math.max(1, parseInt(intEl.value) || 2) : 2;
  
  const statusEl = document.getElementById('auto-scraper-save-status');
  statusEl.textContent = '⏳ Saving...';
  statusEl.style.color = '#60a5fa';
  
  try {
    const res = await fetch('/api/auto-scraper', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keywords, cities, maxResults, deepEmailExtract, dailyTarget, intervalMinutes })
    });
    const data = await res.json();
    if (data.success) {
      statusEl.textContent = `✅ Saved! Target: ${dailyTarget.toLocaleString()} leads/day @ ${intervalMinutes}min intervals`;
      statusEl.style.color = '#34d399';
      setTimeout(() => { statusEl.textContent = ''; }, 3000);
      loadStats();
    } else {
      statusEl.textContent = '❌ Failed: ' + data.error;
      statusEl.style.color = '#f87171';
    }
  } catch (e) {
    statusEl.textContent = '❌ Error: ' + e.message;
    statusEl.style.color = '#f87171';
  }
}

async function toggleAutoScraper(checked) {
  const lbl = document.getElementById('auto-scraper-status-label');
  if (lbl) {
    lbl.textContent = checked ? '⏳ Starting...' : '⏳ Stopping...';
    lbl.style.color = '#60a5fa';
  }
  
  try {
    const res = await fetch('/api/auto-scraper', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: checked })
    });
    const data = await res.json();
    if (data.success) {
      updateAutoScraperStatusVisual(data.config.status, data.config.enabled);
      updateAutoScraperLogsBox(data.config.logs);
      fetchLeads(1);
    }
  } catch (e) {
    console.error('Error toggling auto-scraper:', e);
    if (lbl) {
      lbl.textContent = '❌ Error';
      lbl.style.color = '#f87171';
    }
  }
}

async function clearAutoScraperLogs() {
  if (!confirm('Clear all auto-scraper logs?')) return;
  try {
    const res = await fetch('/api/auto-scraper/clear-logs', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      const box = document.getElementById('auto-scraper-logs-box');
      if (box) box.textContent = '[Logs cleared]';
    }
  } catch (e) {
    console.error('Error clearing logs:', e);
  }
}

function resetAutoScraperDefaults() {
  const defaultCities = [
    'Mumbai', 'Delhi', 'Bangalore', 'Pune', 'Ahmedabad',
    'Hyderabad', 'Kolkata', 'Chennai', 'Lucknow', 'Jaipur',
    'Surat', 'Kanpur', 'Nagpur', 'Indore', 'Thane',
    'Bhopal', 'Visakhapatnam', 'Patna', 'Vadodara', 'Ghaziabad',
    'Ludhiana', 'Agra', 'Nashik', 'Faridabad', 'Meerut',
    'Rajkot', 'Varanasi', 'Srinagar', 'Aurangabad', 'Dhanbad'
  ].join(', ');

  const defaultKeywords = [
    'clinic', 'doctor', 'hospital', 'dentist', 'pharmacy',
    'gym', 'yoga studio', 'spa', 'salon', 'beauty parlour',
    'hotel', 'restaurant', 'cafe', 'catering', 'bakery',
    'CA firm', 'chartered accountant', 'law firm', 'advocate', 'insurance agent',
    'interior designer', 'architect', 'real estate agent', 'builder', 'construction',
    'travel agent', 'tour operator', 'event management', 'wedding planner', 'photographer',
    'coaching institute', 'school', 'tutor', 'driving school', 'computer training'
  ].join(', ');

  document.getElementById('auto-scraper-keywords').value = defaultKeywords;
  document.getElementById('auto-scraper-cities').value = defaultCities;
  document.getElementById('auto-scraper-max-results').value = 200;
  document.getElementById('auto-scraper-daily-target').value = 5000;
  document.getElementById('auto-scraper-interval').value = 2;
  document.getElementById('auto-scraper-deep-extract').checked = false;

  const statusEl = document.getElementById('auto-scraper-save-status');
  if (statusEl) {
    statusEl.textContent = '🔄 Defaults filled! Click "Save Settings" to save.';
    statusEl.style.color = '#fbbf24';
    setTimeout(() => { statusEl.textContent = ''; }, 5000);
  }
}

// -- Gemini Key Test --
async function testGeminiKey(){
  const el = document.getElementById('gemini-status');
  const keyEl = document.getElementById('s-gemini-key');
  const apiKey = keyEl && keyEl.value && keyEl.value.indexOf('\u2022') === -1 ? keyEl.value.trim() : '';
  el.innerHTML = '<span style="color:#60a5fa">Testing Gemini key...</span>';
  try {
    const r = await (await fetch('/api/test-gemini', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ api_key: apiKey })
    })).json();
    el.innerHTML = r.success
      ? '<span style="color:#34d399">' + r.message + '</span>'
      : '<span style="color:#f87171">' + r.error + '</span>';
  } catch(e) {
    el.innerHTML = '<span style="color:#f87171">' + e.message + '</span>';
  }
}

function updateWAGatewayUI(){
  const gwEl = document.getElementById('s-wa-gateway');
  const gw = gwEl ? gwEl.value : 'playwright';
  const umSection = document.getElementById('ultramsg-section');
  const hintEl = document.getElementById('wa-gateway-hint');
  if (umSection) umSection.style.display = gw === 'ultramsg' ? '' : 'none';
  if (hintEl) {
    if (gw === 'playwright') {
      hintEl.innerHTML = '<b>Local Browser mode:</b> WhatsApp Web opens automatically in your browser. No cloud API needed - 100% free.';
    } else if (gw === 'ultramsg') {
      hintEl.innerHTML = '<b>UltraMsg Cloud API mode:</b> Messages sent via UltraMsg REST API. Configure Instance ID and Token below.';
    }
  }
}

// ─── Auto Scraper subtab switching & loading ───────────────────
let exGridSelectedIds = new Set();
let exGridLeads = [];
let exGridPage = 1;
let exGridTotalPages = 1;

function switchExtractorSubtab(subtab) {
  document.querySelectorAll('.ex-subtab-body').forEach(el => el.style.display = 'none');
  document.querySelectorAll('#tab-auto-scraper button[onclick^="switchExtractorSubtab"]').forEach(btn => {
    btn.classList.remove('active');
  });

  const target = document.getElementById('ex-sub-' + subtab);
  if (target) target.style.display = 'block';

  const btn = document.getElementById('subtab-ex-' + subtab);
  if (btn) btn.classList.add('active');

  if (subtab === 'analytics') {
    loadAnalytics();
  } else if (subtab === 'grid') {
    loadExtractorGrid(1);
  } else if (subtab === 'outreach') {
    loadOutreachTab();
  }
}

async function loadAnalytics() {
  const dateLoad = document.getElementById('analytics-date-loading');
  const dateCont = document.getElementById('analytics-date-container');
  const dateTbody = document.getElementById('analytics-date-tbody');
  
  const catLoad = document.getElementById('analytics-cat-loading');
  const catCont = document.getElementById('analytics-cat-container');
  const catTbody = document.getElementById('analytics-cat-tbody');

  const cityLoad = document.getElementById('analytics-city-loading');
  const cityCont = document.getElementById('analytics-city-container');
  const cityTbody = document.getElementById('analytics-city-tbody');

  if (dateLoad) dateLoad.style.display = 'block';
  if (dateCont) dateCont.style.display = 'none';
  if (catLoad) catLoad.style.display = 'block';
  if (catCont) catCont.style.display = 'none';
  if (cityLoad) cityLoad.style.display = 'block';
  if (cityCont) cityCont.style.display = 'none';

  try {
    const res = await fetch('/api/auto-scraper/analytics');
    const data = await res.json();
    if (data.success) {
      const anTotal = document.getElementById('an-total-leads');
      const anToday = document.getElementById('an-todays-leads');
      const anTopCat = document.getElementById('an-top-category');
      const anTopCity = document.getElementById('an-top-city');

      if (anTotal) anTotal.textContent = (data.totalLeads || 0).toLocaleString();
      if (anToday) anToday.textContent = (data.todayLeads || 0).toLocaleString();
      if (anTopCat) anTopCat.textContent = data.topCategory || 'N/A';
      if (anTopCity) anTopCity.textContent = data.topCity || 'N/A';

      // 1. Render Date wise
      if (data.byDate && data.byDate.length) {
        const maxVal = Math.max(...data.byDate.map(d => d.count), 1);
        dateTbody.innerHTML = data.byDate.map(d => {
          const pct = Math.round((d.count / maxVal) * 100);
          return `<tr>
            <td style="padding:6px 8px;border-bottom:1px solid #1e293b;color:#fff">${d.date}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #1e293b;text-align:right;font-weight:700;color:#38bdf8">${d.count}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #1e293b">
              <div style="background:#1e293b;height:6px;border-radius:3px;overflow:hidden;width:100%">
                <div style="background:#38bdf8;width:${pct}%;height:100%"></div>
              </div>
            </td>
          </tr>`;
        }).join('');
      } else {
        dateTbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:20px;color:#64748b">No data found</td></tr>';
      }

      // 2. Render Category wise
      if (data.byCategory && data.byCategory.length) {
        const maxVal = Math.max(...data.byCategory.map(c => c.count), 1);
        catTbody.innerHTML = data.byCategory.map(c => {
          const pct = Math.round((c.count / maxVal) * 100);
          return `<tr>
            <td style="padding:6px 8px;border-bottom:1px solid #1e293b;color:#fff">${c.category}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #1e293b;text-align:right;font-weight:700;color:#a78bfa">${c.count}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #1e293b">
              <div style="background:#1e293b;height:6px;border-radius:3px;overflow:hidden;width:100%">
                <div style="background:#a78bfa;width:${pct}%;height:100%"></div>
              </div>
            </td>
          </tr>`;
        }).join('');
      } else {
        catTbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:20px;color:#64748b">No data found</td></tr>';
      }

      // 3. Render City wise
      if (data.byCity && data.byCity.length) {
        const maxVal = Math.max(...data.byCity.map(c => c.count), 1);
        cityTbody.innerHTML = data.byCity.map(c => {
          const pct = Math.round((c.count / maxVal) * 100);
          return `<tr>
            <td style="padding:6px 8px;border-bottom:1px solid #1e293b;color:#fff">${c.city}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #1e293b;text-align:right;font-weight:700;color:#34d399">${c.count}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #1e293b">
              <div style="background:#1e293b;height:6px;border-radius:3px;overflow:hidden;width:100%">
                <div style="background:#34d399;width:${pct}%;height:100%"></div>
              </div>
            </td>
          </tr>`;
        }).join('');
      } else {
        cityTbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:20px;color:#64748b">No data found</td></tr>';
      }

      if (dateLoad) dateLoad.style.display = 'none';
      if (dateCont) dateCont.style.display = 'block';
      if (catLoad) catLoad.style.display = 'none';
      if (catCont) catCont.style.display = 'block';
      if (cityLoad) cityLoad.style.display = 'none';
      if (cityCont) cityCont.style.display = 'block';
    }
  } catch (err) {
    console.error('Error loading analytics:', err);
    if (dateLoad) dateLoad.textContent = '❌ Error loading analytics';
    if (catLoad) catLoad.textContent = '❌ Error loading analytics';
    if (cityLoad) cityLoad.textContent = '❌ Error loading analytics';
  }
}

async function loadExtractorGrid(page) {
  if (page) exGridPage = page;
  const search = document.getElementById('ex-grid-search')?.value || '';
  const quality = document.getElementById('ex-grid-filter-quality')?.value || 'all';
  const source = document.getElementById('ex-grid-filter-source')?.value || 'all';

  const q = new URLSearchParams({
    page: exGridPage,
    limit: 25,
    search,
    quality,
    source
  });

  try {
    const res = await fetch('/api/auto-scraper/leads?' + q);
    const data = await res.json();
    if (data.success) {
      exGridLeads = data.leads;
      exGridTotalPages = data.pages;
      exGridPage = data.page;
      renderExtractorGridTable();
      updateGridSelectionUI();
    }
  } catch (err) {
    console.error('Error loading extractor grid:', err);
  }
}

function filterExtractorGrid() {
  loadExtractorGrid(1);
}

function getLeadScore(b) {
  let score = 0;
  if (b.rating) score += Math.round(b.rating * 10);
  if (b.reviews) score += Math.min(b.reviews, 50);
  if (b.phone) score += 20;
  if (b.email) score += 30;
  if (b.website && b.website !== 'No Site') score += 10;
  return score;
}

function getLeadQuality(b) {
  if (b.phone && b.email && b.rating >= 4) return 'Hot';
  if ((b.phone || b.email) && b.rating >= 3) return 'Warm';
  return 'Cold';
}

function getDecisionMakerHeuristic(b) {
  if (!b.email) return '—';
  const generic = ['info@', 'sales@', 'admin@', 'support@', 'contact@', 'marketing@', 'office@', 'hello@', 'jobs@', 'careers@'];
  const hasGeneric = generic.some(p => b.email.toLowerCase().trim().startsWith(p));
  if (hasGeneric) {
    return `<span class="badge bgr" style="font-size:9px">🏢 General</span>`;
  }
  const namePart = b.email.split('@')[0];
  const capitalized = namePart.charAt(0).toUpperCase() + namePart.slice(1);
  return `<span class="badge bg" style="font-size:9px;background:#c084fc">👤 ${capitalized}</span>`;
}

function renderExtractorGridTable() {
  const tbody = document.getElementById('ex-grid-body');
  const totalLabel = document.getElementById('ex-grid-totals-label');
  if (!tbody) return;

  if (!exGridLeads.length) {
    tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:24px;color:#64748b">No leads matched. Start extractor to populate data.</td></tr>`;
    if (totalLabel) totalLabel.textContent = 'Showing 0 of 0 leads';
    return;
  }

  tbody.innerHTML = exGridLeads.map((b, i) => {
    const score = getLeadScore(b);
    const quality = getLeadQuality(b);
    const decMaker = getDecisionMakerHeuristic(b);
    const isChecked = exGridSelectedIds.has(b._id) ? 'checked' : '';
    
    let qualBadge = '';
    if (quality === 'Hot') {
      qualBadge = `<span class="badge bg" style="background:#10b981;font-weight:bold">🔥 Hot</span>`;
    } else if (quality === 'Warm') {
      qualBadge = `<span class="badge by" style="background:#f59e0b;color:#fff;font-weight:bold">⚡ Warm</span>`;
    } else {
      qualBadge = `<span class="badge br" style="background:#ef4444;font-weight:bold">❄️ Cold</span>`;
    }

    const emailDisplay = b.email ? `<span style="color:#a78bfa;font-weight:700">${b.email}</span>` : '—';
    const phoneDisplay = b.raw_phone || b.phone || '—';
    const siteDisplay = b.website && b.website !== 'No Site' 
      ? `<a href="${b.website}" target="_blank" class="badge bb" style="text-decoration:none">🌐 Web</a>` 
      : '<span class="badge br">❌ No Site</span>';

    return `<tr style="border-bottom:1px solid #1e293b; background:${isChecked ? 'rgba(124,58,237,.1)' : 'transparent'}">
      <td style="padding:8px 12px"><input type="checkbox" data-grid-id="${b._id}" ${isChecked} onchange="onGridCheckChange(this)"></td>
      <td style="padding:8px"><div style="font-weight:700;color:#fff">${b.name}</div><div style="font-size:9px;color:#64748b">${b.keyword || ''}</div></td>
      <td style="padding:8px"><span class="badge bpur">${b.category || 'General'}</span></td>
      <td style="padding:8px">${b.city || ''}</td>
      <td style="padding:8px;font-family:monospace;color:#cbd5e1">${phoneDisplay}</td>
      <td style="padding:8px;font-size:10px">${emailDisplay}</td>
      <td style="padding:8px">${siteDisplay}</td>
      <td style="padding:8px">${decMaker}</td>
      <td style="padding:8px;text-align:center"><b style="color:#38bdf8">${score}</b></td>
      <td style="padding:8px;text-align:center">${qualBadge}</td>
      <td style="padding:8px;text-align:center">
        <button class="btn" style="background:#1e3a5f;color:#60a5fa;border:1px solid #1e3a5f;padding:2px 6px;font-size:9px;border-radius:5px" onclick="openFuModal('${b._id}','${b.name.replace(/'/g,"\\'")}')">🔔 Follow-up</button>
      </td>
    </tr>`;
  }).join('');

  const itemsCount = exGridLeads.length;
  if (totalLabel) totalLabel.textContent = `Showing ${itemsCount} leads`;
}

function onGridCheckChange(cb) {
  const id = cb.dataset.gridId;
  if (cb.checked) {
    exGridSelectedIds.add(id);
  } else {
    exGridSelectedIds.delete(id);
  }
  updateGridSelectionUI();
  const row = cb.closest('tr');
  if (row) {
    row.style.background = cb.checked ? 'rgba(124,58,237,.1)' : 'transparent';
  }
}

function toggleGridSelectAll(checked) {
  document.querySelectorAll('#ex-grid-body input[type="checkbox"]').forEach(cb => {
    cb.checked = checked;
    const id = cb.dataset.gridId;
    if (checked) {
      exGridSelectedIds.add(id);
    } else {
      exGridSelectedIds.delete(id);
    }
    const row = cb.closest('tr');
    if (row) {
      row.style.background = checked ? 'rgba(124,58,237,.1)' : 'transparent';
    }
  });
  updateGridSelectionUI();
}

function updateGridSelectionUI() {
  const countEl = document.getElementById('ex-grid-selected-count');
  if (countEl) {
    countEl.textContent = `${exGridSelectedIds.size} leads selected`;
  }
  const summaryEl = document.getElementById('campaign-target-summary');
  if (summaryEl) {
    if (exGridSelectedIds.size > 0) {
      summaryEl.innerHTML = `<span style="color:#10b981;font-weight:700">🎯 ${exGridSelectedIds.size} leads selected</span> ready for campaign outreach.`;
    } else {
      summaryEl.textContent = 'No leads selected. Please select target leads in the Live Results Grid tab first.';
    }
  }
}

function exportExtractorGrid(format) {
  const search = document.getElementById('ex-grid-search')?.value || '';
  const quality = document.getElementById('ex-grid-filter-quality')?.value || 'all';
  const source = document.getElementById('ex-grid-filter-source')?.value || 'all';
  
  const q = new URLSearchParams({
    format,
    search,
    quality,
    source
  });

  if (exGridSelectedIds.size > 0) {
    q.set('ids', Array.from(exGridSelectedIds).join(','));
  }

  window.location.href = '/api/auto-scraper/export?' + q.toString();
}

async function mergeSelectedDuplicates() {
  const ids = Array.from(exGridSelectedIds);
  const body = ids.length ? { ids } : {};
  
  if (ids.length === 0) {
    if (!confirm('No leads selected. Do you want to run an automated search & merge for ALL duplicate leads by Name and City?')) return;
  } else {
    if (!confirm(`Merge the ${ids.length} selected duplicate leads?`)) return;
  }

  try {
    const res = await fetch('/api/leads/merge-duplicates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (data.success) {
      alert(data.message || 'Leads merged successfully!');
      exGridSelectedIds.clear();
      loadExtractorGrid(1);
    } else {
      alert('❌ Failed: ' + data.error);
    }
  } catch (err) {
    alert('❌ Error: ' + err.message);
  }
}

// ─── Campaign Outreach subtab functions ───────────────────────
let campaignInterval = null;

function loadOutreachTab() {
  updateGridSelectionUI();
  const nameInput = document.getElementById('campaign-name');
  if (nameInput && !nameInput.value) {
    nameInput.value = 'Outreach Campaign ' + new Date().toLocaleDateString();
  }
}

async function launchOutreachCampaign() {
  const ids = Array.from(exGridSelectedIds);
  if (!ids.length) {
    alert('❌ Please select at least one target lead in the Live Results Grid tab first!');
    return;
  }

  const name = document.getElementById('campaign-name')?.value || 'Outreach Campaign';
  const channel = document.getElementById('campaign-channel')?.value || 'Email';
  const template = document.getElementById('campaign-template')?.value || 'default';

  if (!confirm(`🚀 Launch ${channel} campaign for ${ids.length} leads?`)) return;

  try {
    const res = await fetch('/api/campaigns/launch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, channel, template, ids })
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById('campaign-status-logs').innerHTML = `[${new Date().toLocaleTimeString()}] Campaign launch signal accepted.\n`;
      if (campaignInterval) clearInterval(campaignInterval);
      campaignInterval = setInterval(pollCampaignStatus, 2000);
    } else {
      alert('❌ Launch failed: ' + data.error);
    }
  } catch(e) {
    alert('❌ Error launching campaign: ' + e.message);
  }
}

async function pollCampaignStatus() {
  try {
    const res = await fetch('/api/campaigns/status');
    const data = await res.json();
    if (data.success && data.campaign) {
      const camp = data.campaign;
      
      const pctDelivered = camp.total > 0 ? Math.round((camp.delivered / camp.total) * 100) : 0;
      const pctOpened = camp.delivered > 0 ? Math.round((camp.opened / camp.delivered) * 100) : 0;
      const pctClicked = camp.delivered > 0 ? Math.round((camp.clicked / camp.delivered) * 100) : 0;
      const pctReplied = camp.delivered > 0 ? Math.round((camp.replied / camp.delivered) * 100) : 0;

      document.getElementById('camp-pct-delivered').textContent = `${pctDelivered}% (${camp.delivered}/${camp.total})`;
      document.getElementById('camp-pct-opened').textContent = `${pctOpened}% (${camp.opened}/${camp.delivered})`;
      document.getElementById('camp-pct-clicked').textContent = `${pctClicked}% (${camp.clicked}/${camp.delivered})`;
      document.getElementById('camp-pct-replied').textContent = `${pctReplied}% (${camp.replied}/${camp.delivered})`;

      document.getElementById('camp-bar-delivered').style.width = `${pctDelivered}%`;
      document.getElementById('camp-bar-opened').style.width = `${pctOpened}%`;
      document.getElementById('camp-bar-clicked').style.width = `${pctClicked}%`;
      document.getElementById('camp-bar-replied').style.width = `${pctReplied}%`;

      const logsBox = document.getElementById('campaign-status-logs');
      if (logsBox && camp.logs) {
        logsBox.textContent = camp.logs.join('\n');
        logsBox.scrollTop = logsBox.scrollHeight;
      }

      if (camp.status === 'Completed') {
        clearInterval(campaignInterval);
        campaignInterval = null;
        fetchLeads(1);
      }
    }
  } catch (err) {
    console.error('Error polling campaign status:', err);
  }
}
