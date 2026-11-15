/* =========================================================================
   Éléments pédagogiques interactifs (illustrations CONCEPTUELLES,
   jamais présentées comme des observations)
   ========================================================================= */
window.W = (function () {
  const MASCOTTE = `<svg class="mascot" viewBox="0 0 100 100" aria-hidden="true">
    <defs><radialGradient id="mg" cx="35%" cy="30%"><stop offset="0" stop-color="#bff7ff"/><stop offset=".55" stop-color="#37e2ff"/><stop offset="1" stop-color="#6b4cff"/></radialGradient></defs>
    <circle cx="50" cy="52" r="34" fill="url(#mg)"><animate attributeName="cy" values="52;47;52" dur="3s" repeatCount="indefinite"/></circle>
    <ellipse cx="50" cy="52" rx="46" ry="11" fill="none" stroke="#2ee6c5" stroke-width="2.5" opacity=".7" transform="rotate(-18 50 52)"/>
    <circle cx="40" cy="47" r="4.5" fill="#06122e"/><circle cx="60" cy="47" r="4.5" fill="#06122e"/>
    <circle cx="41.5" cy="45.5" r="1.5" fill="#fff"/><circle cx="61.5" cy="45.5" r="1.5" fill="#fff"/>
    <path d="M41 60 Q50 67 59 60" stroke="#06122e" stroke-width="3" fill="none" stroke-linecap="round"/></svg>`;

  function chaine(v) {
    return `<div class="chain" style="--c:${v.couleur}">${v.chaine.map(([t, d]) => `<div class="step"><b>${t}</b>${d}</div>`).join("")}</div>`;
  }

  // ------------------------------------------------------------------ AOT
  function aot(el) {
    el.innerHTML = `
      <div class="sim">
        <canvas width="720" height="420" aria-label="Conceptual animation of sunlight crossing an aerosol layer"></canvas>
        <div>
          <span class="badge badge-concept">Conceptual illustration — not observations</span>
          <div class="slider"><label>Aerosol optical thickness τ <b data-v="tau"></b></label><input type="range" min="0" max="2" step="0.01" value="0.3" data-i="tau"></div>
          <div class="slider"><label>Solar zenith angle θ <b data-v="sza"></b></label><input type="range" min="0" max="75" step="1" value="30" data-i="sza"></div>
          <div class="slider"><label>Particle type (single-scattering albedo ω) <b data-v="ssa"></b></label><input type="range" min="0.7" max="1" step="0.01" value="0.92" data-i="ssa"></div>
          <div class="meter" aria-hidden="true"><span data-m="dir" style="background:#ffd166"></span><span data-m="sca" style="background:#7dd3fc"></span><span data-m="abs" style="background:#ff6b6b"></span></div>
          <div class="legend-row"><span><i style="background:#ffd166"></i>direct beam <b data-v="dir"></b></span><span><i style="background:#7dd3fc"></i>scattered <b data-v="sca"></b></span><span><i style="background:#ff6b6b"></i>absorbed <b data-v="abs"></b></span></div>
          <p class="small muted" style="margin-top:.8rem">Direct transmission follows Beer–Lambert, T = exp(−τ / cos θ). The removed light is split between scattering (ω) and absorption (1 − ω). Part of the scattered light still reaches the ground as diffuse light. Typical values: τ ≈ 0.05–0.1 on a very clear day, above 1 during a strong dust event.</p>
          <div class="chips"><button class="chip" data-p="0.06,25,0.98">Clear Atlantic day</button><button class="chip" data-p="0.35,35,0.93">Hazy afternoon</button><button class="chip" data-p="1.4,40,0.9">Saharan dust event</button><button class="chip" data-p="0.9,50,0.8">Smoke plume</button></div>
        </div>
      </div>`;
    const cv = el.querySelector("canvas"), ctx = cv.getContext("2d");
    const inp = (k) => el.querySelector(`[data-i="${k}"]`);
    const out = (k, v) => { el.querySelector(`[data-v="${k}"]`).textContent = v; };
    const parts = Array.from({ length: 260 }, () => ({ x: Math.random(), y: .32 + Math.random() * .38, r: .6 + Math.random() * 2.2, v: (Math.random() - .5) * .0006 }));
    let raf;
    function etat() {
      const tau = +inp("tau").value, sza = +inp("sza").value, w = +inp("ssa").value;
      const T = Math.exp(-tau / Math.cos(sza * Math.PI / 180));
      return { tau, sza, w, T, sca: (1 - T) * w, abs: (1 - T) * (1 - w) };
    }
    function maj() {
      const s = etat();
      out("tau", s.tau.toFixed(2)); out("sza", s.sza + "°"); out("ssa", s.w.toFixed(2));
      out("dir", Math.round(s.T * 100) + " %"); out("sca", Math.round(s.sca * 100) + " %"); out("abs", Math.round(s.abs * 100) + " %");
      el.querySelector('[data-m="dir"]').style.width = s.T * 100 + "%";
      el.querySelector('[data-m="sca"]').style.width = s.sca * 100 + "%";
      el.querySelector('[data-m="abs"]').style.width = s.abs * 100 + "%";
    }
    function dessiner(t) {
      const s = etat(), W = cv.width, H = cv.height;
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      const haze = Math.min(1, s.tau / 1.6);
      sky.addColorStop(0, `rgb(${10 + 60 * haze},${40 + 40 * haze},${90 - 20 * haze})`);
      sky.addColorStop(1, `rgb(${60 + 140 * haze},${120 + 60 * haze},${170 - 40 * haze})`);
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
      const ang = s.sza * Math.PI / 180, sx = W / 2 - Math.tan(ang) * H * .9, sy = 40;
      const sun = ctx.createRadialGradient(sx, sy, 4, sx, sy, 60);
      sun.addColorStop(0, "#fff7d6"); sun.addColorStop(.3, "#ffd166"); sun.addColorStop(1, "rgba(255,209,102,0)");
      ctx.fillStyle = sun; ctx.beginPath(); ctx.arc(sx, sy, 60, 0, 7); ctx.fill();
      // rayons directs
      for (let k = -4; k <= 4; k++) {
        const x0 = sx + k * 14, y0 = sy + 20, x1 = W / 2 + k * 30, y1 = H * .86;
        const g = ctx.createLinearGradient(x0, y0, x1, y1);
        g.addColorStop(0, "rgba(255,220,120,.9)"); g.addColorStop(1, `rgba(255,220,120,${.9 * s.T})`);
        ctx.strokeStyle = g; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      }
      // particules
      const n = Math.round(parts.length * Math.min(1, s.tau / 2));
      for (let i = 0; i < n; i++) {
        const p = parts[i]; p.x = (p.x + p.v + 1) % 1;
        const x = p.x * W, y = p.y * H + Math.sin(t / 900 + i) * 3;
        ctx.fillStyle = s.w > .9 ? "rgba(235,225,200,.85)" : `rgba(${120 + 100 * (s.w - .7) / .3},${90 + 80 * (s.w - .7) / .3},70,.9)`;
        ctx.beginPath(); ctx.arc(x, y, p.r, 0, 7); ctx.fill();
        if (i % 9 === 0 && s.tau > 0.05) { // lumière diffusée
          ctx.strokeStyle = "rgba(125,211,252,.35)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y);
          const a = (i * 2.4 + t / 2000) % 6.28; ctx.lineTo(x + Math.cos(a) * 22, y + Math.sin(a) * 22); ctx.stroke();
        }
      }
      // sol
      ctx.fillStyle = "#2b3a2a"; ctx.fillRect(0, H * .86, W, H * .14);
      ctx.fillStyle = "#c9a46a"; for (let i = 0; i < 6; i++) ctx.fillRect(i * W / 6 + 20, H * .86, 60, 4);
      ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.font = "15px Inter, sans-serif";
      ctx.fillText(`Direct sunlight reaching the ground: ${Math.round(s.T * 100)} %`, 16, H - 16);
      raf = requestAnimationFrame(dessiner);
    }
    el.querySelectorAll("input").forEach((i) => i.addEventListener("input", maj));
    el.querySelectorAll("[data-p]").forEach((b) => b.addEventListener("click", () => {
      const [a, z, w] = b.dataset.p.split(","); inp("tau").value = a; inp("sza").value = z; inp("ssa").value = w; maj();
    }));
    maj(); raf = requestAnimationFrame(dessiner);
    return () => cancelAnimationFrame(raf);
  }

  // ---------------------------------------------------------------- OZONE
  function ozone(el) {
    el.innerHTML = `
      <div class="sim">
        <svg viewBox="0 0 360 230" style="width:100%;background:#061029;border-radius:14px;border:1px solid var(--line)" aria-label="Conceptual diagram of the ozone layer filtering UV-B">
          <defs><linearGradient id="oz" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#37e2ff" stop-opacity=".1"/><stop offset=".5" stop-color="#37e2ff" stop-opacity=".55"/><stop offset="1" stop-color="#37e2ff" stop-opacity=".1"/></linearGradient></defs>
          <circle cx="40" cy="30" r="18" fill="#ffd166"/>
          <rect data-c="couche" x="0" y="70" width="360" height="40" fill="url(#oz)"/>
          <text x="352" y="95" fill="#9bb0d3" font-size="11" text-anchor="end">ozone layer (stratosphere)</text>
          <g data-c="rayons"></g>
          <rect x="0" y="200" width="360" height="30" fill="#1f3b2a"/>
          <text x="10" y="220" fill="#fff" font-size="12" data-c="uv">UV-B at the surface</text>
        </svg>
        <div>
          <span class="badge badge-concept">Conceptual illustration — not observations</span>
          <div class="slider"><label>Total ozone column <b data-v="du"></b></label><input type="range" min="100" max="500" step="5" value="300" data-i="du"></div>
          <p>Compressed at surface pressure, this column would be <b data-v="mm"></b> thick — thinner than a coin.</p>
          <p>Relative erythemal (sunburn) UV compared with 300 DU: <b data-v="uv"></b></p>
          <p class="small muted">Rule of thumb used here: a 1 % decrease in ozone raises sunburning UV by about 1.1 % (radiation amplification factor ≈ 1.1). Real UV also depends on the Sun's height, clouds, aerosols and altitude.</p>
          <div class="chips"><button class="chip" data-p="130">Antarctic ozone hole</button><button class="chip" data-p="270">Morocco, typical autumn</button><button class="chip" data-p="440">Arctic spring</button></div>
        </div>
      </div>`;
    const i = el.querySelector("input"), g = el.querySelector('[data-c="rayons"]');
    function maj() {
      const du = +i.value, rel = Math.pow(du / 300, -1.1);
      el.querySelector('[data-v="du"]').textContent = du + " DU";
      el.querySelector('[data-v="mm"]').textContent = (du / 100).toFixed(1) + " mm";
      el.querySelector('[data-v="uv"]').textContent = Math.round(rel * 100) + " %";
      el.querySelector('[data-c="couche"]').setAttribute("height", 10 + du / 10);
      el.querySelector('[data-c="uv"]').textContent = `UV-B at the surface: ${Math.round(rel * 100)} % of the 300 DU case`;
      let s = "";
      for (let k = 0; k < 8; k++) {
        const x = 60 + k * 36, op = Math.min(1, .25 + .5 * (rel - .6));
        s += `<line x1="${x - 20}" y1="40" x2="${x + 20}" y2="198" stroke="#b78bff" stroke-width="3" stroke-dasharray="6 5" opacity="${op.toFixed(2)}"><animate attributeName="stroke-dashoffset" from="0" to="-22" dur="1s" repeatCount="indefinite"/></line>`;
      }
      g.innerHTML = s;
    }
    i.addEventListener("input", maj);
    el.querySelectorAll("[data-p]").forEach((b) => b.addEventListener("click", () => { i.value = b.dataset.p; maj(); }));
    maj();
    return () => {};
  }

  // ------------------------------------------------- niveaux de pression (H2O)
  function niveaux(el) {
    const couches = [[0.1, "Mesosphere", "~65 km"], [1, "Upper stratosphere", "~48 km"], [10, "Middle stratosphere", "~31 km"],
                     [46, "Lower stratosphere", "~21 km"], [100, "Tropopause region", "~16 km"], [316, "Upper troposphere", "~8 km"]];
    el.innerHTML = `<div class="sim"><div>
        <span class="badge badge-concept">Conceptual illustration</span>
        <p style="margin-top:.6rem">MLS measures water vapour at many <b>pressure levels</b>. Lower pressure = higher altitude. Click a level to read what happens there.</p>
        <p data-t class="callout info">Select a level.</p></div>
        <div>${couches.map(([p, n, h]) => `<button class="btn" style="width:100%;margin:.2rem 0;text-align:left" data-l="${n}">${p} hPa · ${h} — ${n}</button>`).join("")}</div></div>`;
    const txt = { "Mesosphere": "Very thin air; water vapour is slowly destroyed by sunlight.", "Upper stratosphere": "Water vapour increases with height because methane is oxidised into water.",
      "Middle stratosphere": "Very dry air (a few ppmv) that slowly circulates from the tropics to the poles.",
      "Lower stratosphere": "Air that has just crossed the tropical tropopause; sensitive to tropopause temperature and to volcanic injections such as Hunga Tonga.",
      "Tropopause region": "The cold 'gate' between troposphere and stratosphere, which freeze-dries rising air. 100 hPa is the default level of the H₂O explorer.",
      "Upper troposphere": "Moister air influenced by convection and weather systems; the lowest level where MLS water vapour is used." };
    el.querySelectorAll("[data-l]").forEach((b) => b.addEventListener("click", () => {
      el.querySelectorAll("[data-l]").forEach((x) => x.setAttribute("aria-pressed", "false")); b.setAttribute("aria-pressed", "true");
      el.querySelector("[data-t]").textContent = txt[b.dataset.l];
    }));
    return () => {};
  }

  const WIDGETS = { aot, ozone, levels: niveaux };
  function monter(el, v) {
    // conceptual animations for every variable (anim.js); the original widgets stay for AOT, ozone and H2O
    const AJOUT = { methane: "methane", no2: "no2", snow: "snow", vegetation: "ndvi" };
    const stops = [];
    if (v.widget && WIDGETS[v.widget]) stops.push(WIDGETS[v.widget](el));
    const a = AJOUT[v.id] || (v.id === "h2o" ? "h2o" : null);
    if (a && window.ANIM && ANIM[a]) {
      const box = document.createElement("div"); box.className = "card anim-card";
      box.innerHTML = `<div class="eyebrow">Animation</div><h3>See how it works</h3><div></div>`;
      el.appendChild(box); stops.push(ANIM[a](box.lastElementChild));
    }
    return () => stops.forEach((f) => { try { f && f(); } catch (_) {} });
  }
  return { MASCOTTE, chaine, monter };
})();
