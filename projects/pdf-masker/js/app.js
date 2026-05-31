/* =====================================================
   PDF Flash — Application Logic
   ===================================================== */

(function () {
  'use strict';

  // ===== Configuration =====
  const PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174';
  const WORKER_SRC = `${PDFJS_CDN}/pdf.worker.min.js`;

  // ===== State =====
  let pdfDoc = null;
  let totalPages = 0;
  let currentFileData = null; // Store for re-render on resize
  let isRendering = false;
  let renderQueue = false;

  // ===== DOM References =====
  const fileInput = document.getElementById('file-input');
  const uploadZone = document.getElementById('upload-zone');
  const uploadSection = document.getElementById('upload-section');
  const loadingSection = document.getElementById('loading-section');
  const loadingText = document.querySelector('.loading-text');
  const viewerSection = document.getElementById('viewer-section');
  const viewer = document.getElementById('viewer');
  const toolbarControls = document.getElementById('toolbar-controls');
  const revealAllBtn = document.getElementById('reveal-all-btn');
  const hideAllBtn = document.getElementById('hide-all-btn');
  const changeFileBtn = document.getElementById('change-file-btn');
  const pageInfo = document.getElementById('page-info');
  
  // Toggles
  const modeLineToggle = document.getElementById('mode-line-toggle');
  const modeHoverToggle = document.getElementById('mode-hover-toggle');

  // ===== Initialize =====
  function init() {
    // Apply initial toggle states
    document.body.classList.toggle('hover-reveal-mode', modeHoverToggle.checked);

    // Configure PDF.js worker
    pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER_SRC;

    // File input handler
    fileInput.addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (file) handleFile(file);
    });

    // Upload zone — click to open file picker
    uploadZone.addEventListener('click', function () {
      fileInput.click();
    });

    // Upload zone — keyboard accessibility
    uploadZone.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fileInput.click();
      }
    });

    // Drag & Drop
    uploadZone.addEventListener('dragover', function (e) {
      e.preventDefault();
      e.stopPropagation();
      uploadZone.classList.add('drag-over');
    });

    uploadZone.addEventListener('dragleave', function (e) {
      e.preventDefault();
      e.stopPropagation();
      uploadZone.classList.remove('drag-over');
    });

    uploadZone.addEventListener('drop', function (e) {
      e.preventDefault();
      e.stopPropagation();
      uploadZone.classList.remove('drag-over');

      var file = e.dataTransfer.files[0];
      if (file && file.type === 'application/pdf') {
        handleFile(file);
      }
    });

    // Also support drag events on the whole window for better UX
    document.addEventListener('dragover', function (e) {
      e.preventDefault();
    });
    document.addEventListener('drop', function (e) {
      e.preventDefault();
    });

    // Toolbar buttons
    revealAllBtn.addEventListener('click', revealAll);
    hideAllBtn.addEventListener('click', hideAll);
    changeFileBtn.addEventListener('click', resetToUpload);

    // Toggles
    modeHoverToggle.addEventListener('change', function (e) {
      document.body.classList.toggle('hover-reveal-mode', e.target.checked);
    });

    modeLineToggle.addEventListener('change', function () {
      if (pdfDoc) renderAllPages();
    });

    // Debounced resize handler
    var resizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if (pdfDoc) renderAllPages();
      }, 350);
    });
  }

  // ===== Section Visibility =====
  function showSection(name) {
    uploadSection.classList.toggle('hidden', name !== 'upload');
    loadingSection.classList.toggle('hidden', name !== 'loading');
    viewerSection.classList.toggle('hidden', name !== 'viewer');

    if (name === 'viewer') {
      toolbarControls.classList.add('visible');
    } else {
      toolbarControls.classList.remove('visible');
    }
  }

  // ===== Handle Uploaded File =====
  function handleFile(file) {
    if (file.type !== 'application/pdf') {
      alert('Please select a valid PDF file.');
      return;
    }

    showSection('loading');
    loadingText.textContent = 'Reading file…';

    var reader = new FileReader();
    reader.onload = function (e) {
      var data = new Uint8Array(e.target.result);
      currentFileData = data;
      loadPdf(data);
    };
    reader.onerror = function () {
      alert('Could not read the file. Please try again.');
      showSection('upload');
    };
    reader.readAsArrayBuffer(file);
  }

  // ===== Load PDF with PDF.js =====
  async function loadPdf(data) {
    try {
      loadingText.textContent = 'Parsing PDF…';

      var loadingTask = pdfjsLib.getDocument({
        data: data,
        cMapUrl: PDFJS_CDN + '/cmaps/',
        cMapPacked: true,
      });

      pdfDoc = await loadingTask.promise;
      totalPages = pdfDoc.numPages;

      pageInfo.textContent = totalPages + ' page' + (totalPages !== 1 ? 's' : '');
      showSection('viewer');

      await renderAllPages();
    } catch (err) {
      console.error('PDF load error:', err);
      alert('Failed to load this PDF. It may be corrupted or password-protected.');
      showSection('upload');
    }
  }

  // ===== Render All Pages =====
  async function renderAllPages() {
    if (isRendering) {
      renderQueue = true;
      return;
    }
    isRendering = true;

    viewer.innerHTML = '';

    for (var i = 1; i <= totalPages; i++) {
      if (renderQueue) break; // Stop rendering if a new render is queued
      loadingText.textContent = 'Rendering page ' + i + ' of ' + totalPages + '…';
      var page = await pdfDoc.getPage(i);
      if (renderQueue) break;
      await renderPage(page, i);
    }

    isRendering = false;
    if (renderQueue) {
      renderQueue = false;
      renderAllPages();
    }
  }

  // ===== Render a Single Page =====
  async function renderPage(page, pageNum) {
    // Calculate scale to fit viewer width, capped at reasonable max
    var viewerWidth = viewer.clientWidth;
    var maxWidth = Math.min(viewerWidth - 16, 960);
    var baseViewport = page.getViewport({ scale: 1 });
    var scale = maxWidth / baseViewport.width;
    var viewport = page.getViewport({ scale: scale });

    // -- Page container --
    var container = document.createElement('div');
    container.className = 'page-container';
    container.style.width = viewport.width + 'px';
    container.style.height = viewport.height + 'px';
    container.style.animationDelay = ((pageNum - 1) * 80) + 'ms';

    // -- Canvas (PDF rendering) --
    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d');

    // High-DPI support
    var outputScale = window.devicePixelRatio || 1;
    canvas.width = viewport.width * outputScale;
    canvas.height = viewport.height * outputScale;
    canvas.style.width = viewport.width + 'px';
    canvas.style.height = viewport.height + 'px';

    container.appendChild(canvas);

    // -- Text layer container --
    var textLayerDiv = document.createElement('div');
    textLayerDiv.className = 'textLayer'; // Must match pdf_viewer.css
    textLayerDiv.style.width = viewport.width + 'px';
    textLayerDiv.style.height = viewport.height + 'px';
    // Provide the required scale factor property for pdf.js text layer
    textLayerDiv.style.setProperty('--scale-factor', scale);
    container.appendChild(textLayerDiv);

    // -- Page number label --
    var label = document.createElement('div');
    label.className = 'page-label';
    label.textContent = pageNum + ' / ' + totalPages;
    container.appendChild(label);

    // Add to DOM before rendering (so dimensions are computed)
    viewer.appendChild(container);

    // -- Render canvas --
    var transform = outputScale !== 1
      ? [outputScale, 0, 0, outputScale, 0, 0]
      : null;

    await page.render({
      canvasContext: ctx,
      viewport: viewport,
      transform: transform,
    }).promise;

    // -- Render text layer --
    var textContent = await page.getTextContent();

    var renderTask = pdfjsLib.renderTextLayer({
      textContent: textContent,
      container: textLayerDiv,
      viewport: viewport,
      textDivs: [],
    });
    await renderTask.promise;

    // -- Post-process: wrap words in clickable masks --
    wrapWordsInMasks(textLayerDiv);

    // -- Event delegation for mask clicks --
    textLayerDiv.addEventListener('click', function (e) {
      var mask = e.target.closest('.word-mask');
      if (mask) {
        e.preventDefault();
        e.stopPropagation();
        mask.classList.toggle('revealed');
      }
    });
  }

  // ===== Wrap Individual Words or Lines in Mask Spans =====
  function wrapWordsInMasks(textLayerDiv) {
    var spans = textLayerDiv.querySelectorAll('span');
    var isLineMode = modeLineToggle.checked;

    spans.forEach(function (span) {
      var text = span.textContent;
      if (!text || !text.trim()) return;

      if (isLineMode) {
        // Line Mode: Wrap the entire span text in one mask
        span.textContent = '';
        var mask = document.createElement('mark');
        mask.className = 'word-mask';
        mask.textContent = text;
        span.appendChild(mask);
      } else {
        // Word Mode: Split into alternating [word, whitespace, word, …]
        var parts = text.split(/(\s+)/);

        // Clear the span and rebuild with mask wrappers
        span.textContent = '';

        parts.forEach(function (part) {
          if (!part) return;

          if (/^\s+$/.test(part)) {
            // Whitespace — keep as a plain text node
            span.appendChild(document.createTextNode(part));
          } else {
            // Word — wrap in a clickable mask. 
            // We use <mark> instead of <span> so pdf_viewer.css doesn't force 'position: absolute' on it!
            var mask = document.createElement('mark');
            mask.className = 'word-mask';
            mask.textContent = part;
            span.appendChild(mask);
          }
        });
      }
    });
  }

  // ===== Global Controls =====
  function revealAll() {
    var masks = document.querySelectorAll('.word-mask');
    masks.forEach(function (mask) {
      mask.classList.add('revealed');
    });
  }

  function hideAll() {
    var masks = document.querySelectorAll('.word-mask');
    masks.forEach(function (mask) {
      mask.classList.remove('revealed');
    });
  }

  // ===== Reset to Upload View =====
  function resetToUpload() {
    pdfDoc = null;
    totalPages = 0;
    currentFileData = null;
    viewer.innerHTML = '';
    fileInput.value = '';
    pageInfo.textContent = '';
    showSection('upload');
  }

  // ===== Start the App =====
  init();
})();
