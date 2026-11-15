/* =========================================================================
   Thème jour / nuit + fond animé (décoratif, jamais des données)
   Nuit : étoiles scintillantes, planètes et lune qui dérivent, étoiles filantes.
   Jour : ciel bleu, soleil, nuages légers.
   ========================================================================= */
window.THEME = (function () {
  const cles = "doorTheme";
  let theme = "night";
  try { theme = localStorage.getItem(cles) || (matchMedia("(prefers-color-scheme: light)").matches ? "day" : "night"); } catch (_) {}
  const ecouteurs = [];
  const reduit = matchMedia("(prefers-reduced-motion: reduce)").matches;

  function appliquer() {
    document.documentElement.dataset.theme = theme;
    const b = document.getElementById("theme-toggle");
    if (b) {
      b.setAttribute("aria-pressed", String(theme === "day"));
      b.title = theme === "day" ? "Switch to night mode" : "Switch to day mode";
      b.querySelector("span").textContent = theme === "day" ? "☀" : "☾";
    }
  }
  function basculer() {
    theme = theme === "day" ? "night" : "day";
    try { localStorage.setItem(cles, theme); } catch (_) {}
    appliquer(); ecouteurs.forEach((f) => f(theme));
  }

  // ------------------------------------------------------------------ fond
  let cv, ctx, W, H, etoiles = [], corps = [], filantes = [], nuages = [], t0 = performance.now();
  function init() {
    cv = document.getElementById("ciel"); if (!cv) return;
    ctx = cv.getContext("2d");
    const resize = () => {
      const r = Math.min(devicePixelRatio || 1, 2);
      W = cv.width = innerWidth * r; H = cv.height = innerHeight * r; cv.style.width = innerWidth + "px"; cv.style.height = innerHeight + "px";
      creer();
    };
    addEventListener("resize", resize); resize();
    appliquer();
    requestAnimationFrame(boucle);
  }
  function creer() {
    const n = Math.round((W * H) / 9000);
    etoiles = Array.from({ length: n }, () => ({ x: Math.random() * W, y: Math.random() * H, r: Math.random() ** 3 * 1.8 + .3,
      p: Math.random() * 6.28, v: .4 + Math.random() * 1.6, c: Math.random() < .12 ? (Math.random() < .5 ? "#bfe3ff" : "#ffe2b8") : "#ffffff" }));
    const s = Math.min(W, H);
    // corps célestes : planètes (dont une à anneau), lune, nébuleuses lointaines
    corps = [
      { type: "nebuleuse", x: W * .78, y: H * .22, r: s * .45, c1: "rgba(139,108,255,.10)", c2: "rgba(55,226,255,.0)", vx: .003 },
      { type: "nebuleuse", x: W * .12, y: H * .78, r: s * .40, c1: "rgba(55,226,255,.08)", c2: "rgba(46,230,197,0)", vx: -.002 },
      { type: "planete", x: W * .88, y: H * .72, r: s * .045, c1: "#f6c27a", c2: "#8a4f2a", anneau: true, vx: -.012 },
      { type: "planete", x: W * .04, y: H * .55, r: s * .022, c1: "#8fd3ff", c2: "#1d4f8f", vx: .01 },
      { type: "lune", x: W * .62, y: H * .1, r: s * .018, vx: .006 },
      { type: "planete", x: W * .35, y: H * .9, r: s * .012, c1: "#ff9aa8", c2: "#7a2a40", vx: .008 },
    ];
    nuages = Array.from({ length: 7 }, (_, i) => ({ x: Math.random() * W, y: H * (.08 + Math.random() * .5), l: s * (.18 + Math.random() * .22), v: .08 + Math.random() * .18, o: .35 + Math.random() * .35 }));
  }
  function planete(b) {
    const g = ctx.createRadialGradient(b.x - b.r * .35, b.y - b.r * .35, b.r * .1, b.x, b.y, b.r);
    g.addColorStop(0, b.c1); g.addColorStop(1, b.c2);
    if (b.anneau) { ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(-.35); ctx.strokeStyle = "rgba(246,194,122,.45)"; ctx.lineWidth = b.r * .18;
      ctx.beginPath(); ctx.ellipse(0, 0, b.r * 2, b.r * .55, 0, Math.PI, 2 * Math.PI); ctx.stroke(); ctx.restore(); }
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.fill();
    ctx.shadowBlur = 0;
    if (b.anneau) { ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(-.35); ctx.strokeStyle = "rgba(246,194,122,.6)"; ctx.lineWidth = b.r * .18;
      ctx.beginPath(); ctx.ellipse(0, 0, b.r * 2, b.r * .55, 0, 0, Math.PI); ctx.stroke(); ctx.restore(); }
  }
  function lune(b) {
    const g = ctx.createRadialGradient(b.x - b.r * .3, b.y - b.r * .3, b.r * .1, b.x, b.y, b.r);
    g.addColorStop(0, "#f4f6ff"); g.addColorStop(1, "#9aa6c4");
    ctx.shadowColor = "rgba(220,230,255,.6)"; ctx.shadowBlur = b.r * 2;
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(120,130,160,.35)";
    [[.3, -.2, .22], [-.35, .25, .16], [.1, .4, .12]].forEach(([dx, dy, rr]) => { ctx.beginPath(); ctx.arc(b.x + dx * b.r, b.y + dy * b.r, rr * b.r, 0, 7); ctx.fill(); });
  }
  function nuit(t) {
    ctx.clearRect(0, 0, W, H);
    for (const b of corps) {
      if (!reduit) b.x = (b.x + b.vx + W * 1.2) % (W * 1.2);
      if (b.type === "nebuleuse") {
        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r); g.addColorStop(0, b.c1); g.addColorStop(1, b.c2);
        ctx.fillStyle = g; ctx.fillRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
      }
    }
    for (const e of etoiles) {
      const a = reduit ? .8 : .45 + .55 * Math.abs(Math.sin(t / 1000 * e.v + e.p));
      ctx.globalAlpha = a; ctx.fillStyle = e.c; ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (devicePixelRatio || 1), 0, 7); ctx.fill();
      if (e.r > 1.6) { ctx.globalAlpha = a * .5; ctx.fillRect(e.x - e.r * 3, e.y - .4, e.r * 6, .8); ctx.fillRect(e.x - .4, e.y - e.r * 3, .8, e.r * 6); }
    }
    ctx.globalAlpha = 1;
    // corps célestes un peu translucides : ils restent un décor derrière le texte
    ctx.globalAlpha = .6;
    for (const b of corps) { if (b.type === "planete") planete(b); else if (b.type === "lune") lune(b); }
    ctx.globalAlpha = 1;
    if (!reduit && Math.random() < .004 && filantes.length < 2) filantes.push({ x: Math.random() * W * .8, y: Math.random() * H * .4, vx: 9 + Math.random() * 6, vy: 4 + Math.random() * 3, vie: 1 });
    filantes = filantes.filter((f) => f.vie > 0);
    for (const f of filantes) {
      const g = ctx.createLinearGradient(f.x, f.y, f.x - f.vx * 12, f.y - f.vy * 12);
      g.addColorStop(0, `rgba(255,255,255,${f.vie})`); g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.strokeStyle = g; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x - f.vx * 12, f.y - f.vy * 12); ctx.stroke();
      f.x += f.vx; f.y += f.vy; f.vie -= .015;
    }
  }
  function jour(t) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#6fb6f2"); g.addColorStop(.55, "#bfe2fb"); g.addColorStop(1, "#eef7ff");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const s = Math.min(W, H), sx = W * .86, sy = H * .12;
    const soleil = ctx.createRadialGradient(sx, sy, 0, sx, sy, s * .35);
    soleil.addColorStop(0, "rgba(255,250,225,1)"); soleil.addColorStop(.08, "rgba(255,236,170,.95)"); soleil.addColorStop(.3, "rgba(255,226,150,.25)"); soleil.addColorStop(1, "rgba(255,226,150,0)");
    ctx.fillStyle = soleil; ctx.fillRect(0, 0, W, H);
    for (const n of nuages) {
      if (!reduit) n.x = (n.x + n.v) % (W + n.l * 2);
      const x = n.x - n.l;
      ctx.fillStyle = `rgba(255,255,255,${n.o})`;
      [[0, 0, .35], [.3, -.12, .3], [.6, 0, .32], [.3, .08, .38]].forEach(([dx, dy, rr]) => {
        ctx.beginPath(); ctx.ellipse(x + dx * n.l, n.y + dy * n.l, rr * n.l, rr * n.l * .45, 0, 0, 7); ctx.fill();
      });
    }
  }
  function boucle(t) {
    if (cv && !document.hidden) (theme === "day" ? jour : nuit)(t);
    requestAnimationFrame(boucle);
  }

  return { init, basculer, get: () => theme, surChangement: (f) => ecouteurs.push(f), appliquer };
})();
