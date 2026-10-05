/* ============ JavaScript ============ */
const KEY = "website-notepad-v1";
const PRI = {urgent:"Urgent", normal:"Normal", low:"Low Priority"};
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS = ["Sun","Mon","Tue","Wed","Thurs","Fri","Sat"];
const $ = id => document.getElementById(id);

/* ---------- helpers ---------- */
const pad = n => String(n).padStart(2,"0");
const iso = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parseISO = s => { const [y,m,d] = s.split("-").map(Number); return new Date(y,m-1,d); };
const fmt12 = (h,m) => `${h%12||12}:${pad(m)} ${h<12?"AM":"PM"}`;
const fmtHM = s => { const [h,m] = s.split(":").map(Number); return fmt12(h,m); };
const fmtTs = ts => { const d = new Date(ts); return fmt12(d.getHours(), d.getMinutes()); };
const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,6);

/* ---------- state + storage ---------- */
let tasks = [];
const today = new Date();
let selected = iso(today);
let view = new Date(today.getFullYear(), today.getMonth(), 1);
let editing = false;
let activeId = null, tick = null;

function load(){
  try { tasks = JSON.parse(localStorage.getItem(KEY)) || []; } catch(e){ tasks = []; }
}
function save(){ try { localStorage.setItem(KEY, JSON.stringify(tasks)); } catch(e){} }

/* ---------- render list ---------- */
const fmtDur = ms => { const m = Math.max(1, Math.round(ms/60000)); return m >= 60 ? `${Math.floor(m/60)} hr ${m%60} min` : `${m} min`; };
const longDate = s => { const d = parseISO(s); return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`; };
const elapsedOf = t => (t.acc || 0) + (t.resumeAt ? Date.now() - t.resumeAt : 0);
const show = id => $(id).classList.add("open"), hide = id => $(id).classList.remove("open");
const isOpen = id => $(id).classList.contains("open");
const acts = t => `${t.finishedAt ? "" : `<button class="pill" data-edit="${t.id}">✎ Edit</button>`}<button class="pill" data-delete="${t.id}">🗑 Delete</button>`;

function taskHTML(t){
  const done = !!t.finishedAt, run = t.startedAt && !done, b = t.bring || [], n = b.filter(i => i.packed).length;
  return `<article class="task ${t.priority} ${done?"done":""} ${run?"run":""}" data-id="${t.id}" tabindex="0" role="button" aria-label="Details: ${esc(t.title)}">
    <span class="pri">${PRI[t.priority]}</span>
    <span class="time">${done && t.startedAt ? fmtTs(t.startedAt) : fmtHM(t.time)}</span>
    <button class="chk" data-open="${t.id}" aria-label="${done?"Completed":"Complete task or open timer"}" ${done?"disabled":""}></button>
    <span class="ttl">${esc(t.title)}</span>
    ${done ? `<span class="fin">✔ ${fmtTs(t.finishedAt)}${t.startedAt ? " · " + fmtDur(elapsedOf(t)) : ""}</span>` : (b.length ? `<span class="meta">🎒 ${n}/${b.length}</span>` : "")}
    ${editing ? `<div class="acts">${acts(t)}</div>` : ""}
  </article>`;
}
function render(){
  const d = parseISO(selected);
  $("dateTitle").textContent = `${MONTHS[d.getMonth()].toUpperCase()} ${d.getDate()}, ${d.getFullYear()} - ${DAYS[d.getDay()]}`;
  const day = tasks.filter(t => t.date === selected);
  const pend = day.filter(t => !t.finishedAt).sort((a,b) => a.time.localeCompare(b.time));
  const comp = day.filter(t => t.finishedAt).sort((a,b) => a.finishedAt - b.finishedAt);
  $("pending").innerHTML = pend.map(taskHTML).join("") || `<p class="empty">No tasks for this day. Add one with the form.</p>`;
  $("completed").innerHTML = comp.map(taskHTML).join("") || `<p class="empty">Finished tasks will show up here.</p>`;
  $("editBtn").textContent = editing ? "Done" : "Edit";
  renderCal();
}

/* ---------- calendar ---------- */
function renderCal(){
  const y = view.getFullYear(), m = view.getMonth();
  const sel = parseISO(selected);
  $("calBig").innerHTML = `${MONTHS[sel.getMonth()]} </sup> ${sel.getDate()} <sup>${sel.getFullYear()}`;
  if(!$("cMonth").options.length) $("cMonth").innerHTML = MONTHS.map((n,i) => `<option value="${i}">${n}</option>`).join("");
  $("cMonth").value = m; $("cYear").value = y;
  const dim = new Date(y, m+1, 0).getDate();
  const sd = selected.startsWith(`${y}-${pad(m+1)}-`) ? +selected.slice(8) : 0;
  $("cDay").innerHTML = '<option value="">Day</option>' + Array.from({length:dim}, (_, i) => `<option value="${i+1}">${i+1}</option>`).join("");
  $("cDay").value = sd || "";
  const first = new Date(y,m,1).getDay(), count = new Date(y,m+1,0).getDate();
  let h = "SMTWTFS".split("").map(c => `<div class="dow">${c}</div>`).join("");
  h += "<span></span>".repeat(first);
  for(let i=1;i<=count;i++){
    const k = `${y}-${pad(m+1)}-${pad(i)}`;
    h += `<button class="day ${k===selected?"sel":""} ${k===iso(today)?"today":""}" data-d="${k}">${i}${k===iso(today)?"<i></i>":""}</button>`;
  }
  $("grid").innerHTML = h;
}
$("grid").onclick = e => {
  const b = e.target.closest("[data-d]"); if(!b) return;
  selected = b.dataset.d; $("fDate").value = selected; render();
};
$("cMonth").onchange = () => { view = new Date(view.getFullYear(), +$("cMonth").value, 1); renderCal(); };
$("cYear").onchange = () => {
  const y = parseInt($("cYear").value, 10);
  if(y >= 1900 && y <= 2100) view = new Date(y, view.getMonth(), 1);
  renderCal();
};
$("cDay").onchange = () => {
  const d = +$("cDay").value; if(!d) return;
  selected = `${view.getFullYear()}-${pad(view.getMonth()+1)}-${pad(d)}`; $("fDate").value = selected; render();
};
$("calToday").onclick = () => { goTo(iso(today)); $("fDate").value = selected; render(); };
$("prev").onclick = () => { view = new Date(view.getFullYear(), view.getMonth()-1, 1); renderCal(); };
$("next").onclick = () => { view = new Date(view.getFullYear(), view.getMonth()+1, 1); renderCal(); };

/* ---------- confirm dialog ---------- */
let cfmRes = null, detId = null, editId = null, draft = [], eDraft = [];
function ask(msg, yes = "Yes"){
  return new Promise(r => { $("cMsg").textContent = msg; $("cYes").textContent = yes; cfmRes = r; show("cfm"); $("cYes").focus(); });
}
function answer(v){ hide("cfm"); if(cfmRes){ cfmRes(v); cfmRes = null; } }
$("cYes").onclick = () => answer(true);
$("cNo").onclick = () => answer(false);
$("cfm").onclick = e => { if(e.target.id === "cfm") answer(false); };

/* ---------- must bring chips (no confirm, by request) ---------- */
const chipHTML = a => a.map((i,k) => `<li>${esc(i.name)}<button type="button" class="x" data-rm="${k}" aria-label="Remove ${esc(i.name)}">✕</button></li>`).join("");
function wireBring(inp, btn, list, get){
  const paint = () => { $(list).innerHTML = chipHTML(get()); };
  const add = () => { const v = $(inp).value.trim(); if(!v) return; get().push({id:uid(), name:v, packed:false}); $(inp).value = ""; paint(); $(inp).focus(); };
  $(btn).onclick = add;
  $(inp).onkeydown = e => { if(e.key === "Enter"){ e.preventDefault(); add(); } };
  $(list).onclick = e => { const b = e.target.closest("[data-rm]"); if(b){ get().splice(+b.dataset.rm, 1); paint(); } };
  return paint;
}
const paintDraft = wireBring("fBring", "fBringAdd", "fBringList", () => draft);
const paintE = wireBring("eBring", "eBringAdd", "eList", () => eDraft);
function goTo(s){ selected = s; const d = parseISO(s); view = new Date(d.getFullYear(), d.getMonth(), 1); }

/* ---------- create task (confirm) ---------- */
$("addForm").onsubmit = async e => {
  e.preventDefault();
  const v = $("fBring").value.trim(); if(v){ draft.push({id:uid(), name:v, packed:false}); $("fBring").value = ""; }
  if(!await ask("Are you sure you want to create this task?", "Create")) return;
  tasks.push({id:uid(), priority:$("fPri").value, date:$("fDate").value, time:$("fTime").value,
              title:$("fTitle").value.trim(), desc:$("fDesc").value.trim(), bring:draft});
  draft = []; paintDraft(); $("fTitle").value = ""; $("fDesc").value = "";
  goTo($("fDate").value); save(); render();
};
$("editBtn").onclick = () => { editing = !editing; render(); };
$("toggleAdd").onclick = () => {
  const c = $("addPanel").classList.toggle("collapsed");
  $("toggleAdd").textContent = c ? "▲" : "▼";
};

/* ---------- card click, details popup ---------- */
function rowAction(e){
  const ed = e.target.closest("[data-edit]"); if(ed){ openEdit(ed.dataset.edit); return true; }
  const dl = e.target.closest("[data-delete]"); if(dl){ delTask(dl.dataset.delete); return true; }
  return false;
}
async function delTask(id){
  if(!await ask("Delete this task? This can't be undone.", "Delete")) return;
  tasks = tasks.filter(t => t.id !== id); save(); hide("det"); render();
}
$("main").onclick = e => {
  const op = e.target.closest("[data-open]"); if(op){ chooseAction(op.dataset.open); return; }
  if(rowAction(e)) return;
  const c = e.target.closest(".task"); if(c) openDet(c.dataset.id);
};
$("main").onkeydown = e => {
  if((e.key === "Enter" || e.key === " ") && e.target.classList.contains("task")){ e.preventDefault(); openDet(e.target.dataset.id); }
};
function openDet(id){ detId = id; paintDet(); show("det"); }
function paintDet(){
  const t = tasks.find(x => x.id === detId); if(!t){ hide("det"); return; }
  const done = !!t.finishedAt, b = t.bring || [], n = b.filter(i => i.packed).length;
  const rows = [["Priority level", PRI[t.priority]], ["Scheduled", `${longDate(t.date)} · ${fmtHM(t.time)}`]];
  if(t.desc) rows.push(["Description", t.desc]);
  rows.push(["Time started", t.startedAt ? fmtTs(t.startedAt) : (done ? "Not timed" : "Not started")],
            ["Time completed", done ? fmtTs(t.finishedAt) : "Not yet"],
            ["Time used", t.startedAt ? fmtDur(elapsedOf(t)) + (done ? "" : " so far") : "-"]);
  $("dBody").innerHTML = `<div class="dh ${t.priority}"><b>${PRI[t.priority]}</b><div class="dt">${esc(t.title)}</div></div>
    <div class="kv">${rows.map(([k,v]) => `<b>${k}</b><span>${esc(v)}</span>`).join("")}</div>
    ${b.length ? `<h4 class="bh">Must bring <small>${n}/${b.length} in luggage</small></h4>
    <div class="bring-list">${b.map(i => `<div class="bi ${i.packed?"packed":""}"><button class="bchk" data-bt="${t.id}" data-bi="${i.id}" role="checkbox" aria-checked="${!!i.packed}" aria-label="${esc(i.name)}" ${done?"disabled":""}>${i.packed?"✔":""}</button><span class="bn">${esc(i.name)}</span></div>`).join("")}</div>` : ""}
    <div class="foot">${acts(t)}<button class="pill" id="dClose">Close</button></div>`;
}
$("det").onclick = e => {
  if(e.target.id === "det" || e.target.id === "dClose"){ hide("det"); return; }
  if(rowAction(e)) return;
  const bt = e.target.closest("[data-bt]");
  if(bt && !bt.disabled){
    const t = tasks.find(x => x.id === bt.dataset.bt), i = t && (t.bring || []).find(x => x.id === bt.dataset.bi);
    if(i){ i.packed = !i.packed; save(); paintDet(); render(); }
  }
};

/* ---------- edit task (confirm on save) ---------- */
function openEdit(id){
  const t = tasks.find(x => x.id === id); if(!t || t.finishedAt) return;
  editId = id; eDraft = (t.bring || []).map(i => ({...i}));
  $("eP").value = t.priority; $("eD").value = t.date; $("eT").value = t.time;
  $("eTitle").value = t.title; $("eDesc").value = t.desc || "";
  paintE(); hide("det"); show("edt"); $("eTitle").focus();
}
$("eCancel").onclick = () => hide("edt");
$("eForm").onsubmit = async e => {
  e.preventDefault();
  const t = tasks.find(x => x.id === editId); if(!t) return;
  const v = $("eBring").value.trim(); if(v){ eDraft.push({id:uid(), name:v, packed:false}); $("eBring").value = ""; }
  if(!await ask("Save your changes to this task?", "Save")) return;
  Object.assign(t, {priority:$("eP").value, date:$("eD").value, time:$("eT").value,
                    title:$("eTitle").value.trim(), desc:$("eDesc").value.trim(), bring:eDraft});
  goTo(t.date); save(); hide("edt"); render();
};

/* ---------- circle: mark completed OR use timer ---------- */
let optId = null;
function chooseAction(id){
  const t = tasks.find(x => x.id === id); if(!t || t.finishedAt) return;
  if(t.startedAt){ openClock(id); return; }   // already timing: go straight to the clock
  optId = id; $("oTitle").textContent = t.title; show("opt"); $("oTimer").focus();
}
$("oTimer").onclick = () => { hide("opt"); openClock(optId); };
$("oCancel").onclick = () => hide("opt");
$("opt").onclick = e => { if(e.target.id === "opt") hide("opt"); };
$("oDone").onclick = async () => {
  if(!await ask("Mark this task as completed?", "Complete")) return;
  const t = tasks.find(x => x.id === optId); if(!t) return;
  t.finishedAt = Date.now(); save(); hide("opt"); render();
};

/* ---------- pop-up clock ---------- */
const getTask = () => tasks.find(t => t.id === activeId);
function openClock(id){
  activeId = id; const t = getTask(); if(!t) return;
  $("mTitle").textContent = t.title; show("modal"); updateBtns(); paintClock();
  clearInterval(tick); tick = setInterval(paintClock, 500); $("closeBtn").focus();
}
function closeClock(){ hide("modal"); clearInterval(tick); activeId = null; render(); }
function updateBtns(){
  const t = getTask(), s = !!t.startedAt;
  $("startBtn").hidden = s; $("pauseBtn").hidden = !s; $("stopBtn").hidden = !s;
  $("pauseBtn").textContent = t.resumeAt ? "Pause" : "Resume";
}
function paintClock(){
  const t = getTask(); if(!t) return;
  const n = new Date();
  $("clock").textContent = `${pad(n.getHours())}:${pad(n.getMinutes())}:${pad(n.getSeconds())}`;
  if(t.startedAt){ const s = Math.floor(elapsedOf(t)/1000); $("elapsed").textContent = `${pad(Math.floor(s/60))}:${pad(s%60)}`; }
  else $("elapsed").textContent = "";
}
$("startBtn").onclick = async () => {
  if(!await ask("Start this task now?", "Start")) return;
  const t = getTask(); if(!t) return;
  t.startedAt = Date.now(); t.acc = 0; t.resumeAt = Date.now(); save(); updateBtns(); paintClock();
};
$("pauseBtn").onclick = () => {
  const t = getTask();
  if(t.resumeAt){ t.acc = elapsedOf(t); t.resumeAt = null; } else { t.resumeAt = Date.now(); }
  save(); updateBtns();
};
$("stopBtn").onclick = async () => {
  if(!await ask("Stop and mark this task as done?", "Stop")) return;
  const t = getTask(); if(!t) return;
  t.acc = elapsedOf(t); t.resumeAt = null; t.finishedAt = Date.now(); save(); closeClock();
};
$("closeBtn").onclick = closeClock;
$("modal").onclick = e => { if(e.target.id === "modal") closeClock(); };
document.addEventListener("keydown", e => {
  if(e.key !== "Escape") return;
  if(isOpen("cfm")) answer(false); else if(isOpen("opt")) hide("opt"); else if(isOpen("edt")) hide("edt"); else if(isOpen("det")) hide("det"); else if(activeId) closeClock();
});

/* ---------- init ---------- */
load();
$("fDate").value = selected;
render();
