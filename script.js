// Pixel Morph — rearrange source pixels to form the target (Obama)
// Colors are preserved: each particle keeps its original source color.

(() => {
  const sourceInput = document.getElementById('source-input');
  const targetInput = document.getElementById('target-input');
  const startBtn = document.getElementById('start-btn');
  const pauseBtn = document.getElementById('pause-btn');
  const resetBtn = document.getElementById('reset-btn');
  const useDefaultBtn = document.getElementById('use-default-obama');
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const sizeSelect = document.getElementById('size-select');
  const speedRange = document.getElementById('speed');
  const speedVal = document.getElementById('speed-val');
  const modeSelect = document.getElementById('mode');

  let srcImage = null;
  let tgtImage = null;
  let workingSize = parseInt(sizeSelect.value, 10);

  const OBAMA_DEFAULT = 'https://upload.wikimedia.org/wikipedia/commons/8/8d/President_Barack_Obama.jpg';

  // Particle list: one per source pixel
  let particles = []; // { r,g,b,a, sx,sy, tx,ty, delay, duration, done }
  let animRequest = null;
  let animStart = 0;
  let paused = false;
  let pauseTime = 0;

  function setSize(n) {
    workingSize = n;
    canvas.width = n;
    canvas.height = n;
  }

  sizeSelect.addEventListener('change', () => {
    setSize(parseInt(sizeSelect.value, 10));
  });

  speedRange.addEventListener('input', () => {
    speedVal.textContent = speedRange.value;
  });

  sourceInput.addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    loadImageFromFile(f).then(img => { srcImage = img; drawPlaceholder(); checkReady(); });
  });

  targetInput.addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    loadImageFromFile(f).then(img => { tgtImage = img; checkReady(); });
  });

  useDefaultBtn.addEventListener('click', async () => {
    useDefaultBtn.disabled = true;
    try {
      const img = await loadImageFromURL(OBAMA_DEFAULT);
      tgtImage = img;
      checkReady();
    } catch (e) {
      alert('Failed to load default target. Upload a target image instead.');
      console.error(e);
    } finally {
      useDefaultBtn.disabled = false;
    }
  });

  startBtn.addEventListener('click', () => {
    if (!srcImage || !tgtImage) return;
    startBtn.disabled = true;
    pauseBtn.disabled = false;
    resetBtn.disabled = false;
    paused = false;
    initParticlesAndStart();
  });

  pauseBtn.addEventListener('click', () => {
    if (!animRequest && !paused) return;
    if (paused) {
      paused = false;
      pauseBtn.textContent = 'Pause';
      animStart += performance.now() - pauseTime;
      animRequest = requestAnimationFrame(loop);
    } else {
      paused = true;
      pauseBtn.textContent = 'Resume';
      pauseTime = performance.now();
      if (animRequest) cancelAnimationFrame(animRequest);
      animRequest = null;
    }
  });

  resetBtn.addEventListener('click', () => {
    if (animRequest) cancelAnimationFrame(animRequest);
    animRequest = null;
    paused = false;
    pauseBtn.textContent = 'Pause';
    startBtn.disabled = false;
    pauseBtn.disabled = true;
    resetBtn.disabled = true;
    particles = [];
    drawPlaceholder();
  });

  function checkReady() {
    if (srcImage && tgtImage) {
      startBtn.disabled = false;
      drawDualPreview();
    }
  }

  function loadImageFromFile(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file);
      loadImageFromURL(url).then(img => { URL.revokeObjectURL(url); res(img); }).catch(rej);
    });
  }

  function loadImageFromURL(url) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => res(img);
      img.onerror = (e) => rej(e);
      img.src = url;
    });
  }

  function fitToSquare(img, n) {
    const tmp = document.createElement('canvas');
    tmp.width = n; tmp.height = n;
    const tctx = tmp.getContext('2d');
    const arImg = img.width / img.height;
    const arCanv = 1;
    let sx = 0, sy = 0, sw = img.width, sh = img.height;
    if (arImg > arCanv) {
      const desiredW = img.height * arCanv;
      sx = (img.width - desiredW) / 2;
      sw = desiredW;
    } else {
      const desiredH = img.width / arCanv;
      sy = (img.height - desiredH) / 2;
      sh = desiredH;
    }
    tctx.drawImage(img, sx, sy, sw, sh, 0, 0, n, n);
    return tmp;
  }

  function drawPlaceholder() {
    ctx.fillStyle = '#333';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = '#fff';
    ctx.font = '14px sans-serif';
    ctx.fillText('Upload a source image', 10, 20);
  }

  function drawDualPreview() {
    const sTmp = fitToSquare(srcImage, workingSize);
    const tTmp = fitToSquare(tgtImage, workingSize);
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(sTmp, 0, 0);
    const insetSize = Math.round(workingSize * 0.35);
    ctx.globalAlpha = 0.95;
    ctx.drawImage(tTmp, workingSize - insetSize - 6, 6, insetSize, insetSize);
    ctx.globalAlpha = 1.0;
  }

  // Compute luminance (perceptual)
  function lumAt(data, i) {
    const r = data[i], g = data[i+1], b = data[i+2];
    return 0.2126*r + 0.7152*g + 0.0722*b;
  }

  function initParticlesAndStart() {
    setSize(parseInt(sizeSelect.value, 10));
    const sTmp = fitToSquare(srcImage, workingSize);
    const tTmp = fitToSquare(tgtImage, workingSize);
    const sCtx = sTmp.getContext('2d');
    const tCtx = tTmp.getContext('2d');
    const srcData = sCtx.getImageData(0,0,workingSize,workingSize).data;
    const tgtData = tCtx.getImageData(0,0,workingSize,workingSize).data;
    const total = workingSize * workingSize;

    // Build luminance-sorted lists
    const srcList = new Array(total);
    const tgtList = new Array(total);
    for (let i=0;i<total;i++) {
      const off = i*4;
      srcList[i] = { idx: i, lum: lumAt(srcData, off) };
      tgtList[i] = { idx: i, lum: lumAt(tgtData, off) };
    }
    srcList.sort((a,b) => a.lum - b.lum);
    tgtList.sort((a,b) => a.lum - b.lum);

    // Build mapping: srcIndex -> targetIndex
    const mapping = new Uint32Array(total);
    for (let k=0;k<total;k++) {
      mapping[srcList[k].idx] = tgtList[k].idx;
    }

    // Build particles list (colors come from source and will not change)
    particles = new Array(total);
    const userSpeed = parseInt(speedRange.value,10); // 1..100
    const totalDuration = Math.max(1.0, 8 - (userSpeed/100) * 6.5);
    const maxDelay = Math.min(1.8, totalDuration * 0.6);
    for (let i=0;i<total;i++) {
      const off = i*4;
      const r = srcData[off], g = srcData[off+1], b = srcData[off+2], a = srcData[off+3];
      const sx = i % workingSize, sy = Math.floor(i / workingSize);
      const tgtIdx = mapping[i];
      const tx = tgtIdx % workingSize, ty = Math.floor(tgtIdx / workingSize);
      const delay = Math.random() * maxDelay;
      const duration = totalDuration * (0.6 + Math.random() * 0.8);
      particles[i] = { r,g,b,a, sx,sy, tx,ty, delay, duration, done:false };
    }

    animStart = performance.now();
    if (animRequest) cancelAnimationFrame(animRequest);
    animRequest = requestAnimationFrame(loop);
  }

  function easeOutCubic(t) { return 1 - Math.pow(1-t, 3); }

  function loop(now) {
    if (paused) { animRequest = null; return; }
    const elapsed = (now - animStart) / 1000; // seconds
    ctx.clearRect(0,0,canvas.width,canvas.height);

    let allDone = true;
    for (let i=0, L=particles.length;i<L;i++) {
      const p = particles[i];
      const localT = (elapsed - p.delay) / p.duration;
      let prog = Math.min(Math.max(localT, 0), 1);
      if (prog < 1) allDone = false;
      const eased = easeOutCubic(prog);
      const x = p.sx + (p.tx - p.sx)*eased;
      const y = p.sy + (p.ty - p.sy)*eased;
      // draw pixel with original source color (alpha normalized)
      const alpha = (p.a === 255) ? 1 : (p.a / 255);
      ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${alpha})`;
      ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    }

    if (!allDone) {
      animRequest = requestAnimationFrame(loop);
    } else {
      animRequest = null;
      // Final state: we do NOT draw the target image; pixels already sit at target positions with their original colors.
      pauseBtn.disabled = true;
      startBtn.disabled = false;
    }
  }

  drawPlaceholder();

  ;(function initDragDrop() {
    const body = document.body;
    body.addEventListener('dragover', e => { e.preventDefault(); body.classList.add('drag'); });
    body.addEventListener('dragleave', e => { body.classList.remove('drag'); });
    body.addEventListener('drop', e => {
      e.preventDefault(); body.classList.remove('drag');
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (!f) return;
      loadImageFromFile(f).then(img => { srcImage = img; checkReady(); drawDualPreview(); });
    });
  })();

})();
