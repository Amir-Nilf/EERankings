// Loads the ranking data, computes scores and renders the page.
(function () {
  "use strict";

  const DISCS = {
    ee: { brand: "EERankings", title: "Electrical Engineering", dept: "electrical engineering" },
    me: { brand: "MERankings", title: "Mechanical Engineering", dept: "mechanical engineering" },
  };

  const EUROPE = "ad al at ba be bg by ch cy cz de dk ee es fi fo fr gb gi gr hr hu ie is it li lt lu lv mc md me mk mt nl no pl pt ro rs ru se si sk sm tr ua va xk".split(" ");
  const ASIA = "ae af am az bd bh bn bt cn ge hk id il in iq ir jo jp kg kh kr kw kz la lb lk mm mn mo mv my np om ph pk ps qa sa sg sy th tj tm tw uz vn ye".split(" ");
  const LATAM = "ar bo br cl co cr cu do ec gt hn jm mx ni pa pe pr py sv tt uy ve".split(" ");
  const AFRICA = "ao bf bi bj bw cd cf cg ci cm cv dj dz eg er et ga gh gm gn gq gw ke km lr ls ly ma mg ml mr mu mw mz na ne ng rw sc sd sl sn so ss st sz td tg tn tz ug za zm zw".split(" ");
  const REGIONS = [
    { code: "us", name: "USA", flag: "us", has: (c) => c === "us" },
    { code: "canada", name: "Canada", flag: "ca", has: (c) => c === "ca" },
    { code: "northamerica", name: "North America", flag: "", has: (c) => c === "us" || c === "ca" },
    { code: "europe", name: "Europe", flag: "eu", has: (c) => EUROPE.includes(c) },
    { code: "asia", name: "Asia", flag: "", has: (c) => ASIA.includes(c) },
    { code: "australasia", name: "Australasia", flag: "au", has: (c) => c === "au" || c === "nz" },
    { code: "latinamerica", name: "Latin America", flag: "", has: (c) => LATAM.includes(c) },
    { code: "africa", name: "Africa", flag: "", has: (c) => AFRICA.includes(c) },
    { code: "world", name: "World", flag: "", has: () => true },
  ];
  const countryName = (() => {
    try {
      const names = new Intl.DisplayNames(["en"], { type: "region" });
      return (c) => names.of(c.toUpperCase()) || c;
    } catch (e) {
      return (c) => c.toUpperCase();
    }
  })();
  const flagUrl = (c) => (c ? `https://flagcdn.com/w20/${c}.png` : "");

  // Faculty button icon
  const ICON_PERSON = '<svg width="17" height="17" viewBox="0 0 512 512" fill="currentColor" fill-rule="evenodd" aria-hidden="true"><path d="M256 31a225 225 0 1 0 0 450 225 225 0 0 0 0-450zM256 140a81 81 0 1 1 0 162 81 81 0 0 1 0-162zM116 386c24-36 54-61 84-70 15 9 35 13 56 13s41-4 56-13c30 9 60 34 84 70-36 42-86 64-140 64s-104-22-140-64z"/></svg>';

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

  const cache = {};
  let D = null;          // current discipline's data
  let disc = "ee";
  let sel = new Set();   // selected venue indices
  let fromYear, toYear, region = "us";
  let advisorMode = false; // false = count ranking, true = Advisor Index
  let openChart = new Set(), openFac = new Set(), openFacChart = new Set(), openArea = new Set();
  let lastRanking = { depts: [], areaOn: [] };

  // Data

  function prepare(raw) {
    const venues = [], areas = [], cats = [];
    raw.categories.forEach((c, ci) => {
      const cat = { ...c, idx: ci, areaIdx: [] };
      cats.push(cat);
      c.areas.forEach((a) => {
        const area = { ...a, cat: ci, idx: areas.length, venueIdx: [] };
        a.venues.forEach((v) => {
          area.venueIdx.push(venues.length);
          venues.push({ ...v, area: area.idx });
        });
        cat.areaIdx.push(area.idx);
        areas.push(area);
      });
    });
    const venueArea = Int32Array.from(venues.map((v) => v.area));
    return { ...raw, venues, areas, cats, venueArea };
  }

  async function load(d) {
    if (!cache[d]) {
      const res = await fetch(`data/${d}.json`);
      if (!res.ok) throw new Error(`data/${d}.json: ${res.status}`);
      cache[d] = prepare(await res.json());
    }
    return cache[d];
  }

  // URL format: #/discipline/region/areas[/from-to][/advisor]

  function parseHash() {
    const parts = decodeURIComponent(location.hash || "").replace(/^#\/?/, "").split("/").filter(Boolean);
    const out = { disc: DISCS[parts[0]] ? parts[0] : "ee", region: parts[1], tokens: parts[2] ? parts[2].split(",") : [] };
    const rest = parts.slice(3);
    const years = rest.map((p) => p.match(/^(\d{4})-(\d{4})$/)).find(Boolean);
    if (years) {
      out.from = +years[1];
      out.to = +years[2];
    }
    out.advisor = rest.includes("advisor");
    return out;
  }

  function writeHash() {
    let toks = [];
    if (sel.size === D.venues.length) toks = ["all"];
    else if (!sel.size) toks = ["none"];
    else {
      D.areas.forEach((a) => {
        const on = a.venueIdx.filter((v) => sel.has(v));
        if (on.length === a.venueIdx.length) toks.push(a.code);
        else if (on.length) toks.push(a.code + "." + on.map((v) => a.venueIdx.indexOf(v)).join("."));
      });
    }
    let h = `#/${disc}/${region}/${toks.join(",")}`;
    if (fromYear !== D.years[0] || toYear !== D.years[1]) h += `/${fromYear}-${toYear}`;
    if (advisorMode) h += "/advisor";
    history.replaceState(null, "", h);
  }

  function applyTokens(tokens) {
    sel = new Set();
    let any = false;
    for (const t of tokens || []) {
      if (t === "all") {
        D.venues.forEach((_, i) => sel.add(i));
        any = true;
        continue;
      }
      if (t === "none") {
        any = true;
        continue;
      }
      const [code, ...sub] = t.split(".");
      const a = D.areas.find((x) => x.code === code);
      if (a) {
        any = true;
        (sub.length ? sub.map((n) => a.venueIdx[+n]).filter((v) => v !== undefined) : a.venueIdx).forEach((v) => sel.add(v));
      }
    }
    if (!any) D.venues.forEach((_, i) => sel.add(i));
  }

  // Ranking

  function regionTest() {
    const r = REGIONS.find((x) => x.code === region);
    return r ? r.has : (c) => c === region;
  }

  function compute() {
    const nA = D.areas.length;
    const areaOn = D.areas.map((a) => a.venueIdx.some((v) => sel.has(v)));
    const nOn = areaOn.filter(Boolean).length;
    const venuesOn = D.areas.map((a) => a.venueIdx.filter((v) => sel.has(v)).length);
    const inRegion = regionTest();
    const depts = new Map();
    for (const f of D.faculty) {
      const inst = D.insts[f[1]];
      if (!inRegion(inst[1])) continue;
      let cnt = 0, adj = 0, areaAdj = null, areaInf = null;
      for (const r of f[3]) {
        if (r[1] < fromYear || r[1] > toYear || !sel.has(r[0])) continue;
        if (!areaAdj) {
          areaAdj = new Float64Array(nA);
          areaInf = new Float64Array(nA);
        }
        const a = D.venueArea[r[0]];
        areaAdj[a] += r[3];
        areaInf[a] += r[4] * 2 ** (-(toYear - r[1]) / 3); // influence halves every 3 years
        cnt += r[2];
        adj += r[3];
      }
      if (!areaAdj) continue;
      let d = depts.get(f[1]);
      if (!d) {
        d = { inst: f[1], areaAdj: new Float64Array(nA), areaStrength: new Float64Array(nA), fac: [] };
        depts.set(f[1], d);
      }
      const areaStrength = new Float64Array(nA);
      let strength = 0;
      for (let i = 0; i < nA; i++) {
        d.areaAdj[i] += areaAdj[i];
        if (areaInf[i] > 0) {
          areaStrength[i] = Math.sqrt(areaInf[i] / venuesOn[i]);
          d.areaStrength[i] += areaStrength[i];
          strength += areaStrength[i];
        }
      }
      d.fac.push({ f, cnt, adj, areaAdj, areaStrength, strength });
    }
    const out = [];
    for (const d of depts.values()) {
      let logSum = 0, rootSum = 0;
      for (let i = 0; i < nA; i++) {
        if (!areaOn[i]) continue;
        logSum += Math.log(d.areaAdj[i] + 1);
        rootSum += Math.sqrt(d.areaStrength[i]);
      }
      if (!nOn) d.score = 0;
      else d.score = advisorMode ? (rootSum / nOn) ** 2 : Math.exp(logSum / nOn) - 1;
      d.fac.sort(advisorMode ? (a, b) => b.strength - a.strength : (a, b) => b.adj - a.adj || b.cnt - a.cnt);
      out.push(d);
    }
    out.sort((a, b) => b.score - a.score || b.fac.length - a.fac.length);
    if (advisorMode && out.length && out[0].score > 0) {
      const top = out[0].score;
      out.forEach((d) => {
        d.score *= 100 / top;
      });
    }
    return { depts: out, areaOn };
  }

  // Rendering

  function chartSvg(values, areaOn) {
    const items = D.areas.map((a, i) => ({ a, v: values[i] })).filter((x) => areaOn[x.a.idx] && x.v > 0.0005);
    if (!items.length) return '<span class="area-tag">No papers in the selected areas.</span>';
    const max = Math.max(...items.map((x) => x.v));
    const rowH = 19, labelW = 190, barW = 210, W = labelW + barW + 46;
    const H = items.length * rowH + 2;
    let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${advisorMode ? "Advisor strength" : "Author credit"} by area">`;
    items.forEach((x, k) => {
      const y = k * rowH + 1, w = Math.max(4, (x.v / max) * barW), flat = (w - 4).toFixed(1);
      s += `<text x="${labelW - 8}" y="${y + 13}" text-anchor="end">${esc(x.a.name)}</text>`;
      s += `<path class="bar" d="M${labelW} ${y + 5}h${flat}a4 4 0 0 1 4 4v0a4 4 0 0 1-4 4h-${flat}z" fill="var(--cat-${x.a.cat})"><title>${esc(x.a.name)}: ${x.v.toFixed(1)} ${advisorMode ? "strength" : "credit"}</title></path>`;
      s += `<text class="val" x="${labelW + w + 6}" y="${y + 13}">${x.v.toFixed(1)}</text>`;
    });
    const cats = [...new Set(items.map((x) => x.a.cat))];
    const legend = cats.map((c) => `<span style="--c:var(--cat-${c})"><i></i>${esc(D.cats[c].name)}</span>`).join("");
    return s + `</svg><div class="legend">${legend}</div>`;
  }

  function detailHtml(d, areaOn) {
    const chart = openChart.has(d.inst) ? `<div class="chart">${chartSvg(advisorMode ? d.areaStrength : d.areaAdj, areaOn)}</div>` : "";
    if (!openFac.has(d.inst)) return chart;
    let h = chart +
      '<table class="faculty"><thead><tr><th class="fac-indent"></th>' +
      '<th><abbr title="Select a name to open the OpenAlex profile. Select elsewhere on the row for a breakdown by area.">Faculty</abbr></th>' +
      '<th class="r fac-num"><abbr title="Papers in the selected areas and years. Select a number to see the person&#39;s works on OpenAlex.">#&nbsp;Pubs</abbr></th>' +
      (advisorMode ? '<th class="r fac-num"><abbr title="This person&#39;s advisor strength, added up across the selected areas.">Strength</abbr></th>'
        : '<th class="r fac-num"><abbr title="Each paper counts as 1 divided by its number of authors.">Adj.&nbsp;#</abbr></th>') + '</tr></thead><tbody>';
    d.fac.forEach((x) => {
      const [name, , aid] = x.f;
      const tags = D.areas.map((a, i) => ({ a, v: x.areaAdj[i] })).filter((t) => t.v > 0)
        .sort((p, q) => q.v - p.v).slice(0, 3)
        .map((t) => `<span class="area-tag" title="${esc(t.a.name)}">${esc(t.a.code)}</span>`).join("");
      const key = d.inst + ":" + aid;
      const open = openFacChart.has(key);
      const oa = `https://openalex.org/${aid}`;
      const scholar = `https://scholar.google.com/citations?view_op=search_authors&mauthors=${encodeURIComponent(name)}`;
      const works = `https://openalex.org/works?filter=authorships.author.id:${aid}`;
      h += `<tr class="fac-row" data-key="${esc(key)}"><td class="fac-indent"><button class="caret${open ? " open" : ""}" type="button" aria-expanded="${open}" aria-label="Show or hide ${esc(name)}'s papers by area"></button></td>` +
        `<td><div class="fac-line"><a href="${oa}" target="_blank" rel="noopener" title="Open ${esc(name)}'s OpenAlex profile">${esc(name)}</a>${tags}` +
        `<a class="inst-link scholar" href="${scholar}" target="_blank" rel="noopener" aria-label="Search Google Scholar for ${esc(name)}">Scholar</a></div></td>` +
        `<td class="r"><a href="${works}" target="_blank" rel="noopener">${x.cnt}</a></td><td class="r">${advisorMode ? x.strength.toFixed(2) : x.adj.toFixed(1)}</td></tr>`;
      h += `<tr${open ? "" : " hidden"} data-facchart="${esc(key)}"><td colspan="4"><div class="chart">${open ? chartSvg(advisorMode ? x.areaStrength : x.areaAdj, areaOn) : ""}</div></td></tr>`;
    });
    return h + "</tbody></table>";
  }

  function renderTable() {
    const { depts, areaOn } = compute();
    lastRanking = { depts, areaOn };
    let h = "", rank = 0, prev = null;
    depts.forEach((d, i) => {
      const shown = d.score.toFixed(1);
      if (shown !== prev) { rank = i + 1; prev = shown; }
      const [name, country] = D.insts[d.inst];
      const chartOpen = openChart.has(d.inst), facOpen = openFac.has(d.inst);
      h += `<tr class="inst-row" data-inst="${d.inst}"><td class="rank-cell">${rank}</td><td><div class="inst-line">` +
        `<button class="caret${chartOpen ? " open" : ""}" type="button" aria-expanded="${chartOpen}" aria-label="Show or hide the chart for ${esc(name)}"></button>` +
        `<span class="inst-name">${esc(name)}</span>` +
        (country ? `<img class="flag" src="${flagUrl(country)}" alt="${esc(countryName(country))}" title="${esc(countryName(country))}" loading="lazy">` : "") +
        `<button class="fac-btn${facOpen ? " open" : ""}" type="button" aria-expanded="${facOpen}" title="Show or hide faculty" aria-label="Show or hide faculty at ${esc(name)}">${ICON_PERSON}</button>` +
        `</div></td><td class="num-cell">${shown}</td><td class="num-cell">${d.fac.length}</td></tr>`;
      h += `<tr${chartOpen || facOpen ? "" : " hidden"} data-detail="${d.inst}"><td colspan="4" class="detail-cell">${detailHtml(d, areaOn)}</td></tr>`;
    });
    if (!depts.length) h = `<tr><td colspan="4" class="area-tag" style="padding:20px 8px">No institutions match. Try another region, more areas or a wider year range.</td></tr>`;
    $("ranking-body").innerHTML = h;
    $("areas-toggle-count").textContent = `${areaOn.filter(Boolean).length} of ${D.areas.length}`;
  }

  function onTableClick(e) {
    if (e.target.closest("a")) return;
    const facRow = e.target.closest(".fac-row");
    if (facRow) {
      const key = facRow.dataset.key;
      const row = facRow.nextElementSibling;
      const open = !openFacChart.has(key);
      if (open) {
        const [inst, aid] = key.split(":");
        const x = lastRanking.depts.find((d) => d.inst === +inst).fac.find((y) => y.f[2] === aid);
        openFacChart.add(key);
        row.querySelector(".chart").innerHTML = chartSvg(advisorMode ? x.areaStrength : x.areaAdj, lastRanking.areaOn);
      } else openFacChart.delete(key);
      row.hidden = !open;
      setCaret(facRow, open);
      return;
    }
    const instRow = e.target.closest(".inst-row");
    if (!instRow) return;
    // Person icon toggles the faculty list, the rest of the row toggles the chart
    const facBtn = e.target.closest(".fac-btn");
    const inst = +instRow.dataset.inst;
    const openSet = facBtn ? openFac : openChart;
    const open = !openSet.has(inst);
    if (open) openSet.add(inst); else openSet.delete(inst);
    const row = instRow.nextElementSibling;
    row.firstElementChild.innerHTML = detailHtml(lastRanking.depts.find((d) => d.inst === inst), lastRanking.areaOn);
    row.hidden = !openChart.has(inst) && !openFac.has(inst);
    if (facBtn) {
      facBtn.classList.toggle("open", open);
      facBtn.setAttribute("aria-expanded", String(open));
    } else setCaret(instRow, open);
  }

  function setCaret(row, open) {
    const c = row.querySelector(".caret");
    c.classList.toggle("open", open);
    c.setAttribute("aria-expanded", String(open));
  }

  function renderAreas() {
    let h = "";
    D.cats.forEach((c) => {
      h += `<div class="cat-group" style="--c:var(--cat-${c.idx})"><button class="cat-head" type="button" data-cat="${c.idx}" title="Turn all ${esc(c.name)} areas on or off"><span>${esc(c.name)}</span></button>`;
      c.areaIdx.forEach((ai) => {
        const a = D.areas[ai];
        const on = a.venueIdx.filter((v) => sel.has(v)).length;
        const open = openArea.has(a.code);
        h += `<div class="area-row"><button class="caret${open ? " open" : ""}" type="button" data-area-toggle="${ai}" aria-expanded="${open}" aria-label="Show or hide venues for ${esc(a.name)}"></button>` +
          `<button class="area-name" type="button" data-area-toggle="${ai}">${esc(a.name)}</button>` +
          `<input class="check" type="checkbox" id="area-${ai}" data-area="${ai}" ${on ? "checked" : ""} aria-label="${esc(a.name)}"></div>`;
        h += `<div class="venues"${open ? "" : " hidden"} data-venues="${ai}">`;
        a.venueIdx.forEach((vi) => {
          const v = D.venues[vi];
          h += `<label class="venue-row"><span><b>${esc(v.short)}</b>${esc(v.name)}</span>` +
            `<input class="check" type="checkbox" id="venue-${vi}" data-venue="${vi}" ${sel.has(vi) ? "checked" : ""}></label>`;
        });
        h += "</div>";
      });
      h += "</div>";
    });
    $("areas").innerHTML = h;
    syncAreaControls();
  }

  function syncAreaControls() {
    D.areas.forEach((a, ai) => {
      const on = a.venueIdx.filter((v) => sel.has(v)).length;
      const cb = document.querySelector(`input[data-area="${ai}"]`);
      cb.checked = on > 0;
      cb.indeterminate = on > 0 && on < a.venueIdx.length;
      a.venueIdx.forEach((vi) => {
        document.querySelector(`input[data-venue="${vi}"]`).checked = sel.has(vi);
      });
    });
    $("all-left").checked = sel.size === D.venues.length;
  }

  function toggleCat(ci) {
    const vs = D.cats[ci].areaIdx.flatMap((ai) => D.areas[ai].venueIdx);
    const allOn = vs.every((v) => sel.has(v));
    vs.forEach((v) => (allOn ? sel.delete(v) : sel.add(v)));
    update();
  }

  function onAreasClick(e) {
    const t = e.target;
    const toggle = t.closest("[data-area-toggle]");
    const cat = t.closest("[data-cat]");
    if (t.dataset.area !== undefined) {
      const a = D.areas[+t.dataset.area];
      a.venueIdx.forEach((v) => (t.checked ? sel.add(v) : sel.delete(v)));
      update();
    } else if (t.dataset.venue !== undefined) {
      t.checked ? sel.add(+t.dataset.venue) : sel.delete(+t.dataset.venue);
      update();
    } else if (toggle) {
      const ai = +toggle.dataset.areaToggle, a = D.areas[ai];
      const box = document.querySelector(`[data-venues="${ai}"]`);
      const row = toggle.closest(".area-row");
      const open = !openArea.has(a.code);
      if (open) openArea.add(a.code); else openArea.delete(a.code);
      box.hidden = !open;
      setCaret(row, open);
    } else if (cat) {
      toggleCat(+cat.dataset.cat);
    }
  }

  function setAll(on) {
    sel = new Set(on ? D.venues.map((_, i) => i) : []);
    update();
  }

  // Controls

  function renderRegions() {
    const present = [...new Set(D.insts.map((i) => i[1]).filter(Boolean))]
      .sort((a, b) => countryName(a).localeCompare(countryName(b)));
    let h = REGIONS.map((r) => `<option value="${r.code}">${r.name}</option>`).join("");
    h += '<option disabled>──────────</option>';
    h += present.map((c) => `<option value="${c}">${esc(countryName(c))}</option>`).join("");
    $("region").innerHTML = h;
    if (![...$("region").options].some((o) => o.value === region && !o.disabled)) region = "us";
    $("region").value = region;
    syncFlag();
  }

  function syncFlag() {
    const r = REGIONS.find((x) => x.code === region);
    $("region-flag").src = r ? flagUrl(r.flag) : flagUrl(region);
  }

  function setupYears() {
    const [lo, hi] = D.years;
    for (const id of ["fromyear", "toyear"]) {
      const el = $(id);
      el.min = lo;
      el.max = hi;
      el.step = 1;
    }
    fromYear = Math.min(Math.max(fromYear || lo, lo), hi);
    toYear = Math.max(Math.min(toYear || hi, hi), fromYear);
    $("fromyear").value = fromYear;
    $("toyear").value = toYear;
    syncYears();
  }

  function syncYears() {
    const [lo, hi] = D.years;
    $("fromyear-label").textContent = fromYear;
    $("toyear-label").textContent = toYear;
    const span = Math.max(1, hi - lo);
    $("track-fill").style.left = ((fromYear - lo) / span) * 100 + "%";
    $("track-fill").style.right = ((hi - toYear) / span) * 100 + "%";
  }

  function onYearInput(e) {
    let f = +$("fromyear").value, t = +$("toyear").value;
    if (f > t) {
      if (e.target.id === "fromyear") f = t;
      else t = f;
    }
    $("fromyear").value = f;
    $("toyear").value = t;
    fromYear = f;
    toYear = t;
    syncYears();
    clearTimeout(onYearInput.timer);
    onYearInput.timer = setTimeout(() => {
      renderTable();
      writeHash();
    }, 60);
  }

  function setTitles() {
    const m = DISCS[disc];
    $("brand").textContent = m.brand;
    $("disc-title").textContent = m.title;
    $("disc-lower").textContent = m.dept;
    document.title = `${m.brand}: ${m.title} Rankings`;
    document.querySelectorAll(".disc-toggle button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.disc === disc)));
    $("pi-min").textContent = D.pi_min;
    $("generated").textContent = D.generated;
  }

  function syncMode() {
    $("mode-btn").setAttribute("aria-pressed", String(advisorMode));
    $("count-head").textContent = advisorMode ? "Index" : "Count";
    $("count-head").title = advisorMode
      ? "Advisor Index, scaled so the top institution in view scores 100. The FAQ explains how it works."
      : "Geometric mean of the institution's author credit across the selected areas.";
  }

  function update() {
    syncAreaControls();
    renderTable();
    writeHash();
  }

  async function switchDisc(d, tokens) {
    $("loading").hidden = false;
    try {
      D = await load(d);
    } catch (err) {
      $("loading").textContent = "The ranking data didn't load (" + err.message + "). If you opened index.html directly, serve the folder instead: python -m http.server";
      return;
    }
    disc = d;
    $("loading").hidden = true;
    openChart.clear();
    openFac.clear();
    openFacChart.clear();
    openArea.clear();
    applyTokens(tokens);
    setTitles();
    renderRegions();
    setupYears();
    renderAreas();
    renderTable();
    writeHash();
  }

  function init() {
    const h = parseHash();
    if (h.region) region = h.region;
    fromYear = h.from;
    toYear = h.to;
    advisorMode = h.advisor;
    syncMode();
    $("ranking-body").addEventListener("click", onTableClick);
    $("areas").addEventListener("click", onAreasClick);
    $("all-left").addEventListener("change", (e) => setAll(e.target.checked));
    $("region").addEventListener("change", (e) => {
      region = e.target.value;
      syncFlag();
      renderTable();
      writeHash();
    });
    $("fromyear").addEventListener("input", onYearInput);
    $("toyear").addEventListener("input", onYearInput);
    $("mode-btn").addEventListener("click", () => {
      advisorMode = !advisorMode;
      syncMode();
      renderTable();
      writeHash();
    });
    $("faq-btn").addEventListener("click", () => {
      $("faq").hidden = !$("faq").hidden;
      $("faq-btn").setAttribute("aria-expanded", String(!$("faq").hidden));
    });
    $("areas-toggle").addEventListener("click", () => {
      const open = $("filter-panel").classList.toggle("open");
      $("areas-toggle").setAttribute("aria-expanded", String(open));
    });
    document.querySelectorAll(".disc-toggle button").forEach((b) =>
      b.addEventListener("click", () => {
        if (b.dataset.disc === disc) return;
        fromYear = toYear = undefined;
        switchDisc(b.dataset.disc, ["all"]);
      }));
    switchDisc(h.disc, h.tokens);
  }

  init();
})();
