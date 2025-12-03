// Pixel Morph to Obama - client-side only
// Controls a canvas animation that turns a source image into a target image
// by gradually replacing pixels (or by crossfading).
(() => {
  const sourceInput = document.getElementById('source-input');
  const targetInput = document.getElementById('target-input');
  const startBtn = document.getElementById('start-btn');
  const pauseBtn = document.getElementById('pause-btn');
  const resetBtn = document.getElementById('reset-btn');
  const useDefaultBtn = document.getElementById('use-default-obama');
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const sizeSelect = document.getElementById('size-select');
  const speedRange = document.getElementById('speed');
  const speedVal = document.getElementById('speed-val');
  const modeSelect = document.getElementById('mode');

  let srcImage = null;
  let tgtImage = null;
  let workingSize = parseInt(sizeSelect.value, 10);
  let animationId = null;
  let isPaused = false;

  // Pixel morph state
  let srcData = null;
  let tgtData = null;
  let currentData = null;
  let indices = [];
  let nextIndex = 0; // how many pixels replaced
  let totalPixels = 0;

  const OBAMA_DEFAULT = 'https://upload.wikimedia.org/wikipedia/commons/8/8d/President_Barack_Obama.jpg';
  // Note: This URL points to a portrait on Wikimedia Commons (official/White House photos are public-domain).
  // If it fails to load you can upload your own target image.

  function updateButtonsReady(ready) {
    startBtn.disabled = !ready;
    resetBtn.disabled = !ready;
    pauseBtn.disabled = true;
  }

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

  sourceInput.addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (!f) return;
    loadImageFromFile(f).then(img => {
      srcImage = img;
      drawPreview(img, 0, 0, canvas.width / 2);
      checkReady();
    });
  });

  targetInput.addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (!f) return;
    loadImageFromFile(f).then(img => {
      tgtImage = img;
      checkReady();
    });
  });

  useDefaultBtn.addEventListener('click', async () => {
    useDefaultBtn.disabled = true;
    try {
      const img = await loadImageFromURL(OBAMA_DEFAULT);
      tgtImage = img;
      checkReady();
    } catch (err) {
      alert('Failed to load default image. Please upload a target image.');
      console.error(err);
    } finally {
      useDefaultBtn.disabled = false;
    }
  });

  startBtn.addEventListener('click', () => {
    if (!srcImage || !tgtImage) return;
    startAnimation();
  });

  pauseBtn.addEventListener('click', () => {
    if (isPaused) {
      isPaused = false;
      pauseBtn.textContent = 'Pause';
      runLoop();
    } else {
      isPaused = true;
      pauseBtn.textContent = 'Resume';
      if (animationId) cancelAnimationFrame(animationId);
    }
  });

  resetBtn.addEventListener('click', () => {
    if (animationId) cancelAnimationFrame(animationId);
    initState();
    renderCurrent();
    pauseBtn.disabled = true;
    isPaused = false;
    pauseBtn.textContent = 'Pause';
  });

  function checkReady() {
    if (srcImage && tgtImage) {
      // enable start
      updateButtonsReady(true);
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
    // Draw image to a temporary canvas sized n×n, maintain aspect by (cover)
    const tmp = document.createElement('canvas');
    tmp.width = n; tmp.height = n;
    const tctx = tmp.getContext('2d');
    // cover crop
    const arImg = img.width / img.height;
    const arCanv = 1;
    let sx=0, sy=0, sw=img.width, sh=img.height;
    if (arImg > arCanv) {
      // image wider -> crop left/right
      const desiredW = img.height * arCanv;
      sx = (img.width - desiredW)/2;
      sw = desiredW;
    } else {
      // image taller -> crop top/bottom
      const desiredH = img.width / arCanv;
      sy = (img.height - desiredH)/2;
      sh = desiredH;
    }
    tctx.drawImage(img, sx, sy, sw, sh, 0, 0, n, n);
    return tmp;
  }

  function drawPreview(img, x, y, maxSide) {
    // draw a small preview in the canvas (not used for final)
    const tmp = fitToSquare(img, workingSize);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(tmp, 0, 0);
  }

  function drawDualPreview() {
    // draw source on left / target on right in the same canvas (for quick preview)
    const sTmp = fitToSquare(srcImage, workingSize);
    const tTmp = fitToSquare(tgtImage, workingSize);
    // side-by-side preview in the canvas width (canvas is square), so draw target over source with opacity?
    // We'll show source first, then draw a small inset of target in the corner
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(sTmp, 0, 0);
    // small inset
    const insetSize = Math.round(workingSize * 0.35);
    ctx.globalAlpha = 0.95;
    ctx.drawImage(tTmp, workingSize - insetSize - 6, 6, insetSize, insetSize);
    ctx.globalAlpha = 1.0;
  }

  function initState() {
    setSize(parseInt(sizeSelect.value, 10));
    // draw resized/cropped images into imageData arrays
    const sTmp = fitToSquare(srcImage, workingSize);
    const tTmp = fitToSquare(tgtImage, workingSize);
    // get data
    const sCtx = sTmp.getContext('2d');
    const tCtx = tTmp.getContext('2d');
    srcData = sCtx.getImageData(0,0,workingSize,workingSize);
    tgtData = tCtx.getImageData(0,0,workingSize,workingSize);
    currentData = ctx.createImageData(workingSize, workingSize);
    // copy src to current
    currentData.data.set(srcData.data);
    totalPixels = workingSize * workingSize;
    // build shuffled index list
    indices = new Uint32Array(totalPixels);
    for (let i=0;i<totalPixels;i++) indices[i]=i;
    // Fisher-Yates shuffle
    for (let i=totalPixels-1;i>0;i--) {
      const j = Math.floor(Math.random()*(i+1));
      const t = indices[i]; indices[i]=indices[j]; indices[j]=t;
    }
    nextIndex = 0;
  }

  function startAnimation() {
    initState();
    renderCurrent();
    isPaused = false;
    pauseBtn.disabled = false;
    pauseBtn.textContent = 'Pause';
    runLoop();
  }

  function runLoop() {
    if (isPaused) return;
    const mode = modeSelect.value;
    if (mode === 'pixels') {
      pixelStep();
    } else {
      fadeStep();
    }
    renderCurrent();
    if (nextIndex >= totalPixels && mode === 'pixels') {
      // finished
      pauseBtn.disabled = true;
      startBtn.disabled = false;
      return;
    }
    animationId = requestAnimationFrame(runLoop);
  }

  function pixelStep() {
    // replace a batch of pixels per frame based on speed
    // speedRange 1..100 -> map to batch size
    const sp = parseInt(speedRange.value, 10);
    // map so that lower speed -> smaller batch
    const batch = Math.max(1, Math.round(sp * totalPixels / 2000)); // tuned empirically
    const d = currentData.data;
    const td = tgtData.data;
    for (let b=0;b<batch && nextIndex<totalPixels;b++, nextIndex++) {
      const pix = indices[nextIndex];
      const off = pix*4;
      d[off] = td[off];
      d[off+1] = td[off+1];
      d[off+2] = td[off+2];
      d[off+3] = td[off+3];
    }
  }

  let fadeT = 0;
  function fadeStep() {
    const sp = parseInt(speedRange.value, 10);
    // interpret speed as how many frames to go from 0->1: faster = fewer frames
    const frames = Math.max(10, Math.round(200 - sp*1.6)); // 1..100 -> 200..40 frames
    fadeT += 1/frames;
    if (fadeT > 1) fadeT = 1;
    const s = srcData.data, t = tgtData.data, d = currentData.data;
    for (let i=0;i<s.length;i+=4) {
      d[i]   = Math.round(s[i]   + (t[i]   - s[i])   * fadeT);
      d[i+1] = Math.round(s[i+1] + (t[i+1] - s[i+1]) * fadeT);
      d[i+2] = Math.round(s[i+2] + (t[i+2] - s[i+2]) * fadeT);
      d[i+3] = Math.round(s[i+3] + (t[i+3] - s[i+3]) * fadeT);
    }
    if (fadeT >= 1) {
      // done
      if (animationId) cancelAnimationFrame(animationId);
      pauseBtn.disabled = true;
    }
  }

  function renderCurrent() {
    ctx.putImageData(currentData, 0, 0);
  }

  // Initial small placeholder
  ctx.fillStyle = '#333';
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle = '#fff';
  ctx.font = '14px sans-serif';
  ctx.fillText('Upload a source image', 10, 20);

  // Utility to load with file or URL already provided earlier (for testing)
  // don't expose more globally.

  // Expose a check to enable start button if only source+default target chosen via button:
  window.__enableStartIfReady = checkReady;

  // Also handle drag-and-drop for convenience
  ;(function initDragDrop() {
    const body = document.body;
    body.addEventListener('dragover', e => { e.preventDefault(); body.classList.add('drag'); });
    body.addEventListener('dragleave', e => { body.classList.remove('drag'); });
    body.addEventListener('drop', e => {
      e.preventDefault(); body.classList.remove('drag');
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (!f) return;
      // treat as source
      loadImageFromFile(f).then(img => { srcImage = img; checkReady(); drawDualPreview(); });
    });
  })();

})();
