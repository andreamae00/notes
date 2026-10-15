/* ============ JavaScript ============ */
const KEY = "website-notepad-v1";

const PRI = {
  urgent: "Urgent",
  normal: "Normal",
  low: "Low Priority"
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thurs", "Fri", "Sat"];
const $ = id => document.getElementById(id);

/* ---------- helpers ---------- */
const pad = n => String(n).padStart(2, "0");

const iso = d =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const parseISO = s => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

const fmt12 = (h, m) =>
  `${h % 12 || 12}:${pad(m)} ${h < 12 ? "AM" : "PM"}`;

const fmtHM = s => {
  const [h, m] = s.split(":").map(Number);
  return fmt12(h, m);
};

const fmtTs = ts => {
  const d = new Date(ts);
  return fmt12(d.getHours(), d.getMinutes());
};

const esc = s =>
  String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));

const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* ---------- state + storage ---------- */
let tasks = [];
const today = new Date();

let selected = iso(today);
let view = new Date(today.getFullYear(), today.getMonth(), 1);
let editing = false;

let activeId = null;
let tick = null;
let activeMode = "elapsed";

function load() {
  try {
    tasks = JSON.parse(localStorage.getItem(KEY)) || [];
  } catch (e) {
    tasks = [];
  }
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(tasks));
  } catch (e) {}
}

/* ---------- task/date lock ---------- */
/* A date is locked only if it has at least one task
   and every task on that date is completed. */
function isDayLocked(date) {
  const dayTasks = tasks.filter(t => t.date === date);
  return dayTasks.length > 0 && dayTasks.every(t => !!t.finishedAt);
}


function updateAddAvailability() {
    const pastDate = isPastSelectedDate();
    const form = $("addForm");

    if (!form) return;

    // Disable all fields except those outside the form
    form.querySelectorAll("input, textarea, select, button").forEach(el => {
        el.disabled = pastDate;
    });

    // Block clicking Submit on past dates
    form.addEventListener("submit", function (e) {
        if (isPastSelectedDate()) {
            e.preventDefault();
            e.stopImmediatePropagation();
            alert("You cannot add tasks to a past date.");
        }
    });

    let message = $("daylockMessage");

    if (!message) {
        message = document.createElement("p");
        message.id = "daylockMessage";
        message.style.color = "#b00020";
        form.appendChild(message);
    }

    message.textContent = pastDate
        ? "You cannot add tasks to a past date."
        : "";

    message.style.display = pastDate ? "block" : "none";
}


/* ---------- task/date lock ---------- */

// Past dates cannot receive new tasks.
// Today and future dates can receive unlimited tasks.
function isPastSelectedDate(date = selected) {
    const now = new Date();

    const todayDate = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
    );

    const chosenDate = parseISO(date);

    return chosenDate < todayDate;
}

function updateAddAvailability() {
    const pastDate = isPastSelectedDate(selected);
    const form = $("addForm");

    if (!form) return;

    // Disable or enable every field inside the Add Notes form.
    form.querySelectorAll("input, textarea, select, button").forEach(el => {
        el.disabled = pastDate;
    });

    // Show the message for past dates only.
    let message = $("daylockMessage");

    if (!message) {
        message = document.createElement("p");
        message.id = "daylockMessage";
        message.style.color = "#b00020";
        message.style.fontSize = "13px";
        message.style.marginTop = "8px";

        form.appendChild(message);
    }

    message.textContent = pastDate
        ? "You cannot add tasks to a previous date."
        : "";

    message.hidden = !pastDate;
}

/* ---------- render list ---------- */
const fmtDur = ms => {
  const m = Math.max(1, Math.round(ms / 60000));
  return m >= 60
    ? `${Math.floor(m / 60)} hr ${m % 60} min`
    : `${m} min`;
};

const longDate = s => {
  const d = parseISO(s);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
};

const elapsedOf = t =>
  (t.acc || 0) + (t.resumeAt ? Date.now() - t.resumeAt : 0);

/* Total time for alarm tasks:
   original countdown duration + any extra time used. */
const alarmTimeUsed = t => {
  if (!t.alarmDuration) return 0;

  return (t.alarmExtraAcc || 0) +
    (t.alarmExtraResumeAt
      ? Date.now() - t.alarmExtraResumeAt
      : 0);
};

const timeUsedOf = t =>
  t.alarmDuration
    ? alarmTimeUsed(t)
    : t.startedAt
      ? elapsedOf(t)
      : 0;

const show = id => $(id).classList.add("open");
const hide = id => $(id).classList.remove("open");
const isOpen = id => $(id).classList.contains("open");

const acts = t =>
  `${t.finishedAt ? "" : `<button class="pill" data-edit="${t.id}">✎ Edit</button>`}
   <button class="pill" data-delete="${t.id}">🗑 Delete</button>`;

function taskHTML(t) {
  const done = !!t.finishedAt;
  const run = (!!t.startedAt && !done) ||
    !!t.alarmRunning ||
    !!t.alarmExtraResumeAt;

  const b = t.bring || [];
  const n = b.filter(i => i.packed).length;

  return `
    <article class="task ${t.priority} ${done ? "done" : ""} ${run ? "run" : ""}"
      data-id="${t.id}" tabindex="0" role="button"
      aria-label="Details: ${esc(t.title)}">

      <span class="pri">${PRI[t.priority]}</span>

      <span class="time">
        ${done && t.startedAt ? fmtTs(t.startedAt) : fmtHM(t.time)}
      </span>

      <button class="chk" data-open="${t.id}"
        aria-label="${done ? "Completed" : "Complete task or open timer"}"
        ${done ? "disabled" : ""}></button>

      <span class="ttl">${esc(t.title)}</span>

      ${
        done
          ? `<span class="fin">✔ ${fmtTs(t.finishedAt)} · ${fmtDur(timeUsedOf(t))}</span>`
          : b.length
            ? `<span class="meta">🎒 ${n}/${b.length}</span>`
            : ""
      }

      ${editing ? `<div class="acts">${acts(t)}</div>` : ""}
    </article>
  `;
}

function render() {
  const d = parseISO(selected);

  $("dateTitle").textContent =
    `${MONTHS[d.getMonth()].toUpperCase()} ${d.getDate()}, ${d.getFullYear()} - ${DAYS[d.getDay()]}`;

  const day = tasks.filter(t => t.date === selected);

  const pend = day
    .filter(t => !t.finishedAt)
    .sort((a, b) => a.time.localeCompare(b.time));

  const comp = day
    .filter(t => t.finishedAt)
    .sort((a, b) => a.finishedAt - b.finishedAt);

  $("pending").innerHTML =
    pend.map(taskHTML).join("") ||
    `<p class="empty">No tasks for this day. Add one with the form.</p>`;

  $("completed").innerHTML =
    comp.map(taskHTML).join("") ||
    `<p class="empty">Finished tasks will show up here.</p>`;

  $("editBtn").textContent = editing ? "Done" : "Edit";

  renderCal();
  updateAddAvailability();
}

/* ---------- calendar ---------- */
function renderCal() {
  const y = view.getFullYear();
  const m = view.getMonth();
  const sel = parseISO(selected);

  $("calBig").innerHTML =
    `${MONTHS[sel.getMonth()]} </sup> ${sel.getDate()} <sup>${sel.getFullYear()}`;

  if (!$("cMonth").options.length) {
    $("cMonth").innerHTML = MONTHS
      .map((n, i) => `<option value="${i}">${n}</option>`)
      .join("");
  }

  $("cMonth").value = m;
  $("cYear").value = y;

  const dim = new Date(y, m + 1, 0).getDate();

  const sd = selected.startsWith(`${y}-${pad(m + 1)}-`)
    ? +selected.slice(8)
    : 0;

  $("cDay").innerHTML =
    '<option value="">Day</option>' +
    Array.from(
      { length: dim },
      (_, i) => `<option value="${i + 1}">${i + 1}</option>`
    ).join("");

  $("cDay").value = sd || "";

  const first = new Date(y, m, 1).getDay();
  const count = new Date(y, m + 1, 0).getDate();

  let h = "SMTWTFS"
    .split("")
    .map(c => `<div class="dow">${c}</div>`)
    .join("");

  h += "<span></span>".repeat(first);

  for (let i = 1; i <= count; i++) {
    const k = `${y}-${pad(m + 1)}-${pad(i)}`;

    h += `
      <button class="day ${k === selected ? "sel" : ""} ${k === iso(today) ? "today" : ""}"
        data-d="${k}">
        ${i}${k === iso(today) ? "<i></i>" : ""}
      </button>
    `;
  }

  $("grid").innerHTML = h;
}

$("grid").onclick = e => {
  const b = e.target.closest("[data-d]");
  if (!b) return;

  selected = b.dataset.d;
  $("fDate").value = selected;
  render();
};

$("cMonth").onchange = () => {
  view = new Date(view.getFullYear(), +$("cMonth").value, 1);
  renderCal();
};

$("cYear").onchange = () => {
  const y = parseInt($("cYear").value, 10);

  if (y >= 1900 && y <= 2100) {
    view = new Date(y, view.getMonth(), 1);
  }

  renderCal();
};

$("cDay").onchange = () => {
  const d = +$("cDay").value;
  if (!d) return;

  selected =
    `${view.getFullYear()}-${pad(view.getMonth() + 1)}-${pad(d)}`;

  $("fDate").value = selected;
  render();
};

$("calToday").onclick = () => {
  goTo(iso(today));
  $("fDate").value = selected;
  render();
};

$("prev").onclick = () => {
  view = new Date(view.getFullYear(), view.getMonth() - 1, 1);
  renderCal();
};

$("next").onclick = () => {
  view = new Date(view.getFullYear(), view.getMonth() + 1, 1);
  renderCal();
};

/* Keep the calendar and form date synchronized. */
$("fDate").addEventListener("change", () => {
  if (!$("fDate").value) return;

  goTo($("fDate").value);
  render();
});

/* ---------- confirm dialog ---------- */
let cfmRes = null;
let detId = null;
let editId = null;
let draft = [];
let eDraft = [];

function ask(msg, yes = "Yes") {
  return new Promise(resolve => {
    $("cMsg").textContent = msg;
    $("cYes").textContent = yes;
    cfmRes = resolve;
    show("cfm");
    $("cYes").focus();
  });
}

function answer(v) {
  hide("cfm");

  if (cfmRes) {
    cfmRes(v);
    cfmRes = null;
  }
}

$("cYes").onclick = () => answer(true);
$("cNo").onclick = () => answer(false);

$("cfm").onclick = e => {
  if (e.target.id === "cfm") answer(false);
};

/* ---------- must bring chips ---------- */
const chipHTML = a =>
  a.map((i, k) => `
    <li>
      ${esc(i.name)}
      <button type="button" class="x" data-rm="${k}"
        aria-label="Remove ${esc(i.name)}">✕</button>
    </li>
  `).join("");

function wireBring(inp, btn, list, get) {
  const paint = () => {
    $(list).innerHTML = chipHTML(get());
    updateAddAvailability();
  };

  const add = () => {
    const v = $(inp).value.trim();
    if (!v) return;

    get().push({ id: uid(), name: v, packed: false });
    $(inp).value = "";
    paint();
    $(inp).focus();
  };

  $(btn).onclick = add;

  $(inp).onkeydown = e => {
    if (e.key === "Enter") {
      e.preventDefault();
      add();
    }
  };

  $(list).onclick = e => {
    const b = e.target.closest("[data-rm]");
    if (b && !b.disabled) {
      get().splice(+b.dataset.rm, 1);
      paint();
    }
  };

  return paint;
}

const paintDraft = wireBring(
  "fBring",
  "fBringAdd",
  "fBringList",
  () => draft
);

const paintE = wireBring(
  "eBring",
  "eBringAdd",
  "eList",
  () => eDraft
);

function goTo(s) {
  selected = s;
  const d = parseISO(s);
  view = new Date(d.getFullYear(), d.getMonth(), 1);
}

/* ---------- create task ---------- */

$("addForm").onsubmit = async e => {
    e.preventDefault();

    const date = $("fDate").value || selected;

    // Block submissions for past dates.
    if (isPastSelectedDate(date)) {
        alert("You cannot add tasks to a previous date.");
        updateAddAvailability();
        return;
    }

    const v = $("fBring").value.trim();

    if (v) {
        draft.push({
            id: uid(),
            name: v,
            packed: false
        });

        $("fBring").value = "";
    }

    if (!await ask("Are you sure you want to create this task?", "Create")) {
        return;
    }

    // Check again in case the selected date changed.
    const currentDate = $("fDate").value || selected;

    if (isPastSelectedDate(currentDate)) {
        alert("You cannot add tasks to a previous date.");
        updateAddAvailability();
        return;
    }

    tasks.push({
        id: uid(),
        priority: $("fPri").value,
        date: currentDate,
        time: $("fTime").value,
        title: $("fTitle").value.trim(),
        desc: $("fDesc").value.trim(),
        bring: [...draft]
    });

    draft = [];
    paintDraft();

    $("fTitle").value = "";
    $("fDesc").value = "";

    goTo(currentDate);
    $("fDate").value = currentDate;

    save();
    render();
};


$("editBtn").onclick = () => {
  editing = !editing;
  render();
};

$("toggleAdd").onclick = () => {
  const c = $("addPanel").classList.toggle("collapsed");
  $("toggleAdd").textContent = c ? "▲" : "▼";
};

/* ---------- card actions ---------- */
function rowAction(e) {
  const ed = e.target.closest("[data-edit]");
  if (ed) {
    openEdit(ed.dataset.edit);
    return true;
  }

  const dl = e.target.closest("[data-delete]");
  if (dl) {
    delTask(dl.dataset.delete);
    return true;
  }

  return false;
}

async function delTask(id) {
  if (!await ask("Delete this task? This can't be undone.", "Delete")) {
    return;
  }

  tasks = tasks.filter(t => t.id !== id);
  save();
  hide("det");
  render();
}

$("main").onclick = e => {
  const op = e.target.closest("[data-open]");

  if (op) {
    chooseAction(op.dataset.open);
    return;
  }

  if (rowAction(e)) return;

  const c = e.target.closest(".task");
  if (c) openDet(c.dataset.id);
};

$("main").onkeydown = e => {
  if (
    (e.key === "Enter" || e.key === " ") &&
    e.target.classList.contains("task")
  ) {
    e.preventDefault();
    openDet(e.target.dataset.id);
  }
};

/* ---------- task details ---------- */
function openDet(id) {
  detId = id;
  paintDet();
  show("det");
}

function paintDet() {
  const t = tasks.find(x => x.id === detId);
  if (!t) {
    hide("det");
    return;
  }

  const done = !!t.finishedAt;
  const b = t.bring || [];
  const n = b.filter(i => i.packed).length;

  const rows = [
    ["Priority level", PRI[t.priority]],
    ["Scheduled", `${longDate(t.date)} · ${fmtHM(t.time)}`]
  ];

  if (t.desc) rows.push(["Description", t.desc]);

  rows.push(
    ["Time started", t.startedAt ? fmtTs(t.startedAt) : (done ? "Not timed" : "Not started")],
    ["Time completed", done ? fmtTs(t.finishedAt) : "Not yet"],
    [
      "Time used",
      t.alarmDuration
        ? fmtDur(timeUsedOf(t)) + (done ? "" : " so far")
        : t.startedAt
          ? fmtDur(timeUsedOf(t)) + (done ? "" : " so far")
          : "-"
    ]
  );

  $("dBody").innerHTML = `
    <div class="dh ${t.priority}">
      <b>${PRI[t.priority]}</b>
      <div class="dt">${esc(t.title)}</div>
    </div>

    <div class="kv">
      ${rows.map(([k, v]) => `<b>${k}</b><span>${esc(v)}</span>`).join("")}
    </div>

    ${
      b.length
        ? `
          <h4 class="bh">Must bring <small>${n}/${b.length} in luggage</small></h4>
          <div class="bring-list">
            ${b.map(i => `
              <div class="bi ${i.packed ? "packed" : ""}">
                <button class="bchk" data-bt="${t.id}" data-bi="${i.id}"
                  role="checkbox" aria-checked="${!!i.packed}"
                  aria-label="${esc(i.name)}" ${done ? "disabled" : ""}>
                  ${i.packed ? "✔" : ""}
                </button>
                <span class="bn">${esc(i.name)}</span>
              </div>
            `).join("")}
          </div>
        `
        : ""
    }

    <div class="foot">
      ${acts(t)}
      <button class="pill" id="dClose">Close</button>
    </div>
  `;
}

$("det").onclick = e => {
  if (e.target.id === "det" || e.target.id === "dClose") {
    hide("det");
    return;
  }

  if (rowAction(e)) return;

  const bt = e.target.closest("[data-bt]");

  if (bt && !bt.disabled) {
    const t = tasks.find(x => x.id === bt.dataset.bt);
    const i = t && (t.bring || []).find(x => x.id === bt.dataset.bi);

    if (i) {
      i.packed = !i.packed;
      save();
      paintDet();
      render();
    }
  }
};

/* ---------- edit task ---------- */
function openEdit(id) {
  const t = tasks.find(x => x.id === id);
  if (!t || t.finishedAt) return;

  editId = id;
  eDraft = (t.bring || []).map(i => ({ ...i }));

  $("eP").value = t.priority;
  $("eD").value = t.date;
  $("eT").value = t.time;
  $("eTitle").value = t.title;
  $("eDesc").value = t.desc || "";

  paintE();
  hide("det");
  show("edt");
  $("eTitle").focus();
}

$("eCancel").onclick = () => hide("edt");

$("eForm").onsubmit = async e => {
  e.preventDefault();

  const t = tasks.find(x => x.id === editId);
  if (!t) return;

  const v = $("eBring").value.trim();

  if (v) {
    eDraft.push({ id: uid(), name: v, packed: false });
    $("eBring").value = "";
  }

  if (!await ask("Save your changes to this task?", "Save")) {
    return;
  }

  Object.assign(t, {
    priority: $("eP").value,
    date: $("eD").value,
    time: $("eT").value,
    title: $("eTitle").value.trim(),
    desc: $("eDesc").value.trim(),
    bring: eDraft
  });

  goTo(t.date);
  save();
  hide("edt");
  render();
};

/* ---------- complete / stopwatch / alarm options ---------- */
let optId = null;

function chooseAction(id) {
  const t = tasks.find(x => x.id === id);
  if (!t || t.finishedAt) return;

  /* Reopen an existing alarm or extra-time counter. */
  if (
    t.alarmRunning ||
    t.alarmPaused ||
    t.alarmRinging ||
    t.alarmExtraResumeAt ||
    t.alarmExtraPaused
  ) {
    openClock(id, "alarm");
    return;
  }

  if (t.startedAt) {
    openClock(id, "elapsed");
    return;
  }

  optId = id;
  $("oTitle").textContent = t.title;
  show("opt");
  $("oTimer").focus();
}

$("oTimer").onclick = () => {
  hide("opt");
  openClock(optId, "elapsed");
};

$("oAlarm").onclick = () => {
  const t = tasks.find(x => x.id === optId);
  if (!t) return;

  hide("opt");
  $("alarmTaskTitle").textContent = t.title;
  $("alarmHours").value = 0;
  $("alarmMinutes").value = 20;
  $("alarmSeconds").value = 0;
  show("alarmSetup");
};

$("alarmCancel").onclick = () => hide("alarmSetup");

$("alarmSetup").onclick = e => {
  if (e.target.id === "alarmSetup") hide("alarmSetup");
};

$("oCancel").onclick = () => hide("opt");

$("opt").onclick = e => {
  if (e.target.id === "opt") hide("opt");
};

$("oDone").onclick = async () => {
  if (!await ask("Mark this task as completed?", "Complete")) return;

  const t = tasks.find(x => x.id === optId);
  if (!t) return;

  t.finishedAt = Date.now();
  save();
  hide("opt");
  render();
};

/* ---------- alarm sound ---------- */
function stopAlarmSound() {
  const audio = $("alarmSound");

  audio.pause();
  audio.currentTime = 0;
  audio.loop = false;
}

function playAlarmSound() {
  const audio = $("alarmSound");

  audio.loop = true;
  audio.currentTime = 0;

  const result = audio.play();

  if (result && typeof result.catch === "function") {
    result.catch(() => {
      $("clockStatus").textContent =
        "Time is up! If you can't hear the alarm, check your browser's sound settings.";
    });
  }
}

/* ---------- start alarm countdown ---------- */
$("alarmStart").onclick = () => {
  const hours = Number($("alarmHours").value);
  const minutes = Number($("alarmMinutes").value);
  const seconds = Number($("alarmSeconds").value);

  const valid =
    Number.isInteger(hours) && hours >= 0 && hours <= 99 &&
    Number.isInteger(minutes) && minutes >= 0 && minutes <= 59 &&
    Number.isInteger(seconds) && seconds >= 0 && seconds <= 59;

  const duration = ((hours * 60 + minutes) * 60 + seconds) * 1000;

  if (!valid || duration <= 0) {
    alert("Please enter a valid alarm time greater than zero.");
    return;
  }

  const t = tasks.find(x => x.id === optId);
  if (!t || t.finishedAt) return;

  stopAlarmSound();

  t.alarmDuration = duration;
  t.alarmEndAt = Date.now() + duration;
  t.alarmRemaining = duration;
  t.alarmRunning = true;
  t.alarmPaused = false;
  t.alarmRinging = false;
  t.alarmExtraAcc = 0;
  t.alarmExtraResumeAt = null;
  t.alarmExtraPaused = false;

  save();
  hide("alarmSetup");
  openClock(t.id, "alarm");
};

/* ---------- pop-up clock ---------- */
const getTask = () => tasks.find(t => t.id === activeId);

function openClock(id, mode = "elapsed") {
  activeId = id;
  activeMode = mode;

  const t = getTask();
  if (!t) return;

  $("mTitle").textContent = t.title;

  show("modal");
  updateBtns();
  paintClock();

  clearInterval(tick);
  tick = setInterval(paintClock, 250);

  $("closeBtn").focus();
}

function closeClock() {
  const t = getTask();

  hide("modal");

  /* Keep a running alarm ticking even if its clock window is closed. */
  if (
    activeMode === "alarm" &&
    t &&
    (t.alarmRunning || t.alarmExtraResumeAt)
  ) {
    return;
  }

  clearInterval(tick);
  tick = null;
  activeId = null;

  render();
}

function updateBtns() {
  const t = getTask();
  if (!t) return;

  const ringing = activeMode === "alarm" && !!t.alarmRinging;

  $("ringingActions").hidden = !ringing;

  if (ringing) {
    $("startBtn").hidden = true;
    $("pauseBtn").hidden = true;
    $("stopBtn").hidden = true;
    return;
  }

  $("startBtn").hidden = true;

  if (activeMode === "alarm") {
    const running = !!t.alarmRunning || !!t.alarmExtraResumeAt;
    const paused = !!t.alarmPaused || !!t.alarmExtraPaused;

    $("pauseBtn").hidden = !(running || paused);
    $("stopBtn").hidden = !(running || paused);

    if (t.alarmExtraResumeAt || t.alarmExtraPaused) {
      $("clockStatus").textContent = "Extra time";
      $("stopBtn").textContent = "Stop";
    } else {
      $("clockStatus").textContent = "Countdown alarm";
      $("stopBtn").textContent = "Stop";
    }

    if (t.alarmExtraResumeAt) {
      $("pauseBtn").textContent = "Pause";
    } else if (t.alarmExtraPaused) {
      $("pauseBtn").textContent = "Resume";
    } else if (t.alarmRunning) {
      $("pauseBtn").textContent = "Pause";
    } else {
      $("pauseBtn").textContent = "Resume";
    }

    return;
  }

  const started = !!t.startedAt;

  $("startBtn").hidden = started;
  $("pauseBtn").hidden = !started;
  $("stopBtn").hidden = !started;

  $("pauseBtn").textContent = t.resumeAt ? "Pause" : "Resume";
  $("stopBtn").textContent = "Stop";
}

function formatClock(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function finishAlarmCountdown(t) {
  if (t.alarmRinging || t.finishedAt) return;

  t.alarmRunning = false;
  t.alarmPaused = false;
  t.alarmRemaining = 0;
  t.alarmRinging = true;

  /* Record the original countdown duration as time used. */
  t.alarmExtraAcc = t.alarmDuration || 0;
  t.alarmExtraResumeAt = null;
  t.alarmExtraPaused = false;

  save();
  updateBtns();

  $("clockStatus").textContent = "Time is up!";
  $("elapsed").textContent = "00:00:00";

  show("modal");
  playAlarmSound();
}

function paintClock() {
  const t = getTask();
  if (!t) return;

  const now = new Date();

  $("clock").textContent =
    `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  if (activeMode === "alarm") {
    if (t.alarmRinging) {
      $("clockStatus").textContent = "Time is up!";
      $("elapsed").textContent = "00:00:00";
      updateBtns();
      return;
    }

    /* Countdown is still running. */
    if (t.alarmRunning) {
      const remaining = Math.max(0, t.alarmEndAt - Date.now());
      t.alarmRemaining = remaining;

      $("clockStatus").textContent = "Countdown alarm";
      $("elapsed").textContent = formatClock(remaining);

      if (remaining <= 0) {
        finishAlarmCountdown(t);
      }

      return;
    }

    /* Countdown paused before the alarm rang. */
    if (t.alarmPaused && !t.alarmExtraResumeAt && !t.alarmExtraPaused) {
      $("clockStatus").textContent = "Alarm paused";
      $("elapsed").textContent = formatClock(t.alarmRemaining || 0);
      return;
    }

    /* Extra time: count upward from the original duration. */
    if (t.alarmExtraResumeAt) {
      const extraElapsed = Date.now() - t.alarmExtraResumeAt;
      const total = (t.alarmExtraAcc || t.alarmDuration || 0) + extraElapsed;

      $("clockStatus").textContent = "Extra time";
      $("elapsed").textContent = formatClock(total);
      return;
    }

    /* Extra time paused. */
    if (t.alarmExtraPaused) {
      $("clockStatus").textContent = "Extra time paused";
      $("elapsed").textContent = formatClock(
        t.alarmExtraAcc || t.alarmDuration || 0
      );
      return;
    }

    $("clockStatus").textContent = "Countdown alarm";
    $("elapsed").textContent = formatClock(
      t.alarmRemaining || t.alarmDuration || 0
    );
    return;
  }

  /* Original elapsed timer. */
  $("clockStatus").textContent = "Elapsed timer";

  if (t.startedAt) {
    $("elapsed").textContent = formatClock(elapsedOf(t));
  } else {
    $("elapsed").textContent = "00:00:00";
  }
}

/* ---------- elapsed timer: start ---------- */
$("startBtn").onclick = async () => {
  if (!await ask("Start this task now?", "Start")) return;

  const t = getTask();
  if (!t) return;

  t.startedAt = Date.now();
  t.acc = 0;
  t.resumeAt = Date.now();

  save();
  updateBtns();
  paintClock();
};

/* ---------- pause / resume ---------- */
$("pauseBtn").onclick = () => {
  const t = getTask();
  if (!t) return;

  if (activeMode === "alarm") {
    /* Pause or resume the countdown. */
    if (t.alarmRunning) {
      t.alarmRemaining = Math.max(0, t.alarmEndAt - Date.now());
      t.alarmRunning = false;
      t.alarmPaused = true;
    } else if (t.alarmPaused && !t.alarmExtraPaused) {
      t.alarmEndAt = Date.now() + (t.alarmRemaining || 0);
      t.alarmRunning = true;
      t.alarmPaused = false;
    } else if (t.alarmExtraResumeAt) {
      /* Pause extra time. */
      t.alarmExtraAcc =
        (t.alarmExtraAcc || t.alarmDuration || 0) +
        (Date.now() - t.alarmExtraResumeAt);

      t.alarmExtraResumeAt = null;
      t.alarmExtraPaused = true;
    } else if (t.alarmExtraPaused) {
      /* Resume extra time. */
      t.alarmExtraResumeAt = Date.now();
      t.alarmExtraPaused = false;
    }

    save();
    updateBtns();
    paintClock();
    return;
  }

  /* Original elapsed timer pause / resume. */
  if (t.resumeAt) {
    t.acc = elapsedOf(t);
    t.resumeAt = null;
  } else {
    t.resumeAt = Date.now();
  }

  save();
  updateBtns();
  paintClock();
};

/* ---------- stop button ---------- */
$("stopBtn").onclick = async () => {
  if (activeMode === "alarm") {
    if (!await ask("Are you sure you are done with this task?", "Yes, complete")) {
      return;
    }

    const t = getTask();
    if (!t) return;

    stopAlarmSound();

    if (t.alarmExtraResumeAt) {
      t.alarmExtraAcc =
        (t.alarmExtraAcc || t.alarmDuration || 0) +
        (Date.now() - t.alarmExtraResumeAt);
    }

    t.alarmRunning = false;
    t.alarmPaused = false;
    t.alarmRinging = false;
    t.alarmExtraResumeAt = null;
    t.alarmExtraPaused = false;
    t.finishedAt = Date.now();

    save();
    closeClock();
    render();
    return;
  }

  if (!await ask("Stop and mark this task as done?", "Stop")) {
    return;
  }

  const t = getTask();
  if (!t) return;

  t.acc = elapsedOf(t);
  t.resumeAt = null;
  t.finishedAt = Date.now();

  save();
  closeClock();
};

/* ---------- alarm rings: stop or extend ---------- */
$("alarmStopBtn").onclick = async () => {
  /* Do not stop the sound unless the user confirms completion. */
  if (!await ask("Are you sure you are done with this task?", "Yes, complete")) {
    return;
  }

  const t = getTask();
  if (!t) return;

  stopAlarmSound();

  t.alarmRunning = false;
  t.alarmPaused = false;
  t.alarmRinging = false;
  t.alarmExtraResumeAt = null;
  t.alarmExtraPaused = false;
  t.finishedAt = Date.now();

  save();
  closeClock();
  render();
};

$("alarmExtendBtn").onclick = () => {
  const t = getTask();
  if (!t || !t.alarmRinging) return;

  stopAlarmSound();

  /* Begin extra time from the original countdown duration.
     Example: after a 20-minute alarm, the counter continues at 00:20:00,
     then 00:20:01, 00:20:02, and so on. */
  t.alarmRinging = false;
  t.alarmRunning = false;
  t.alarmPaused = false;
  t.alarmExtraAcc = t.alarmDuration || 0;
  t.alarmExtraResumeAt = Date.now();
  t.alarmExtraPaused = false;

  save();
  updateBtns();
  paintClock();
};

/* ---------- close clock ---------- */
$("closeBtn").onclick = closeClock;

$("modal").onclick = e => {
  if (e.target.id === "modal") closeClock();
};

/* ---------- keyboard escape ---------- */
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;

  if (isOpen("cfm")) {
    answer(false);
  } else if (isOpen("alarmSetup")) {
    hide("alarmSetup");
  } else if (isOpen("opt")) {
    hide("opt");
  } else if (isOpen("edt")) {
    hide("edt");
  } else if (isOpen("det")) {
    hide("det");
  } else if (activeId && isOpen("modal")) {
    closeClock();
  }
});

/* ---------- init ---------- */
load();
$("fDate").value = selected;
render();