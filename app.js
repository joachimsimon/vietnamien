"use strict";
const $ = s => document.querySelector(s);
const audio = $("#audio"), speedSel = $("#speed");

let lessons = [], lesson = null, items = [], activeItem = null, selItem = null, endAt = null, raf = 0;

/* ---------- utilitaires ---------- */
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const refs = s => esc(s).replace(/\[(\d+)\]/g, '<sup class="ref">[$1]</sup>');
const rich = s => esc(s).replace(/\*(.+?)\*/g, "<em>$1</em>");
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} }
};
function loadScript(src) {
  return new Promise((ok, ko) => {
    const el = document.createElement("script");
    el.src = src; el.onload = ok; el.onerror = () => ko(new Error("Fichier introuvable : " + src));
    document.head.appendChild(el);
  });
}
function showError(e) {
  const box = $("#error");
  box.hidden = false;
  box.innerHTML = `<strong>Impossible de charger les données.</strong><br>${esc(e.message)}`;
}

/* ---------- initialisation ---------- */
async function init() {
  const sp = store.get("speed") || "1";
  speedSel.value = sp; applySpeed();
  try {
    lessons = [...VI.manifest].sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.number - a.number);
    renderMenu();
    const wanted = location.hash.slice(1) || store.get("lesson");
    await loadLesson((lessons.find(l => l.id === wanted) || lessons[0]).id);
  } catch (e) { showError(e); }
}

function renderMenu() {
  $("#lessonList").innerHTML = lessons.map(l =>
    `<li><button data-id="${esc(l.id)}">Leçon ${esc(l.number)} — ${esc(l.title)}<small>${esc(l.date || "")}</small></button></li>`).join("");
}
$("#lessonList").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  loadLesson(b.dataset.id); $("#menu").classList.remove("open");
});
$("#menuBtn").onclick = () => $("#menu").classList.toggle("open");

/* ---------- chargement + rendu d'une leçon ---------- */
async function loadLesson(id) {
  const meta = lessons.find(l => l.id === id); if (!meta) return;
  audio.pause();
  try { if (!VI.data[id]) await loadScript(meta.file); lesson = VI.data[id]; } catch (e) { return showError(e); }
  $("#error").hidden = true;
  store.set("lesson", id); history.replaceState(null, "", "#" + id);
  document.title = `${lesson.title.replace(/\s*\[\d+\]/, "")} — Initiation au vietnamien`;
  document.querySelectorAll("#lessonList button").forEach(b => b.setAttribute("aria-current", b.dataset.id === id));
  audio.src = lesson.audio; audio.load(); applySpeed();
  items = []; activeItem = selItem = null; endAt = null;
  render(); selectItem(null);
}

const attrs = o => (o && o.start != null)
  ? (items.push(o), ` data-i="${items.length - 1}" tabindex="0" title="Écouter"`) : "";

function render() {
  let html = `${lesson.category ? `<div class="tab">${esc(lesson.category)}</div>` : ""}
    <div class="head"${attrs(lesson.head)}><div class="num">${esc(lesson.number)}</div>
    <div><h1>${refs(lesson.title)}</h1><p>${refs(lesson.subtitle)}</p></div></div>`;
  for (const b of lesson.blocks) {
    if (b.type === "section") {
      html += `<h2 class="sec"${attrs(b)}>${rich(b.title)}</h2>${b.text ? `<p class="txt">${rich(b.text)}</p>` : ""}`;
    } else if (b.type === "table") {
      html += "<table><tbody>";
      for (const g of b.groups) g.rows.forEach((r, i) => {
        items.push(r);
        html += `<tr class="item" data-i="${items.length - 1}" tabindex="0" title="Écouter">
          <td class="vi">${esc(r.vi)}</td><td class="fr">${esc(r.fr)}</td>
          ${i === 0 ? `<td class="note" rowspan="${g.rows.length}">${rich(g.note)}</td>` : ""}</tr>`;
      });
      html += "</tbody></table>";
    } else if (b.type === "note") {
      html += `<div class="foot">${rich(b.text)}</div>`;
    }
  }
  $("#lesson").innerHTML = html;
}

/* ---------- lecture ---------- */
function applySpeed() {
  const v = parseFloat(speedSel.value) || 1;
  audio.defaultPlaybackRate = v; audio.playbackRate = v;
}
speedSel.onchange = () => { applySpeed(); store.set("speed", speedSel.value); };

function setActive(it) {
  if (it === activeItem) return;
  if (activeItem?._el) activeItem._el.classList.remove("active");
  activeItem = it;
  if (it?._el) it._el.classList.add("active");
}
function playItem(it) {
  endAt = it.end; audio.currentTime = it.start; applySpeed();
  setActive(it); audio.play().catch(() => {});
}
function tick() {
  const t = audio.currentTime;
  if (endAt != null && t >= endAt) { endAt = null; audio.pause(); return; }
  if (endAt == null) setActive(items.find(i => t >= i.start && t < i.end) || null);
  if (!audio.paused) raf = requestAnimationFrame(tick);
}
audio.addEventListener("play", () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); applySpeed(); });
audio.addEventListener("pause", () => { cancelAnimationFrame(raf); endAt = null; setActive(null); });
audio.addEventListener("ended", () => { endAt = null; setActive(null); });
$("#playAll").onclick = () => { endAt = null; audio.currentTime = 0; audio.play().catch(() => {}); };

/* ---------- interaction avec les lignes ---------- */
function bindRows() {
  $("#lesson").querySelectorAll("[data-i]").forEach(tr => { items[tr.dataset.i]._el = tr; });
}
const lessonEl = $("#lesson");
lessonEl.addEventListener("click", e => {
  const tr = e.target.closest("[data-i]"); if (!tr || e.target.closest(".note")) return;
  const it = items[tr.dataset.i];
  if ($("#edit").checked) selectItem(it);
  playItem(it);
});
lessonEl.addEventListener("keydown", e => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const tr = e.target.closest("[data-i]"); if (!tr) return;
  e.preventDefault(); tr.click();
});
new MutationObserver(bindRows).observe(lessonEl, { childList: true });

/* ---------- mode calage (réglage des timecodes) ---------- */
const ed = { start: $("#edStart"), end: $("#edEnd"), label: $("#edLabel") };
$("#edit").onchange = e => { $("#editor").hidden = !e.target.checked; if (!e.target.checked) selectItem(null); };
function selectItem(it) {
  if (selItem?._el) selItem._el.classList.remove("sel");
  selItem = it;
  if (it?._el) it._el.classList.add("sel");
  ed.label.textContent = it ? (it.vi ?? it.title) : "cliquez une ligne";
  ed.start.value = it ? it.start : ""; ed.end.value = it ? it.end : "";
}
ed.start.onchange = () => { if (selItem) selItem.start = +ed.start.value; };
ed.end.onchange = () => { if (selItem) selItem.end = +ed.end.value; };
$("#setStart").onclick = () => { if (selItem) { selItem.start = ed.start.value = +audio.currentTime.toFixed(2); } };
$("#setEnd").onclick = () => { if (selItem) { selItem.end = ed.end.value = +audio.currentTime.toFixed(2); } };
$("#testSeg").onclick = () => { if (selItem) playItem(selItem); };
$("#copyJson").onclick = async e => {
  const clean = "VI.register(" + JSON.stringify(lesson, (k, v) => k === "_el" ? undefined : v, 2) + ");";
  try { await navigator.clipboard.writeText(clean); e.target.textContent = "Copié ✓"; }
  catch { prompt("Copiez ce contenu :", clean); }
  setTimeout(() => e.target.textContent = "Copier la leçon", 1500);
};

init();