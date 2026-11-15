/* =========================================================================
   Animation d'ouverture : la porte s'ouvre sur la Terre
   (passable, rejouable, son optionnel désactivé par défaut)
   ========================================================================= */
window.INTRO = (function () {
  const el = () => document.getElementById("intro");
  let raf = null, timers = [], son = false, audio = null;
  const reduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function etoiles() {
    const cv = document.getElementById("intro-stars"), ctx = cv.getContext("2d");
    const resize = () => { cv.width = innerWidth * devicePixelRatio; cv.height = innerHeight * devicePixelRatio; };
    resize(); addEventListener("resize", resize);
    const pts = Array.from({ length: 420 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.4 + .2, t: Math.random() * 6.28, v: .2 + Math.random() }));
    const parts = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), vx: (Math.random() - .5) * .0004, vy: -.0002 - Math.random() * .0004 }));
    function f(t) {
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (const p of pts) {
        const a = .35 + .65 * Math.abs(Math.sin(t / 1000 * p.v + p.t));
        ctx.fillStyle = `rgba(210,230,255,${a})`; ctx.beginPath(); ctx.arc(p.x * cv.width, p.y * cv.height, p.r * devicePixelRatio, 0, 7); ctx.fill();
      }
      for (const p of parts) {
        p.x = (p.x + p.vx + 1) % 1; p.y = (p.y + p.vy + 1) % 1;
        ctx.fillStyle = "rgba(55,226,255,.5)"; ctx.beginPath(); ctx.arc(p.x * cv.width, p.y * cv.height, 1.6 * devicePixelRatio, 0, 7); ctx.fill();
      }
      raf = requestAnimationFrame(f);
    }
    raf = requestAnimationFrame(f);
  }

  function bruitPorte() {
    if (!son) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const t = audio.currentTime;
      // nappe grave
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = "sine"; o.frequency.setValueAtTime(55, t); o.frequency.exponentialRampToValueAtTime(110, t + 3.5);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.18, t + 1); g.gain.linearRampToValueAtTime(0, t + 4.5);
      o.connect(g).connect(audio.destination); o.start(t); o.stop(t + 4.6);
      // souffle d'ouverture (bruit filtré)
      const buf = audio.createBuffer(1, audio.sampleRate * 2.5, audio.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const n = audio.createBufferSource(), f = audio.createBiquadFilter(), gn = audio.createGain();
      n.buffer = buf; f.type = "bandpass"; f.frequency.setValueAtTime(300, t + .3); f.frequency.exponentialRampToValueAtTime(2400, t + 2.6);
      gn.gain.setValueAtTime(.0, t); gn.gain.linearRampToValueAtTime(.12, t + .8); gn.gain.linearRampToValueAtTime(0, t + 2.8);
      n.connect(f).connect(gn).connect(audio.destination); n.start(t + .3);
      // scintillement
      [880, 1320, 1760].forEach((fr, k) => {
        const s = audio.createOscillator(), sg = audio.createGain();
        s.type = "triangle"; s.frequency.value = fr; sg.gain.setValueAtTime(0, t + 2 + k * .25);
        sg.gain.linearRampToValueAtTime(.05, t + 2.05 + k * .25); sg.gain.exponentialRampToValueAtTime(.0001, t + 3.2 + k * .25);
        s.connect(sg).connect(audio.destination); s.start(t + 2 + k * .25); s.stop(t + 3.4 + k * .25);
      });
    } catch (e) { /* audio indisponible */ }
  }

  function ouvrir() {
    const e = el();
    if (e.classList.contains("open")) return;
    e.classList.add("open");
    bruitPorte();
    timers.push(setTimeout(terminer, reduit ? 600 : 5200));
  }

  function terminer() {
    const e = el();
    timers.forEach(clearTimeout); timers = [];
    e.classList.add("done");
    setTimeout(() => { e.hidden = true; cancelAnimationFrame(raf); raf = null; }, 950);
    try { sessionStorage.setItem("doorIntroVue", "1"); } catch (_) {}
    document.getElementById("vue").focus({ preventScroll: true });
    document.dispatchEvent(new Event("intro-fin"));
  }

  function lancer() {
    const e = el();
    e.hidden = false; e.classList.remove("open", "done");
    if (!raf) etoiles();
    timers.push(setTimeout(ouvrir, reduit ? 100 : 1400));
  }

  function init() {
    document.getElementById("intro-enter").addEventListener("click", ouvrir);
    document.getElementById("intro-skip").addEventListener("click", terminer);
    const bs = document.getElementById("intro-sound");
    bs.addEventListener("click", () => {
      son = !son; bs.setAttribute("aria-pressed", String(son)); bs.querySelector("span").textContent = son ? "on" : "off";
      if (son && el().classList.contains("open")) bruitPorte();
    });
    document.getElementById("replay-intro").addEventListener("click", lancer);
    document.addEventListener("keydown", (k) => { if (k.key === "Escape" && !el().hidden) terminer(); });
    let vue = false;
    try { vue = sessionStorage.getItem("doorIntroVue") === "1"; } catch (_) {}
    if (vue) { el().hidden = true; } else lancer();
  }
  return { init, lancer };
})();
