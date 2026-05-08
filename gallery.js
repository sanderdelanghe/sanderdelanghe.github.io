/* gallery.js */
const grid = document.getElementById('masonry');
let resizeTimer;

// 1. Initial creation of elements
function initGallery() {
    if (!grid) return;
    IMAGES.forEach(item => {
        const el = document.createElement('div');
        el.className = 'masonry-item';

        // Check welk type cursor we nodig hebben
        if (item.link) {
            el.classList.add('cursor-link');
        } else {
            el.classList.add('cursor-zoom');
        }

        el.innerHTML = `
            <img src="${item.src}" alt="${item.title}" loading="lazy">
            <div class="overlay"></div>
            <div class="overlay-label"><span>${item.title}</span></div>
        `;
        
        el.addEventListener('click', () => {
            if (item.link) {
                window.location.href = item.link;
            } else {
                openLb(item.src, item.title, item.video);
            }
        });
        grid.appendChild(el);
    });
}

// 2. The Layout Engine
function layoutMasonry() {
    const items = document.querySelectorAll('.masonry-item');
    if (!items.length || !grid) return;

    const containerWidth = grid.offsetWidth;
    const itemWidth = items[0].offsetWidth;
    const gap = itemWidth * 0.07;

    // --- NIEUWE LOGICA ---
    let numCols;
    const forcedCols = grid.getAttribute('data-columns');
    
    if (forcedCols) {
        numCols = parseInt(forcedCols); // Gebruik de "1" uit je HTML
    } else {
        // De standaard berekening voor je ART pagina
        numCols = Math.floor((containerWidth + gap) / (itemWidth + gap));
        if (numCols < 2) numCols = 2; 
    }
    // ---------------------

    const totalGridWidth = (numCols * itemWidth) + ((numCols - 1) * gap);
    const sidePadding = Math.max(0, (containerWidth - totalGridWidth) / 2);

    let colHeights = Array(numCols).fill(0);

    items.forEach(item => {
        let shortestCol = colHeights.indexOf(Math.min(...colHeights));
        const x = sidePadding + (shortestCol * (itemWidth + gap));
        const y = colHeights[shortestCol];

        item.style.transform = `translate(${x}px, ${y}px)`;
        colHeights[shortestCol] += item.offsetHeight + gap;
    });

    grid.style.height = (Math.max(...colHeights) - gap) + 'px';
}

// 3. Smooth Resizing
function handleResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(layoutMasonry, 100);
}

// 4. Lightbox Logic
window.openLb = function(src, title, videoSrc) {
    const lbImg = document.getElementById('lb-img');
    const lbCap = document.getElementById('lb-cap');
    const lbContainer = lbImg.parentElement;
    
    // Verwijder een eventuele oude video van een vorig klikje
    const oldVideo = document.getElementById('lb-video');
    if (oldVideo) oldVideo.remove();

    if (videoSrc) {
        // Er is een video: verberg de img-tag en maak een video-element
        lbImg.style.display = 'none'; 
        
        const video = document.createElement('video');
        video.id = 'lb-video';
        video.src = videoSrc;
        video.autoplay = true;
        video.controls = true;
        video.loop = true;
        video.style.maxWidth = '100%';
        video.style.maxHeight = '80vh';
        video.style.display = 'block';
        video.style.margin = '0 auto';
        
        // Plaats de video in de lightbox boven de tekst
        lbContainer.insertBefore(video, lbCap);
    } else {
        // Geen video: toon de img-tag en zet de bron goed
        lbImg.style.display = 'block';
        lbImg.src = src;
    }

    lbCap.textContent = title;
    document.getElementById('lightbox').classList.add('open');
    document.body.style.overflow = 'hidden';
};

window.closeLb = function(e) {
    if (e && e.target !== document.getElementById('lightbox') && 
        !e.target.classList.contains('lb-close')) return;
    document.getElementById('lightbox').classList.remove('open');
    document.body.style.overflow = '';
};

// 5. Execution
document.addEventListener('DOMContentLoaded', () => {
    initGallery();
    
    const allImages = document.querySelectorAll('.masonry-item img');
    allImages.forEach(img => {
        if (img.complete) {
            layoutMasonry();
        } else {
            img.addEventListener('load', layoutMasonry);
        }
    });

    // Lucide Icons initialization
    if (window.lucide) {
        lucide.createIcons();
    }
});

window.addEventListener('resize', handleResize);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLb({}); });
document.fonts.ready.then(layoutMasonry);