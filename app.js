/* ============================================================
   DJJ Finance — front-end app
   - HyperFormula engine drives all cross-sheet formulas
   - Months stored locally (and optionally Supabase)
   - New month: clears inputs, keeps format+formulas, carries last month
   ============================================================ */

const SEED = window.DJJ_SEED;
const SHEET_ORDER = SEED.sheetOrder;
const META = SEED.meta;
const COLLATOR = new Intl.Collator();

/* ---------------- helpers ---------------- */
const $ = s => document.querySelector(s);
const colToLetter = n => { let s=''; while(n>0){ const m=(n-1)%26; s=String.fromCharCode(65+m)+s; n=(n-m-1)/26; } return s; };
const letterToCol = s => { let n=0; for(const ch of s) n=n*26+(ch.charCodeAt(0)-64); return n; };
function toast(msg, err=false){ const t=$('#toast'); t.textContent=msg; t.className='toast show'+(err?' err':''); setTimeout(()=>t.className='toast',2200); }
function isNum(v){ return v!==''&&v!==null&&v!==undefined&&!isNaN(v); }
function fmtNum(v){
  if(v===null||v===undefined||v==='') return '';
  if(typeof v==='string') return v;
  if(typeof v==='number'){
    if(Number.isInteger(v)) return v.toLocaleString('en-US');
    return v.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  }
  return String(v);
}

/* ---------------- workbook model ----------------
   A "book" = one month. Structure:
   book.sheets[name] = { rows: { rowIndex: { col: {f?, v} } }, lastRow, lastCol }
   We keep formulas (f) as source of truth; values (v) recomputed by engine.
-------------------------------------------------- */
function seedToBook(){
  const sheets={};
  for(const name of SHEET_ORDER){
    const src=SEED.sheets[name];
    const rows={};
    for(const row of src.rows){
      rows[row.r]={};
      for(const [coord,cell] of Object.entries(row.cells)){
        const m=coord.match(/^([A-Z]+)(\d+)$/);
        const col=letterToCol(m[1]);
        rows[row.r][col]= cell.f ? {f:normalizeFormula(cell.f)} : {v:cell.v};
      }
    }
    sheets[name]={rows,lastRow:src.lastRow,lastCol:src.lastCol};
  }
  return {sheets};
}
function normalizeFormula(f){
  // HyperFormula doesn't have ARRAYFORMULA; unwrap it
  f=f.replace(/=ARRAYFORMULA\((.*)\)\s*$/i,'=$1');
  return f;
}

/* ---------------- HyperFormula engine ---------------- */
let HF=null;
let HF_SHEETID={};   // sheetName -> hf sheet id
function buildEngine(book){
  if(HF){ HF.destroy(); HF=null; }
  const sheetsData={};
  HF_SHEETID={};
  for(const name of SHEET_ORDER){
    const sh=book.sheets[name];
    const arr=[];
    for(let r=1;r<=sh.lastRow;r++){
      const rowArr=[];
      const rowCells=sh.rows[r]||{};
      for(let c=1;c<=sh.lastCol;c++){
        const cell=rowCells[c];
        if(!cell){ rowArr.push(null); continue; }
        rowArr.push(cell.f!==undefined?cell.f:cell.v);
      }
      arr.push(rowArr);
    }
    sheetsData[name]=arr;
  }
  HF=HyperFormula.buildFromSheets(sheetsData,{licenseKey:'gpl-v3'});
  HF.getSheetNames().forEach(n=>{ HF_SHEETID[n]=HF.getSheetId(n); });
}
function cellValue(name,row,col){
  const id=HF_SHEETID[name];
  const v=HF.getCellValue({sheet:id,row:row-1,col:col-1});
  if(v&&typeof v==='object'&&v.type) return {__err:v.type}; // surface error type
  return v;
}
function setCell(name,row,col,raw){
  const id=HF_SHEETID[name];
  HF.setCellContents({sheet:id,row:row-1,col:col-1},raw);
}

/* ---------------- months store (local) ----------------
   localStorage key: djj_book_<YYYY-MM> = JSON of book.sheets (only {f}/{v} overrides + meta)
   We persist the *entire* sheets structure per month for fidelity.
-------------------------------------------------- */
const LS_MONTHS='djj_months';
const LS_BOOK=m=>'djj_book_'+m;
const LS_CLOUD='djj_cloud_cfg';

function listMonths(){
  const raw=localStorage.getItem(LS_MONTHS);
  let arr=raw?JSON.parse(raw):[];
  if(!arr.includes(SEED.month)) arr.push(SEED.month);
  arr=[...new Set(arr)].sort().reverse();
  return arr;
}
function saveMonthsList(arr){ localStorage.setItem(LS_MONTHS,JSON.stringify([...new Set(arr)].sort())); }
function loadBook(month){
  if(month===SEED.month){
    const saved=localStorage.getItem(LS_BOOK(month));
    if(saved) return {sheets:JSON.parse(saved)};
    return seedToBook();
  }
  const saved=localStorage.getItem(LS_BOOK(month));
  if(saved) return {sheets:JSON.parse(saved)};
  return null;
}
function saveBookLocal(month,book){
  localStorage.setItem(LS_BOOK(month),JSON.stringify(book.sheets));
  const months=listMonths(); if(!months.includes(month)) months.push(month);
  saveMonthsList(months);
}

/* ---------------- new month creation ----------------
   Strategy:
   - Clone base month's sheet structure (keeps ALL formulas + format/labels).
   - For DATA sheets: clear the transaction value rows (keep header row 1),
     leaving formulas intact. (Inputs blanked, formulas stay.)
   - For P&L sheets: shift "this month (C)" computed values into "last month (B)"
     as plain numbers (carry-forward), clear the hardcoded C inputs but keep C formulas.
   - For recon sheet: keep formulas, clear hardcoded inputs.
-------------------------------------------------- */
const PL_SHEETS=SHEET_ORDER.filter(n=>META[n].type==='pl');
function createNewMonth(newMonth, baseMonth){
  const base=loadBook(baseMonth);
  // need base computed values for carry-forward
  buildEngine(base);
  const fresh=JSON.parse(JSON.stringify(base.sheets));

  for(const name of SHEET_ORDER){
    const t=META[name].type;
    const sh=fresh[name];
    if(t==='data'){
      // keep row 1 (header) + any rows that are entirely formula (totals). Clear input values in rows>=2.
      for(let r=2;r<=sh.lastRow;r++){
        const rc=sh.rows[r]; if(!rc) continue;
        for(const c of Object.keys(rc)){
          if(rc[c].f===undefined){ delete rc[c]; } // blank inputs, keep formulas
        }
        if(Object.keys(rc).length===0) delete sh.rows[r];
      }
    } else if(t==='pl'){
      // Column B = last month, C = this month
      for(let r=1;r<=sh.lastRow;r++){
        const rc=sh.rows[r]; if(!rc) continue;
        const Bc=letterToCol('B'), Cc=letterToCol('C');
        // carry: new B = base computed C
        const baseC=cellValue(name,r,Cc);
        if(rc[Cc]!==undefined){
          if(typeof baseC==='number') rc[Bc]={v:baseC};
          // clear C inputs (hardcoded), keep C formulas
          if(rc[Cc].f===undefined) delete rc[Cc];
        }
      }
    } else if(t==='recon'){
      // keep formulas, clear hardcoded numeric inputs (keep text labels in col A,C,E,G...)
      for(let r=2;r<=sh.lastRow;r++){
        const rc=sh.rows[r]; if(!rc) continue;
        for(const c of Object.keys(rc)){
          const cell=rc[c];
          if(cell.f===undefined && typeof cell.v==='number'){ delete rc[c]; }
        }
      }
    }
  }
  const book={sheets:fresh};
  saveBookLocal(newMonth,book);
  if(CLOUD.client) cloudSaveBook(newMonth,book);
  return book;
}

/* ============================================================
   APP STATE + RENDER
   ============================================================ */
let STATE={ month:null, sheet:null, book:null, sel:null };

function init(){
  // ensure seed month persisted
  if(!localStorage.getItem(LS_BOOK(SEED.month))){
    saveBookLocal(SEED.month, seedToBook());
  }
  loadCloudCfg();
  STATE.month=listMonths()[0];
  openMonth(STATE.month);
  STATE.sheet=SHEET_ORDER[0];
  renderTabs(); renderSheet();
  wireUI();
  $('#loading').style.display='none';
  $('#app').style.display='flex';
}

function openMonth(month){
  STATE.month=month;
  STATE.book=loadBook(month);
  if(!STATE.book){ STATE.book=seedToBook(); }
  buildEngine(STATE.book);
  renderMonthSelect();
}

function renderMonthSelect(){
  const sel=$('#monthSelect'); sel.innerHTML='';
  for(const m of listMonths()){
    const o=document.createElement('option'); o.value=m; o.textContent=m.replace('-','年')+'月';
    if(m===STATE.month) o.selected=true; sel.appendChild(o);
  }
}

function renderTabs(){
  const t=$('#tabs'); t.innerHTML='';
  for(const name of SHEET_ORDER){
    const m=META[name];
    const b=document.createElement('button');
    b.className='tab t-'+m.type+(name===STATE.sheet?' active':'');
    b.innerHTML=`${m.label}<span class="badge">${m.en}</span>`;
    b.onclick=()=>{ STATE.sheet=name; STATE.sel=null; renderTabs(); renderSheet(); };
    t.appendChild(b);
  }
}

function renderSheet(){
  const name=STATE.sheet, m=META[name], sh=STATE.book.sheets[name];
  const wrap=$('#sheetWrap');
  const tagClass=m.type==='data'?'data':m.type==='recon'?'recon':'pl';
  const tagTxt=m.type==='data'?'数据填写':m.type==='recon'?'核对·自动':'损益表·自动';

  let html=`<div class="sheet-head">
    <h2>${m.label}</h2><span class="en">${m.en}</span>
    <span class="tag ${tagClass}">${tagTxt}</span></div>`;

  if(m.type==='data'){
    html+=`<div class="hint">
      <span><b>蓝色可编辑</b>单元格直接填写交易明细，下方损益表会自动汇总。</span>
      <span class="legend"><i class="input"></i>可填写</span>
      <span class="legend"><i class="formula"></i>公式（自动）</span></div>`;
  }else if(m.type==='pl'){
    html+=`<div class="hint">
      <span><b>B列=上月</b>（新建月份时自动带入），<b>C列=本月</b>（蓝色为手填费用，绿色自动来自数据表）。</span>
      <span class="legend"><i class="linked"></i>跨表自动</span>
      <span class="legend"><i class="input"></i>手填</span></div>`;
  }else{
    html+=`<div class="hint"><span>本表为<b>核对中枢</b>：自动从各数据表汇总，再供三张损益表引用。绿色为跨表公式。</span></div>`;
  }

  html+=`<div class="formula-bar" id="fbar"><span class="addr">—</span><span class="fx">点击单元格查看公式</span></div>`;
  html+=`<div class="grid-scroll"><table class="grid"><thead><tr><th class="corner"></th>`;
  for(let c=1;c<=sh.lastCol;c++) html+=`<th>${colToLetter(c)}</th>`;
  html+=`</tr></thead><tbody>`;

  for(let r=1;r<=sh.lastRow;r++){
    const rc=sh.rows[r]||{};
    html+=`<tr><td class="rowhead">${r}</td>`;
    for(let c=1;c<=sh.lastCol;c++){
      html+=renderCell(name,r,c,rc[c]);
    }
    html+=`</tr>`;
  }
  html+=`</tbody></table></div>`;
  wrap.innerHTML=html;
  attachGridHandlers();
}

function renderCell(name,r,c,cell){
  const val=cellValue(name,r,c);
  const isErr=val&&typeof val==='object'&&val.__err;
  const hasF=cell&&cell.f!==undefined;
  const isLinked=hasF&&/[!]/.test(cell.f);
  const isText=(typeof val==='string')||(cell&&typeof cell.v==='string'&&!hasF);
  const editable=cell===undefined? cellEditableEmpty(name,r,c) : (!hasF);
  let cls='';
  if(isText) cls+=' label text';
  else cls+=' num';
  if(hasF) cls+= isLinked?' linked':' formula';
  if(editable) cls+=' editable';

  let display='';
  if(isErr){ display='—'; }
  else if(isText) display = val!==null&&val!==undefined? String(val): (cell&&cell.v!==undefined?String(cell.v):'');
  else display = fmtNum(val);
  let extra='';
  if(!isErr && !isText && typeof val==='number'){
    if(c===letterToCol('E') && META[name].type==='pl' && r>=3){ display=(val*100).toLocaleString('en-US',{maximumFractionDigits:1})+'%'; extra=val<0?' pct neg':' pct pos'; }
    else if(val<0){ extra=' neg'; }
  }
  if(isErr) extra=' pct';
  const data=`data-r="${r}" data-c="${c}"`;
  return `<td class="${cls}${extra}" ${data}><div class="cell">${escapeHtml(display)}</div></td>`;
}
function cellEditableEmpty(name,r,c){
  // empty cells in data sheets (rows>=2, within input columns) are editable
  const t=META[name].type;
  if(t==='data'&&r>=2) return true;
  if(t==='pl'&&c===letterToCol('C')) return true;
  return false;
}
function escapeHtml(s){ return String(s).replace(/[&<>]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[ch])); }

/* ---------------- editing ---------------- */
function attachGridHandlers(){
  const tbody=$('#sheetWrap tbody');
  tbody.addEventListener('click',e=>{
    const td=e.target.closest('td'); if(!td||td.classList.contains('rowhead'))return;
    selectCell(td);
  });
  tbody.addEventListener('dblclick',e=>{
    const td=e.target.closest('td'); if(!td||!td.classList.contains('editable'))return;
    beginEdit(td);
  });
}
function selectCell(td){
  document.querySelectorAll('td.sel').forEach(x=>x.classList.remove('sel'));
  const r=+td.dataset.r,c=+td.dataset.c;
  STATE.sel={r,c};
  const cell=(STATE.book.sheets[STATE.sheet].rows[r]||{})[c];
  const fbar=$('#fbar');
  const addr=colToLetter(c)+r;
  if(cell&&cell.f!==undefined) fbar.innerHTML=`<span class="addr">${addr}</span><span class="fx">${escapeHtml(cell.f)}</span>`;
  else { const v=cellValue(STATE.sheet,r,c); const disp=(v&&v.__err)?'（'+v.__err+'）':(v===null||v===undefined?'（空）':String(v)); fbar.innerHTML=`<span class="addr">${addr}</span><span class="fx">${escapeHtml(disp)}</span>`; }
}
function beginEdit(td){
  const r=+td.dataset.r,c=+td.dataset.c;
  const cell=(STATE.book.sheets[STATE.sheet].rows[r]||{})[c];
  const cur=cell? (cell.f!==undefined?cell.f:cell.v) : '';
  const isText=td.classList.contains('text');
  td.classList.add('editing');
  td.innerHTML=`<input class="editor" value="${escapeHtml(cur===null?'':cur)}" />`;
  const inp=td.querySelector('input'); inp.focus(); inp.select();
  const commit=save=>{
    td.classList.remove('editing');
    if(save) applyEdit(r,c,inp.value);
    else renderSheet();
  };
  inp.addEventListener('keydown',ev=>{
    if(ev.key==='Enter'){ commit(true); moveSel(1,0); }
    else if(ev.key==='Escape') commit(false);
    else if(ev.key==='Tab'){ ev.preventDefault(); commit(true); moveSel(0,1); }
  });
  inp.addEventListener('blur',()=>commit(true));
}
function moveSel(dr,dc){
  if(!STATE.sel)return;
  const nr=STATE.sel.r+dr,nc=STATE.sel.c+dc;
  const td=document.querySelector(`td[data-r="${nr}"][data-c="${nc}"]`);
  if(td){ selectCell(td); if(td.classList.contains('editable')) beginEdit(td); }
}
function applyEdit(r,c,raw){
  const sh=STATE.book.sheets[STATE.sheet];
  if(!sh.rows[r]) sh.rows[r]={};
  raw=raw.trim();
  if(raw===''){ delete sh.rows[r][c]; setCell(STATE.sheet,r,c,null); }
  else if(raw.startsWith('=')){ sh.rows[r][c]={f:raw}; setCell(STATE.sheet,r,c,raw); }
  else if(isNum(raw)){ const n=Number(raw); sh.rows[r][c]={v:n}; setCell(STATE.sheet,r,c,n); }
  else { sh.rows[r][c]={v:raw}; setCell(STATE.sheet,r,c,raw); }
  // expand lastRow if needed
  if(r>sh.lastRow) sh.lastRow=r;
  persist();
  renderSheet();
}

/* ---------------- persistence ---------------- */
let saveTimer=null;
function persist(){
  saveBookLocal(STATE.month,STATE.book);
  setSync('saving','保存中…');
  clearTimeout(saveTimer);
  saveTimer=setTimeout(async()=>{
    if(CLOUD.client){
      try{ await cloudSaveBook(STATE.month,STATE.book); setSync('ok','已同步云端'); }
      catch(e){ setSync('err','云端失败'); }
    } else setSync('local','本地已保存');
  },600);
}

/* ============================================================
   SUPABASE CLOUD
   table: djj_books(month text primary key, data jsonb, updated_at timestamptz)
   ============================================================ */
const CLOUD={client:null,url:'',key:''};
function loadCloudCfg(){
  const raw=localStorage.getItem(LS_CLOUD); if(!raw)return;
  try{ const c=JSON.parse(raw); if(c.url&&c.key) connectCloud(c.url,c.key,true); }catch(e){}
}
function connectCloud(url,key,silent){
  try{
    CLOUD.client=window.supabase.createClient(url,key);
    CLOUD.url=url;CLOUD.key=key;
    localStorage.setItem(LS_CLOUD,JSON.stringify({url,key}));
    setSync('ok','云端已连接');
    if(!silent) cloudSyncAll();
    return true;
  }catch(e){ setSync('err','连接失败'); return false; }
}
async function cloudSaveBook(month,book){
  const {error}=await CLOUD.client.from('djj_books')
    .upsert({month,data:book.sheets,updated_at:new Date().toISOString()});
  if(error)throw error;
}
async function cloudSyncAll(){
  // pull all cloud months, merge into local list
  try{
    const {data,error}=await CLOUD.client.from('djj_books').select('month,data');
    if(error)throw error;
    const months=listMonths();
    for(const row of data){
      localStorage.setItem(LS_BOOK(row.month),JSON.stringify(row.data));
      if(!months.includes(row.month)) months.push(row.month);
    }
    saveMonthsList(months);
    // also push any local-only months
    for(const m of months){
      if(!data.find(d=>d.month===m)){ const b=loadBook(m); if(b) await cloudSaveBook(m,b); }
    }
    renderMonthSelect(); openMonth(STATE.month); renderSheet();
    toast('云端同步完成');
  }catch(e){ toast('同步失败：'+(e.message||e),true); }
}
function setSync(cls,txt){
  const el=$('#syncStatus'); el.className='sync-dot '+cls;
  el.querySelector('.txt').textContent=txt;
}

/* ============================================================
   UI WIRING
   ============================================================ */
function wireUI(){
  $('#monthSelect').onchange=e=>{ openMonth(e.target.value); renderSheet(); };

  // new month modal
  $('#newMonthBtn').onclick=()=>{
    const months=listMonths();
    const base=months[0];
    const [y,mo]=base.split('-').map(Number);
    const nd=new Date(y,mo,1); // next month
    const nm=`${nd.getFullYear()}-${String(nd.getMonth()+1).padStart(2,'0')}`;
    $('#newMonthInput').value=nm;
    const bs=$('#baseMonthSelect'); bs.innerHTML='';
    months.forEach(m=>{const o=document.createElement('option');o.value=m;o.textContent=m;bs.appendChild(o);});
    $('#newMonthModal').classList.add('show');
  };
  $('#newMonthCancel').onclick=()=>$('#newMonthModal').classList.remove('show');
  $('#newMonthConfirm').onclick=()=>{
    const nm=$('#newMonthInput').value, base=$('#baseMonthSelect').value;
    if(!nm){toast('请选择月份',true);return;}
    if(listMonths().includes(nm)){toast('该月份已存在',true);return;}
    createNewMonth(nm,base);
    $('#newMonthModal').classList.remove('show');
    openMonth(nm); renderSheet();
    toast(`已创建 ${nm}，格式与公式已保留，数据已清空`);
  };

  // cloud modal
  $('#cloudBtn').onclick=()=>{
    $('#supaUrl').value=CLOUD.url; $('#supaKey').value=CLOUD.key;
    $('#cloudModal').classList.add('show');
  };
  $('#cloudCancel').onclick=()=>$('#cloudModal').classList.remove('show');
  $('#cloudConnect').onclick=()=>{
    const url=$('#supaUrl').value.trim(), key=$('#supaKey').value.trim();
    if(!url||!key){toast('请填写 URL 和 Key',true);return;}
    if(connectCloud(url,key,false)) $('#cloudModal').classList.remove('show');
  };
  $('#cloudDisconnect').onclick=()=>{
    CLOUD.client=null;CLOUD.url='';CLOUD.key='';
    localStorage.removeItem(LS_CLOUD);
    setSync('local','本地模式'); $('#cloudModal').classList.remove('show');
    toast('已断开云端');
  };

  // keyboard nav
  document.addEventListener('keydown',e=>{
    if(!STATE.sel)return;
    if(document.querySelector('input.editor'))return;
    const map={ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1]};
    if(map[e.key]){ e.preventDefault(); moveSel(...map[e.key]); }
    else if(e.key==='Enter'){ const td=document.querySelector(`td[data-r="${STATE.sel.r}"][data-c="${STATE.sel.c}"]`); if(td&&td.classList.contains('editable'))beginEdit(td); }
  });
}

window.addEventListener('DOMContentLoaded',init);
