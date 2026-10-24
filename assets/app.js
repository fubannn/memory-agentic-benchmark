/* Memory-Agentic Benchmark 静态站：所有内容从 data/*.json 渲染。 */
(function () {
  "use strict";

  const DATA = {
    site: "data/site.json",
    metrics: "data/metrics.json",
    batches: "data/batches.json",
  };

  // 禁用缓存，保证改完 JSON 刷新即生效
  async function loadJSON(path) {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error(`${path} 加载失败（HTTP ${res.status}）`);
    return res.json();
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
  }

  function tex(src, displayMode) {
    if (!window.katex) return `<code>${esc(src)}</code>`;
    return window.katex.renderToString(src, { displayMode: !!displayMode, throwOnError: false });
  }

  function pct(num, den) {
    return ((num / den) * 100).toFixed(2) + "%";
  }

  // 分数格子：实测 / 待重算 / N/A / 缺失
  function scoreCell(score) {
    if (!score) return `<span class="score-missing">—</span>`;
    const cal = score.caliber ? `<span class="score-cal">口径 ${esc(score.caliber)}</span>` : "";
    if (score.status === "pending") {
      return `<span class="score-pending">待重算</span>${cal}`;
    }
    if (score.status === "na") {
      const note = score.note ? `<span class="score-pct">${esc(score.note)}</span>` : "";
      return `<span class="score-na">N/A</span>${note}${cal}`;
    }
    if (score.status === "missing") {
      return `<span class="score-missing">数据未提供</span>${cal}`;
    }
    if (typeof score.num === "number" && typeof score.den === "number" && score.den > 0) {
      return `<span class="score-frac">${score.num}/${score.den}</span>` +
        `<span class="score-pct">${pct(score.num, score.den)}</span>${cal}`;
    }
    return `<span class="score-missing">格式错误</span>`;
  }

  function statusBadge(statusTypes, key, short) {
    const t = statusTypes[key] || { label: key, short: key };
    return `<span class="badge ${esc(key)}">${esc(short ? t.short : t.label)}</span>`;
  }

  function metricHead(m) {
    return `<span class="dim">${esc(m.dimension)}</span>${tex(m.tex)}<span class="zh">${esc(m.name_zh)}</span>`;
  }

  function systemLabel(s) {
    const sub = [s.harness && `harness: ${s.harness}`, s.model_api && `API: ${s.model_api}`, s.tag]
      .filter(Boolean).join(" · ");
    return `<span class="sys-name">${esc(s.model)} + ${esc(s.harness)}</span><span class="sys-sub">${esc(sub)}</span>`;
  }

  // 首页总表：按批次分组，每组标注状态与口径
  function renderOverview(el, metrics, batchData) {
    const cols = metrics.columns;
    const head = `<tr><th>批次 / 组合</th>${cols.map((c) => `<th>${metricHead(metrics.metrics[c])}</th>`).join("")}</tr>`;
    const body = batchData.batches.map((b) => {
      const multi = b.systems.length > 1 && b.status !== "formal_frozen";
      const group = `<tr class="group-row"><td colspan="${cols.length + 1}">` +
        `<a href="batches.html#${esc(b.id)}"><b>${esc(b.title)}</b></a>` +
        statusBadge(batchData.status_types, b.status, true) +
        `<span class="badge caliber">口径 ${esc(b.caliber)}</span>` +
        (multi ? `<span class="badge uncontrolled">组内非受控对比</span>` : "") +
        `</td></tr>`;
      const rows = b.systems.map((s) =>
        `<tr><td>${systemLabel(s)}</td>${cols.map((c) => `<td>${scoreCell(s.scores[c])}</td>`).join("")}</tr>`
      ).join("");
      return group + rows;
    }).join("");
    el.innerHTML = `<div class="table-scroll" tabindex="0"><table class="scores"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
  }

  function legacyBlock(metrics, b) {
    const sysWithLegacy = b.systems.filter((s) => s.legacy_v1);
    if (!sysWithLegacy.length && !b.legacy_note) return "";
    const lm = metrics.legacy_v1 || {};
    const items = sysWithLegacy.map((s) =>
      Object.entries(s.legacy_v1).map(([k, v]) =>
        `<li>${esc(s.model)} + ${esc(s.harness)}：${tex((lm[k] && lm[k].tex) || k)}（${esc((lm[k] && lm[k].name_zh) || "v1")}）= ` +
        `${v.num}/${v.den}（${pct(v.num, v.den)}）</li>`
      ).join("")
    ).join("");
    return `<details class="legacy"><summary>v1 旧口径备注（不进入主表，不可与 v2 比较）</summary>` +
      (b.legacy_note ? `<p>${esc(b.legacy_note)}</p>` : "") +
      (items ? `<ul>${items}</ul>` : "") + `</details>`;
  }

  // 批次详情页
  function renderBatches(el, metrics, batchData) {
    const cols = metrics.columns;
    const tabs = `<nav class="batch-tabs" aria-label="批次">${batchData.batches.map((b) =>
      `<a href="#${esc(b.id)}">${esc(b.title)} · ${esc(batchData.status_types[b.status]?.short || b.status)}</a>`).join("")}</nav>`;

    const sections = batchData.batches.map((b) => {
      const st = batchData.status_types[b.status] || {};
      const multi = b.systems.length > 1 && b.status !== "formal_frozen";
      const head = `<tr><th>组合</th>${cols.map((c) => `<th>${metricHead(metrics.metrics[c])}</th>`).join("")}</tr>`;
      const rows = b.systems.map((s) =>
        `<tr><td>${systemLabel(s)}</td>${cols.map((c) => `<td>${scoreCell(s.scores[c])}</td>`).join("")}</tr>`
      ).join("");
      const notes = b.systems.filter((s) => s.notes && s.notes.length).map((s) =>
        `<li><b>${esc(s.model)} + ${esc(s.harness)}</b>：${s.notes.map(esc).join(" ")}</li>`).join("");

      // 任务级明细：结构先留好，数据未到时显示占位
      const td = b.task_details || {};
      let detail;
      if (td.available && td.rows && td.rows.length) {
        const dRows = td.rows.map((r) =>
          `<tr><td>${esc(r.task)}</td><td>${esc(r.system)}</td>${cols.map((c) => `<td>${scoreCell(r.scores && r.scores[c])}</td>`).join("")}</tr>`).join("");
        detail = `<div class="table-scroll" tabindex="0"><table class="scores"><thead><tr><th>任务</th><th>组合</th>` +
          `${cols.map((c) => `<th>${metricHead(metrics.metrics[c])}</th>`).join("")}</tr></thead><tbody>${dRows}</tbody></table></div>`;
      } else {
        const placeholder = (td.rows || []).length
          ? `<div class="task-chips">${td.rows.map((r) => `<span class="chip">${esc(r.task)}</span>`).join("")}</div>` : "";
        detail = `<p class="muted small">${esc(td.note || "任务级明细待补。")}</p>${placeholder}`;
      }

      return `<section class="card" id="${esc(b.id)}">
        <div class="section-eyebrow">BATCH</div>
        <h2>${esc(b.title)} ${statusBadge(batchData.status_types, b.status, false)}</h2>
        <dl class="meta-list">
          <dt>状态</dt><dd>${esc(st.desc || "")}</dd>
          <dt>口径</dt><dd>${esc(b.caliber)}</dd>
          <dt>任务</dt><dd>${esc(b.tasks)}</dd>
          <dt>说明</dt><dd>${esc(b.summary)}</dd>
        </dl>
        ${multi ? `<p class="small"><span class="badge uncontrolled">非受控对比</span> 本批次各组合之间只是开发观察，不构成受控对比。</p>` : ""}
        <div class="table-scroll" tabindex="0"><table class="scores"><thead>${head}</thead><tbody>${rows}</tbody></table></div>
        ${notes ? `<h3>观察备注</h3><ul>${notes}</ul>` : ""}
        ${legacyBlock(metrics, b)}
        <h3>任务级明细</h3>
        ${detail}
      </section>`;
    }).join("");
    el.innerHTML = tabs + sections;
    if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
  }

  // 方法页
  function renderMethod(el, metrics) {
    const byDim = {};
    metrics.columns.forEach((c) => {
      const m = metrics.metrics[c];
      (byDim[m.dimension] = byDim[m.dimension] || []).push(m);
    });
    const dimTitle = { Write: "Write（写记忆）", Read: "Read（读记忆）" };
    const blocks = Object.entries(byDim).map(([dim, ms]) =>
      `<section class="card"><div class="section-eyebrow">${esc(dim.toUpperCase())}</div><h2>${esc(dimTitle[dim] || dim)}</h2>` +
      ms.map((m) => `<div class="metric-block"><h3>${tex(m.tex)} · ${esc(m.name_zh)}</h3>` +
        `<div class="formula">${tex(m.formula, true)}</div><p class="small muted">${esc(m.caliber_note || "")}</p></div>`).join("") +
      `</section>`).join("");

    const lm = metrics.legacy_v1 || {};
    const legacy = Object.values(lm).filter((m) => m && m.formula).map((m) =>
      `<div class="metric-block"><h3>${tex(m.tex)} · ${esc(m.name_zh)}</h3><div class="formula">${tex(m.formula, true)}</div>` +
      (m.extra ? `<p class="small muted">${esc(m.extra)}</p>` : "") + `</div>`).join("");

    el.innerHTML = blocks + `<section class="card"><div class="section-eyebrow">CALIBER</div><h2>口径版本说明</h2>
      <p>v2 口径于 2026-10-21 定稿。召回率 ${tex("R_W")}、${tex("R_E")} 在 v1 和 v2 中定义相同；两个精确率换成了 v2 定义（新增有效图片保存率 / 送达率），分母与 v1 不同。</p>
      <ul>
        <li>batch012 用 v1 测量，其 ${tex("R_W")}、${tex("R_E")} 可以直接展示；${tex("P_W^{(v2)}")}、${tex("P_E^{(v2)}")} 需按新定义重算，目前记为“待重算”。</li>
        <li>batch020 使用 v2 口径。</li>
        <li>v1 精确率不能换算成 v2，只在折叠备注里出现，并标明是 v1。</li>
      </ul>
      <details class="legacy"><summary>v1 旧口径的精确率定义（已弃用，仅供查阅）</summary>${legacy}</details>
    </section>`;
  }

  function renderSiteChrome(site) {
    document.querySelectorAll("[data-site]").forEach((n) => {
      const v = site[n.dataset.site];
      if (typeof v === "string") n.textContent = v;
    });
    const about = document.getElementById("about");
    if (about) {
      about.innerHTML = `${site.about.map((p) => `<p>${esc(p)}</p>`).join("")}
        <div class="grid-2">${site.dimensions.map((d) =>
          `<div class="dim-box"><b>${esc(d.key)}（${esc(d.name_zh)}）</b><p>${esc(d.desc)}</p></div>`).join("")}</div>
        <h3>任务（${esc(site.environment)}，${site.tasks.length} 个）</h3>
        <div class="task-chips">${site.tasks.map((t) => `<span class="chip">${esc(t)}</span>`).join("")}</div>`;
    }
    const rl = document.getElementById("red-lines");
    if (rl) rl.innerHTML = `<strong>口径红线</strong><ul>${site.red_lines.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>`;
  }

  async function main() {
    const page = document.body.dataset.page;
    const target = document.getElementById("content");
    try {
      const [site, metrics, batches] = await Promise.all([loadJSON(DATA.site), loadJSON(DATA.metrics), loadJSON(DATA.batches)]);
      renderSiteChrome(site);
      if (page === "home") renderOverview(target, metrics, batches);
      else if (page === "batches") renderBatches(target, metrics, batches);
      else if (page === "method") renderMethod(target, metrics);
    } catch (err) {
      const hint = location.protocol === "file:"
        ? "当前是直接打开本地文件（file://），浏览器会阻止读取 JSON。请在站点目录运行 python3 -m http.server 后访问 http://localhost:8000/。"
        : "";
      target.innerHTML = `<div class="error-box">数据加载失败：${esc(err.message)}。${esc(hint)}</div>`;
      console.error(err);
    }
  }

  document.addEventListener("DOMContentLoaded", main);
})();
