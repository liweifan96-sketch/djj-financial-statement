/* ============================================================
   DJJ Finance — v2 front-end
   - Layout-aware grid (real column names, no A/B/C/1/2/3)
   - Two-level grouped headers (store grouping)
   - Currency formatting with $ + thousands separators
   - Store filter dropdown for vertical sheets
   - Dynamic month headers in P&L (上月/本月 -> real YYYY.MM)
   - HyperFormula engine drives all cross-sheet formulas
   - Local + optional Supabase persistence
   ============================================================ */

const SEED = window.DJJ_SEED;
const LAYOUTS = window.DJJ_LAYOUTS;
const SHEET_ORDER = SEED.sheetOrder;
const META = SEED.meta;

/* ---------------- helpers ---------------- */
const $ = s => document.querySelector(s);
const colToLetter = n => { let s=''; while(n>0){ const m=(n-1)%26; s=String.fromCharCode(65+m)+s; n=(n-m-1)/26; } return s; };
const letterToCol = s => { let n=0; for(const ch of s) n=n*26+(ch.charCodeAt(0)-64); return n; };
function toast(msg, err=false){ const t=$('#toast'); t.textContent=msg; t.className='toast show'+(err?' err':''); setTimeout(()=>t.className='toast',2200); }
function isNum(v){ return v!==''&&v!==null&&v!==undefined&&!isNaN(v); }
function escapeHtml(s){ return String(s).replace(/[&<>]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[ch])); }

function fmtMoney(v){
  if(v===null||v===undefined||v==='') return '';
  if(typeof v!=='number') return String(v);
  const neg = v<0;
  const abs = Math.abs(v);
  const s = abs.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  return (neg?'-':'') + '$' + s;
}
function fmtNumPlain(v){
  if(v===null||v===undefined||v==='') return '';
  if(typeof v!=='number') return String(v);
  if(Number.isInteger(v)) return v.toLocaleString('en-US');
  return v.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
}
function fmtPct(v){
  if(v===null||v===undefined||v==='') return '';
  if(typeof v!=='number') return String(v);
  return (v*100).toLocaleString('en-US',{maximumFractionDigits:1})+'%';
}
function shiftMonth(ym,delta){
  const [y,m]=ym.split('-').map(Number);
  const d=new Date(y,m-1+delta,1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
function monthLabel(ym){ const [y,m]=ym.split('-'); return `${y}.${m}`; }

/* ---------------- workbook model ---------------- */
function seedToBook(){
  const sheets={};
  for(const name of SHEET_ORDER){
    const src=SEED.sheets[name];
    const layout = LAYOUTS[name];
    const clearSeed = layout && layout.clearSeedData;
    const rows={};
    for(const row of src.rows){
      // For sheets marked clearSeedData, drop data rows; keep only header (row 1)
      if(clearSeed && row.r >= 2) continue;
      rows[row.r]={};
      for(const [coord,cell] of Object.entries(row.cells)){
        const m=coord.match(/^([A-Z]+)(\d+)$/);
        const col=letterToCol(m[1]);
        rows[row.r][col]= cell.f ? {f:normalizeFormula(cell.f)} : {v:cell.v};
      }
    }
    // For cleared sheets, reset lastRow to header + a small buffer
    const lastRow = clearSeed ? 1 : src.lastRow;
    sheets[name]={rows,lastRow,lastCol:src.lastCol};
  }
  return {sheets};
}
function normalizeFormula(f){ return f.replace(/=ARRAYFORMULA\((.*)\)\s*$/i,'=$1'); }

/* ---------------- HyperFormula engine ---------------- */
let HF=null;
let HF_SHEETID={};
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
  if(v&&typeof v==='object'&&v.type) return {__err:v.type};
  return v;
}
function setCell(name,row,col,raw){
  const id=HF_SHEETID[name];
  HF.setCellContents({sheet:id,row:row-1,col:col-1},raw);
}

/* ---------------- months store ---------------- */
const LS_MONTHS='djj_months';
const LS_BOOK=m=>'djj_book_'+m;
const LS_CLOUD='djj_cloud_cfg';
function listMonths(){
  const raw=localStorage.getItem(LS_MONTHS);
  let arr=raw?JSON.parse(raw):[];
  if(!arr.includes(SEED.month)) arr.push(SEED.month);
  return [...new Set(arr)].sort().reverse();
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

/* ---------------- new month creation ---------------- */
function createNewMonth(newMonth, baseMonth){
  const base=loadBook(baseMonth);
  buildEngine(base);
  const fresh=JSON.parse(JSON.stringify(base.sheets));
  for(const name of SHEET_ORDER){
    const t=META[name].type;
    const sh=fresh[name];
    if(t==='data'){
      for(let r=2;r<=sh.lastRow;r++){
        const rc=sh.rows[r]; if(!rc) continue;
        for(const c of Object.keys(rc)){
          if(rc[c].f===undefined){ delete rc[c]; }
        }
        if(Object.keys(rc).length===0) delete sh.rows[r];
      }
    } else if(t==='pl'){
      for(let r=1;r<=sh.lastRow;r++){
        const rc=sh.rows[r]; if(!rc) continue;
        const Bc=2, Cc=3;
        const baseC=cellValue(name,r,Cc);
        if(rc[Cc]!==undefined){
          if(typeof baseC==='number') rc[Bc]={v:baseC};
          if(rc[Cc].f===undefined) delete rc[Cc];
        }
      }
    } else if(t==='recon'){
      for(let r=2;r<=sh.lastRow;r++){
        const rc=sh.rows[r]; if(!rc) continue;
        for(const c of Object.keys(rc)){
          if(rc[c].f===undefined && typeof rc[c].v==='number'){ delete rc[c]; }
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
let STATE={ month:null, sheet:null, book:null, sel:null, storeFilter:'全部' };

const SEED_VERSION = '2026-04-cleanup-v1';   // bump to re-apply clearSeedData cleanups

function init(){
  if(!localStorage.getItem(LS_BOOK(SEED.month))){
    saveBookLocal(SEED.month, seedToBook());
  }
  // One-time cleanup: if the seed version stored differs, re-apply layout's clearSeedData
  if(localStorage.getItem('djj_seed_version') !== SEED_VERSION){
    applySeedCleanups();
    localStorage.setItem('djj_seed_version', SEED_VERSION);
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

function applySeedCleanups(){
  // For each month book in localStorage, drop data rows in sheets marked clearSeedData
  const months = listMonths();
  for(const m of months){
    const saved = localStorage.getItem(LS_BOOK(m));
    if(!saved) continue;
    let book;
    try{ book = {sheets: JSON.parse(saved)}; } catch(e){ continue; }
    let changed = false;
    for(const name of SHEET_ORDER){
      const layout = LAYOUTS[name];
      if(!layout || !layout.clearSeedData) continue;
      const sh = book.sheets[name];
      if(!sh) continue;
      // wipe row 2+ (keep header row 1)
      const newRows = {};
      if(sh.rows['1']) newRows['1'] = sh.rows['1'];
      else if(sh.rows[1]) newRows[1] = sh.rows[1];
      sh.rows = newRows;
      sh.lastRow = 1;
      changed = true;
    }
    if(changed) localStorage.setItem(LS_BOOK(m), JSON.stringify(book.sheets));
  }
}

function openMonth(month){
  STATE.month=month;
  STATE.book=loadBook(month);
  if(!STATE.book) STATE.book=seedToBook();
  buildEngine(STATE.book);
  renderMonthSelect();
}

function renderMonthSelect(){
  const sel=$('#monthSelect'); sel.innerHTML='';
  for(const m of listMonths()){
    const o=document.createElement('option'); o.value=m; o.textContent=monthLabel(m);
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
    b.onclick=()=>{ STATE.sheet=name; STATE.sel=null; STATE.storeFilter='全部'; renderTabs(); renderSheet(); };
    t.appendChild(b);
  }
}

/* ---------------- main sheet renderer ---------------- */
function renderSheet(){
  const name=STATE.sheet, m=META[name], sh=STATE.book.sheets[name];
  const layout=LAYOUTS[name] || {headerRows:1,dataStartRow:2,useRow1AsHeader:true,columnNames:{},moneyCols:[],labelCols:[]};
  const wrap=$('#sheetWrap');
  const tagClass=m.type==='data'?'data':m.type==='recon'?'recon':'pl';
  const tagTxt=m.type==='data'?'数据填写':m.type==='recon'?'核对·自动':'损益表·自动';

  const sheetTitle = name.replace(/^\d{4}\.\d{2}月/,'');
  let html=`<div class="sheet-head">
    <h2>${sheetTitle}</h2><span class="en">${m.en}</span>
    <span class="tag ${tagClass}">${tagTxt}</span>`;
  if(layout.storeFilterCol){
    const stores=collectStores(sh,layout.storeFilterCol);
    html+=`<div class="store-filter">
      <label>门店筛选</label>
      <select id="storeFilter">
        <option value="全部">全部门店</option>
        ${stores.map(s=>`<option value="${escapeHtml(s)}"${s===STATE.storeFilter?' selected':''}>${escapeHtml(s)}</option>`).join('')}
      </select>
    </div>`;
  }
  html+=`</div>`;

  if(m.type==='data'){
    html+=`<div class="hint">
      <span><b>白色单元格可填写</b>，绿色为自动计算。</span>
      <span class="legend"><i class="input"></i>可填写</span>
      <span class="legend"><i class="formula"></i>公式自动</span></div>`;
  }else if(m.type==='pl'){
    const lm=monthLabel(shiftMonth(STATE.month,-1)), tm=monthLabel(STATE.month);
    html+=`<div class="hint">
      <span><b>${lm}</b> = 上月对比（新建月份自动带入），<b>${tm}</b> = 本月（蓝色手填，绿色自动）</span>
      <span class="legend"><i class="linked"></i>跨表自动</span>
      <span class="legend"><i class="input"></i>手填</span></div>`;
  }else{
    html+=`<div class="hint"><span>本表为<b>核对中枢</b>：自动从各数据表汇总，再供三张损益表引用。</span></div>`;
  }

  html+=`<div class="formula-bar" id="fbar"><span class="addr">—</span><span class="fx">点击单元格查看公式</span></div>`;
  html+=`<div class="grid-scroll"><table class="grid">`;
  html+=renderHeader(name,layout);
  html+=renderBody(name,sh,layout);
  html+=`</table></div>`;
  wrap.innerHTML=html;
  attachGridHandlers();
}

function collectStores(sh,col){
  const set=new Set();
  for(let r=2;r<=sh.lastRow;r++){
    const rc=sh.rows[r]; if(!rc) continue;
    const cell=rc[col]; if(!cell) continue;
    const v=cell.v; if(typeof v==='string' && v.trim()) set.add(v.trim());
  }
  return [...set].sort();
}

/* ---------------- header rendering ---------------- */
function renderHeader(name,layout){
  const isManagedList = !!layout.addRowButton;
  let html='<thead>';
  if(layout.useRow1AsHeader){
    const sh=STATE.book.sheets[name];
    const row1=sh.rows[1]||{};
    const visibleCols=[];
    for(let c=1;c<=sh.lastCol;c++){
      if(layout.hideCols && layout.hideCols.includes(c)) continue;
      visibleCols.push(c);
    }
    html+='<tr>';
    if(isManagedList) html+=`<th class="rowctrl"></th>`;
    for(const c of visibleCols){
      const lbl = (layout.columnNames && layout.columnNames[c])
        || (row1[c] && row1[c].v) || '';
      const clean = String(lbl).replace(/\s+/g,' ').trim();
      html+=`<th data-col="${c}"><div class="hcell">${escapeHtml(clean)}</div></th>`;
    }
    html+='</tr></thead>';
    return html;
  }
  const groups = layout.groups || [];
  html+='<tr class="hgroup">';
  for(const g of groups){
    const visCols = g.cols.filter(c=>!(layout.hideCols||[]).includes(c));
    if(!visCols.length) continue;
    if(g.flat){
      html+=`<th class="g-${g.color}" colspan="${visCols.length}" rowspan="2"><div class="hcell">${escapeHtml(g.label)}</div></th>`;
    } else {
      html+=`<th class="g-${g.color}" colspan="${visCols.length}"><div class="hcell">${escapeHtml(g.label)}</div></th>`;
    }
  }
  html+='</tr>';
  html+='<tr class="hsub">';
  for(const g of groups){
    if(g.flat) continue;
    const visCols = g.cols.filter(c=>!(layout.hideCols||[]).includes(c));
    visCols.forEach((c)=>{
      let sub = g.subHeaders[g.cols.indexOf(c)] || '';
      if(layout.dynamicHeaders && layout.dynamicHeaders[c]){
        const kind=layout.dynamicHeaders[c];
        if(kind==='lastMonth') sub=monthLabel(shiftMonth(STATE.month,-1));
        else if(kind==='thisMonth') sub=monthLabel(STATE.month);
      }
      html+=`<th class="g-${g.color} sub" data-col="${c}"><div class="hcell">${escapeHtml(sub)}</div></th>`;
    });
  }
  html+='</tr></thead>';
  return html;
}

/* ---------------- body rendering ---------------- */
function renderBody(name,sh,layout){
  let html='<tbody>';
  const start = layout.dataStartRow || 2;
  const allCols=[];
  if(layout.useRow1AsHeader){
    for(let c=1;c<=sh.lastCol;c++){
      if((layout.hideCols||[]).includes(c)) continue;
      allCols.push(c);
    }
  } else {
    for(const g of layout.groups||[]){
      for(const c of g.cols){
        if(!(layout.hideCols||[]).includes(c)) allCols.push(c);
      }
    }
  }

  const filterCol = layout.storeFilterCol;
  const filtering = filterCol && STATE.storeFilter && STATE.storeFilter!=='全部';
  const hideEmptyRows = META[name].type==='pl' || META[name].type==='recon';

  // For user-managed list sheets (addRowButton:true), only show rows with data
  // + 1 trailing empty row as input entry. The ➕ button adds more.
  const DEFAULT_EMPTY_ROWS = 1;
  const isManagedList = !!layout.addRowButton;

  // First pass: determine which rows have data (so we know how many empties to append)
  let lastDataRow = start - 1;
  if(isManagedList){
    for(let r=start;r<=sh.lastRow;r++){
      const rc=sh.rows[r]||{};
      const has = allCols.some(c=>{
        if(c===layout.autoSerialCol||c===layout.autoMonthCol) return false;
        return rc[c]!=null;
      });
      if(has) lastDataRow = r;
    }
  }
  // For managed lists: render at least 1 empty row beyond the last data row.
  // sh.lastRow grows with ➕, shrinks with −.
  // On fresh load: lastRow=1 (header only), so we want at least row 2 to appear.
  let renderUntil;
  if(isManagedList){
    const minEnd = Math.max(lastDataRow + DEFAULT_EMPTY_ROWS, start);
    renderUntil = Math.max(sh.lastRow, minEnd);
    // Sync sh.lastRow up if we're virtually extending — keeps ➕/− consistent
    if(renderUntil > sh.lastRow) sh.lastRow = renderUntil;
  } else {
    renderUntil = sh.lastRow;
  }

  // Count actual data rows for auto-serial
  let serialCounter = 0;
  for(let r=start;r<=renderUntil;r++){
    const rc=sh.rows[r]||{};
    if(filtering){
      const cell=rc[filterCol];
      if(!cell || (cell.v||'').toString().trim()!==STATE.storeFilter) continue;
    }
    if(hideEmptyRows){
      const has = allCols.some(c => rc[c] || isMeaningful(name,r,c));
      if(!has){ const span=allCols.length+(isManagedList?1:0); html+=`<tr class="empty"><td colspan="${span}">&nbsp;</td></tr>`; continue; }
    }
    // Determine whether to show a serial for this row
    const nonAutoHasData = allCols.some(c=>{
      if(c===layout.autoSerialCol||c===layout.autoMonthCol) return false;
      return rc[c]!=null;
    });
    let rowSerial = null;
    if(layout.autoSerialCol){
      // In managed lists, show serial on every row (incl. empty placeholders).
      // In non-managed sheets, only show serial on rows with data.
      if(isManagedList || nonAutoHasData){ serialCounter++; rowSerial = serialCounter; }
    }

    let rowCls='';
    const firstLabelCol = (layout.labelCols && layout.labelCols[0]) || 1;
    const labelCell = rc[firstLabelCol];
    const labelVal = labelCell ? (labelCell.v||'') : '';
    if(typeof labelVal==='string'){
      if(/^(Total|总|合计|净利润|毛利合计|利润|gross profit|净利)/i.test(labelVal.trim())) rowCls=' total';
    }
    // For managed list sheets: row is "empty" (deletable) if no non-auto cell has data
    const isRowEmpty = isManagedList && !nonAutoHasData;
    if(isManagedList) rowCls += ' mgrow';
    if(isRowEmpty) rowCls += ' rowempty';

    html+=`<tr class="${rowCls}" data-r="${r}">`;
    // Delete-row affordance (shows on hover, only for empty rows in managed lists)
    if(isManagedList){
      html+=`<td class="rowctrl"><button class="btn-delrow" data-r="${r}" title="删除此空行">−</button></td>`;
    }
    for(const c of allCols){
      html+=renderCell(name,r,c,rc[c],layout,{rowSerial});
    }
    html+=`</tr>`;
  }

  // ➕ Add row button (just before footer)
  if(layout.addRowButton){
    const span = allCols.length + 1; // +1 for rowctrl col
    html+=`<tr class="addrow"><td colspan="${span}">
      <button class="btn-addrow" id="btnAddRow">＋ 插入一行</button>
    </td></tr>`;
  }

  // Footer row
  if(layout.footer){
    html+=`<tr class="footer-row">`;
    if(isManagedList) html+=`<td class="rowctrl"></td>`;
    for(const c of allCols){
      const f = layout.footer.cells[c];
      if(!f){ html+=`<td></td>`; continue; }
      if(f.kind==='label'){
        html+=`<td class="footer-label"><div class="cell">${escapeHtml(f.label)}</div></td>`;
      } else if(f.kind==='auto'){
        // count non-empty cells in source column
        let count=0;
        for(let r=start;r<=sh.lastRow;r++){
          const rc=sh.rows[r]||{};
          if(filtering){
            const cell=rc[filterCol];
            if(!cell || (cell.v||'').toString().trim()!==STATE.storeFilter) continue;
          }
          const sc = rc[f.sourceCol];
          if(sc && sc.v!=null && String(sc.v).trim()!=='') count++;
        }
        html+=`<td class="footer-auto"><div class="cell"><b>${escapeHtml(f.label)}：</b>${count}</div></td>`;
      } else if(f.kind==='input'){
        // value comes from a special footer-input store keyed by sheet+month+col
        const key = `${name}__${STATE.month}__footer_${c}`;
        const stored = localStorage.getItem('djj_finput_'+key) || '';
        html+=`<td class="footer-input"><div class="cell"><b>${escapeHtml(f.label)}：</b>
          <input class="finput" data-key="${escapeHtml(key)}" value="${escapeHtml(stored)}" placeholder="${escapeHtml(f.placeholder||'')}" />
        </div></td>`;
      }
    }
    html+=`</tr>`;
  }

  html+='</tbody>';
  return html;
}
function isMeaningful(name,r,c){
  const v=cellValue(name,r,c);
  if(v===null||v===undefined||v==='') return false;
  if(v&&v.__err) return false;
  return true;
}

function renderCell(name,r,c,cell,layout,opts){
  opts = opts || {};
  const val=cellValue(name,r,c);
  const isErr=val&&typeof val==='object'&&val.__err;
  const hasF=cell&&cell.f!==undefined;
  const isLinked=hasF&&/[!]/.test(cell.f);

  const isLabelCol = (layout.labelCols||[]).includes(c);
  const isMoneyCol = (layout.moneyCols||[]).includes(c);
  const isPctCol = (layout.pctCols||[]).includes(c);
  const isDateCol = (layout.dateCols||[]).includes(c);

  // Auto-filled columns: serial number, current month
  const isAutoSerial = layout.autoSerialCol===c;
  const isAutoMonth = layout.autoMonthCol===c;
  const isDropdown = layout.dropdowns && layout.dropdowns[c];

  // Auto cols are not editable; the value is computed at render time
  let autoVal = null;
  if(isAutoSerial && opts.rowSerial!=null) autoVal = opts.rowSerial;
  if(isAutoMonth) autoVal = monthLabel(STATE.month);

  const editable = !hasF && !isAutoSerial && !isAutoMonth;
  const isText = isLabelCol || isDateCol || isAutoMonth || isDropdown || (typeof val==='string');

  let cls='';
  if(isText) cls+=' label text';
  else cls+=' num';
  if(hasF) cls+= isLinked?' linked':' formula';
  if(isAutoSerial || isAutoMonth) cls+=' auto';
  if(isDropdown) cls+=' dropdown';
  if(editable) cls+=' editable';

  let display='';
  if(autoVal!=null){ display=String(autoVal); }
  else if(isErr){ display='—'; }
  else if(val===null||val===undefined||val===''){ display=''; }
  else if(isText){ display=String(val); }
  else if(isPctCol){ display=fmtPct(val); }
  else if(isMoneyCol){ display=fmtMoney(val); }
  else if(typeof val==='number'){ display=fmtNumPlain(val); }
  else { display=String(val); }

  let extra='';
  if(isErr) extra=' pct';
  else if(typeof val==='number' && val<0) extra=' neg';
  else if(typeof val==='number' && val>0 && isPctCol) extra=' pos';

  const data=`data-r="${r}" data-c="${c}"`;
  return `<td class="${cls}${extra}" ${data}><div class="cell">${escapeHtml(display)}</div></td>`;
}

/* ---------------- editing ---------------- */
function attachGridHandlers(){
  const tbody=$('#sheetWrap tbody');
  if(!tbody) return;

  // Single click handler with clear priority
  tbody.addEventListener('click',e=>{
    // 1. ➕ add row button
    if(e.target.closest('#btnAddRow')){
      e.preventDefault(); e.stopPropagation();
      insertRowAtEnd();
      return;
    }
    // 2. − delete row button
    const delBtn = e.target.closest('.btn-delrow');
    if(delBtn){
      e.preventDefault(); e.stopPropagation();
      const r = +delBtn.dataset.r;
      deleteRow(r);
      return;
    }
    // 3. ignore footer-input clicks
    if(e.target.closest('input.finput')) return;
    // 4. find the td
    const td=e.target.closest('td'); if(!td) return;
    if(td.closest('tr.addrow') || td.closest('tr.footer-row')) return;
    if(td.classList.contains('rowctrl')) return;
    selectCell(td);
    if(td.classList.contains('dropdown') && td.classList.contains('editable')){
      beginEdit(td);
    }
  });

  tbody.addEventListener('dblclick',e=>{
    const td=e.target.closest('td'); if(!td)return;
    if(td.closest('tr.addrow') || td.closest('tr.footer-row')) return;
    if(td.classList.contains('rowctrl')) return;
    if(!td.classList.contains('editable')) return;
    if(td.classList.contains('dropdown')) return;
    beginEdit(td);
  });

  tbody.querySelectorAll('input.finput').forEach(inp=>{
    inp.addEventListener('input',e=>{
      const k=e.target.dataset.key, v=e.target.value;
      if(v.trim()==='') localStorage.removeItem('djj_finput_'+k);
      else localStorage.setItem('djj_finput_'+k, v);
    });
  });
  const sf=$('#storeFilter');
  if(sf){ sf.onchange=e=>{ STATE.storeFilter=e.target.value; renderSheet(); }; }
}

function deleteRow(r){
  const sh=STATE.book.sheets[STATE.sheet];
  // Safety: only delete empty rows
  const rc = sh.rows[r];
  const layout = LAYOUTS[STATE.sheet];
  if(rc){
    const hasUserData = Object.entries(rc).some(([col, cell])=>{
      const c = +col;
      if(c===layout.autoSerialCol || c===layout.autoMonthCol) return false;
      if(cell.f !== undefined) return true;
      return cell.v !== null && cell.v !== undefined && String(cell.v).trim() !== '';
    });
    if(hasUserData){ toast('该行有内容，不能直接删除', true); return; }
    delete sh.rows[r];
  }
  // Shift all rows after r up by 1 (only if we're not at the tail)
  for(let i=r+1; i<=sh.lastRow; i++){
    if(sh.rows[i]){
      sh.rows[i-1] = sh.rows[i];
      delete sh.rows[i];
    }
  }
  sh.lastRow = Math.max(1, sh.lastRow - 1);
  persist();
  renderSheet();
}

function insertRowAtEnd(){
  const sh=STATE.book.sheets[STATE.sheet];
  sh.lastRow = sh.lastRow + 1;
  persist();
  renderSheet();
  setTimeout(()=>{
    const td=document.querySelector(`tr:not(.addrow):not(.footer-row) td.editable[data-r="${sh.lastRow}"]`);
    if(td){ selectCell(td); beginEdit(td); }
  },50);
}
function selectCell(td){
  document.querySelectorAll('td.sel').forEach(x=>x.classList.remove('sel'));
  td.classList.add('sel');
  const r=+td.dataset.r,c=+td.dataset.c;
  if(isNaN(r)||isNaN(c)) return;
  STATE.sel={r,c};
  const cell=(STATE.book.sheets[STATE.sheet].rows[r]||{})[c];
  const fbar=$('#fbar');
  const addr=`行${r}·${getColLabel(c)}`;
  if(cell&&cell.f!==undefined) fbar.innerHTML=`<span class="addr">${escapeHtml(addr)}</span><span class="fx">${escapeHtml(cell.f)}</span>`;
  else {
    const v=cellValue(STATE.sheet,r,c);
    const disp=(v&&v.__err)?'（'+v.__err+'）':(v===null||v===undefined||v===''?'（空）':String(v));
    fbar.innerHTML=`<span class="addr">${escapeHtml(addr)}</span><span class="fx">${escapeHtml(disp)}</span>`;
  }
}
function getColLabel(c){
  const layout=LAYOUTS[STATE.sheet];
  if(!layout) return colToLetter(c);
  if(layout.columnNames && layout.columnNames[c]) return layout.columnNames[c];
  if(layout.groups){
    for(const g of layout.groups){
      const idx=g.cols.indexOf(c);
      if(idx>=0) return g.label+'·'+(g.subHeaders[idx]||colToLetter(c));
    }
  }
  return colToLetter(c);
}
function beginEdit(td){
  const r=+td.dataset.r,c=+td.dataset.c;
  const cell=(STATE.book.sheets[STATE.sheet].rows[r]||{})[c];
  const cur=cell? (cell.f!==undefined?cell.f:cell.v) : '';
  const layout=LAYOUTS[STATE.sheet];
  const dropdownOpts = layout && layout.dropdowns && layout.dropdowns[c];

  td.classList.add('editing');
  if(dropdownOpts){
    const opts = ['',...dropdownOpts].map(o=>`<option value="${escapeHtml(o)}"${o===cur?' selected':''}>${escapeHtml(o||'— 选择 —')}</option>`).join('');
    td.innerHTML=`<select class="editor dropdown-editor">${opts}</select>`;
    const sel=td.querySelector('select'); sel.focus();
    let committed=false;
    const commit=save=>{
      if(committed) return; committed=true;
      td.classList.remove('editing');
      if(save) applyEdit(r,c,sel.value);
      else renderSheet();
    };
    sel.addEventListener('change',()=>commit(true));
    sel.addEventListener('blur',()=>commit(true));
    sel.addEventListener('keydown',ev=>{ if(ev.key==='Escape') commit(false); });
    return;
  }

  td.innerHTML=`<input class="editor" value="${escapeHtml(cur===null?'':cur)}" />`;
  const inp=td.querySelector('input'); inp.focus(); inp.select();
  let committed=false;
  const commit=save=>{
    if(committed) return; committed=true;
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

/* ---------------- supabase ---------------- */
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
  try{
    const {data,error}=await CLOUD.client.from('djj_books').select('month,data');
    if(error)throw error;
    const months=listMonths();
    for(const row of data){
      localStorage.setItem(LS_BOOK(row.month),JSON.stringify(row.data));
      if(!months.includes(row.month)) months.push(row.month);
    }
    saveMonthsList(months);
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

/* ---------------- UI wiring ---------------- */
function wireUI(){
  $('#monthSelect').onchange=e=>{ openMonth(e.target.value); renderSheet(); };
  $('#newMonthBtn').onclick=()=>{
    const months=listMonths();
    const base=months[0];
    const nm=shiftMonth(base,1);
    $('#newMonthInput').value=nm;
    const bs=$('#baseMonthSelect'); bs.innerHTML='';
    months.forEach(m=>{const o=document.createElement('option');o.value=m;o.textContent=monthLabel(m);bs.appendChild(o);});
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
    toast(`已创建 ${monthLabel(nm)}，格式与公式已保留，数据已清空`);
  };
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
  document.addEventListener('keydown',e=>{
    if(!STATE.sel)return;
    if(document.querySelector('input.editor'))return;
    const map={ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1]};
    if(map[e.key]){ e.preventDefault(); moveSel(...map[e.key]); }
    else if(e.key==='Enter'){ const td=document.querySelector(`td[data-r="${STATE.sel.r}"][data-c="${STATE.sel.c}"]`); if(td&&td.classList.contains('editable'))beginEdit(td); }
  });
}

window.addEventListener('DOMContentLoaded',init);
