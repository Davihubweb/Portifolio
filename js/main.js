/**
 * PORTFÓLIO DAVI ANDRADE BATISTA — MOTOR PRINCIPAL
 *
 *  1. Tema claro/escuro (com transição circular quando o navegador suporta)
 *  2. Preferência de movimento reduzido + controle dos loops de animação
 *  3. Fundo cósmico: estrelas, parallax (mouse + rolagem), estrela cadente
 *  4. Buraco negro: disco em camadas, matéria em espiral, Doppler, pulso ao clicar,
 *     arrastar para inclinar, reação à velocidade da rolagem
 *  5. Navegação: cabeçalho inteligente, scroll-spy, indicador deslizante, menu mobile
 *  6. Animações de rolagem: revelação escalonada, títulos por palavra, parallax do hero
 *  7. Microinterações: luz que segue o mouse nos cards, tilt 3D, botões magnéticos
 */

(function () {
  'use strict';

  const root = document.documentElement;
  const TAU = Math.PI * 2;
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

  const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let isReduced = motionQuery.matches;

  // Estado compartilhado entre os módulos
  const state = {
    scrollVel: 0,        // velocidade de rolagem, decai sozinha
    pageVisible: !document.hidden,
    heroVisible: true
  };

  const mouse = {
    x: window.innerWidth * 0.5,
    y: window.innerHeight * 0.35,
    targetX: window.innerWidth * 0.5,
    targetY: window.innerHeight * 0.35
  };

  window.addEventListener('mousemove', (e) => {
    mouse.targetX = e.clientX;
    mouse.targetY = e.clientY;
  }, { passive: true });

  // --------------------------------------------------------------------------
  // 1. TEMA (CLARO / ESCURO)
  // --------------------------------------------------------------------------
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  const themeMetaTag = document.querySelector('meta[name="theme-color"]');
  let isDark = root.getAttribute('data-theme') !== 'light';

  function readSavedTheme() {
    try { return localStorage.getItem('theme'); } catch (e) { return null; }
  }

  function getPreferredTheme() {
    const saved = readSavedTheme();
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(theme, save) {
    root.setAttribute('data-theme', theme);
    isDark = theme !== 'light';
    if (themeMetaTag) themeMetaTag.setAttribute('content', isDark ? '#0a0a0a' : '#f5f5f5');
    if (save) {
      try { localStorage.setItem('theme', theme); } catch (e) { /* armazenamento indisponível */ }
    }
    // Com movimento reduzido não há loop: redesenha o quadro estático
    if (isReduced) {
      renderStaticBackground();
      renderStaticBlackHole();
    }
  }

  // Alterna o tema com uma onda circular saindo do botão
  function switchTheme() {
    const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';

    if (!document.startViewTransition || isReduced) {
      applyTheme(next, true);
      return;
    }

    const rect = themeToggleBtn.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    );

    root.classList.add('theme-switching');
    const transition = document.startViewTransition(() => applyTheme(next, true));

    transition.ready.then(() => {
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`] },
        { duration: 750, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', pseudoElement: '::view-transition-new(root)' }
      );
    }).catch(() => {});

    transition.finished.finally(() => root.classList.remove('theme-switching'));
  }

  if (themeToggleBtn) themeToggleBtn.addEventListener('click', switchTheme);

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!readSavedTheme()) applyTheme(e.matches ? 'dark' : 'light', false);
  });

  // --------------------------------------------------------------------------
  // 2. CONTROLE DOS LOOPS DE ANIMAÇÃO
  // --------------------------------------------------------------------------
  let bgAnimId = null;
  let bhAnimId = null;

  function updateLoops() {
    const shouldRunBg = !isReduced && state.pageVisible;
    const shouldRunBh = !isReduced && state.pageVisible && state.heroVisible;

    if (shouldRunBg && bgAnimId === null && bgCtx) {
      bgLast = performance.now();
      bgAnimId = requestAnimationFrame(bgFrame);
    } else if (!shouldRunBg && bgAnimId !== null) {
      cancelAnimationFrame(bgAnimId);
      bgAnimId = null;
    }

    if (shouldRunBh && bhAnimId === null && bhCtx) {
      bhLast = performance.now();
      bhAnimId = requestAnimationFrame(bhFrame);
    } else if (!shouldRunBh && bhAnimId !== null) {
      cancelAnimationFrame(bhAnimId);
      bhAnimId = null;
    }
  }

  motionQuery.addEventListener('change', (e) => {
    isReduced = e.matches;
    if (isReduced) {
      bh.intro = 1;
      renderStaticBackground();
      renderStaticBlackHole();
    }
    updateLoops();
  });

  document.addEventListener('visibilitychange', () => {
    state.pageVisible = !document.hidden;
    updateLoops();
  });

  // --------------------------------------------------------------------------
  // 3. FUNDO CÓSMICO
  // --------------------------------------------------------------------------
  const bgCanvas = document.getElementById('cosmos-bg-canvas');
  const spotlightEl = document.getElementById('ambient-spotlight');
  let bgCtx = null;
  let bgW = 0;
  let bgH = 0;
  let bgLast = 0;
  let shootingStar = null;
  let nextShootingStarAt = 0;
  const stars = [];
  const STAR_COUNT = 100;

  class CosmicParticle {
    constructor() { this.reset(true); }

    reset(initial) {
      this.x = Math.random() * bgW;
      this.y = initial ? Math.random() * bgH : 0;
      this.z = Math.random() * 0.85 + 0.15;
      this.radius = (Math.random() * 0.8 + 0.3) * this.z;
      this.baseAlpha = (Math.random() * 0.35 + 0.1) * this.z;
      this.twinkleSpeed = Math.random() * 0.015 + 0.005;
      this.phase = Math.random() * TAU;
      this.speedY = (Math.random() * 0.08 + 0.03) * this.z;
    }

    update(f) {
      this.y += this.speedY * f;
      this.phase += this.twinkleSpeed * f;
      if (this.y > bgH) this.reset(false);
    }

    draw(ctx, offsetX, offsetY) {
      // O parallax "dá a volta" na tela, assim nunca sobra um canto vazio
      const px = (((this.x + offsetX * this.z) % bgW) + bgW) % bgW;
      const py = (((this.y + offsetY * this.z) % bgH) + bgH) % bgH;
      const brightness = Math.sin(this.phase) * 0.25 + 0.75;
      const alpha = Math.min(0.65, this.baseAlpha * brightness);

      ctx.fillStyle = isDark
        ? `rgba(240, 240, 240, ${alpha})`
        : `rgba(30, 30, 30, ${alpha * 0.45})`;
      ctx.beginPath();
      ctx.arc(px, py, this.radius, 0, TAU);
      ctx.fill();
    }
  }

  function initBackground() {
    if (!bgCanvas) return;
    bgCtx = bgCanvas.getContext('2d');
    resizeBackground();
    window.addEventListener('resize', resizeBackground, { passive: true });
    if (isReduced) renderStaticBackground();
  }

  function resizeBackground() {
    if (!bgCanvas || !bgCtx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const widthChanged = window.innerWidth !== bgW;

    bgW = window.innerWidth;
    bgH = window.innerHeight;
    bgCanvas.width = Math.floor(bgW * dpr);
    bgCanvas.height = Math.floor(bgH * dpr);
    bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Só recria as estrelas se a largura mudou (a barra do navegador no celular não conta)
    if (widthChanged || stars.length === 0) {
      stars.length = 0;
      for (let i = 0; i < STAR_COUNT; i++) stars.push(new CosmicParticle());
    }

    if (isReduced) renderStaticBackground();
  }

  function renderStaticBackground() {
    if (!bgCtx) return;
    bgCtx.clearRect(0, 0, bgW, bgH);
    for (let i = 0; i < stars.length; i++) stars[i].draw(bgCtx, 0, 0);
  }

  function spawnShootingStar() {
    const fromLeft = Math.random() > 0.5;
    const angle = (Math.random() * 14 + 24) * (Math.PI / 180);
    shootingStar = {
      x: fromLeft ? Math.random() * bgW * 0.5 : bgW * (0.5 + Math.random() * 0.5),
      y: Math.random() * bgH * 0.35,
      dx: Math.cos(angle) * (fromLeft ? 1 : -1),
      dy: Math.sin(angle),
      speed: 11 + Math.random() * 6,
      life: 0
    };
  }

  function drawShootingStar(f, now) {
    if (!shootingStar) {
      if (now > nextShootingStarAt) spawnShootingStar();
      return;
    }
    const s = shootingStar;
    s.life += 0.018 * f;
    s.x += s.dx * s.speed * f;
    s.y += s.dy * s.speed * f;

    const fade = Math.sin(clamp(s.life, 0, 1) * Math.PI);
    const tail = 110;
    const tx = s.x - s.dx * tail;
    const ty = s.y - s.dy * tail;
    const g = bgCtx.createLinearGradient(tx, ty, s.x, s.y);
    const rgb = isDark ? '255, 255, 255' : '20, 20, 20';
    g.addColorStop(0, `rgba(${rgb}, 0)`);
    g.addColorStop(1, `rgba(${rgb}, ${0.55 * fade})`);

    bgCtx.strokeStyle = g;
    bgCtx.lineWidth = 1.3;
    bgCtx.lineCap = 'round';
    bgCtx.beginPath();
    bgCtx.moveTo(tx, ty);
    bgCtx.lineTo(s.x, s.y);
    bgCtx.stroke();

    if (s.life >= 1 || s.x < -150 || s.x > bgW + 150 || s.y > bgH + 150) {
      shootingStar = null;
      nextShootingStarAt = now + 6000 + Math.random() * 8000;
    }
  }

  function bgFrame(now) {
    const dt = Math.min((now - bgLast) / 1000, 0.05);
    bgLast = now;
    const f = dt * 60;

    // Suaviza o mouse (antes o valor nunca acompanhava o alvo)
    const ease = 1 - Math.pow(1 - 0.06, f);
    mouse.x += (mouse.targetX - mouse.x) * ease;
    mouse.y += (mouse.targetY - mouse.y) * ease;

    if (spotlightEl) {
      spotlightEl.style.transform = `translate3d(${mouse.x.toFixed(1)}px, ${mouse.y.toFixed(1)}px, 0) translate(-50%, -50%)`;
    }

    bgCtx.clearRect(0, 0, bgW, bgH);

    const parallaxX = (mouse.x - bgW * 0.5) * 0.03;
    const parallaxY = (mouse.y - bgH * 0.5) * 0.03 - window.scrollY * 0.14;

    for (let i = 0; i < stars.length; i++) {
      stars[i].update(f);
      stars[i].draw(bgCtx, parallaxX, parallaxY);
    }

    drawShootingStar(f, now);
    bgAnimId = requestAnimationFrame(bgFrame);
  }

  initBackground();
  nextShootingStarAt = performance.now() + 4000;

  // --------------------------------------------------------------------------
  // 4. BURACO NEGRO
  // --------------------------------------------------------------------------
  const bhCanvas = document.getElementById('blackhole-canvas');
  let bhCtx = null;
  let bhW = 0;
  let bhH = 0;
  let bhDpr = 1;
  let bhLast = 0;

  const bh = {
    radius: 64,
    tiltX: 0,
    tiltY: 0,
    targetX: 0,
    targetY: 0,
    time: 0,
    intro: 0,       // 0 → 1: o buraco "se forma" ao carregar
    spin: 1,        // multiplicador de rotação (suavizado)
    kick: 0,        // impulso de rotação ao clicar
    pulses: [],     // ondas de choque
    streams: []
  };

  // Paleta monocromática, com versão para fundo claro (tinta escura)
  const GREY = [];
  for (let i = 0; i < 256; i++) GREY.push(`rgb(${i},${i},${i})`);

  function palette() {
    return isDark
      ? { rgb: '255,255,255', gMin: 120, gMax: 255, composite: 'lighter', alphaMul: 1, aura: 0.15, glow: 0.55 }
      : { rgb: '0,0,0', gMin: 8, gMax: 90, composite: 'source-over', alphaMul: 0.8, aura: 0.07, glow: 0.2 };
  }

  const rgba = (rgb, a) => `rgba(${rgb},${clamp(a, 0, 1).toFixed(3)})`;

  function spawnStream(s, initial) {
    // Início: espalhado por todo o disco. Reaparições: na borda externa.
    s.dist = initial ? 1.14 + Math.pow(Math.random(), 1.4) * 1.9 : 2.65 + Math.random() * 0.4;
    s.angle = Math.random() * TAU;
    s.arc = 0.12 + Math.random() * 0.3;
    s.size = Math.random() * 2 + 0.8;
    s.alpha = Math.random() * 0.45 + 0.35;
    s.speedVar = 0.8 + Math.random() * 0.4;
    s.flow = 0.7 + Math.random() * 0.7;
    s.phase = Math.random() * TAU;
    s.yJitter = (Math.random() - 0.5) * 0.06;
    s.fade = 1;
  }

  function initAccretionStreams() {
    bh.streams.length = 0;
    const count = window.innerWidth < 768 ? 150 : 260;
    for (let i = 0; i < count; i++) {
      const s = {};
      spawnStream(s, true);
      bh.streams.push(s);
    }
  }

  function initBlackHole() {
    if (!bhCanvas) return;
    bhCtx = bhCanvas.getContext('2d');
    resizeBlackHole();
    initAccretionStreams();
    window.addEventListener('resize', resizeBlackHole, { passive: true });

    // Inclinação suave seguindo o cursor
    window.addEventListener('mousemove', (e) => {
      if (isReduced || dragging) return;
      applyHoverTilt(e.clientX, e.clientY);
    }, { passive: true });

    // Arrastar para inclinar, clicar para emitir um pulso
    bhCanvas.addEventListener('pointerdown', onBhPointerDown);
    bhCanvas.addEventListener('pointermove', onBhPointerMove);
    bhCanvas.addEventListener('pointerup', onBhPointerUp);
    bhCanvas.addEventListener('pointercancel', onBhPointerUp);

    // Só anima enquanto o hero está na tela
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((entries) => {
        state.heroVisible = entries[0].isIntersecting;
        updateLoops();
      }, { threshold: 0 }).observe(bhCanvas);
    }

    if (isReduced) {
      bh.intro = 1;
      renderStaticBlackHole();
    } else {
      updateLoops();
    }
  }

  function resizeBlackHole() {
    if (!bhCanvas || !bhCtx) return;
    bhDpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = bhCanvas.getBoundingClientRect();
    bhW = rect.width;
    bhH = rect.height;

    bhCanvas.width = Math.floor(bhW * bhDpr);
    bhCanvas.height = Math.floor(bhH * bhDpr);
    bh.radius = Math.min(bhW, bhH) * 0.155;

    if (isReduced) renderStaticBlackHole();
  }

  function applyHoverTilt(clientX, clientY) {
    if (!bhCanvas) return;
    const rect = bhCanvas.getBoundingClientRect();
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    const normX = (clientX - cx) / (window.innerWidth * 0.5);
    const normY = (clientY - cy) / (window.innerHeight * 0.5);
    bh.targetX = clamp(normX * 0.25, -0.25, 0.25);
    bh.targetY = clamp(normY * 0.25, -0.25, 0.25);
  }

  // Interação direta com o canvas
  let dragging = false;
  let dragMoved = 0;
  let dragStart = { x: 0, y: 0 };

  function onBhPointerDown(e) {
    if (isReduced) return;
    dragging = true;
    dragMoved = 0;
    dragStart = { x: e.clientX, y: e.clientY };
    try { bhCanvas.setPointerCapture(e.pointerId); } catch (err) { /* ignorado */ }
  }

  function onBhPointerMove(e) {
    if (!dragging) return;
    dragMoved = Math.max(dragMoved, Math.hypot(e.clientX - dragStart.x, e.clientY - dragStart.y));
    const rect = bhCanvas.getBoundingClientRect();
    const nx = (e.clientX - (rect.left + rect.width * 0.5)) / (rect.width * 0.5);
    const ny = (e.clientY - (rect.top + rect.height * 0.5)) / (rect.height * 0.5);
    bh.targetX = clamp(nx * 0.6, -0.6, 0.6);
    bh.targetY = clamp(ny * 0.6, -0.6, 0.6);
  }

  function onBhPointerUp(e) {
    if (!dragging) return;
    dragging = false;
    if (dragMoved < 6) {
      bh.pulses.push({ t: 0 });   // clique simples: onda de choque
      bh.kick = Math.min(bh.kick + 4, 8);
    }
    applyHoverTilt(e.clientX, e.clientY);
  }

  function stepBlackHole(dt) {
    const f = dt * 60;
    bh.time += dt;

    if (bh.intro < 1) bh.intro = Math.min(1, bh.intro + dt / 3);
    const introE = easeOutCubic(bh.intro);

    const k = (rate) => 1 - Math.pow(1 - rate, f);
    bh.tiltX += (bh.targetX - bh.tiltX) * k(0.055);
    bh.tiltY += (bh.targetY - bh.tiltY) * k(0.055);

    // A rotação acelera: na formação, ao clicar e ao rolar a página rápido
    bh.kick *= Math.pow(0.97, f);
    const scrollBoost = Math.min(state.scrollVel / 30, 2.5);
    state.scrollVel *= Math.pow(0.9, f);
    const spinTarget = 1 + (1 - introE) * 5 + bh.kick + scrollBoost;
    bh.spin += (spinTarget - bh.spin) * k(0.06);

    for (let i = 0; i < bh.streams.length; i++) {
      const s = bh.streams[i];
      // Velocidade orbital kepleriana: v ∝ 1/√r
      s.angle += (0.028 / Math.sqrt(s.dist)) * s.speedVar * bh.spin * f;
      // A matéria espirala lentamente para dentro
      s.dist -= (0.0006 + 0.0004 / s.dist) * s.flow * (1 + (bh.spin - 1) * 0.25) * f;
      if (s.dist < 1.07) spawnStream(s, false);

      const inner = clamp((s.dist - 1.07) / 0.22, 0, 1);
      const outer = clamp((3.05 - s.dist) / 0.3, 0, 1);
      s.fade = inner * outer;
    }

    for (let i = bh.pulses.length - 1; i >= 0; i--) {
      bh.pulses[i].t += dt / 1.7;
      if (bh.pulses[i].t >= 1) bh.pulses.splice(i, 1);
    }
  }

  // Desenha metade do disco (trás ou frente), em perspectiva elíptica
  function drawDiskHalf(ctx, front, R, e, flat, diskAngle, pal) {
    const cx = bhW * 0.5;
    const cy = bhH * 0.5;
    const t = bh.time;
    const widthScale = clamp(R / 78, 0.6, 1.15);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(diskAngle);
    ctx.scale(1, flat);

    // Brilho de base do disco (apenas a metade correspondente)
    ctx.save();
    ctx.beginPath();
    if (front) ctx.rect(-R * 4, 0, R * 8, R * 4);
    else ctx.rect(-R * 4, -R * 4, R * 8, R * 4);
    ctx.clip();

    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 2.9);
    const g = pal.glow * e;
    glow.addColorStop(0, rgba(pal.rgb, 0));
    glow.addColorStop(0.37, rgba(pal.rgb, 0));
    glow.addColorStop(0.4, rgba(pal.rgb, g));
    glow.addColorStop(0.5, rgba(pal.rgb, g * 0.55));
    glow.addColorStop(0.75, rgba(pal.rgb, g * 0.16));
    glow.addColorStop(1, rgba(pal.rgb, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, R * 2.9, 0, TAU);
    ctx.fill();
    ctx.restore();

    // Filamentos de plasma
    ctx.lineCap = 'round';
    for (let i = 0; i < bh.streams.length; i++) {
      const s = bh.streams[i];
      const mid = s.angle + s.arc * 0.5;
      const sn = Math.sin(mid);
      if ((sn >= 0) !== front) continue;

      // Doppler: o lado que se aproxima (esquerda) é mais brilhante
      const doppler = clamp(1 - 0.5 * Math.cos(mid), 0.4, 1.5);
      const flicker = 0.85 + 0.15 * Math.sin(t * 3 + s.phase);
      const alpha = s.alpha * doppler * flicker * s.fade * e * pal.alphaMul;
      if (alpha < 0.02) continue;

      const hot = clamp((3.0 - s.dist) / 1.9, 0, 1);   // mais quente perto do horizonte
      const grey = (pal.gMin + (pal.gMax - pal.gMin) * hot) | 0;

      ctx.globalAlpha = Math.min(alpha, 1);
      ctx.strokeStyle = GREY[grey];
      ctx.lineWidth = s.size * (0.75 + 0.5 * hot) * widthScale;
      ctx.beginPath();
      ctx.arc(0, s.yJitter * R, R * s.dist, s.angle, s.angle + s.arc);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // Arco luminoso: camadas de traços de larguras crescentes, com brilho que
  // desvanece nas pontas (gradiente cônico, sem emendas)
  function drawSoftArc(ctx, radius, a0, a1, baseWidth, alpha, rgb) {
    const layers = 5;
    ctx.lineCap = 'butt';

    if (ctx.createConicGradient) {
      const span = (a1 - a0) / TAU;
      const grad = ctx.createConicGradient(a0, 0, 0);
      const steps = 10;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        grad.addColorStop(t * span, rgba(rgb, Math.pow(Math.sin(t * Math.PI), 0.7)));
      }
      grad.addColorStop(Math.min(1, span + 0.0001), rgba(rgb, 0));
      grad.addColorStop(1, rgba(rgb, 0));
      ctx.strokeStyle = grad;

      for (let l = 0; l < layers; l++) {
        const k = l / (layers - 1);
        ctx.globalAlpha = clamp(alpha * Math.pow(1 - k, 2) * 0.55, 0, 1);
        ctx.lineWidth = baseWidth * (0.2 + k * 1.7);
        ctx.beginPath();
        ctx.arc(0, 0, radius, a0, a1);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      return;
    }

    // Alternativa para navegadores sem gradiente cônico: traço único e suave
    ctx.strokeStyle = rgba(rgb, alpha * 0.35);
    ctx.lineWidth = baseWidth;
    ctx.beginPath();
    ctx.arc(0, 0, radius, a0, a1);
    ctx.stroke();
  }

  function drawBlackHoleFrame() {
    const ctx = bhCtx;
    if (!ctx || !bhW) return;

    const pal = palette();
    ctx.setTransform(bhDpr, 0, 0, bhDpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, bhW, bhH);

    const cx = bhW * 0.5;
    const cy = bhH * 0.5;
    const e = easeOutCubic(bh.intro);
    const R = bh.radius * (0.35 + 0.65 * easeOutExpo(bh.intro));
    const breathe = 0.5 + 0.5 * Math.sin(bh.time * 1.4);
    const flat = clamp(0.27 + bh.tiltY * 0.45, 0.1, 0.55);
    const diskAngle = -0.14 + bh.tiltX * 0.6;

    // 1. Aura gravitacional externa
    const aura = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 3.6);
    aura.addColorStop(0, rgba(pal.rgb, pal.aura * e * (0.85 + 0.3 * breathe)));
    aura.addColorStop(0.35, rgba(pal.rgb, pal.aura * 0.4 * e));
    aura.addColorStop(1, rgba(pal.rgb, 0));
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 3.6, 0, TAU);
    ctx.fill();

    ctx.globalCompositeOperation = pal.composite;

    // 2. Arcos de lente gravitacional (a luz do disco de trás curvada sobre o buraco)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(bh.tiltX * 0.25 - 0.06);
    const lens = e * pal.alphaMul * (0.9 + 0.1 * breathe);
    drawSoftArc(ctx, R * 1.36, Math.PI * 0.86, Math.PI * 2.14, R * 0.2, 0.95 * lens, pal.rgb);
    drawSoftArc(ctx, R * 1.3, Math.PI * 0.14, Math.PI * 0.86, R * 0.14, 0.4 * lens, pal.rgb);
    ctx.restore();

    // 3. Metade de trás do disco
    drawDiskHalf(ctx, false, R, e, flat, diskAngle, pal);

    // 4. Halo da esfera de fótons (por baixo do horizonte, que o recorta)
    const halo = ctx.createRadialGradient(cx, cy, R, cx, cy, R * 1.28);
    halo.addColorStop(0, rgba(pal.rgb, (0.9 + 0.1 * breathe) * e));
    halo.addColorStop(0.35, rgba(pal.rgb, 0.4 * e));
    halo.addColorStop(1, rgba(pal.rgb, 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.28, 0, TAU);
    ctx.fill();

    ctx.globalCompositeOperation = 'source-over';

    // 5. Horizonte de eventos
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.fill();

    // 6. Anel de luz fino, que "respira"
    ctx.strokeStyle = isDark ? `rgba(255,255,255,${(0.75 + 0.25 * breathe) * e})` : `rgba(0,0,0,${0.9 * e})`;
    ctx.lineWidth = 1.2 + 0.9 * breathe;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.015, 0, TAU);
    ctx.stroke();

    // 7. Metade da frente do disco (passa na frente do horizonte)
    ctx.globalCompositeOperation = pal.composite;
    drawDiskHalf(ctx, true, R, e, flat, diskAngle, pal);
    ctx.globalCompositeOperation = 'source-over';

    // 8. Ondas de choque (clique)
    for (let i = 0; i < bh.pulses.length; i++) {
      const p = bh.pulses[i];
      const radius = R * (1.15 + easeOutCubic(p.t) * 3.4);
      ctx.strokeStyle = rgba(pal.rgb, (1 - p.t) * 0.5);
      ctx.lineWidth = 0.6 + (1 - p.t) * 1.6;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, TAU);
      ctx.stroke();
    }
  }

  function renderStaticBlackHole() {
    if (!bhCtx) return;
    bh.tiltX = 0;
    bh.tiltY = 0;
    bh.intro = 1;
    drawBlackHoleFrame();
  }

  function bhFrame(now) {
    const dt = Math.min((now - bhLast) / 1000, 0.05);
    bhLast = now;
    stepBlackHole(dt);
    drawBlackHoleFrame();
    bhAnimId = requestAnimationFrame(bhFrame);
  }

  initBlackHole();

  // Aplica o tema inicial depois que os módulos existem
  applyTheme(getPreferredTheme(), false);

  // --------------------------------------------------------------------------
  // 5. NAVEGAÇÃO
  // --------------------------------------------------------------------------
  const header = document.getElementById('site-header');
  const nav = document.getElementById('main-nav');
  const indicator = document.getElementById('nav-indicator');
  const navLinks = Array.from(document.querySelectorAll('.nav-link'));
  const progressBar = document.getElementById('scroll-progress-bar');
  const heroSection = document.getElementById('inicio');
  const menuToggle = document.getElementById('menu-toggle');
  const mobileMenu = document.getElementById('mobile-menu');
  const sectionIds = navLinks.map((l) => l.dataset.section);
  const sections = sectionIds.map((id) => document.getElementById(id)).filter(Boolean);

  let activeId = null;
  let hoveredLink = null;
  let lastScrollY = window.scrollY;
  let headerLockedUntil = 0;
  let scrollTicking = false;
  let menuOpen = false;

  // Indicador deslizante
  function moveIndicator(link) {
    if (!indicator || !link || !nav) return;
    indicator.style.setProperty('--ind-x', `${link.offsetLeft}px`);
    indicator.style.setProperty('--ind-w', `${link.offsetWidth}px`);
    indicator.classList.add('is-ready');
  }

  function currentActiveLink() {
    return navLinks.find((l) => l.dataset.section === activeId) || null;
  }

  function setActive(id) {
    if (id === activeId) return;
    activeId = id;
    navLinks.forEach((link) => {
      const on = link.dataset.section === id;
      link.classList.toggle('is-active', on);
      if (on) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });
    if (!hoveredLink) moveIndicator(currentActiveLink());
  }

  navLinks.forEach((link) => {
    link.addEventListener('mouseenter', () => { hoveredLink = link; moveIndicator(link); });
    link.addEventListener('focus', () => { hoveredLink = link; moveIndicator(link); });
    const leave = () => { hoveredLink = null; moveIndicator(currentActiveLink()); };
    link.addEventListener('mouseleave', leave);
    link.addEventListener('blur', leave);
  });

  window.addEventListener('resize', () => moveIndicator(hoveredLink || currentActiveLink()), { passive: true });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => moveIndicator(hoveredLink || currentActiveLink()));
  }

  function updateOnScroll() {
    scrollTicking = false;
    const y = window.scrollY;
    const maxScroll = root.scrollHeight - window.innerHeight;
    const dy = y - lastScrollY;
    lastScrollY = y;

    // Barra de progresso
    if (progressBar) progressBar.style.transform = `scaleX(${maxScroll > 0 ? clamp(y / maxScroll, 0, 1) : 0})`;

    // Cabeçalho: ganha fundo ao rolar; some ao descer e volta ao subir
    header.classList.toggle('is-scrolled', y > 24);
    if (!menuOpen && performance.now() > headerLockedUntil) {
      if (y > 320 && dy > 6) header.classList.add('is-hidden');
      else if (dy < -6 || y <= 320) header.classList.remove('is-hidden');
    }

    // Scroll-spy: a seção ativa é a última cujo topo passou de 40% da tela
    const line = window.innerHeight * 0.4;
    let current = sections.length ? sections[0].id : null;
    for (let i = 0; i < sections.length; i++) {
      if (sections[i].getBoundingClientRect().top <= line) current = sections[i].id;
    }
    if (maxScroll > 0 && y >= maxScroll - 4) current = sections[sections.length - 1].id;
    setActive(current);

    // Parallax de saída do hero + impulso para o buraco negro
    if (!isReduced && heroSection) {
      const p = clamp(y / (heroSection.offsetHeight * 0.9), 0, 1);
      heroSection.style.setProperty('--hero-p', p.toFixed(4));
      state.scrollVel = Math.max(state.scrollVel, Math.abs(dy));
    }
  }

  function requestScrollUpdate() {
    if (!scrollTicking) {
      scrollTicking = true;
      requestAnimationFrame(updateOnScroll);
    }
  }

  window.addEventListener('scroll', requestScrollUpdate, { passive: true });
  window.addEventListener('resize', requestScrollUpdate, { passive: true });
  updateOnScroll();

  // Menu mobile
  function setMenu(open) {
    menuOpen = open;
    mobileMenu.classList.toggle('is-open', open);
    root.classList.toggle('menu-open', open);
    menuToggle.setAttribute('aria-expanded', String(open));
    menuToggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
    const main = document.getElementById('main-content');
    const footer = document.querySelector('.site-footer');
    [main, footer].forEach((el) => { if (el) el.inert = open; });
    if (open) {
      header.classList.remove('is-hidden');
      const first = mobileMenu.querySelector('.mobile-nav-link');
      if (first) setTimeout(() => first.focus({ preventScroll: true }), 80);
    }
  }

  if (menuToggle && mobileMenu) {
    menuToggle.addEventListener('click', () => setMenu(!menuOpen));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && menuOpen) { setMenu(false); menuToggle.focus(); }
    });
    window.matchMedia('(min-width: 901px)').addEventListener('change', (e) => {
      if (e.matches && menuOpen) setMenu(false);
    });
  }

  // Rolagem suave para âncoras
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', function (e) {
      const targetId = this.getAttribute('href');
      if (!targetId || targetId === '#') return;
      const target = document.querySelector(targetId);
      if (!target) return;

      e.preventDefault();
      if (menuOpen) setMenu(false);

      headerLockedUntil = performance.now() + 1100;   // mantém o cabeçalho visível durante o deslize
      header.classList.remove('is-hidden');

      target.scrollIntoView({ behavior: isReduced ? 'auto' : 'smooth', block: 'start' });
      if (history.replaceState) history.replaceState(null, '', targetId);

      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    });
  });

  // --------------------------------------------------------------------------
  // 6. ANIMAÇÕES DE ROLAGEM
  // --------------------------------------------------------------------------
  if ('IntersectionObserver' in window && !isReduced) {
    // Títulos: separa em palavras para a animação de máscara
    document.querySelectorAll('.section-title').forEach((title) => {
      const words = title.textContent.trim().split(/\s+/);
      title.textContent = '';
      words.forEach((word, i) => {
        const outer = document.createElement('span');
        outer.className = 'word';
        const inner = document.createElement('span');
        inner.className = 'word-inner';
        inner.style.setProperty('--w', i);
        inner.textContent = word;
        outer.appendChild(inner);
        title.appendChild(outer);
        if (i < words.length - 1) title.appendChild(document.createTextNode(' '));
      });
      title.classList.add('split-title', 'scroll-reveal');
    });

    root.classList.add('js-ready');

    const revealObserver = new IntersectionObserver((entries) => {
      // Elementos que entram juntos aparecem em sequência (efeito cascata)
      const entering = entries.filter((en) => en.isIntersecting);
      entering.forEach((entry, i) => {
        const el = entry.target;
        el.style.setProperty('--reveal-delay', `${i * 0.09}s`);
        el.classList.add('is-visible');
        el.addEventListener('animationend', (ev) => {
          // Ao terminar, devolve o controle ao CSS normal (o hover dos cards volta a funcionar)
          if (ev.target === el && !el.classList.contains('split-title')) {
            el.classList.add('is-done');
            el.style.removeProperty('--reveal-delay');
          }
        });
        revealObserver.unobserve(el);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    document.querySelectorAll('.scroll-reveal').forEach((el) => revealObserver.observe(el));
  }

  // --------------------------------------------------------------------------
  // 7. MICROINTERAÇÕES
  // --------------------------------------------------------------------------
  if (canHover && !isReduced) {
    // Luz que segue o cursor dentro dos cards + inclinação 3D nos projetos
    document.querySelectorAll('.editorial-card, .skill-box, .project-panel, .contact-block, .hero-summary-surface, .section-lead-surface')
      .forEach((card) => {
        card.setAttribute('data-spotlight', '');
        const tilt = card.classList.contains('project-panel');

        card.addEventListener('pointermove', (e) => {
          const r = card.getBoundingClientRect();
          const px = (e.clientX - r.left) / r.width;
          const py = (e.clientY - r.top) / r.height;
          card.style.setProperty('--mx', `${(px * r.width).toFixed(0)}px`);
          card.style.setProperty('--my', `${(py * r.height).toFixed(0)}px`);
          if (tilt) {
            card.style.setProperty('--ry', `${((px - 0.5) * 7).toFixed(2)}deg`);
            card.style.setProperty('--rx', `${((0.5 - py) * 5).toFixed(2)}deg`);
          }
        });

        card.addEventListener('pointerleave', () => {
          card.style.removeProperty('--rx');
          card.style.removeProperty('--ry');
        });
      });

    // Botões magnéticos
    document.querySelectorAll('[data-magnetic]').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left - r.width / 2) * 0.28;
        const y = (e.clientY - r.top - r.height / 2) * 0.4;
        el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      });
      el.addEventListener('pointerleave', () => { el.style.transform = ''; });
    });
  }

})();
