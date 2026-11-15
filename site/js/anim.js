/* =========================================================================
   Animations that explain the difficult substances (conceptual illustrations)
   Each function fills a container and returns a cleanup function.
   ========================================================================= */
window.ANIM = (function () {
  const reduit = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pct = (x) => `${Math.round(x * 100)} %`;

  // ------------------------------------------------------------------ semesters
  function semestres(el) {
    const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    el.innerHTML = `<div class="sem-anim">
      <div class="sem-months">${M.map((m, i) => `<span class="m ${i < 6 ? "s1" : "s2"}" style="--i:${i}">${m}</span>`).join("")}</div>
      <div class="sem-boxes"><div class="sb s1"><b>S1</b> January → June</div><div class="sb s2"><b>S2</b> July → December</div></div>
      <div class="sem-line"><svg viewBox="0 0 600 70" aria-hidden="true">
        <line x1="10" y1="60" x2="590" y2="60" class="axe"/>
        ${Array.from({ length: 12 }, (_, k) => { const x = 25 + k * 48; const y = 40 - 14 * Math.sin(k * Math.PI) + (k % 2 ? 8 : -6) - k * 1.6; return `<circle cx="${x}" cy="${y.toFixed(0)}" r="6" class="pt ${k % 2 ? "s2" : "s1"}" style="--k:${k}"/>`; }).join("")}
      </svg><p>One value every 6 months → 2 points per year → about 44 points from 2004 to 2026.</p></div>
      <button class="btn small" data-rejouer>Play again</button></div>`;
    const go = () => { const b = el.querySelector(".sem-anim"); b.classList.remove("on"); void b.offsetWidth; b.classList.add("on"); };
    el.querySelector("[data-rejouer]").addEventListener("click", go);
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) { go(); io.disconnect(); } });
    io.observe(el);
    return () => io.disconnect();
  }

  // ------------------------------------------------------------------ AOT
  function aot(el) {
    el.innerHTML = `<div class="anim-grid">
      <svg class="anim-svg" viewBox="0 0 520 300" role="img" aria-label="Sunlight crossing a layer of dust particles">
        <defs><linearGradient id="ciel-aot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" data-c1 stop-color="#5aa9ff"/><stop offset="1" data-c2 stop-color="#cfe8ff"/></linearGradient></defs>
        <rect width="520" height="300" fill="url(#ciel-aot)"/>
        <circle cx="70" cy="55" r="30" fill="#ffd34d"/><circle cx="70" cy="55" r="42" fill="#ffd34d" opacity=".25"/>
        <g data-rayons></g>
        <rect x="0" y="120" width="520" height="90" fill="#c89b5a" data-couche opacity=".2"/>
        <text x="510" y="135" text-anchor="end" font-size="12" fill="#3b2a12">particle layer (dust, smoke)</text>
        <g data-grains></g>
        <rect x="0" y="250" width="520" height="50" fill="#d9b77a"/>
        <g transform="translate(380 222)"><rect x="0" y="0" width="90" height="34" fill="#1d3557" transform="skewX(-20)"/><line x1="0" y1="17" x2="90" y2="17" stroke="#8ecae6" transform="skewX(-20)"/><line x1="30" y1="0" x2="30" y2="34" stroke="#8ecae6" transform="skewX(-20)"/><line x1="60" y1="0" x2="60" y2="34" stroke="#8ecae6" transform="skewX(-20)"/><rect x="34" y="34" width="6" height="14" fill="#555"/></g>
        <text x="425" y="292" text-anchor="middle" font-size="12" fill="#3b2a12">solar panel</text>
      </svg>
      <div class="anim-ctrl">
        <label>Aerosol optical thickness (AOT): <b data-v>0.25</b><input type="range" min="0" max="1.2" step="0.01" value="0.25" data-r></label>
        <div class="chips"><button class="chip" data-p="0.05">Clear sky 0.05</button><button class="chip" data-p="0.14">World mean ≈ 0.14</button>
          <button class="chip" data-p="0.25">Morocco ≈ 0.25</button><button class="chip" data-p="0.8">Strong dust event 0.8</button></div>
        <div class="big-num" data-t>78 %</div>
        <p data-txt></p>
        <p class="small muted">Sun 30° from the vertical. Direct sunlight transmitted = e<sup>−AOT / cos 30°</sup> (Beer–Lambert law). World and Morocco values: order of magnitude read on the team's MERRA-2 figures.</p>
      </div></div>`;
    const r = el.querySelector("[data-r]"), grains = el.querySelector("[data-grains]"), rayons = el.querySelector("[data-rayons]");
    let parts = [], raf = null;
    function maj() {
      const a = +r.value, T = Math.exp(-a / Math.cos(Math.PI / 6));
      el.querySelector("[data-v]").textContent = a.toFixed(2);
      el.querySelector("[data-t]").textContent = pct(T);
      el.querySelector("[data-txt]").innerHTML = `of the direct sunlight reaches the panel; <b>${pct(1 - T)}</b> is scattered or absorbed by particles. ${a < .1 ? "A very clean, deep-blue sky." : a < .3 ? "A normal, slightly hazy sky." : a < .6 ? "A hazy sky: the Sun looks pale." : "A dust storm: the sky turns beige and the Sun is dim."}`;
      el.querySelector("[data-couche]").setAttribute("opacity", Math.min(.75, .1 + a * .55).toFixed(2));
      el.querySelector("[data-c1]").setAttribute("stop-color", a > .5 ? "#c9b48d" : a > .25 ? "#8fb6e0" : "#5aa9ff");
      el.querySelector("[data-c2]").setAttribute("stop-color", a > .5 ? "#e8d3a8" : "#cfe8ff");
      rayons.innerHTML = [0, 1, 2, 3, 4].map((k) => `<line x1="${85 + k * 6}" y1="70" x2="${370 + k * 22}" y2="230" stroke="#ffd34d" stroke-width="4" opacity="${(.15 + .85 * T).toFixed(2)}" stroke-dasharray="${T < .5 ? "6 6" : "0"}"/>`).join("");
      const n = Math.round(a * 140);
      while (parts.length < n) parts.push({ x: Math.random() * 520, y: 125 + Math.random() * 80, v: .3 + Math.random() * .8, s: 1 + Math.random() * 2.2 });
      parts.length = n;
      dessiner();
    }
    function dessiner() { grains.innerHTML = parts.map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${p.s.toFixed(1)}" fill="#8a5a2b" opacity=".8"/>`).join(""); }
    function boucle() { parts.forEach((p) => { p.x = (p.x + p.v) % 520; p.y += Math.sin((p.x + p.s * 40) / 30) * .2; }); dessiner(); raf = requestAnimationFrame(boucle); }
    r.addEventListener("input", maj);
    el.querySelectorAll("[data-p]").forEach((b) => b.addEventListener("click", () => { r.value = b.dataset.p; maj(); }));
    maj();
    if (!reduit) raf = requestAnimationFrame(boucle);
    return () => cancelAnimationFrame(raf);
  }

  // ------------------------------------------------------------------ Snowmelt
  function neige(el) {
    const M = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const stock = [.85, 1, .85, .55, .25, .05, 0, 0, 0, .05, .3, .6];          // conceptual snowpack
    const fonte = [.05, .1, .45, .85, .7, .2, 0, 0, 0, 0, 0, .02];           // conceptual melt
    el.innerHTML = `<div class="anim-grid">
      <svg class="anim-svg" viewBox="0 0 520 300" role="img" aria-label="Snow melting on the Atlas mountains and filling a dam">
        <rect width="520" height="300" fill="#bfe3ff" data-ciel/>
        <circle cx="460" cy="50" r="24" fill="#ffd34d" data-soleil/>
        <polygon points="40,240 170,70 250,150 330,60 470,240" fill="#7b6a58"/>
        <clipPath id="clip-mont"><polygon points="40,240 170,70 250,150 330,60 470,240"/></clipPath>
        <rect x="0" y="0" width="520" height="0" fill="#ffffff" clip-path="url(#clip-mont)" data-neige/>
        <path d="M250 200 C 260 230, 300 240, 330 262 S 400 280, 430 270" stroke="#4f8dff" stroke-width="6" fill="none" data-riviere opacity=".3"/>
        <g data-gouttes></g>
        <rect x="430" y="240" width="70" height="40" fill="#3d5a80" opacity=".25"/>
        <rect x="430" y="280" width="70" height="0" fill="#4f8dff" data-barrage/>
        <rect x="426" y="236" width="6" height="46" fill="#555"/><text x="465" y="296" text-anchor="middle" font-size="12" fill="#1b2a41">dam</text>
        <rect x="0" y="240" width="430" height="60" fill="#9bbf6a"/>
        <text x="185" y="290" font-size="13" fill="#1b2a41">High Atlas</text>
      </svg>
      <div class="anim-ctrl">
        <label>Month: <b data-m>January</b><input type="range" min="0" max="11" step="1" value="0" data-r></label>
        <button class="btn small" data-play>Play the year</button>
        <div class="bars"><div><span>Snow on the mountain</span><i data-b1></i></div><div><span>Melt water going down</span><i data-b2></i></div></div>
        <p data-txt></p>
        <p class="small muted">Conceptual illustration of the seasonal cycle (not data). It explains why the team's continent chart peaks every first semester (S1, spring) and why the Morocco map lights up only along the Atlas.</p>
      </div></div>`;
    const r = el.querySelector("[data-r]"), g = el.querySelector("[data-gouttes]");
    let lac = .15, timer = null, raf = null, gouttes = [];
    function maj() {
      const m = +r.value, s = stock[m], f = fonte[m];
      el.querySelector("[data-m]").textContent = `${M[m]} (${m < 6 ? "S1" : "S2"})`;
      el.querySelector("[data-neige]").setAttribute("height", (60 + 120 * s).toFixed(0));
      el.querySelector("[data-neige]").setAttribute("y", "0");
      el.querySelector("[data-riviere]").setAttribute("opacity", (.25 + .75 * f).toFixed(2));
      el.querySelector("[data-b1]").style.width = `${Math.round(s * 100)}%`;
      el.querySelector("[data-b2]").style.width = `${Math.round(f * 100)}%`;
      el.querySelector("[data-ciel]").setAttribute("fill", m >= 5 && m <= 8 ? "#9fd4ff" : "#cfe3f5");
      el.querySelector("[data-txt]").innerHTML = s > .7 && f < .2 ? "Winter: snow piles up on the summits. Little melt water." :
        f > .6 ? "<b>Spring melt</b>: the snow melts fast and fills rivers and dams." : s < .1 ? "Summer and early autumn: no snow left, rivers are low." : "Snow is coming back on the summits.";
    }
    function boucle() {
      const m = +r.value, f = fonte[m];
      if (Math.random() < f * .5) gouttes.push({ t: 0 });
      gouttes.forEach((d) => (d.t += .012)); gouttes = gouttes.filter((d) => d.t < 1);
      lac = Math.max(.1, Math.min(1, lac + f * .004 - .0012));
      el.querySelector("[data-barrage]").setAttribute("height", (40 * lac).toFixed(1));
      el.querySelector("[data-barrage]").setAttribute("y", (280 - 40 * lac).toFixed(1));
      g.innerHTML = gouttes.map((d) => { const x = 250 + 180 * d.t, y = 200 + 70 * Math.sin(d.t * 1.4); return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="4" fill="#1e6fd9"/>`; }).join("");
      raf = requestAnimationFrame(boucle);
    }
    r.addEventListener("input", maj);
    el.querySelector("[data-play]").addEventListener("click", () => {
      clearInterval(timer); r.value = 0; maj();
      timer = setInterval(() => { if (+r.value >= 11) { clearInterval(timer); return; } r.value = +r.value + 1; maj(); }, 900);
    });
    maj();
    if (!reduit) raf = requestAnimationFrame(boucle);
    return () => { clearInterval(timer); cancelAnimationFrame(raf); };
  }

  // ------------------------------------------------------------------ NDVI
  function ndvi(el) {
    const cas = { sand: ["Desert sand", .30, .25, "#e3c58f"], grass: ["Dry grass", .35, .15, "#b9c46a"], crop: ["Green crops", .45, .08, "#6cbf4a"], forest: ["Dense forest", .50, .04, "#1f7a3a"] };
    el.innerHTML = `<div class="anim-grid">
      <svg class="anim-svg" viewBox="0 0 520 300" role="img" aria-label="A satellite measuring red and near-infrared light reflected by the ground">
        <rect width="520" height="300" fill="#0b1a3a"/>
        <g transform="translate(240 20)"><rect x="-22" y="0" width="44" height="26" rx="4" fill="#cfd8e6"/><rect x="-70" y="6" width="44" height="14" fill="#2f5fb3"/><rect x="26" y="6" width="44" height="14" fill="#2f5fb3"/></g>
        <text x="260" y="62" font-size="12" fill="#cfe8ff" text-anchor="middle">satellite (MODIS)</text>
        <line x1="210" y1="240" x2="235" y2="70" stroke="#ff4d4d" stroke-width="6" data-red/>
        <line x1="290" y1="240" x2="265" y2="70" stroke="#ff9eea" stroke-width="6" data-nir/>
        <text x="150" y="160" fill="#ff8080" font-size="13">red light</text><text x="300" y="160" fill="#ffb8f0" font-size="13">near-infrared</text>
        <rect x="0" y="240" width="520" height="60" data-sol fill="#6cbf4a"/>
        <g data-plantes></g>
      </svg>
      <div class="anim-ctrl">
        <div class="chips">${Object.entries(cas).map(([k, c]) => `<button class="chip" data-c="${k}">${c[0]}</button>`).join("")}</div>
        <div class="big-num" data-v>0.70</div>
        <p data-txt></p>
        <p class="small muted">NDVI = (NIR − Red) / (NIR + Red). Healthy leaves absorb red light for photosynthesis and strongly reflect near-infrared. Reflectance values are typical examples, not data.</p>
      </div></div>`;
    function choisir(k) {
      const [nom, nir, red, coul] = cas[k], v = (nir - red) / (nir + red);
      el.querySelector("[data-v]").textContent = `NDVI ${v.toFixed(2)}`;
      el.querySelector("[data-red]").setAttribute("stroke-width", (2 + red * 40).toFixed(1));
      el.querySelector("[data-nir]").setAttribute("stroke-width", (2 + nir * 40).toFixed(1));
      el.querySelector("[data-sol]").setAttribute("fill", coul);
      const n = { sand: 0, grass: 10, crop: 22, forest: 30 }[k];
      el.querySelector("[data-plantes]").innerHTML = Array.from({ length: n }, (_, i) => { const x = 10 + i * (500 / Math.max(n, 1)); const h = k === "forest" ? 40 : k === "crop" ? 22 : 12;
        return k === "forest" ? `<circle cx="${x}" cy="${240 - h / 2}" r="${h / 2}" fill="#145c2b"/><rect x="${x - 2}" y="${240 - 6}" width="4" height="6" fill="#5b3a1e"/>` : `<path d="M${x} 240 q 3 -${h} 6 0" fill="${coul}" stroke="#2f6b1f"/>`; }).join("");
      el.querySelector("[data-txt]").innerHTML = `<b>${nom}</b>: red reflected ${pct(red)}, near-infrared reflected ${pct(nir)}. ${v < .2 ? "Almost no vegetation." : v < .5 ? "Sparse or dry vegetation." : "Dense, healthy vegetation."}`;
      el.querySelectorAll("[data-c]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.c === k)));
    }
    el.querySelectorAll("[data-c]").forEach((b) => b.addEventListener("click", () => choisir(b.dataset.c)));
    choisir("crop");
    return () => {};
  }

  // ------------------------------------------------------------------ H2O altitude
  function h2o(el) {
    el.innerHTML = `<div class="anim-grid">
      <svg class="anim-svg" viewBox="0 0 520 300" role="img" aria-label="Layers of the atmosphere and water vapour">
        <rect width="520" height="300" fill="#0b1a3a"/>
        <rect y="200" width="520" height="70" fill="#1d4f8f"/><rect y="110" width="520" height="90" fill="#163e74"/><rect y="0" width="520" height="110" fill="#0f2b56"/>
        <text x="10" y="232" fill="#cfe8ff" font-size="12">Troposphere: clouds, rain (most water)</text>
        <text x="10" y="150" fill="#cfe8ff" font-size="12">Stratosphere — 100 hPa ≈ 16 km: very dry</text>
        <text x="10" y="40" fill="#cfe8ff" font-size="12">Mesosphere, up to ≈ 90 km</text>
        <line x1="0" y1="200" x2="520" y2="200" stroke="#ffd34d" stroke-dasharray="5 5"/><text x="512" y="196" fill="#ffd34d" font-size="11" text-anchor="end">100 hPa</text>
        <rect y="270" width="520" height="30" fill="#2d5a27"/><path d="M300 270 l20 -30 20 30z" fill="#6b4b2b" data-volcan/>
        <g data-mol></g>
      </svg>
      <div class="anim-ctrl">
        <button class="btn small" data-erupt>Simulate an eruption like Hunga Tonga (2022)</button>
        <button class="btn small" data-reset>Reset</button>
        <p data-txt>Blue dots are water molecules. Most stay low, in clouds. Very few reach the stratosphere: there, every extra molecule matters for climate.</p>
        <p class="small muted">Conceptual illustration. The team's real result: at 100 hPa, water vapour rose by about +0.21 ppmv per decade over Morocco and +0.18 over the world (2004–2025), already before the eruption.</p>
      </div></div>`;
    const g = el.querySelector("[data-mol]");
    let mol = [], raf = null;
    const ajouter = (n, y0, y1, x0 = 0, x1 = 520) => { for (let i = 0; i < n; i++) mol.push({ x: x0 + Math.random() * (x1 - x0), y: y0 + Math.random() * (y1 - y0), vx: (Math.random() - .5) * .6, cible: null }); };
    const init = () => { mol = []; ajouter(90, 205, 265); ajouter(10, 115, 195); ajouter(3, 10, 105); };
    function boucle() {
      mol.forEach((m) => { m.x = (m.x + m.vx + 520) % 520; if (m.cible) { m.y += (m.cible - m.y) * .03; if (Math.abs(m.y - m.cible) < 1) m.cible = null; } });
      g.innerHTML = mol.map((m) => `<circle cx="${m.x.toFixed(0)}" cy="${m.y.toFixed(0)}" r="3" fill="#7cc4ff"/>`).join("");
      raf = requestAnimationFrame(boucle);
    }
    el.querySelector("[data-erupt]").addEventListener("click", () => {
      for (let i = 0; i < 40; i++) mol.push({ x: 320 + (Math.random() - .5) * 20, y: 250, vx: (Math.random() - .5) * 1.2, cible: 115 + Math.random() * 80 });
      el.querySelector("[data-txt]").innerHTML = "The eruption shoots water straight into the stratosphere. It stays there for years and spreads around the planet: the unusual semesters after 2022 in the team's charts.";
    });
    el.querySelector("[data-reset]").addEventListener("click", init);
    init();
    if (!reduit) raf = requestAnimationFrame(boucle); else boucle();
    return () => cancelAnimationFrame(raf);
  }


  // ------------------------------------------------------------------ Methane
  function methane(el) {
    el.innerHTML = `<div class="anim-grid">
      <svg class="anim-svg" viewBox="0 0 520 300" role="img" aria-label="Methane molecules sending heat back to the ground">
        <rect width="520" height="300" fill="#0b1a3a"/>
        <g data-mol></g><g data-rayons></g>
        <rect y="250" width="520" height="50" fill="#3f6b2e"/>
        <text x="40" y="244" font-size="12" fill="#e8eefc">wetland</text><text x="150" y="244" font-size="12" fill="#e8eefc">livestock</text>
        <text x="270" y="244" font-size="12" fill="#e8eefc">rice field</text><text x="390" y="244" font-size="12" fill="#e8eefc">gas leak</text>
      </svg>
      <div class="anim-ctrl">
        <label>Methane in the air: <b data-v>1805</b> ppb<input type="range" min="1750" max="1950" step="5" value="1805" data-r></label>
        <div class="chips"><button class="chip" data-p="1805">≈ 2004 (world)</button><button class="chip" data-p="1858">≈ 2025 (world)</button><button class="chip" data-p="1913">≈ 2025 (Morocco box)</button></div>
        <p data-txt></p>
        <p class="small muted">Conceptual illustration. Orange arrows are heat (infrared) leaving the ground; the arrows sent back down are those absorbed and re-emitted by methane. Values: order of magnitude read on the team's figures.</p>
      </div></div>`;
    const r = el.querySelector("[data-r]"), g = el.querySelector("[data-mol]"), ray = el.querySelector("[data-rayons]");
    let mol = [], raf = null;
    function maj() {
      const v = +r.value, n = Math.round((v - 1700) / 4);
      el.querySelector("[data-v]").textContent = v;
      while (mol.length < n) mol.push({ x: Math.random() * 520, y: 40 + Math.random() * 190, vy: -.1 - Math.random() * .25 });
      mol.length = n;
      const retour = Math.round(2 + (v - 1750) / 40);
      ray.innerHTML = Array.from({ length: 6 }, (_, k) => { const x = 50 + k * 85; const back = k < retour;
        return `<path d="M${x} 248 L${x + 10} 120" stroke="#ff9f43" stroke-width="3" opacity=".8"/>${back ? `<path d="M${x + 12} 125 L${x + 24} 245" stroke="#ff5d6c" stroke-width="3" stroke-dasharray="5 4"/>` : ""}`; }).join("");
      el.querySelector("[data-txt]").innerHTML = `More methane → more heat sent back to the ground. Between 2004 and 2025 world methane rose by about 50 ppb (team figure), a steady increase seen everywhere on the planet.`;
    }
    function boucle() { mol.forEach((m) => { m.y += m.vy; if (m.y < 30) m.y = 230; }); g.innerHTML = mol.map((m) => `<circle cx="${m.x.toFixed(0)}" cy="${m.y.toFixed(0)}" r="3.5" fill="#9bd36b"/>`).join(""); raf = requestAnimationFrame(boucle); }
    r.addEventListener("input", maj);
    el.querySelectorAll("[data-p]").forEach((b) => b.addEventListener("click", () => { r.value = b.dataset.p; maj(); }));
    maj(); if (!reduit) raf = requestAnimationFrame(boucle); else boucle();
    return () => cancelAnimationFrame(raf);
  }

  // ------------------------------------------------------------------ NO2
  function no2(el) {
    el.innerHTML = `<div class="anim-grid">
      <svg class="anim-svg" viewBox="0 0 520 300" role="img" aria-label="Traffic and factories emitting nitrogen dioxide over a city">
        <rect width="520" height="300" fill="#bcd7f0" data-ciel/>
        <g data-nuage></g>
        <g fill="#3d4a5c"><rect x="60" y="160" width="40" height="90"/><rect x="110" y="130" width="35" height="120"/><rect x="155" y="175" width="45" height="75"/><rect x="330" y="150" width="30" height="100"/><rect x="368" y="185" width="50" height="65"/></g>
        <rect x="440" y="140" width="16" height="110" fill="#6b6b6b"/><rect x="465" y="160" width="14" height="90" fill="#6b6b6b"/>
        <rect y="250" width="520" height="50" fill="#555"/><g data-voitures></g>
        <text x="10" y="292" font-size="12" fill="#fff">city traffic</text><text x="430" y="292" font-size="12" fill="#fff">factory</text>
      </svg>
      <div class="anim-ctrl">
        <div class="chips"><button class="chip" data-m="normal" aria-pressed="true">Normal week</button><button class="chip" data-m="lock">2020 lockdown</button><button class="chip" data-m="weekend">Sunday</button></div>
        <div class="big-num" data-v>100 %</div>
        <p data-txt></p>
        <p class="small muted">Conceptual illustration. NO₂ lives only hours to a day, so it stays near its sources and drops quickly when emissions drop — the dip visible in 2020 in the team's OMI charts.</p>
      </div></div>`;
    const g = el.querySelector("[data-nuage]"), car = el.querySelector("[data-voitures]");
    let niveau = 1, raf = null, t = 0, puffs = [];
    const TXT = { normal: [1, "Cars, trucks and factories emit NO₂ all day: a brown haze sits over the city."], lock: [.6, "Fewer cars and less industry: NO₂ falls within days. Worldwide, the team's charts show a clear dip in 2020."], weekend: [.75, "Less traffic on Sunday: NO₂ is lower than on weekdays."] };
    function choisir(m) { niveau = TXT[m][0]; el.querySelector("[data-v]").textContent = `${Math.round(niveau * 100)} % of normal emissions`; el.querySelector("[data-txt]").innerHTML = TXT[m][1];
      el.querySelectorAll("[data-m]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.m === m))); }
    function boucle() {
      t++;
      if (Math.random() < .25 * niveau) puffs.push({ x: Math.random() < .3 ? 450 + Math.random() * 20 : Math.random() * 420, y: 240, a: .5, r: 6 });
      puffs.forEach((p) => { p.y -= .5; p.r += .08; p.a -= .0035; }); puffs = puffs.filter((p) => p.a > 0);
      g.innerHTML = puffs.map((p) => `<circle cx="${p.x.toFixed(0)}" cy="${p.y.toFixed(0)}" r="${p.r.toFixed(1)}" fill="#8a5a2b" opacity="${p.a.toFixed(2)}"/>`).join("");
      const n = Math.round(8 * niveau);
      car.innerHTML = Array.from({ length: n }, (_, k) => `<rect x="${((t * 1.5 + k * 70) % 560) - 40}" y="${k % 2 ? 262 : 274}" width="26" height="9" rx="3" fill="${["#e63946", "#f1faee", "#a8dadc", "#ffb703"][k % 4]}"/>`).join("");
      raf = requestAnimationFrame(boucle);
    }
    el.querySelectorAll("[data-m]").forEach((b) => b.addEventListener("click", () => choisir(b.dataset.m)));
    choisir("normal"); if (!reduit) raf = requestAnimationFrame(boucle); else boucle();
    return () => cancelAnimationFrame(raf);
  }

  return { semestres, aot, neige, snow: neige, ndvi, h2o, methane, no2 };
})();
