// --- ANALYTICS TRACKING ---
function trackAppEvent(eventName, eventData = {}) {
    if (window.umami && typeof window.umami.track === 'function') {
        window.umami.track(eventName, eventData);
    }
}

// --- APP STATE ---
let uploadedPhotos = []; // elements: { id: string, name: string, dataUrl: string, size: string, rotation: 0|90|180|270 }
let sortableInstance = null;
let uploadedOrganizerPages = []; // elements: { id: string, fileId: string, filename: string, pageIndex: number, rotation: 0|90|180|270 }
let organizerFilesMap = new Map(); // map of fileId -> ArrayBuffer
let organizerSortable = null;
let currentPdfToImgFile = null;
let ocrLoadedFile = null; // { type: 'image'|'pdf', name: string, dataUrl: string, arrayBuffer: ArrayBuffer }
let mergeQueue = []; // elements: { id: string, name: string, size: string, pages: number, arrayBuffer: ArrayBuffer }
let mergeSortable = null;

    // --- DOM REFERENCES ---
    const body = document.body;
    const themeToggleBtn = document.getElementById('theme-toggle');
    const themeToggleMobileBtn = document.getElementById('theme-toggle-mobile');
    const viewTitle = document.getElementById('view-title');
    const viewSubtitle = document.getElementById('view-subtitle');

    // Sidebar & View Navigation
    const navItems = document.querySelectorAll('.nav-item');
    const viewPanels = document.querySelectorAll('.view-panel');
    const cardPhotos = document.getElementById('card-photos');
    const cardNotes = document.getElementById('card-notes');
    const cardEdit = document.getElementById('card-edit');
    const cardCompress = document.getElementById('card-compress');
    const cardPhotoCompress = document.getElementById('card-photo-compress');
    const cardPhotoResize = document.getElementById('card-photo-resize');
    const cardOrganizer = document.getElementById('card-organizer');
    const cardMerge = document.getElementById('card-merge');
    const cardPdfToImg = document.getElementById('card-pdf-to-img');
    const cardOcr = document.getElementById('card-ocr');
    const cardMarkdown = document.getElementById('card-markdown');

    // Toast Container
    const toastContainer = document.getElementById('toast-container');

    // Loader Overlay
    const loadingOverlay = document.getElementById('loading-overlay');
    const loaderTitle = document.getElementById('loader-title');
    const loaderMessage = document.getElementById('loader-message');
    const progressBar = document.getElementById('progress-bar');

    // --- 1. THEME MANAGEMENT ---
    function initTheme() {
        const savedTheme = localStorage.getItem('nexeditor-theme') || 'dark-theme';
        body.className = savedTheme;
    }

    function toggleTheme() {
        if (body.classList.contains('dark-theme')) {
            body.classList.replace('dark-theme', 'light-theme');
            localStorage.setItem('nexeditor-theme', 'light-theme');
            showToast('Switched to Light Theme', 'info');
        } else {
            body.classList.replace('light-theme', 'dark-theme');
            localStorage.setItem('nexeditor-theme', 'dark-theme');
            showToast('Switched to Dark Theme', 'info');
        }
    }

    if (themeToggleBtn) themeToggleBtn.addEventListener('click', toggleTheme);
    if (themeToggleMobileBtn) themeToggleMobileBtn.addEventListener('click', toggleTheme);

    // --- 2. TOAST NOTIFICATIONS ---
    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        let iconName = 'info';
        if (type === 'success') iconName = 'check-circle';
        if (type === 'error') iconName = 'alert-triangle';

        toast.innerHTML = `
            <i data-lucide="${iconName}"></i>
            <span>${message}</span>
        `;
        
        toastContainer.appendChild(toast);
        lucide.createIcons({ attrs: { class: 'toast-icon' } });

        // Trigger transition
        setTimeout(() => toast.classList.add('show'), 10);

        // Remove toast
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // --- 3. LOADER OVERLAY CONTROLS ---
    function showLoader(title, message) {
        loaderTitle.textContent = title;
        loaderMessage.textContent = message;
        progressBar.style.width = '0%';
        loadingOverlay.classList.add('active');
    }

    function updateLoaderProgress(percent) {
        progressBar.style.width = `${percent}%`;
    }

    function hideLoader() {
        loadingOverlay.classList.remove('active');
    }

    // --- 4. VIEW ROUTING & NAVIGATION ---
    function switchView(targetViewId, updateHash = true) {
        // Find all navbar items representing the target view
        const activeNavs = Array.from(navItems).filter(item => item.getAttribute('data-target') === targetViewId);
        
        // Deactivate all nav items & panels
        navItems.forEach(item => item.classList.remove('active'));
        viewPanels.forEach(panel => panel.classList.remove('active'));

        // Activate matching elements
        activeNavs.forEach(nav => nav.classList.add('active'));
        const targetPanel = document.getElementById(targetViewId);
        if (targetPanel) targetPanel.classList.add('active');

        // Update header headers depending on target view
        if (targetViewId === 'dashboard-view') {
            viewTitle.textContent = 'Dashboard Overview';
            viewSubtitle.textContent = 'Welcome to NexEditor Lab. Convert your files securely.';
        } else if (targetViewId === 'photos-view') {
            viewTitle.textContent = 'Photos to PDF Workspace';
            viewSubtitle.textContent = 'Compile and arrange images into a single PDF.';
        } else if (targetViewId === 'notes-view') {
            viewTitle.textContent = 'Notes & Text Workspace';
            viewSubtitle.textContent = 'Create professional formatted documents.';
        } else if (targetViewId === 'edit-view') {
            viewTitle.textContent = 'Edit & Annotate PDF';
            viewSubtitle.textContent = 'Add annotations, signature drawings, or text to pages.';
        } else if (targetViewId === 'compress-view') {
            viewTitle.textContent = 'PDF Compressor Workspace';
            viewSubtitle.textContent = 'Reduce the size of your PDF documents locally.';
        } else if (targetViewId === 'photo-compress-view') {
            viewTitle.textContent = 'Photo Compressor Workspace';
            viewSubtitle.textContent = 'Compress PNG, JPEG, and WebP images locally.';
        } else if (targetViewId === 'photo-resize-view') {
            viewTitle.textContent = 'Photo Resizer Workspace';
            viewSubtitle.textContent = 'Resize dimensions or scale your images locally.';
        } else if (targetViewId === 'organizer-view') {
            viewTitle.textContent = 'PDF Page Organizer';
            viewSubtitle.textContent = 'Merge multiple PDFs, split documents, and reorder pages offline.';
        } else if (targetViewId === 'merge-view') {
            viewTitle.textContent = 'PDF Merger';
            viewSubtitle.textContent = 'Combine up to 20 PDF documents in any order locally.';
        } else if (targetViewId === 'pdf-to-image-view') {
            viewTitle.textContent = 'PDF to Image Converter';
            viewSubtitle.textContent = 'Convert PDF pages into high-resolution JPG/PNG/WebP images locally.';
        } else if (targetViewId === 'ocr-view') {
            viewTitle.textContent = 'Image Text Extractor (OCR)';
            viewSubtitle.textContent = 'Extract copyable text from photos or scanned documents offline.';
        } else if (targetViewId === 'markdown-view') {
            viewTitle.textContent = 'Markdown to PDF Editor';
            viewSubtitle.textContent = 'Write using Markdown syntax and render styled, print-ready PDFs.';
        }

        // Show/hide Back button in Desktop top bar
        const backBtn = document.getElementById('header-back-btn');
        if (backBtn) {
            if (targetViewId === 'dashboard-view') {
                backBtn.style.display = 'none';
            } else {
                backBtn.style.display = 'inline-flex';
            }
        }

        // Show/hide Back button in Mobile header
        const mobileBackBtn = document.getElementById('mobile-back-btn');
        if (mobileBackBtn) {
            if (targetViewId === 'dashboard-view') {
                mobileBackBtn.style.display = 'none';
            } else {
                mobileBackBtn.style.display = 'flex';
            }
        }

        // Sync history state / hash
        if (updateHash) {
            window.location.hash = targetViewId;
        }
    }

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const target = item.getAttribute('data-target');
            switchView(target);
        });
    });

    // Dashboard Card Shortcuts
    if (cardPhotos) cardPhotos.addEventListener('click', () => switchView('photos-view'));
    if (cardNotes) cardNotes.addEventListener('click', () => switchView('notes-view'));
    if (cardEdit) cardEdit.addEventListener('click', () => switchView('edit-view'));
    if (cardCompress) cardCompress.addEventListener('click', () => switchView('compress-view'));
    if (cardPhotoCompress) cardPhotoCompress.addEventListener('click', () => switchView('photo-compress-view'));
    if (cardPhotoResize) cardPhotoResize.addEventListener('click', () => switchView('photo-resize-view'));
    if (cardOrganizer) cardOrganizer.addEventListener('click', () => switchView('organizer-view'));
    if (cardMerge) cardMerge.addEventListener('click', () => switchView('merge-view'));
    if (cardPdfToImg) cardPdfToImg.addEventListener('click', () => switchView('pdf-to-image-view'));
    if (cardOcr) cardOcr.addEventListener('click', () => switchView('ocr-view'));
    if (cardMarkdown) cardMarkdown.addEventListener('click', () => switchView('markdown-view'));

    // Back Button Click Listeners
    const headerBackBtn = document.getElementById('header-back-btn');
    if (headerBackBtn) {
        headerBackBtn.addEventListener('click', () => {
            switchView('dashboard-view');
        });
    }

    const mobileBackBtn = document.getElementById('mobile-back-btn');
    if (mobileBackBtn) {
        mobileBackBtn.addEventListener('click', () => {
            switchView('dashboard-view');
        });
    }

    // Hash Navigation Listener
    window.addEventListener('hashchange', () => {
        const hash = window.location.hash.replace('#', '');
        if (hash) {
            switchView(hash, false);
        } else {
            switchView('dashboard-view', false);
        }
    });


    // --- 5. PHOTOS TO PDF WORKSPACE LOGIC ---
    const photoDropZone = document.getElementById('photo-drop-zone');
    const photoInput = document.getElementById('photo-input');
    const uploadTriggerBtn = document.querySelector('.btn-upload-trigger');
    const sortableGrid = document.getElementById('sortable-images-grid');
    const managerHeader = document.getElementById('manager-header');
    const photoCountLabel = document.getElementById('photo-count-label');
    const btnClearPhotos = document.getElementById('btn-clear-photos');
    const btnGeneratePhotoPdf = document.getElementById('btn-generate-photo-pdf');
    const photoQualityInput = document.getElementById('photo-quality');
    const qualityValueLabel = document.getElementById('quality-value');

    // Trigger File Input Click
    uploadTriggerBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Avoid double triggers
        photoInput.click();
    });

    photoDropZone.addEventListener('click', () => {
        photoInput.click();
    });

    // Quality slider indicator update
    photoQualityInput.addEventListener('input', (e) => {
        qualityValueLabel.textContent = `${e.target.value}%`;
    });

    // Drag-and-drop triggers
    ['dragenter', 'dragover'].forEach(eventName => {
        photoDropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            photoDropZone.classList.add('dragover');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        photoDropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            photoDropZone.classList.remove('dragover');
        }, false);
    });

    photoDropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        handlePhotoFiles(files);
    });

    photoInput.addEventListener('change', (e) => {
        handlePhotoFiles(e.target.files);
    });

    // Process uploaded file list
    function handlePhotoFiles(files) {
        if (!files.length) return;

        const loadPromises = [];

        Array.from(files).forEach(file => {
            // Validate file type
            if (!file.type.match('image/jpeg') && !file.type.match('image/png') && !file.type.match('image/webp')) {
                showToast(`Skipped "${file.name}": Unsupported format.`, 'error');
                return;
            }
            
            // Validate size (10MB limit)
            if (file.size > 10 * 1024 * 1024) {
                showToast(`Skipped "${file.name}": File size exceeds 10MB.`, 'error');
                return;
            }

            const promise = new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    // Generate unique ID
                    const photoId = 'photo_' + Math.random().toString(36).substr(2, 9);
                    // Format file size
                    const fileSizeFormatted = (file.size / 1024).toFixed(0) + ' KB';
                    
                    uploadedPhotos.push({
                        id: photoId,
                        name: file.name,
                        dataUrl: e.target.result,
                        size: fileSizeFormatted,
                        rotation: 0
                    });
                    resolve();
                };
                reader.readAsDataURL(file);
            });
            loadPromises.push(promise);
        });

        if (loadPromises.length > 0) {
            showLoader('Uploading Images', 'Reading files. Please wait...');
            Promise.all(loadPromises).then(() => {
                hideLoader();
                renderPhotosGrid();
                showToast(`Successfully added ${loadPromises.length} photo(s).`, 'success');
            });
        }
    }

    // Render Grid Elements and Initialize SortableJS
    function renderPhotosGrid() {
        sortableGrid.innerHTML = '';

        if (uploadedPhotos.length === 0) {
            managerHeader.style.display = 'none';
            btnGeneratePhotoPdf.disabled = true;
            return;
        }

        managerHeader.style.display = 'flex';
        photoCountLabel.textContent = `${uploadedPhotos.length} ${uploadedPhotos.length === 1 ? 'Image' : 'Images'}`;
        btnGeneratePhotoPdf.disabled = false;

        uploadedPhotos.forEach((photo, index) => {
            const card = document.createElement('div');
            card.className = 'photo-card';
            card.setAttribute('data-id', photo.id);
            
            // Rotate styling based on angle state
            let rotClass = 'rotate-0';
            if (photo.rotation === 90) rotClass = 'rotate-90';
            else if (photo.rotation === 180) rotClass = 'rotate-180';
            else if (photo.rotation === 270) rotClass = 'rotate-270';

            card.innerHTML = `
                <div class="photo-card-actions">
                    <button class="photo-action-btn btn-rotate" title="Rotate 90° Clockwise">
                        <i data-lucide="rotate-cw"></i>
                    </button>
                    <button class="photo-action-btn btn-delete" title="Delete Image">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
                <div class="drag-handle" title="Drag to reorder">
                    <i data-lucide="grip-vertical"></i>
                </div>
                <div class="photo-card-img-wrapper">
                    <img src="${photo.dataUrl}" class="photo-card-img ${rotClass}" alt="${photo.name}" draging="false">
                </div>
                <div class="photo-card-footer">
                    <span class="photo-name" title="${photo.name}">${photo.name}</span>
                    <span class="photo-index">${index + 1}</span>
                </div>
            `;
            
            // Event Listeners on Card elements
            const btnRotate = card.querySelector('.btn-rotate');
            btnRotate.addEventListener('click', (e) => {
                e.stopPropagation();
                rotatePhoto(photo.id);
            });

            const btnDelete = card.querySelector('.btn-delete');
            btnDelete.addEventListener('click', (e) => {
                e.stopPropagation();
                deletePhoto(photo.id);
            });

            sortableGrid.appendChild(card);
        });

        lucide.createIcons();

        // Setup SortableJS for drag-and-drop reordering
        if (sortableInstance) {
            sortableInstance.destroy();
        }
        
        sortableInstance = new Sortable(sortableGrid, {
            animation: 150,
            handle: '.drag-handle',
            ghostClass: 'sortable-ghost',
            onEnd: () => {
                // Sync JS array ordering with DOM order
                const cardElements = sortableGrid.querySelectorAll('.photo-card');
                const reorderedArray = [];
                
                cardElements.forEach(card => {
                    const id = card.getAttribute('data-id');
                    const photo = uploadedPhotos.find(p => p.id === id);
                    if (photo) {
                        reorderedArray.push(photo);
                    }
                });
                
                uploadedPhotos = reorderedArray;
                
                // Re-render indices on cards
                updateCardIndexLabels();
            }
        });
    }

    // Refresh Card Indices numbers in place
    function updateCardIndexLabels() {
        const indices = sortableGrid.querySelectorAll('.photo-index');
        indices.forEach((badge, index) => {
            badge.textContent = index + 1;
        });
    }

    // Delete photo
    function deletePhoto(id) {
        uploadedPhotos = uploadedPhotos.filter(p => p.id !== id);
        renderPhotosGrid();
        showToast('Image deleted.', 'info');
    }

    // Rotate photo state
    function rotatePhoto(id) {
        const photo = uploadedPhotos.find(p => p.id === id);
        if (photo) {
            photo.rotation = (photo.rotation + 90) % 360;
            // Update only the target card image class to prevent full re-render flickering
            const card = sortableGrid.querySelector(`.photo-card[data-id="${id}"]`);
            if (card) {
                const img = card.querySelector('.photo-card-img');
                img.className = 'photo-card-img'; // clear
                if (photo.rotation === 90) img.classList.add('rotate-90');
                else if (photo.rotation === 180) img.classList.add('rotate-180');
                else if (photo.rotation === 270) img.classList.add('rotate-270');
            }
        }
    }

    // Clear all photos
    btnClearPhotos.addEventListener('click', () => {
        uploadedPhotos = [];
        renderPhotosGrid();
        showToast('All photos cleared.', 'info');
    });

    // Helper: offscreen canvas rendering rotation engine
    function getRotatedImage(photo, quality) {
        return new Promise((resolve) => {
            if (photo.rotation === 0) {
                resolve(photo.dataUrl);
                return;
            }
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const angle = photo.rotation;
                
                // Swap sizes if orthogonal orientation swap
                if (angle === 90 || angle === 270) {
                    canvas.width = img.naturalHeight;
                    canvas.height = img.naturalWidth;
                } else {
                    canvas.width = img.naturalWidth;
                    canvas.height = img.naturalHeight;
                }
                
                ctx.translate(canvas.width / 2, canvas.height / 2);
                ctx.rotate((angle * Math.PI) / 180);
                ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
                
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.src = photo.dataUrl;
        });
    }

    // PDF PHOTO RENDERER IMPLEMENTATION
    btnGeneratePhotoPdf.addEventListener('click', async () => {
        if (uploadedPhotos.length === 0) return;

        const photoFilenameInput = document.getElementById('photo-filename');
        let filename = photoFilenameInput ? photoFilenameInput.value.trim() : 'photos_document.pdf';
        if (!filename) filename = 'photos_document.pdf';
        if (!filename.toLowerCase().endsWith('.pdf')) filename += '.pdf';

        const pageSizeOption = document.getElementById('photo-page-size').value;
        const marginOption = document.getElementById('photo-margin').value;
        const fitOption = document.getElementById('photo-fit-mode').value;
        const qualitySlider = parseInt(photoQualityInput.value) / 100;
        
        const orientationOption = document.querySelector('input[name="photo-orientation"]:checked').value;

        showLoader('Generating Photo PDF', 'Initializing compilation engine...');
        
        // Define margin in mm
        let margin = 0;
        if (marginOption === 'small') margin = 10;
        else if (marginOption === 'medium') margin = 20;
        else if (marginOption === 'large') margin = 30;

        const { jsPDF } = window.jspdf;
        let doc = null;

        try {
            for (let i = 0; i < uploadedPhotos.length; i++) {
                updateLoaderProgress(Math.round((i / uploadedPhotos.length) * 100));
                loaderMessage.textContent = `Processing image ${i + 1} of ${uploadedPhotos.length}...`;
                
                // Yield thread to update UI loader progress
                await new Promise(r => setTimeout(r, 50));

                const photo = uploadedPhotos[i];
                // Rotate using helper
                const imgDataUrl = await getRotatedImage(photo, qualitySlider);

                // Read natural image dimensions
                const naturalDimensions = await new Promise((resolve) => {
                    const tempImg = new Image();
                    tempImg.onload = () => {
                        resolve({ w: tempImg.naturalWidth, h: tempImg.naturalHeight });
                    };
                    tempImg.src = imgDataUrl;
                });

                const imgWidthPx = naturalDimensions.w;
                const imgHeightPx = naturalDimensions.h;
                const imgAspect = imgWidthPx / imgHeightPx;

                // 1. Calculate Page format & page dimensions
                let pageWidth, pageHeight, isLandscape;
                
                if (pageSizeOption === 'fit') {
                    // Convert pixels to mm roughly at 96 DPI
                    pageWidth = imgWidthPx * 0.264583 + margin * 2;
                    pageHeight = imgHeightPx * 0.264583 + margin * 2;
                    isLandscape = pageWidth > pageHeight;
                } else {
                    // Standard formats
                    // A4 standard: 210 x 297 mm
                    // Letter standard: 215.9 x 279.4 mm
                    const formatWidth = (pageSizeOption === 'a4') ? 210 : 215.9;
                    const formatHeight = (pageSizeOption === 'a4') ? 297 : 279.4;

                    isLandscape = (orientationOption === 'landscape');
                    pageWidth = isLandscape ? formatHeight : formatWidth;
                    pageHeight = isLandscape ? formatWidth : formatHeight;
                }

                // 2. Initialize PDF instance on first page, or add page afterwards
                const pageFormatArray = pageSizeOption === 'fit' ? [pageWidth, pageHeight] : pageSizeOption;
                const orientationChar = isLandscape ? 'l' : 'p';

                if (!doc) {
                    doc = new jsPDF({
                        orientation: orientationChar,
                        unit: 'mm',
                        format: pageFormatArray
                    });
                } else {
                    doc.addPage(pageFormatArray, orientationChar);
                }

                // 3. Draw image inside printable boundaries
                const printableWidth = pageWidth - margin * 2;
                const printableHeight = pageHeight - margin * 2;
                
                let drawW, drawH, drawX, drawY;

                if (pageSizeOption === 'fit') {
                    drawW = printableWidth;
                    drawH = printableHeight;
                    drawX = margin;
                    drawY = margin;
                } else {
                    if (fitOption === 'contain') {
                        // Fit inside constraints
                        const scale = Math.min(printableWidth / imgWidthPx, printableHeight / imgHeightPx);
                        drawW = imgWidthPx * scale;
                        drawH = imgHeightPx * scale;
                        drawX = margin + (printableWidth - drawW) / 2;
                        drawY = margin + (printableHeight - drawH) / 2;
                    } else {
                        // Fill / Stretch
                        drawW = printableWidth;
                        drawH = printableHeight;
                        drawX = margin;
                        drawY = margin;
                    }
                }

                // Determine compression type
                const compressionFormat = photo.name.match(/\.(png|webp)$/i) ? 'PNG' : 'JPEG';
                
                doc.addImage(
                    imgDataUrl, 
                    compressionFormat, 
                    drawX, 
                    drawY, 
                    drawW, 
                    drawH, 
                    undefined, 
                    'FAST'
                );
            }

            // Complete progress bar
            updateLoaderProgress(100);
            loaderMessage.textContent = 'Saving PDF document...';
            await new Promise(r => setTimeout(r, 200));

            if (doc) {
                doc.save(filename);
                showToast('PDF downloaded successfully!', 'success');
                trackAppEvent('generate_photos_pdf', { photo_count: uploadedPhotos.length });
            } else {
                showToast('Failed to generate PDF. Empty document.', 'error');
            }
        } catch (error) {
            console.error(error);
            showToast('An error occurred during PDF compilation.', 'error');
        } finally {
            hideLoader();
        }
    });

    // Toggle orientation layout panels depending on Fit layout select
    const pageSizeSelect = document.getElementById('photo-page-size');
    const groupOrientation = document.getElementById('group-photo-orientation');
    const groupFit = document.getElementById('group-photo-fit');

    pageSizeSelect.addEventListener('change', (e) => {
        if (e.target.value === 'fit') {
            groupOrientation.style.display = 'none';
            groupFit.style.display = 'none';
        } else {
            groupOrientation.style.display = 'flex';
            groupFit.style.display = 'flex';
        }
    });


    // --- 6. NOTES TO PDF WORKSPACE LOGIC ---
    const notesEditor = document.getElementById('notes-editor');
    const notesPageContainer = document.getElementById('notes-page-container');
    const editorHeaderSelect = document.getElementById('editor-header-select');
    const btnTextColor = document.getElementById('btn-text-color');
    const editorColorPicker = document.getElementById('editor-color-picker');
    const btnInsertTable = document.getElementById('btn-insert-table');
    const btnInsertDate = document.getElementById('btn-insert-date');
    const btnClearEditor = document.getElementById('btn-clear-editor');
    
    // Config panel items
    const templateItems = document.querySelectorAll('.template-item');
    const fontSelect = document.getElementById('notes-font');
    const marginSelect = document.getElementById('notes-margin');
    const formatSelect = document.getElementById('notes-page-format');
    const checkHeader = document.getElementById('notes-enable-header');
    const headerTextContainer = document.getElementById('header-text-container');
    const checkFooter = document.getElementById('notes-enable-footer');
    const btnGenerateNotesPdf = document.getElementById('btn-generate-notes-pdf');

    // WYSIWYG standard triggers
    const toolBtnEditors = document.querySelectorAll('.tool-btn-editor[data-cmd]');
    toolBtnEditors.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const cmd = btn.getAttribute('data-cmd');
            document.execCommand(cmd, false, null);
            notesEditor.focus();
        });
    });

    // Formatting selects (Paragraph and Header blocks)
    editorHeaderSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        document.execCommand('formatBlock', false, val);
        notesEditor.focus();
    });

    // Text color picker trigger
    btnTextColor.addEventListener('click', () => {
        editorColorPicker.click();
    });

    editorColorPicker.addEventListener('input', (e) => {
        document.execCommand('foreColor', false, e.target.value);
    });

    // Inset Table utility
    btnInsertTable.addEventListener('click', () => {
        const tableHTML = `
            <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
                <thead>
                    <tr style="background-color: #f1f5f9;">
                        <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: left; font-weight: 600;">Header 1</th>
                        <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: left; font-weight: 600;">Header 2</th>
                        <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: left; font-weight: 600;">Header 3</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td style="border: 1px solid #cbd5e1; padding: 8px;">Content</td>
                        <td style="border: 1px solid #cbd5e1; padding: 8px;">Content</td>
                        <td style="border: 1px solid #cbd5e1; padding: 8px;">Content</td>
                    </tr>
                    <tr>
                        <td style="border: 1px solid #cbd5e1; padding: 8px;">Content</td>
                        <td style="border: 1px solid #cbd5e1; padding: 8px;">Content</td>
                        <td style="border: 1px solid #cbd5e1; padding: 8px;">Content</td>
                    </tr>
                </tbody>
            </table>
        `;
        document.execCommand('insertHTML', false, tableHTML);
        notesEditor.focus();
    });

    // Helper to get currently selected TD/TH table cell
    function getCurrentTableCell() {
        const selection = window.getSelection();
        if (!selection.rangeCount) return null;
        let node = selection.getRangeAt(0).startContainer;
        while (node && node !== notesEditor) {
            if (node.nodeType === Node.ELEMENT_NODE && (node.tagName === 'TD' || node.tagName === 'TH')) {
                return node;
            }
            node = node.parentNode;
        }
        return null;
    }

    // Toggle Table actions toolbar group when selection changes
    const tableControlsGroup = document.getElementById('table-controls-group');
    document.addEventListener('selectionchange', () => {
        const activeCell = getCurrentTableCell();
        if (tableControlsGroup) {
            if (activeCell) {
                tableControlsGroup.style.display = 'flex';
            } else {
                tableControlsGroup.style.display = 'none';
            }
        }
    });

    // Row / Column Operations
    const btnTableRowAdd = document.getElementById('btn-table-row-add');
    const btnTableRowDelete = document.getElementById('btn-table-row-delete');
    const btnTableColAdd = document.getElementById('btn-table-col-add');
    const btnTableColDelete = document.getElementById('btn-table-col-delete');

    // Add Row Below
    btnTableRowAdd.addEventListener('click', (e) => {
        e.preventDefault();
        const activeCell = getCurrentTableCell();
        if (!activeCell) return;
        const currentTr = activeCell.closest('tr');
        const parentTable = currentTr.closest('table');
        if (!currentTr || !parentTable) return;

        // Count cells in current row to know how many cells to create
        const cellsCount = currentTr.cells.length;
        const newTr = document.createElement('tr');
        
        for (let i = 0; i < cellsCount; i++) {
            const newTd = document.createElement('td');
            newTd.style.border = '1px solid #cbd5e1';
            newTd.style.padding = '8px';
            newTd.innerHTML = 'Content';
            newTr.appendChild(newTd);
        }

        // Insert new row below the current row
        currentTr.parentNode.insertBefore(newTr, currentTr.nextSibling);
        notesEditor.focus();
        showToast('Added table row.', 'success');
    });

    // Delete current row
    btnTableRowDelete.addEventListener('click', (e) => {
        e.preventDefault();
        const activeCell = getCurrentTableCell();
        if (!activeCell) return;
        const currentTr = activeCell.closest('tr');
        const parentTable = currentTr.closest('table');
        if (!currentTr || !parentTable) return;

        // If it's the last row, remove table entirely
        const allRows = parentTable.querySelectorAll('tr');
        if (allRows.length <= 1) {
            parentTable.remove();
            showToast('Deleted table.', 'info');
        } else {
            currentTr.remove();
            showToast('Deleted table row.', 'info');
        }
        notesEditor.focus();
    });

    // Add Column Right
    btnTableColAdd.addEventListener('click', (e) => {
        e.preventDefault();
        const activeCell = getCurrentTableCell();
        if (!activeCell) return;
        const currentTr = activeCell.closest('tr');
        const parentTable = currentTr.closest('table');
        if (!currentTr || !parentTable) return;

        const cellIndex = activeCell.cellIndex;
        const allRows = parentTable.querySelectorAll('tr');

        allRows.forEach(row => {
            const cells = Array.from(row.cells);
            const targetCell = cells[cellIndex];
            if (!targetCell) return;

            // Check if row is inside THEAD for header styling
            const isHeader = targetCell.tagName === 'TH';
            const newCell = document.createElement(isHeader ? 'th' : 'td');
            
            // Apply standard table border/padding styles inline
            newCell.style.border = '1px solid #cbd5e1';
            newCell.style.padding = '8px';
            if (isHeader) {
                newCell.style.fontWeight = '600';
                newCell.style.backgroundColor = '#f1f5f9';
                newCell.innerHTML = 'Header';
            } else {
                newCell.innerHTML = 'Content';
            }

            row.insertBefore(newCell, targetCell.nextSibling);
        });

        notesEditor.focus();
        showToast('Added table column.', 'success');
    });

    // Delete Column
    btnTableColDelete.addEventListener('click', (e) => {
        e.preventDefault();
        const activeCell = getCurrentTableCell();
        if (!activeCell) return;
        const currentTr = activeCell.closest('tr');
        const parentTable = currentTr.closest('table');
        if (!currentTr || !parentTable) return;

        const cellIndex = activeCell.cellIndex;
        const allRows = parentTable.querySelectorAll('tr');

        // Check if removing this column leaves row empty
        if (currentTr.cells.length <= 1) {
            parentTable.remove();
            showToast('Deleted table.', 'info');
        } else {
            allRows.forEach(row => {
                if (row.cells[cellIndex]) {
                    row.cells[cellIndex].remove();
                }
            });
            showToast('Deleted table column.', 'info');
        }
        notesEditor.focus();
    });

    // Insert date stamp
    btnInsertDate.addEventListener('click', () => {
        const localeDate = new Date().toLocaleDateString(undefined, {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
        document.execCommand('insertText', false, localeDate + ' ');
        notesEditor.focus();
    });

    // Clear all contents
    btnClearEditor.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear your current editor notes?')) {
            notesEditor.innerHTML = '<p><br></p>';
            showToast('Editor workspace cleared.', 'info');
        }
    });

    // Config: Font selector changed
    fontSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        // remove font classes
        notesPageContainer.classList.remove('font-inter', 'font-playfair', 'font-outfit', 'font-mono');
        notesPageContainer.classList.add(val);
    });

    // Config: Margin selector changed
    marginSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        notesPageContainer.classList.remove('margin-small', 'margin-med', 'margin-large');
        notesPageContainer.classList.add(val);
    });

    // Config: Toggle header field
    checkHeader.addEventListener('change', (e) => {
        if (e.target.checked) {
            headerTextContainer.style.display = 'block';
        } else {
            headerTextContainer.style.display = 'none';
        }
    });


    // --- 7. DOCUMENT NOTE TEMPLATES ---
    const templates = {
        blank: `
            <h1>Untitled Document</h1>
            <p>Start writing your creative ideas or notes here...</p>
        `,
        meeting: `
            <h1>Meeting Minutes</h1>
            <p><strong>Date:</strong> ${new Date().toLocaleDateString()} | <strong>Time:</strong> 10:00 AM PST</p>
            <p><strong>Attendees:</strong> Participant A, Participant B, Participant C</p>
            <hr>
            <h2>1. Agenda Topics</h2>
            <ul>
                <li>Strategic product roadmap updates</li>
                <li>Budget allocations for next quarter</li>
                <li>Design review feedback alignment</li>
            </ul>
            <h2>2. Key Discussions</h2>
            <p>The team discussed prioritizing structural code improvements alongside the features. We determined that setting up local compilation saves client bandwidth and protects privacy.</p>
            <h2>3. Action Items</h2>
            <table>
                <thead>
                    <tr>
                        <th>Action Item Task Description</th>
                        <th>Owner</th>
                        <th>Target Date</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>Establish client framework boilerplate</td>
                        <td>Team Lead</td>
                        <td>June 28</td>
                    </tr>
                    <tr>
                        <td>Draft CSS style tokens guidelines</td>
                        <td>Lead Designer</td>
                        <td>June 30</td>
                    </tr>
                </tbody>
            </table>
        `,
        letter: `
            <p style="text-align: right;"><strong>NexEditor Lab Solutions</strong><br>100 Innovation Parkway<br>Silicon Valley, CA</p>
            <p><strong>Date:</strong> ${new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</p>
            <p><strong>Recipient Address:</strong><br>Pangea IT Solutions<br>Suite 500, Market Street<br>San Francisco, CA</p>
            <hr>
            <p>Dear Partner,</p>
            <p>I am writing to express our formal appreciation for our partnership on your recent initiatives. Our design teams have successfully implemented the visual workspace guidelines, resulting in clean layouts and improved user conversion rates.</p>
            <p>We are ready to initiate the next phase of deployment. Let us plan a synchronization conference next Tuesday to discuss specifications.</p>
            <p>Sincerely,</p>
            <br>
            <p><strong>Jane Doe</strong><br>Executive Director, NexEditor Lab</p>
        `,
        notes: `
            <h1>Topic: Creative Design Principles</h1>
            <p><strong>Subject:</strong> Product Usability | <strong>Author:</strong> Design Team</p>
            <hr>
            <h2>1. Superb Aesthetics Matter</h2>
            <p>Aesthetic interfaces feel easier to use, command higher perceived value, and keep users engaged. Applying curated color palettes and responsive feedback separates high-end products from standard templates.</p>
            <h2>2. Essential Guidelines</h2>
            <ul>
                <li><strong>Glow & Accents:</strong> Use radial gradients and blur elements to build subtle lighting layers.</li>
                <li><strong>Clear Typographic Hierarchy:</strong> Larger, high-contrast headings combined with smaller, muted paragraph margins.</li>
                <li><strong>Micro-animations:</strong> Smooth feedback during clicks and transitions guides attention naturally.</li>
            </ul>
            <h2>3. References & Books</h2>
            <p>For further reading, check the typography guides and UX design case studies in our internal library.</p>
        `
    };

    templateItems.forEach(item => {
        item.addEventListener('click', () => {
            const templateKey = item.getAttribute('data-template');
            if (templates[templateKey]) {
                if (confirm('Loading a template will replace all current contents in the editor. Proceed?')) {
                    // Update Active Template Item UI state
                    templateItems.forEach(t => t.classList.remove('active'));
                    item.classList.add('active');

                    // Load
                    notesEditor.innerHTML = templates[templateKey].trim();
                    showToast(`Loaded ${item.querySelector('h4').textContent} template.`, 'success');
                }
            }
        });
    });


    // --- 8. NOTES PDF GENERATOR (html2pdf.js integration) ---
    btnGenerateNotesPdf.addEventListener('click', () => {
        showLoader('Generating Notes PDF', 'Rendering document pages...');
        
        const notesFilenameInput = document.getElementById('notes-filename');
        let filename = notesFilenameInput ? notesFilenameInput.value.trim() : 'notes_document.pdf';
        if (!filename) filename = 'notes_document.pdf';
        if (!filename.toLowerCase().endsWith('.pdf')) filename += '.pdf';

        // Settings configuration
        const fontOption = fontSelect.value;
        const marginOption = marginSelect.value;
        const pageFormatOption = formatSelect.value;

        // Convert Margin option classes to mm values for html2pdf
        let marginValue = 25; // default
        if (marginOption === 'margin-small') marginValue = 15;
        else if (marginOption === 'margin-large') marginValue = 35;

        // Build printable element wrapper
        const printContainer = document.createElement('div');
        printContainer.className = `page-container-mock ${fontOption} ${marginOption}`;
        
        // Inline styles to match the WYSIWYG styles when exporting
        printContainer.style.backgroundColor = '#ffffff';
        printContainer.style.color = '#1e293b';
        printContainer.style.padding = '0px'; // html2pdf handles margin in its main page, let's keep this clean
        printContainer.style.width = '100%';
        printContainer.style.boxShadow = 'none';

        // 1. Header Insertion
        let headerHTML = '';
        if (checkHeader.checked) {
            const hText = document.getElementById('notes-header-text').value || 'Document';
            headerHTML = `
                <div style="font-size: 8pt; color: #64748b; font-family: system-ui, -apple-system, sans-serif; border-bottom: 1.5px solid #cbd5e1; padding-bottom: 6px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; width:100%;">
                    <span style="font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">${hText}</span>
                    <span>${new Date().toLocaleDateString()}</span>
                </div>
            `;
        }

        // Add standard styling rule injection inside printed HTML to ensure typography renders perfectly
        const printStyleText = `
            <style>
                h1 { font-size: 2.2rem; font-weight: 700; color: #0f172a; margin-bottom: 20px; line-height: 1.25; margin-top:0px; }
                h2 { font-size: 1.45rem; font-weight: 600; color: #1e293b; margin-top: 24px; margin-bottom: 12px; line-height: 1.3; }
                h3 { font-size: 1.15rem; font-weight: 600; color: #334155; margin-top: 18px; margin-bottom: 8px; }
                p { margin-bottom: 14px; font-size: 10.5pt; line-height: 1.6; color: #334155; }
                ul, ol { margin-left: 20px; margin-bottom: 14px; color: #334155; font-size: 10.5pt; }
                li { margin-bottom: 4px; }
                table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 9.5pt; }
                table td, table th { border: 1px solid #cbd5e1; padding: 6px 10px; }
                table th { background-color: #f8fafc; font-weight: 600; color: #0f172a; }
                hr { border: none; border-top: 1.5px solid #e2e8f0; margin: 20px 0; }
                .font-inter { font-family: 'Inter', system-ui, sans-serif; }
                .font-playfair { font-family: 'Playfair Display', Georgia, serif; }
                .font-outfit { font-family: 'Outfit', sans-serif; }
                .font-mono { font-family: 'Fira Code', monospace; }
            </style>
        `;

        // Assemble HTML inside page
        printContainer.innerHTML = printStyleText + headerHTML + notesEditor.innerHTML;

        // html2pdf Options configurations
        const opt = {
            margin: marginValue,
            filename: filename,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { 
                scale: 2, 
                useCORS: true, 
                letterRendering: true,
                backgroundColor: '#ffffff'
            },
            jsPDF: { 
                unit: 'mm', 
                format: pageFormatOption, 
                orientation: 'portrait' 
            },
            pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
        };

        // Render PDF flow
        html2pdf()
            .set(opt)
            .from(printContainer)
            .toPdf()
            .get('pdf')
            .then((pdf) => {
                // Apply page numbers footer if active
                if (checkFooter.checked) {
                    const totalPages = pdf.internal.getNumberOfPages();
                    const pageW = pdf.internal.pageSize.getWidth();
                    const pageH = pdf.internal.pageSize.getHeight();
                    
                    for (let i = 1; i <= totalPages; i++) {
                        pdf.setPage(i);
                        pdf.setFontSize(8);
                        pdf.setTextColor(100, 116, 139); // Muted grey color
                        pdf.setFont('helvetica', 'normal');
                        
                        const footerString = `Page ${i} of ${totalPages}`;
                        pdf.text(footerString, pageW / 2, pageH - 12, { align: 'center' });
                    }
                }
            })
            .save()
            .then(() => {
                hideLoader();
                showToast('Document exported successfully!', 'success');
                const fontSelect = document.getElementById('notes-font');
                const selectedFont = fontSelect ? fontSelect.value : 'unknown';
                trackAppEvent('generate_notes_pdf', { font: selectedFont });
            })
            .catch(err => {
                console.error(err);
                hideLoader();
                showToast('Failed to export document.', 'error');
            });
    });

    // --- 9. PDF EDITOR WORKSPACE LOGIC ---
    const pdfEditDropZone = document.getElementById('pdf-edit-drop-zone');
    const pdfEditInput = document.getElementById('pdf-edit-input');
    const pdfUploadTriggerBtn = document.querySelector('.btn-pdf-upload-trigger');
    const pdfEditorContainer = document.getElementById('pdf-editor-container');

    // Controls
    const editToolModeRadios = document.querySelectorAll('input[name="edit-tool-mode"]');
    const editToolColorSelect = document.getElementById('edit-tool-color');
    const editBrushSizeInput = document.getElementById('edit-brush-size');
    const brushSizeValLabel = document.getElementById('brush-size-val');
    const editTextSizeInput = document.getElementById('edit-text-size');
    const textSizeValLabel = document.getElementById('text-size-val');
    const btnClearPdfEdits = document.getElementById('btn-clear-pdf-edits');
    const btnGenerateEditedPdf = document.getElementById('btn-generate-edited-pdf');
    const editTextFontSelect = document.getElementById('edit-text-font');

    const groupBrushSize = document.getElementById('group-brush-size');
    const groupTextSize = document.getElementById('group-text-size');
    const groupTextFont = document.getElementById('group-text-font');

    // State Variables
    let editPdfDoc = null;
    let editPdfCanvasObjects = []; // elements: { pageIndex, canvas, ctx, originalImageData }
    let editorCurrentMode = 'pan'; // 'pan', 'draw', 'text'
    let editorActiveColor = '#1C1A17';
    let editorBrushSize = 4;
    let editorFontSize = 18;
    let selectedTextSpan = null;

    // Trigger File Input Click
    if (pdfUploadTriggerBtn) {
        pdfUploadTriggerBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            pdfEditInput.click();
        });
    }

    if (pdfEditDropZone) {
        pdfEditDropZone.addEventListener('click', () => {
            pdfEditInput.click();
        });

        // Drag-and-drop triggers
        ['dragenter', 'dragover'].forEach(eventName => {
            pdfEditDropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                pdfEditDropZone.classList.add('dragover');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            pdfEditDropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                pdfEditDropZone.classList.remove('dragover');
            }, false);
        });

        pdfEditDropZone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            if (files.length) handlePDFFile(files[0]);
        });
    }

    if (pdfEditInput) {
        pdfEditInput.addEventListener('change', (e) => {
            if (e.target.files.length) handlePDFFile(e.target.files[0]);
        });
    }

    // Helper to sample background and text colors from the canvas around a bounding box
    function sampleCanvasColors(ctx, vx, vy, fontHeight, itemWidth) {
        let bgColor = '#ffffff';
        let textColor = '#1C1A17'; // default charcoal
        
        try {
            const canvas = ctx.canvas;
            const w = canvas.width;
            const h = canvas.height;
            
            const toHex = (r, g, b) => {
                return '#' + [r, g, b].map(x => {
                    const hex = x.toString(16);
                    return hex.length === 1 ? '0' + hex : hex;
                }).join('');
            };
            
            const getPixel = (x, y) => {
                x = Math.max(0, Math.min(w - 1, Math.floor(x)));
                y = Math.max(0, Math.min(h - 1, Math.floor(y)));
                const d = ctx.getImageData(x, y, 1, 1).data;
                return { r: d[0], g: d[1], b: d[2], a: d[3] };
            };
            
            // Sample background at corners/sides
            const bgSamples = [
                getPixel(vx - 4, vy - fontHeight / 2),
                getPixel(vx + itemWidth + 4, vy - fontHeight / 2),
                getPixel(vx + itemWidth / 2, vy - fontHeight - 4),
                getPixel(vx + itemWidth / 2, vy + 4)
            ];
            
            const validBg = bgSamples.filter(s => s.a > 100);
            let bgR = 255, bgG = 255, bgB = 255;
            if (validBg.length > 0) {
                bgR = Math.round(validBg.reduce((sum, s) => sum + s.r, 0) / validBg.length);
                bgG = Math.round(validBg.reduce((sum, s) => sum + s.g, 0) / validBg.length);
                bgB = Math.round(validBg.reduce((sum, s) => sum + s.b, 0) / validBg.length);
            }
            bgColor = toHex(bgR, bgG, bgB);
            
            // Sample text color inside the box (find pixel with highest contrast to bg)
            const xStart = Math.max(0, Math.floor(vx));
            const yStart = Math.max(0, Math.floor(vy - fontHeight));
            const boxW = Math.min(w - xStart, Math.ceil(itemWidth));
            const boxH = Math.min(h - yStart, Math.ceil(fontHeight));
            
            if (boxW > 0 && boxH > 0) {
                const imgData = ctx.getImageData(xStart, yStart, boxW, boxH);
                const data = imgData.data;
                let maxDist = -1;
                let textR = 28, textG = 26, textB = 23;
                
                const step = data.length > 2000 ? 8 : 4;
                for (let i = 0; i < data.length; i += step * 4) {
                    const r = data[i];
                    const g = data[i+1];
                    const b = data[i+2];
                    const a = data[i+3];
                    
                    if (a < 150) continue;
                    
                    const dist = Math.pow(r - bgR, 2) + Math.pow(g - bgG, 2) + Math.pow(b - bgB, 2);
                    if (dist > maxDist) {
                        maxDist = dist;
                        textR = r;
                        textG = g;
                        textB = b;
                    }
                }
                
                if (maxDist > 900) {
                    textColor = toHex(textR, textG, textB);
                } else {
                    const brightness = (bgR * 299 + bgG * 587 + bgB * 114) / 1000;
                    textColor = brightness > 128 ? '#1C1A17' : '#ffffff';
                }
            }
        } catch (e) {
            console.error('Error sampling colors:', e);
        }
        
        return { bgColor, textColor };
    }

    // Helper to guess font style properties from PDF.js font names
    function parseFontStyle(fontName) {
        let weight = '500';
        let fontStyle = 'normal';
        const name = (fontName || '').toLowerCase();
        
        if (name.includes('bold') || name.includes('black') || name.includes('heavy') || name.includes('w7') || name.includes('w8')) {
            weight = 'bold';
        } else if (name.includes('light') || name.includes('thin') || name.includes('w2') || name.includes('w3')) {
            weight = '300';
        } else if (name.includes('medium') || name.includes('w5') || name.includes('w6')) {
            weight = '500';
        }
        
        if (name.includes('italic') || name.includes('oblique')) {
            fontStyle = 'italic';
        }
        
        return { weight, fontStyle };
    }

    // Process PDF file
    function handlePDFFile(file) {
        if (!file || file.type !== 'application/pdf') {
            showToast('Skipped file: Please upload a valid PDF document.', 'error');
            return;
        }

        const editFilenameInput = document.getElementById('edit-filename');
        if (editFilenameInput) {
            let annotatedName = 'annotated_' + file.name;
            if (!annotatedName.toLowerCase().endsWith('.pdf')) {
                annotatedName += '.pdf';
            }
            editFilenameInput.value = annotatedName;
        }

        if (file.size > 15 * 1024 * 1024) {
            showToast('Skipped file: PDF size exceeds 15MB.', 'error');
            return;
        }

        showLoader('Loading PDF', 'Initializing PDF reading engine...');

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const arrayBuffer = e.target.result;
                
                // Configure PDF.js worker
                window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

                const pdfData = new Uint8Array(arrayBuffer);
                const loadingTask = window.pdfjsLib.getDocument({ data: pdfData });
                editPdfDoc = await loadingTask.promise;

                // Reset canvas tracking
                pdfEditorContainer.innerHTML = '';
                editPdfCanvasObjects = [];

                loaderMessage.textContent = `Rendering page 1 of ${editPdfDoc.numPages}...`;
                await new Promise(r => setTimeout(r, 50));

                for (let i = 1; i <= editPdfDoc.numPages; i++) {
                    updateLoaderProgress(Math.round((i / editPdfDoc.numPages) * 100));
                    loaderMessage.textContent = `Rendering page ${i} of ${editPdfDoc.numPages}...`;
                    
                    const page = await editPdfDoc.getPage(i);
                    // Render scale 1.5 for crisp document
                    const viewport = page.getViewport({ scale: 1.5 });
                    
                    const wrapper = document.createElement('div');
                    wrapper.className = 'pdf-page-canvas-wrapper mode-pan';
                    wrapper.setAttribute('data-page-index', i - 1);

                    const canvas = document.createElement('canvas');
                    canvas.className = 'pdf-page-canvas';
                    canvas.width = viewport.width;
                    canvas.height = viewport.height;
                    
                    const ctx = canvas.getContext('2d');
                    wrapper.appendChild(canvas);
                    pdfEditorContainer.appendChild(wrapper);

                    // Render page content
                    await page.render({ canvasContext: ctx, viewport: viewport }).promise;

                    // Extract and build editable text overlay layer
                    try {
                        const textContent = await page.getTextContent();
                        const textItems = textContent.items;
                        const styles = textContent.styles || {};
                        
                        if (textItems.length > 0) {
                            const textOverlay = document.createElement('div');
                            textOverlay.className = 'pdf-text-overlay-layer';
                            textOverlay.style.width = `${viewport.width}px`;
                            textOverlay.style.height = `${viewport.height}px`;
                            wrapper.appendChild(textOverlay);

                            textItems.forEach(item => {
                                if (!item.str.trim()) return;

                                // Convert PDF coordinate space point to viewport space point
                                const [vx, vy] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
                                const fontHeight = Math.abs(item.transform[3]) * viewport.scale;
                                const itemWidth = item.width * viewport.scale;

                                // Sample canvas background & text colors
                                const sampled = sampleCanvasColors(ctx, vx, vy, fontHeight, itemWidth);
                                const styleInfo = styles[item.fontName];
                                const detectedFontFamily = styleInfo ? `${item.fontName}, ${styleInfo.fontFamily}` : 'sans-serif';
                                const fontStyleInfo = parseFontStyle(item.fontName);

                                const span = document.createElement('span');
                                span.className = 'pdf-editable-text-item';
                                span.contentEditable = 'true';
                                span.style.left = `${vx}px`;
                                span.style.top = `${vy - fontHeight * 0.9}px`;
                                span.style.fontSize = `${fontHeight}px`;
                                span.style.width = `${itemWidth + 4}px`;
                                span.style.height = `${fontHeight * 1.25}px`;
                                
                                // Apply original detected styling (initially transparent color)
                                span.style.fontFamily = detectedFontFamily;
                                span.style.fontWeight = fontStyleInfo.weight;
                                span.style.fontStyle = fontStyleInfo.fontStyle;

                                // Save text metadata properties
                                span.setAttribute('data-init-str', item.str);
                                span.setAttribute('data-original-str', item.str);
                                span.setAttribute('data-font-family', detectedFontFamily);
                                span.setAttribute('data-font-size', fontHeight);
                                span.setAttribute('data-font-weight', fontStyleInfo.weight);
                                span.setAttribute('data-font-style', fontStyleInfo.fontStyle);
                                span.setAttribute('data-text-color', sampled.textColor);
                                span.setAttribute('data-bg-color', sampled.bgColor);
                                span.setAttribute('data-vx', vx);
                                span.setAttribute('data-vy', vy);
                                span.setAttribute('data-item-width', itemWidth);

                                span.textContent = item.str;
                                textOverlay.appendChild(span);

                                // On Focus logic
                                span.addEventListener('focus', () => {
                                    selectedTextSpan = span;
                                    
                                    // 1. White-out / Erase original text on canvas using background color
                                    const bgColor = span.getAttribute('data-bg-color');
                                    ctx.fillStyle = bgColor;
                                    ctx.fillRect(vx - 2, vy - fontHeight, itemWidth + 6, fontHeight * 1.35);

                                    // 2. Make span text visible and match details
                                    const textColor = span.getAttribute('data-text-color');
                                    span.style.color = textColor;
                                    span.style.backgroundColor = '#FFFFFF';

                                    // 3. Update sidebar settings to reflect selected text properties
                                    if (editToolColorSelect) {
                                        // Ensure color exists in dropdown or append it
                                        let foundColor = false;
                                        for (let opt of editToolColorSelect.options) {
                                            if (opt.value.toLowerCase() === textColor.toLowerCase()) {
                                                foundColor = true;
                                                break;
                                            }
                                        }
                                        if (!foundColor) {
                                            const newOpt = new Option(`Detected (${textColor})`, textColor);
                                            editToolColorSelect.add(newOpt);
                                        }
                                        editToolColorSelect.value = textColor;
                                        editorActiveColor = textColor;
                                    }

                                    if (editTextSizeInput) {
                                        const size = Math.round(parseFloat(span.getAttribute('data-font-size')));
                                        editTextSizeInput.value = size;
                                        textSizeValLabel.textContent = `${size}px`;
                                        editorFontSize = size;
                                    }

                                    if (editTextFontSelect) {
                                        // Update font family select
                                        const curFont = span.getAttribute('data-font-family');
                                        let foundFont = false;
                                        for (let opt of editTextFontSelect.options) {
                                            if (opt.value === curFont || curFont.includes(opt.value)) {
                                                editTextFontSelect.value = opt.value;
                                                foundFont = true;
                                                break;
                                            }
                                        }
                                        if (!foundFont) {
                                            const cleanFont = curFont.split(',')[0].replace(/['"]/g, '');
                                            const newOpt = new Option(cleanFont, curFont);
                                            editTextFontSelect.add(newOpt);
                                            editTextFontSelect.value = curFont;
                                        }
                                    }
                                });

                                // On Blur logic
                                span.addEventListener('blur', () => {
                                    const origStr = span.getAttribute('data-original-str');
                                    const currStr = span.textContent;

                                    const textColor = span.getAttribute('data-text-color');
                                    const bgColor = span.getAttribute('data-bg-color');
                                    const fontFamily = span.getAttribute('data-font-family');
                                    const fontSize = parseFloat(span.getAttribute('data-font-size'));
                                    const fontWeight = span.getAttribute('data-font-weight');
                                    const fontStyle = span.getAttribute('data-font-style');

                                    // Make span text transparent again
                                    span.style.color = 'transparent';
                                    span.style.backgroundColor = 'transparent';

                                    // Calculate maximum width to erase (so we clear both old and new text if size changed)
                                    ctx.font = `${fontStyle} ${fontWeight} ${fontSize * 0.9}px ${fontFamily}`;
                                    const newWidth = ctx.measureText(currStr).width;
                                    const origWidth = parseFloat(span.getAttribute('data-item-width'));
                                    const maxW = Math.max(origWidth, newWidth);

                                    // 1. Erase box cleanly using sampled background color
                                    ctx.fillStyle = bgColor;
                                    ctx.fillRect(vx - 2, vy - fontSize, maxW + 8, fontSize * 1.35);

                                    // 2. Draw final text on canvas
                                    ctx.fillStyle = textColor;
                                    ctx.textBaseline = 'alphabetic';
                                    ctx.fillText(currStr, vx, vy);

                                    // Update state attributes
                                    span.setAttribute('data-item-width', newWidth);
                                    
                                    if (origStr !== currStr) {
                                        span.setAttribute('data-original-str', currStr);
                                        showToast('Text updated.', 'success');
                                    }

                                    // Clear active reference if it matches
                                    if (selectedTextSpan === span) {
                                        selectedTextSpan = null;
                                    }
                                });
                            });
                        }
                    } catch (textErr) {
                        console.error('Failed to render text overlay layer:', textErr);
                    }

                    // Save pristine image data
                    const originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    
                    const canvasObj = {
                        pageIndex: i - 1,
                        canvas: canvas,
                        ctx: ctx,
                        viewport: viewport,
                        originalImageData: originalImageData
                    };
                    editPdfCanvasObjects.push(canvasObj);

                    // Attach drawing/writing event listeners to canvas
                    setupCanvasInteractions(canvasObj, wrapper);
                }

                // Show container, hide upload zone
                pdfEditDropZone.style.display = 'none';
                pdfEditorContainer.style.display = 'flex';
                btnGenerateEditedPdf.disabled = false;
                
                showToast(`PDF loaded successfully with ${editPdfDoc.numPages} page(s).`, 'success');
            } catch (err) {
                console.error(err);
                showToast('Failed to parse PDF file.', 'error');
            } finally {
                hideLoader();
            }
        };
        reader.readAsArrayBuffer(file);
    }

    // Canvas Draw & Text handlers setup
    function setupCanvasInteractions(canvasObj, wrapper) {
        const canvas = canvasObj.canvas;
        const ctx = canvasObj.ctx;

        let isDrawing = false;
        let lastX = 0;
        let lastY = 0;

        function getMouseCoordinates(e) {
            const rect = canvas.getBoundingClientRect();
            // Scale according to actual drawing width/height
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            return {
                x: (e.clientX - rect.left) * scaleX,
                y: (e.clientY - rect.top) * scaleY,
                offsetX: e.clientX - rect.left,
                offsetY: e.clientY - rect.top
            };
        }

        // Draw handlers
        canvas.addEventListener('mousedown', (e) => {
            if (editorCurrentMode !== 'draw') return;
            isDrawing = true;
            const coords = getMouseCoordinates(e);
            lastX = coords.x;
            lastY = coords.y;
        });

        canvas.addEventListener('mousemove', (e) => {
            if (editorCurrentMode !== 'draw' || !isDrawing) return;
            const coords = getMouseCoordinates(e);
            
            ctx.beginPath();
            ctx.moveTo(lastX, lastY);
            ctx.lineTo(coords.x, coords.y);
            ctx.strokeStyle = editorActiveColor;
            ctx.lineWidth = editorBrushSize;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();

            lastX = coords.x;
            lastY = coords.y;
        });

        const stopDrawing = () => { isDrawing = false; };
        canvas.addEventListener('mouseup', stopDrawing);
        canvas.addEventListener('mouseout', stopDrawing);

        // Text handler
        canvas.addEventListener('click', (e) => {
            if (editorCurrentMode !== 'text') return;
            
            // Check if there's already an active editing input
            const activeInput = wrapper.querySelector('.pdf-text-editor-input');
            if (activeInput) {
                // Save and remove
                saveTextInput(activeInput, canvasObj);
                return;
            }

            const coords = getMouseCoordinates(e);
            const rect = canvas.getBoundingClientRect();

            // Create temporary absolute input
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'pdf-text-editor-input';
            input.style.left = `${coords.offsetX}px`;
            input.style.top = `${coords.offsetY - (editorFontSize * (rect.width / canvas.width) / 2)}px`; // center vertically
            input.style.fontSize = `${editorFontSize * (rect.width / canvas.width)}px`; // scale size visually
            input.style.color = editorActiveColor;
            
            // Track canvas coordinate bindings
            input.setAttribute('data-canvas-x', coords.x);
            input.setAttribute('data-canvas-y', coords.y);

            wrapper.appendChild(input);
            input.focus();

            // Handle save keys
            input.addEventListener('keydown', (keyEvt) => {
                if (keyEvt.key === 'Enter') {
                    keyEvt.preventDefault();
                    saveTextInput(input, canvasObj);
                } else if (keyEvt.key === 'Escape') {
                    input.remove();
                }
            });

            // Handle clicking outside to apply
            setTimeout(() => {
                document.addEventListener('click', function outsideClick(docEvt) {
                    if (!wrapper.contains(docEvt.target)) {
                        saveTextInput(input, canvasObj);
                        document.removeEventListener('click', outsideClick);
                    }
                });
            }, 50);
        });
    }

    // Save overlay text onto canvas
    function saveTextInput(input, canvasObj) {
        if (!input.parentNode) return;
        const val = input.value.trim();
        const ctx = canvasObj.ctx;

        if (val) {
            const x = parseFloat(input.getAttribute('data-canvas-x'));
            const y = parseFloat(input.getAttribute('data-canvas-y'));
            const fontFamily = editTextFontSelect ? editTextFontSelect.value : "'Inter', sans-serif";

            ctx.font = `600 ${editorFontSize}px ${fontFamily}`;
            ctx.fillStyle = editorActiveColor;
            ctx.textBaseline = 'middle'; // Center align baseline
            ctx.fillText(val, x, y);
        }

        input.remove();
    }

    // Editor controls handlers
    if (editToolModeRadios) {
        editToolModeRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                editorCurrentMode = e.target.value;
                
                // Adjust layouts depending on tool
                if (editorCurrentMode === 'draw') {
                    groupBrushSize.style.display = 'block';
                    groupTextSize.style.display = 'none';
                    if (groupTextFont) groupTextFont.style.display = 'none';
                } else if (editorCurrentMode === 'text') {
                    groupBrushSize.style.display = 'none';
                    groupTextSize.style.display = 'block';
                    if (groupTextFont) groupTextFont.style.display = 'block';
                } else {
                    groupBrushSize.style.display = 'none';
                    groupTextSize.style.display = 'none';
                    if (groupTextFont) groupTextFont.style.display = 'none';
                }

                // Sync wrapper cursor modes
                const wrappers = pdfEditorContainer.querySelectorAll('.pdf-page-canvas-wrapper');
                wrappers.forEach(w => {
                    w.className = `pdf-page-canvas-wrapper mode-${editorCurrentMode}`;
                });
            });
        });
    }

    if (editToolColorSelect) {
        editToolColorSelect.addEventListener('change', (e) => {
            editorActiveColor = e.target.value;
            if (selectedTextSpan) {
                selectedTextSpan.style.color = editorActiveColor;
                selectedTextSpan.setAttribute('data-text-color', editorActiveColor);
            }
        });
    }

    if (editBrushSizeInput) {
        editBrushSizeInput.addEventListener('input', (e) => {
            editorBrushSize = parseInt(e.target.value);
            brushSizeValLabel.textContent = `${editorBrushSize}px`;
        });
    }

    if (editTextSizeInput) {
        editTextSizeInput.addEventListener('input', (e) => {
            editorFontSize = parseInt(e.target.value);
            textSizeValLabel.textContent = `${editorFontSize}px`;
            if (selectedTextSpan) {
                selectedTextSpan.style.fontSize = `${editorFontSize}px`;
                selectedTextSpan.setAttribute('data-font-size', editorFontSize);
                selectedTextSpan.setAttribute('data-font-height', editorFontSize);
                selectedTextSpan.style.height = `${editorFontSize * 1.25}px`;
            }
        });
    }

    if (editTextFontSelect) {
        editTextFontSelect.addEventListener('change', (e) => {
            const font = e.target.value;
            if (selectedTextSpan) {
                selectedTextSpan.style.fontFamily = font;
                selectedTextSpan.setAttribute('data-font-family', font);
            }
        });
    }

    // Reset annotations of active viewport page
    if (btnClearPdfEdits) {
        btnClearPdfEdits.addEventListener('click', () => {
            if (editPdfCanvasObjects.length === 0) return;
            
            if (confirm('Are you sure you want to clear annotations and reset all text edits?')) {
                editPdfCanvasObjects.forEach(obj => {
                    obj.ctx.putImageData(obj.originalImageData, 0, 0);
                    const wrapper = obj.canvas.parentNode;
                    const spans = wrapper.querySelectorAll('.pdf-editable-text-item');
                    spans.forEach(span => {
                        const initStr = span.getAttribute('data-init-str');
                        span.textContent = initStr;
                        span.setAttribute('data-original-str', initStr);
                    });
                });
                showToast('All edits and page annotations reset.', 'info');
            }
        });
    }

    // Save PDF flow compiling canvas array elements
    if (btnGenerateEditedPdf) {
        btnGenerateEditedPdf.addEventListener('click', async () => {
            if (editPdfCanvasObjects.length === 0) return;

            showLoader('Saving Edited PDF', 'Assembling annotated canvases...');
            await new Promise(r => setTimeout(r, 100));

            const { jsPDF } = window.jspdf;
            let doc = null;

            try {
                for (let i = 0; i < editPdfCanvasObjects.length; i++) {
                    updateLoaderProgress(Math.round((i / editPdfCanvasObjects.length) * 100));
                    
                    const obj = editPdfCanvasObjects[i];
                    const canvas = obj.canvas;
                    
                    // Convert pixel sizes to mm sizes at 96 DPI for layout replication
                    const mmW = canvas.width * 0.264583;
                    const mmH = canvas.height * 0.264583;

                    // Yield main thread to allow loader render loop
                    await new Promise(r => setTimeout(r, 50));

                    const imgData = canvas.toDataURL('image/jpeg', 0.95);

                    if (!doc) {
                        doc = new jsPDF({
                            orientation: mmW > mmH ? 'l' : 'p',
                            unit: 'mm',
                            format: [mmW, mmH]
                        });
                    } else {
                        doc.addPage([mmW, mmH], mmW > mmH ? 'l' : 'p');
                    }

                    doc.addImage(imgData, 'JPEG', 0, 0, mmW, mmH, undefined, 'FAST');
                }

                updateLoaderProgress(100);
                loaderMessage.textContent = 'Saving PDF document...';
                await new Promise(r => setTimeout(r, 100));

                const editFilenameInput = document.getElementById('edit-filename');
                let filename = editFilenameInput ? editFilenameInput.value.trim() : 'annotated_document.pdf';
                if (!filename) filename = 'annotated_document.pdf';
                if (!filename.toLowerCase().endsWith('.pdf')) filename += '.pdf';

                doc.save(filename);
                showToast('Edited PDF downloaded successfully!', 'success');
                trackAppEvent('save_annotated_pdf');
            } catch (err) {
                console.error(err);
                showToast('Failed to export edited PDF.', 'error');
            } finally {
                hideLoader();
            }
        });
    }

    // --- 10. PDF COMPRESSOR WORKSPACE LOGIC ---
    const pdfCompressDropZone = document.getElementById('pdf-compress-drop-zone');
    const pdfCompressInput = document.getElementById('pdf-compress-input');
    const pdfCompressUploadBtn = document.querySelector('.btn-pdf-compress-upload-trigger');
    const pdfCompressInfoCard = document.getElementById('pdf-compress-info');
    const compressFileNameLabel = document.getElementById('compress-file-name');
    const compressFileSizeLabel = document.getElementById('compress-file-size');
    const btnClearCompressPdf = document.getElementById('btn-clear-compress-pdf');
    const btnRunPdfCompress = document.getElementById('btn-run-pdf-compress');
    const compressLevelSelect = document.getElementById('compress-level');

    let compressPdfFile = null;
    let compressPdfDoc = null;

    if (pdfCompressUploadBtn) {
        pdfCompressUploadBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            pdfCompressInput.click();
        });
    }

    if (pdfCompressDropZone) {
        pdfCompressDropZone.addEventListener('click', () => {
            pdfCompressInput.click();
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            pdfCompressDropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                pdfCompressDropZone.classList.add('dragover');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            pdfCompressDropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                pdfCompressDropZone.classList.remove('dragover');
            }, false);
        });

        pdfCompressDropZone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            if (files.length) handleCompressPDFFile(files[0]);
        });
    }

    if (pdfCompressInput) {
        pdfCompressInput.addEventListener('change', (e) => {
            if (e.target.files.length) handleCompressPDFFile(e.target.files[0]);
        });
    }

    function handleCompressPDFFile(file) {
        if (!file || file.type !== 'application/pdf') {
            showToast('Please upload a valid PDF document.', 'error');
            return;
        }

        const compressFilenameInput = document.getElementById('compress-filename');
        if (compressFilenameInput) {
            let compressedName = 'compressed_' + file.name;
            if (!compressedName.toLowerCase().endsWith('.pdf')) {
                compressedName += '.pdf';
            }
            compressFilenameInput.value = compressedName;
        }

        compressPdfFile = file;
        
        // Show info card, hide upload zone
        pdfCompressDropZone.style.display = 'none';
        pdfCompressInfoCard.style.display = 'block';
        
        compressFileNameLabel.textContent = file.name;
        compressFileSizeLabel.textContent = `Original Size: ${(file.size / (1024 * 1024)).toFixed(2)} MB`;
        
        if (btnRunPdfCompress) btnRunPdfCompress.disabled = false;
        showToast('PDF loaded for compression.', 'success');
    }

    if (btnClearCompressPdf) {
        btnClearCompressPdf.addEventListener('click', () => {
            compressPdfFile = null;
            compressPdfDoc = null;
            pdfCompressInput.value = '';
            
            pdfCompressDropZone.style.display = 'block';
            pdfCompressInfoCard.style.display = 'none';
            if (btnRunPdfCompress) btnRunPdfCompress.disabled = true;
            showToast('PDF cleared.', 'info');
        });
    }

    if (btnRunPdfCompress) {
        btnRunPdfCompress.addEventListener('click', async () => {
            if (!compressPdfFile) return;

            showLoader('Compressing PDF', 'Reading PDF document...');
            await new Promise(r => setTimeout(r, 100));

            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const arrayBuffer = e.target.result;
                    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                    const pdfData = new Uint8Array(arrayBuffer);
                    const loadingTask = window.pdfjsLib.getDocument({ data: pdfData });
                    compressPdfDoc = await loadingTask.promise;

                    const level = compressLevelSelect ? compressLevelSelect.value : 'medium';
                    
                    // Set compression configuration
                    let scale = 1.0;
                    let quality = 0.7;
                    if (level === 'high') {
                        scale = 0.8;
                        quality = 0.4;
                    } else if (level === 'low') {
                        scale = 1.3;
                        quality = 0.92;
                    }

                    const { jsPDF } = window.jspdf;
                    let outDoc = null;

                    for (let i = 1; i <= compressPdfDoc.numPages; i++) {
                        updateLoaderProgress(Math.round((i / compressPdfDoc.numPages) * 100));
                        loaderMessage.textContent = `Rendering and compressing page ${i} of ${compressPdfDoc.numPages}...`;
                        
                        const page = await compressPdfDoc.getPage(i);
                        const viewport = page.getViewport({ scale: scale });
                        
                        const canvas = document.createElement('canvas');
                        canvas.width = viewport.width;
                        canvas.height = viewport.height;
                        const ctx = canvas.getContext('2d');
                        
                        // Render onto canvas
                        await page.render({ canvasContext: ctx, viewport: viewport }).promise;
                        
                        const imgData = canvas.toDataURL('image/jpeg', quality);
                        const mmW = canvas.width * 0.264583;
                        const mmH = canvas.height * 0.264583;
                        
                        if (!outDoc) {
                            outDoc = new jsPDF({
                                orientation: mmW > mmH ? 'l' : 'p',
                                unit: 'mm',
                                format: [mmW, mmH]
                            });
                        } else {
                            outDoc.addPage([mmW, mmH], mmW > mmH ? 'l' : 'p');
                        }
                        
                        outDoc.addImage(imgData, 'JPEG', 0, 0, mmW, mmH, undefined, 'FAST');
                        
                        // Free canvas memory
                        canvas.width = 0;
                        canvas.height = 0;
                    }

                    updateLoaderProgress(100);
                    loaderMessage.textContent = 'Assembling final compressed PDF...';
                    await new Promise(r => setTimeout(r, 100));

                    const compressFilenameInput = document.getElementById('compress-filename');
                    let compressedName = compressFilenameInput ? compressFilenameInput.value.trim() : 'compressed_' + compressPdfFile.name;
                    if (!compressedName) compressedName = 'compressed_' + compressPdfFile.name;
                    if (!compressedName.toLowerCase().endsWith('.pdf')) compressedName += '.pdf';

                    outDoc.save(compressedName);
                    showToast('PDF compressed and downloaded successfully!', 'success');
                    trackAppEvent('compress_pdf', { level: level });
                } catch (err) {
                    console.error(err);
                    showToast('Failed to compress PDF file.', 'error');
                } finally {
                    hideLoader();
                }
            };
            reader.readAsArrayBuffer(compressPdfFile);
        });
    }

    // --- 11. PHOTO COMPRESSOR WORKSPACE LOGIC ---
    const photoCompressDropZone = document.getElementById('photo-compress-drop-zone');
    const photoCompressInput = document.getElementById('photo-compress-input');
    const photoCompressUploadBtn = document.querySelector('.btn-photo-compress-upload-trigger');
    const photoCompressManager = document.getElementById('photo-compress-manager');
    const photoCompressCountLabel = document.getElementById('photo-compress-count-label');
    const btnClearPhotoCompress = document.getElementById('btn-clear-photo-compress');
    const photoCompressGrid = document.getElementById('photo-compress-grid');
    const btnRunPhotoCompress = document.getElementById('btn-run-photo-compress');
    
    // Controls
    const photoCompressQualityInput = document.getElementById('photo-compress-quality');
    const photoCompressQualityVal = document.getElementById('photo-compress-quality-val');
    const photoCompressFormatSelect = document.getElementById('photo-compress-format');

    let compressPhotosList = []; // elements: { id, name, dataUrl, size, type }

    if (photoCompressUploadBtn) {
        photoCompressUploadBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            photoCompressInput.click();
        });
    }

    if (photoCompressDropZone) {
        photoCompressDropZone.addEventListener('click', () => {
            photoCompressInput.click();
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            photoCompressDropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                photoCompressDropZone.classList.add('dragover');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            photoCompressDropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                photoCompressDropZone.classList.remove('dragover');
            }, false);
        });

        photoCompressDropZone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            handlePhotoCompressUploads(files);
        });
    }

    if (photoCompressInput) {
        photoCompressInput.addEventListener('change', (e) => {
            handlePhotoCompressUploads(e.target.files);
        });
    }

    if (photoCompressQualityInput) {
        photoCompressQualityInput.addEventListener('input', (e) => {
            if (photoCompressQualityVal) {
                photoCompressQualityVal.textContent = `${e.target.value}%`;
            }
        });
    }

    function handlePhotoCompressUploads(files) {
        if (!files.length) return;

        const promises = [];
        Array.from(files).forEach(file => {
            if (!file.type.match('image/jpeg') && !file.type.match('image/png') && !file.type.match('image/webp')) {
                showToast(`Skipped "${file.name}": Unsupported format.`, 'error');
                return;
            }

            if (file.size > 10 * 1024 * 1024) {
                showToast(`Skipped "${file.name}": File size exceeds 10MB.`, 'error');
                return;
            }

            const promise = new Promise(resolve => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const id = 'comp_photo_' + Math.random().toString(36).substr(2, 9);
                    const sizeKB = (file.size / 1024).toFixed(0) + ' KB';
                    compressPhotosList.push({
                        id: id,
                        name: file.name,
                        dataUrl: e.target.result,
                        size: sizeKB,
                        type: file.type
                    });
                    resolve();
                };
                reader.readAsDataURL(file);
            });
            promises.push(promise);
        });

        if (promises.length > 0) {
            showLoader('Uploading Images', 'Reading selected image files...');
            Promise.all(promises).then(() => {
                hideLoader();
                renderPhotoCompressGrid();
                showToast(`Successfully added ${promises.length} photo(s) for compression.`, 'success');
            });
        }
    }

    function renderPhotoCompressGrid() {
        if (!photoCompressGrid) return;
        photoCompressGrid.innerHTML = '';

        if (compressPhotosList.length === 0) {
            photoCompressDropZone.style.display = 'block';
            photoCompressManager.style.display = 'none';
            if (btnRunPhotoCompress) btnRunPhotoCompress.disabled = true;
            return;
        }

        photoCompressDropZone.style.display = 'none';
        photoCompressManager.style.display = 'block';
        if (btnRunPhotoCompress) btnRunPhotoCompress.disabled = false;

        photoCompressCountLabel.textContent = `${compressPhotosList.length} ${compressPhotosList.length === 1 ? 'Image' : 'Images'}`;

        compressPhotosList.forEach(photo => {
            const card = document.createElement('div');
            card.className = 'photo-card';
            card.setAttribute('data-id', photo.id);
            card.innerHTML = `
                <div class="photo-card-img-wrapper" style="height: 100px;">
                    <img src="${photo.dataUrl}" alt="${photo.name}" class="photo-card-img">
                </div>
                <div class="photo-card-info" style="padding: 10px;">
                    <p class="photo-card-name" style="font-size: 11px; margin-bottom: 2px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${photo.name}</p>
                    <p class="photo-card-size text-secondary" style="font-size: 10px;">Size: ${photo.size}</p>
                </div>
                <button class="btn-delete" title="Remove image" style="top: 6px; right: 6px;">
                    <i data-lucide="x" style="width: 12px; height: 12px;"></i>
                </button>
            `;

            card.querySelector('.btn-delete').addEventListener('click', (e) => {
                e.stopPropagation();
                compressPhotosList = compressPhotosList.filter(p => p.id !== photo.id);
                renderPhotoCompressGrid();
                showToast('Image removed.', 'info');
            });

            photoCompressGrid.appendChild(card);
        });

        lucide.createIcons();
    }

    if (btnClearPhotoCompress) {
        btnClearPhotoCompress.addEventListener('click', () => {
            compressPhotosList = [];
            renderPhotoCompressGrid();
            showToast('All photos cleared.', 'info');
        });
    }

    if (btnRunPhotoCompress) {
        btnRunPhotoCompress.addEventListener('click', async () => {
            if (compressPhotosList.length === 0) return;

            showLoader('Compressing Images', 'Initializing local canvas compression...');
            await new Promise(r => setTimeout(r, 100));

            const quality = parseFloat(photoCompressQualityInput.value) / 100;
            const format = photoCompressFormatSelect.value; // 'original', 'jpeg', 'webp', 'png'

            try {
                for (let i = 0; i < compressPhotosList.length; i++) {
                    const photo = compressPhotosList[i];
                    
                    updateLoaderProgress(Math.round((i / compressPhotosList.length) * 100));
                    loaderMessage.textContent = `Compressing image ${i + 1} of ${compressPhotosList.length}...`;
                    
                    await new Promise(resolve => {
                        const img = new Image();
                        img.onload = () => {
                            const canvas = document.createElement('canvas');
                            canvas.width = img.naturalWidth;
                            canvas.height = img.naturalHeight;
                            const ctx = canvas.getContext('2d');
                            ctx.drawImage(img, 0, 0);

                            let outMime = photo.type;
                            if (format === 'jpeg') outMime = 'image/jpeg';
                            else if (format === 'webp') outMime = 'image/webp';
                            else if (format === 'png') outMime = 'image/png';

                            let ext = 'jpg';
                            if (outMime === 'image/webp') ext = 'webp';
                            else if (outMime === 'image/png') ext = 'png';

                            const compressedData = canvas.toDataURL(outMime, quality);
                            
                            // Trigger individual download
                            const dlLink = document.createElement('a');
                            dlLink.href = compressedData;
                            const baseName = photo.name.substring(0, photo.name.lastIndexOf('.')) || photo.name;
                            dlLink.download = `compressed_${baseName}.${ext}`;
                            document.body.appendChild(dlLink);
                            dlLink.click();
                            dlLink.remove();

                            canvas.width = 0;
                            canvas.height = 0;
                            resolve();
                        };
                        img.src = photo.dataUrl;
                    });
                }

                updateLoaderProgress(100);
                loaderMessage.textContent = 'All images downloaded!';
                await new Promise(r => setTimeout(r, 200));
                showToast('All photos compressed and downloaded successfully!', 'success');
                const qualityValSelect = document.getElementById('photo-compress-quality');
                const targetQuality = qualityValSelect ? qualityValSelect.value : '70';
                trackAppEvent('compress_photo', { quality: targetQuality, photo_count: compressPhotosList.length });
            } catch (err) {
                console.error(err);
                showToast('Failed to compress some photos.', 'error');
            } finally {
                hideLoader();
            }
        });
    }

    // --- 12. PHOTO RESIZER WORKSPACE LOGIC ---
    const photoResizeDropZone = document.getElementById('photo-resize-drop-zone');
    const photoResizeInput = document.getElementById('photo-resize-input');
    const photoResizeUploadBtn = document.querySelector('.btn-photo-resize-upload-trigger');
    const photoResizeManager = document.getElementById('photo-resize-manager');
    const photoResizeCountLabel = document.getElementById('photo-resize-count-label');
    const btnClearPhotoResize = document.getElementById('btn-clear-photo-resize');
    const photoResizeGrid = document.getElementById('photo-resize-grid');
    const btnRunPhotoResize = document.getElementById('btn-run-photo-resize');

    // Controls
    const photoResizeModeSelect = document.getElementById('photo-resize-mode');
    const groupResizePercent = document.getElementById('group-resize-percent');
    const groupResizeDimensions = document.getElementById('group-resize-dimensions');
    const photoResizePercentInput = document.getElementById('photo-resize-percent');
    const photoResizePercentVal = document.getElementById('photo-resize-percent-val');
    
    const photoResizeWidthInput = document.getElementById('photo-resize-width');
    const photoResizeHeightInput = document.getElementById('photo-resize-height');
    const photoResizeAspectRatio = document.getElementById('photo-resize-aspect-ratio');
    const photoResizeFormatSelect = document.getElementById('photo-resize-format');

    let resizePhotosList = []; // elements: { id, name, dataUrl, size, type, width, height, aspect }

    if (photoResizeUploadBtn) {
        photoResizeUploadBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            photoResizeInput.click();
        });
    }

    if (photoResizeDropZone) {
        photoResizeDropZone.addEventListener('click', () => {
            photoResizeInput.click();
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            photoResizeDropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                photoResizeDropZone.classList.add('dragover');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            photoResizeDropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                photoResizeDropZone.classList.remove('dragover');
            }, false);
        });

        photoResizeDropZone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            handlePhotoResizeUploads(files);
        });
    }

    if (photoResizeInput) {
        photoResizeInput.addEventListener('change', (e) => {
            handlePhotoResizeUploads(e.target.files);
        });
    }

    if (photoResizeModeSelect) {
        photoResizeModeSelect.addEventListener('change', (e) => {
            const mode = e.target.value;
            if (mode === 'percentage') {
                groupResizePercent.style.display = 'block';
                groupResizeDimensions.style.display = 'none';
            } else {
                groupResizePercent.style.display = 'none';
                groupResizeDimensions.style.display = 'block';
                
                // Prefill with first image dimensions if available
                if (resizePhotosList.length > 0) {
                    photoResizeWidthInput.value = resizePhotosList[0].width;
                    photoResizeHeightInput.value = resizePhotosList[0].height;
                }
            }
        });
    }

    if (photoResizePercentInput) {
        photoResizePercentInput.addEventListener('input', (e) => {
            if (photoResizePercentVal) {
                photoResizePercentVal.textContent = `${e.target.value}%`;
            }
        });
    }

    // Aspect Ratio Lock logic
    if (photoResizeWidthInput) {
        photoResizeWidthInput.addEventListener('input', () => {
            if (photoResizeAspectRatio.checked && resizePhotosList.length > 0) {
                const ratio = resizePhotosList[0].aspect;
                const w = parseFloat(photoResizeWidthInput.value);
                if (w > 0) {
                    photoResizeHeightInput.value = Math.round(w / ratio);
                }
            }
        });
    }

    if (photoResizeHeightInput) {
        photoResizeHeightInput.addEventListener('input', () => {
            if (photoResizeAspectRatio.checked && resizePhotosList.length > 0) {
                const ratio = resizePhotosList[0].aspect;
                const h = parseFloat(photoResizeHeightInput.value);
                if (h > 0) {
                    photoResizeWidthInput.value = Math.round(h * ratio);
                }
            }
        });
    }

    function handlePhotoResizeUploads(files) {
        if (!files.length) return;

        const promises = [];
        Array.from(files).forEach(file => {
            if (!file.type.match('image/jpeg') && !file.type.match('image/png') && !file.type.match('image/webp')) {
                showToast(`Skipped "${file.name}": Unsupported format.`, 'error');
                return;
            }

            if (file.size > 10 * 1024 * 1024) {
                showToast(`Skipped "${file.name}": File size exceeds 10MB.`, 'error');
                return;
            }

            const promise = new Promise(resolve => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const img = new Image();
                    img.onload = () => {
                        const id = 'resize_photo_' + Math.random().toString(36).substr(2, 9);
                        const sizeKB = (file.size / 1024).toFixed(0) + ' KB';
                        resizePhotosList.push({
                            id: id,
                            name: file.name,
                            dataUrl: e.target.result,
                            size: sizeKB,
                            type: file.type,
                            width: img.naturalWidth,
                            height: img.naturalHeight,
                            aspect: img.naturalWidth / img.naturalHeight
                        });
                        resolve();
                    };
                    img.src = e.target.result;
                };
                reader.readAsDataURL(file);
            });
            promises.push(promise);
        });

        if (promises.length > 0) {
            showLoader('Uploading Images', 'Analyzing and loading image properties...');
            Promise.all(promises).then(() => {
                hideLoader();
                renderPhotoResizeGrid();
                
                // Set default input fields if custom dimensions is selected
                if (photoResizeModeSelect.value === 'dimensions' && resizePhotosList.length > 0) {
                    photoResizeWidthInput.value = resizePhotosList[0].width;
                    photoResizeHeightInput.value = resizePhotosList[0].height;
                }
                
                showToast(`Successfully loaded ${promises.length} photo(s) for resizing.`, 'success');
            });
        }
    }

    function renderPhotoResizeGrid() {
        if (!photoResizeGrid) return;
        photoResizeGrid.innerHTML = '';

        if (resizePhotosList.length === 0) {
            photoResizeDropZone.style.display = 'block';
            photoResizeManager.style.display = 'none';
            if (btnRunPhotoResize) btnRunPhotoResize.disabled = true;
            return;
        }

        photoResizeDropZone.style.display = 'none';
        photoResizeManager.style.display = 'block';
        if (btnRunPhotoResize) btnRunPhotoResize.disabled = false;

        photoResizeCountLabel.textContent = `${resizePhotosList.length} ${resizePhotosList.length === 1 ? 'Image' : 'Images'}`;

        resizePhotosList.forEach(photo => {
            const card = document.createElement('div');
            card.className = 'photo-card';
            card.setAttribute('data-id', photo.id);
            card.innerHTML = `
                <div class="photo-card-img-wrapper" style="height: 100px;">
                    <img src="${photo.dataUrl}" alt="${photo.name}" class="photo-card-img">
                </div>
                <div class="photo-card-info" style="padding: 10px;">
                    <p class="photo-card-name" style="font-size: 11px; margin-bottom: 2px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${photo.name}</p>
                    <p class="photo-card-size text-secondary" style="font-size: 10px; margin-bottom: 2px;">Original: ${photo.width}x${photo.height}</p>
                    <p class="photo-card-size text-secondary" style="font-size: 10px;">Size: ${photo.size}</p>
                </div>
                <button class="btn-delete" title="Remove image" style="top: 6px; right: 6px;">
                    <i data-lucide="x" style="width: 12px; height: 12px;"></i>
                </button>
            `;

            card.querySelector('.btn-delete').addEventListener('click', (e) => {
                e.stopPropagation();
                resizePhotosList = resizePhotosList.filter(p => p.id !== photo.id);
                renderPhotoResizeGrid();
                showToast('Image removed.', 'info');
            });

            photoResizeGrid.appendChild(card);
        });

        lucide.createIcons();
    }

    if (btnClearPhotoResize) {
        btnClearPhotoResize.addEventListener('click', () => {
            resizePhotosList = [];
            renderPhotoResizeGrid();
            showToast('All photos cleared.', 'info');
        });
    }

    if (btnRunPhotoResize) {
        btnRunPhotoResize.addEventListener('click', async () => {
            if (resizePhotosList.length === 0) return;

            showLoader('Resizing Images', 'Initializing canvas resizing...');
            await new Promise(r => setTimeout(r, 100));

            const mode = photoResizeModeSelect.value;
            const format = photoResizeFormatSelect.value;
            
            let percentScale = 1.0;
            let targetW = 0;
            let targetH = 0;
            
            if (mode === 'percentage') {
                percentScale = parseFloat(photoResizePercentInput.value) / 100;
            } else {
                targetW = parseInt(photoResizeWidthInput.value);
                targetH = parseInt(photoResizeHeightInput.value);
            }

            try {
                for (let i = 0; i < resizePhotosList.length; i++) {
                    const photo = resizePhotosList[i];
                    
                    updateLoaderProgress(Math.round((i / resizePhotosList.length) * 100));
                    loaderMessage.textContent = `Resizing image ${i + 1} of ${resizePhotosList.length}...`;
                    
                    await new Promise(resolve => {
                        const img = new Image();
                        img.onload = () => {
                            let newW = img.naturalWidth;
                            let newH = img.naturalHeight;
                            
                            if (mode === 'percentage') {
                                newW = Math.round(img.naturalWidth * percentScale);
                                newH = Math.round(img.naturalHeight * percentScale);
                            } else {
                                if (photoResizeAspectRatio.checked) {
                                    // Proportionate resize based on width if set, otherwise height
                                    if (targetW > 0) {
                                        newW = targetW;
                                        newH = Math.round(targetW / photo.aspect);
                                    } else if (targetH > 0) {
                                        newH = targetH;
                                        newW = Math.round(targetH * photo.aspect);
                                    }
                                } else {
                                    if (targetW > 0) newW = targetW;
                                    if (targetH > 0) newH = targetH;
                                }
                            }

                            if (newW <= 0) newW = 1;
                            if (newH <= 0) newH = 1;

                            const canvas = document.createElement('canvas');
                            canvas.width = newW;
                            canvas.height = newH;
                            const ctx = canvas.getContext('2d');
                            ctx.drawImage(img, 0, 0, newW, newH);

                            let outMime = photo.type;
                            if (format === 'jpeg') outMime = 'image/jpeg';
                            else if (format === 'webp') outMime = 'image/webp';
                            else if (format === 'png') outMime = 'image/png';

                            let ext = 'jpg';
                            if (outMime === 'image/webp') ext = 'webp';
                            else if (outMime === 'image/png') ext = 'png';

                            const resizedData = canvas.toDataURL(outMime, 0.92);
                            
                            // Trigger individual download
                            const dlLink = document.createElement('a');
                            dlLink.href = resizedData;
                            const baseName = photo.name.substring(0, photo.name.lastIndexOf('.')) || photo.name;
                            dlLink.download = `resized_${newW}x${newH}_${baseName}.${ext}`;
                            document.body.appendChild(dlLink);
                            dlLink.click();
                            dlLink.remove();

                            canvas.width = 0;
                            canvas.height = 0;
                            resolve();
                        };
                        img.src = photo.dataUrl;
                    });
                }

                updateLoaderProgress(100);
                loaderMessage.textContent = 'All images resized!';
                await new Promise(r => setTimeout(r, 200));
                showToast('All photos resized and downloaded successfully!', 'success');
                const resizeModeSelect = document.getElementById('photo-resize-mode');
                const mode = resizeModeSelect ? resizeModeSelect.value : 'percentage';
                trackAppEvent('resize_photo', { mode: mode, photo_count: resizePhotosList.length });
            } catch (err) {
                console.error(err);
                showToast('Failed to resize some photos.', 'error');
            } finally {
                hideLoader();
            }
        });
    }

    // Mobile Tab Switcher within workspaces (Workspace vs settings panel)
    const mobileTabBtns = document.querySelectorAll('.mobile-tab-btn');
    mobileTabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-tab-target');
            const panel = document.getElementById(targetId);
            if (!panel) return;
            const layout = panel.closest('.workspace-layout');
            
            // Toggle active class on tab buttons in the same container
            const container = btn.closest('.mobile-workspace-tabs');
            container.querySelectorAll('.mobile-tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            if (targetId.includes('settings')) {
                layout.classList.add('show-settings');
            } else {
                layout.classList.remove('show-settings');
            }
        });
    });

    // ==========================================================================
    // --- 11. PDF PAGE ORGANIZER WORKSPACE LOGIC ---
    // ==========================================================================
    const organizerFileInput = document.getElementById('organizer-file-input');
    const organizerDropZone = document.getElementById('organizer-drop-zone');
    const organizerManager = document.getElementById('organizer-manager');
    const organizerGrid = document.getElementById('organizer-grid');
    const organizerPagesCount = document.getElementById('organizer-pages-count');
    const btnClearOrganizer = document.getElementById('btn-clear-organizer');
    const btnRunOrganizer = document.getElementById('btn-run-organizer');
    const organizerUploadTriggerBtn = document.querySelector('.btn-organizer-upload-trigger');

    if (organizerUploadTriggerBtn) organizerUploadTriggerBtn.addEventListener('click', () => organizerFileInput.click());
    if (organizerFileInput) organizerFileInput.addEventListener('change', (e) => handleOrganizerFiles(e.target.files));

    if (organizerDropZone) {
        organizerDropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            organizerDropZone.classList.add('dragover');
        });
        organizerDropZone.addEventListener('dragleave', () => {
            organizerDropZone.classList.remove('dragover');
        });
        organizerDropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            organizerDropZone.classList.remove('dragover');
            handleOrganizerFiles(e.dataTransfer.files);
        });
    }

    if (btnClearOrganizer) {
        btnClearOrganizer.addEventListener('click', () => {
            uploadedOrganizerPages = [];
            organizerFilesMap.clear();
            if (organizerSortable) {
                organizerSortable.destroy();
                organizerSortable = null;
            }
            organizerGrid.innerHTML = '';
            organizerManager.style.display = 'none';
            organizerDropZone.style.display = 'flex';
            btnRunOrganizer.disabled = true;
            showToast('Organizer workspace cleared.', 'info');
        });
    }

    async function handleOrganizerFiles(files) {
        const pdfFiles = Array.from(files).filter(f => f.type === 'application/pdf');
        if (pdfFiles.length === 0) {
            showToast('Please upload valid PDF files.', 'error');
            return;
        }

        showLoader('Loading PDFs', 'Reading document pages...');
        let totalFiles = pdfFiles.length;
        let loadedCount = 0;

        for (let i = 0; i < pdfFiles.length; i++) {
            const file = pdfFiles[i];
            const fileId = 'file-' + Date.now() + '-' + Math.round(Math.random() * 1000);
            
            try {
                const arrayBuffer = await file.arrayBuffer();
                organizerFilesMap.set(fileId, arrayBuffer);

                // Load via PDF.js
                const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
                const pdf = await loadingTask.promise;
                
                for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                    const page = await pdf.getPage(pageNum);
                    
                    // Render page thumbnail to canvas
                    const viewport = page.getViewport({ scale: 0.35 });
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    canvas.width = viewport.width;
                    canvas.height = viewport.height;

                    await page.render({ canvasContext: ctx, viewport: viewport }).promise;
                    const thumbnailDataUrl = canvas.toDataURL('image/jpeg', 0.85);

                    uploadedOrganizerPages.push({
                        id: 'page-' + Math.random().toString(36).substr(2, 9),
                        fileId: fileId,
                        filename: file.name,
                        pageIndex: pageNum - 1, // 0-indexed
                        rotation: 0,
                        thumbnailDataUrl: thumbnailDataUrl
                    });
                }
                loadedCount++;
                updateLoaderProgress(Math.round((loadedCount / totalFiles) * 100));
            } catch (err) {
                console.error(err);
                showToast(`Failed to parse ${file.name}`, 'error');
            }
        }

        hideLoader();
        renderOrganizerGrid();
    }

    function renderOrganizerGrid() {
        organizerGrid.innerHTML = '';
        if (uploadedOrganizerPages.length === 0) {
            organizerManager.style.display = 'none';
            organizerDropZone.style.display = 'flex';
            btnRunOrganizer.disabled = true;
            return;
        }

        organizerDropZone.style.display = 'none';
        organizerManager.style.display = 'block';
        btnRunOrganizer.disabled = false;
        organizerPagesCount.textContent = `${uploadedOrganizerPages.length} Pages Loaded`;

        uploadedOrganizerPages.forEach((page, idx) => {
            const card = document.createElement('div');
            card.className = 'organizer-page-card';
            card.setAttribute('data-id', page.id);

            card.innerHTML = `
                <div class="organizer-page-card-canvas-wrapper">
                    <img src="${page.thumbnailDataUrl}" class="rotate-${page.rotation}" style="max-width: 100%; max-height: 100%; object-fit: contain;" alt="Page ${idx + 1}">
                    <div class="organizer-page-card-actions">
                        <button class="photo-action-btn btn-rotate" title="Rotate 90°"><i data-lucide="rotate-cw"></i></button>
                        <button class="photo-action-btn btn-delete" title="Delete Page"><i data-lucide="trash"></i></button>
                    </div>
                </div>
                <div class="organizer-page-card-footer">
                    <span class="organizer-page-label" title="${page.filename}">${page.filename}</span>
                    <span class="organizer-page-number">${idx + 1}</span>
                </div>
            `;

            // Attach rotate handler
            card.querySelector('.btn-rotate').addEventListener('click', (e) => {
                e.stopPropagation();
                page.rotation = (page.rotation + 90) % 360;
                const img = card.querySelector('img');
                img.className = `rotate-${page.rotation}`;
            });

            // Attach delete handler
            card.querySelector('.btn-delete').addEventListener('click', (e) => {
                e.stopPropagation();
                uploadedOrganizerPages = uploadedOrganizerPages.filter(p => p.id !== page.id);
                renderOrganizerGrid();
            });

            organizerGrid.appendChild(card);
        });

        lucide.createIcons();

        // Setup Sortable reordering
        if (organizerSortable) {
            organizerSortable.destroy();
        }

        organizerSortable = new Sortable(organizerGrid, {
            animation: 200,
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            onEnd: () => {
                // Sync internal array order with DOM elements
                const reorderedPages = [];
                const cards = organizerGrid.querySelectorAll('.organizer-page-card');
                cards.forEach(card => {
                    const id = card.getAttribute('data-id');
                    const pageObj = uploadedOrganizerPages.find(p => p.id === id);
                    if (pageObj) reorderedPages.push(pageObj);
                });
                uploadedOrganizerPages = reorderedPages;
                
                // Redraw numbering footer labels
                cards.forEach((card, newIdx) => {
                    card.querySelector('.organizer-page-number').textContent = newIdx + 1;
                });
            }
        });
    }

    if (btnRunOrganizer) {
        btnRunOrganizer.addEventListener('click', async () => {
            if (uploadedOrganizerPages.length === 0) return;

            showLoader('Compiling PDF', 'Merging and organizing pages locally...');
            try {
                // Create final doc via pdf-lib
                const mergedPdf = await PDFLib.PDFDocument.create();
                
                // Cache of parsed PDFLib loaded documents to avoid reading them repeatedly
                const libDocCache = new Map();

                for (let i = 0; i < uploadedOrganizerPages.length; i++) {
                    const page = uploadedOrganizerPages[i];
                    updateLoaderProgress(Math.round((i / uploadedOrganizerPages.length) * 100));
                    
                    if (!libDocCache.has(page.fileId)) {
                        const buffer = organizerFilesMap.get(page.fileId);
                        const doc = await PDFLib.PDFDocument.load(buffer);
                        libDocCache.set(page.fileId, doc);
                    }

                    const srcDoc = libDocCache.get(page.fileId);
                    const [copiedPage] = await mergedPdf.copyPages(srcDoc, [page.pageIndex]);

                    // Apply rotation
                    if (page.rotation !== 0) {
                        copiedPage.setRotation(PDFLib.degrees(page.rotation));
                    }
                    mergedPdf.addPage(copiedPage);
                }

                updateLoaderProgress(95);
                loaderMessage.textContent = 'Saving PDF bytes...';
                
                const finalBytes = await mergedPdf.save();
                const blob = new Blob([finalBytes], { type: 'application/pdf' });
                const downloadUrl = URL.createObjectURL(blob);
                
                const organizerFilenameInput = document.getElementById('organizer-filename');
                let filename = organizerFilenameInput ? organizerFilenameInput.value.trim() : 'organized_document.pdf';
                if (!filename) filename = 'organized_document.pdf';
                if (!filename.toLowerCase().endsWith('.pdf')) filename += '.pdf';

                const a = document.createElement('a');
                a.href = downloadUrl;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(downloadUrl);

                showToast('PDF compiled successfully!', 'success');
                trackAppEvent('organize_pdf_pages', { page_count: uploadedOrganizerPages.length });
            } catch (err) {
                console.error(err);
                showToast('Failed to compile reorganized PDF.', 'error');
            } finally {
                hideLoader();
            }
        });
    }


    // ==========================================================================
    // --- 12. PDF TO IMAGE CONVERTER LOGIC ---
    // ==========================================================================
    const pdfToImgFileInput = document.getElementById('pdf-to-img-file-input');
    const pdfToImgDropZone = document.getElementById('pdf-to-img-drop-zone');
    const pdfToImgManager = document.getElementById('pdf-to-img-manager');
    const pdfToImgPreviewGrid = document.getElementById('pdf-to-img-preview-grid');
    const pdfToImgFilenameLabel = document.getElementById('pdf-to-img-filename-label');
    const btnClearPdfToImg = document.getElementById('btn-clear-pdf-to-img');
    const btnRunPdfToImg = document.getElementById('btn-run-pdf-to-img');
    const pdfToImgUploadTrigger = document.querySelector('.btn-pdf-to-img-upload-trigger');

    if (pdfToImgUploadTrigger) pdfToImgUploadTrigger.addEventListener('click', () => pdfToImgFileInput.click());
    if (pdfToImgFileInput) pdfToImgFileInput.addEventListener('change', (e) => handlePdfToImgFile(e.target.files[0]));

    if (pdfToImgDropZone) {
        pdfToImgDropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            pdfToImgDropZone.classList.add('dragover');
        });
        pdfToImgDropZone.addEventListener('dragleave', () => {
            pdfToImgDropZone.classList.remove('dragover');
        });
        pdfToImgDropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            pdfToImgDropZone.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) handlePdfToImgFile(e.dataTransfer.files[0]);
        });
    }

    if (btnClearPdfToImg) {
        btnClearPdfToImg.addEventListener('click', () => {
            currentPdfToImgFile = null;
            pdfToImgFileInput.value = '';
            pdfToImgPreviewGrid.innerHTML = '';
            pdfToImgManager.style.display = 'none';
            pdfToImgDropZone.style.display = 'flex';
            btnRunPdfToImg.disabled = true;
            showToast('PDF to Image workspace cleared.', 'info');
        });
    }

    async function handlePdfToImgFile(file) {
        if (!file || file.type !== 'application/pdf') {
            showToast('Please upload a valid PDF document.', 'error');
            return;
        }

        showLoader('Loading PDF', 'Preparing pages list...');
        currentPdfToImgFile = file;
        pdfToImgFilenameLabel.textContent = `${file.name} (${Math.round(file.size / 1024)} KB)`;

        try {
            const arrayBuffer = await file.arrayBuffer();
            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
            const pdf = await loadingTask.promise;

            pdfToImgPreviewGrid.innerHTML = '';
            pdfToImgDropZone.style.display = 'none';
            pdfToImgManager.style.display = 'block';
            btnRunPdfToImg.disabled = false;

            // Render fast previews of the first 6 pages to avoid crashing on huge PDFs
            const pagesToRender = Math.min(pdf.numPages, 12);
            for (let pageNum = 1; pageNum <= pagesToRender; pageNum++) {
                const page = await pdf.getPage(pageNum);
                const viewport = page.getViewport({ scale: 0.2 });
                const canvas = document.createElement('canvas');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                const ctx = canvas.getContext('2d');

                await page.render({ canvasContext: ctx, viewport: viewport }).promise;
                
                const card = document.createElement('div');
                card.className = 'organizer-page-card';
                card.style.cursor = 'default';
                card.innerHTML = `
                    <div class="organizer-page-card-canvas-wrapper" style="aspect-ratio: 0.707;">
                        <img src="${canvas.toDataURL('image/jpeg', 0.7)}" style="max-width: 100%; max-height: 100%;">
                    </div>
                    <div class="organizer-page-card-footer" style="justify-content: center;">
                        <span class="organizer-page-number" style="width: auto; height: auto; border-radius: 4px; padding: 2px 6px;">Page ${pageNum}</span>
                    </div>
                `;
                pdfToImgPreviewGrid.appendChild(card);
            }

            if (pdf.numPages > 12) {
                const hint = document.createElement('div');
                hint.style.gridColumn = '1 / -1';
                hint.style.textAlign = 'center';
                hint.style.fontSize = '0.78rem';
                hint.style.color = 'var(--text-secondary)';
                hint.textContent = `... and ${pdf.numPages - 12} more pages. All ${pdf.numPages} pages will be processed on download.`;
                pdfToImgPreviewGrid.appendChild(hint);
            }

            showToast('PDF loaded successfully!', 'success');
        } catch (err) {
            console.error(err);
            showToast('Failed to load PDF preview.', 'error');
        } finally {
            hideLoader();
        }
    }

    if (btnRunPdfToImg) {
        btnRunPdfToImg.addEventListener('click', async () => {
            if (!currentPdfToImgFile) return;

            showLoader('Converting Pages', 'Extracting pages to images...');
            try {
                const arrayBuffer = await currentPdfToImgFile.arrayBuffer();
                const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
                const pdf = await loadingTask.promise;

                const format = document.getElementById('pdf-to-img-format').value; // png, jpeg, webp
                const scale = parseFloat(document.getElementById('pdf-to-img-scale').value); // 1, 2, 3
                const rangeStr = document.getElementById('pdf-to-img-range').value.trim();

                // Parse page range numbers
                let selectedPages = [];
                if (rangeStr) {
                    const parts = rangeStr.split(',');
                    parts.forEach(part => {
                        if (part.includes('-')) {
                            const [start, end] = part.split('-').map(n => parseInt(n.trim()));
                            if (start && end && start <= end) {
                                for (let p = start; p <= end; p++) {
                                    if (p >= 1 && p <= pdf.numPages) selectedPages.push(p);
                                }
                            }
                        } else {
                            const p = parseInt(part.trim());
                            if (p >= 1 && p <= pdf.numPages) selectedPages.push(p);
                        }
                    });
                }

                // Default to all pages if selection empty
                if (selectedPages.length === 0) {
                    for (let p = 1; p <= pdf.numPages; p++) selectedPages.push(p);
                }

                // Remove duplicates and sort
                selectedPages = [...new Set(selectedPages)].sort((a,b) => a - b);

                const zip = new JSZip();

                for (let i = 0; i < selectedPages.length; i++) {
                    const pageNum = selectedPages[i];
                    loaderMessage.textContent = `Converting page ${pageNum} (${i+1}/${selectedPages.length})...`;
                    updateLoaderProgress(Math.round((i / selectedPages.length) * 100));

                    const page = await pdf.getPage(pageNum);
                    const viewport = page.getViewport({ scale: scale });
                    
                    const canvas = document.createElement('canvas');
                    canvas.width = viewport.width;
                    canvas.height = viewport.height;
                    const ctx = canvas.getContext('2d');
                    
                    await page.render({ canvasContext: ctx, viewport: viewport }).promise;
                    
                    const mimeType = format === 'png' ? 'image/png' : format === 'webp' ? 'image/webp' : 'image/jpeg';
                    const dataUrl = canvas.toDataURL(mimeType, 0.95);
                    const base64Data = dataUrl.split(',')[1];
                    
                    zip.file(`page_${pageNum}.${format}`, base64Data, { base64: true });
                }

                updateLoaderProgress(90);
                loaderMessage.textContent = 'Generating zip package...';

                const content = await zip.generateAsync({ type: 'blob' });
                const downloadUrl = URL.createObjectURL(content);

                const a = document.createElement('a');
                a.href = downloadUrl;
                a.download = `${currentPdfToImgFile.name.replace('.pdf', '')}_images.zip`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(downloadUrl);

                showToast('Images zip package downloaded successfully!', 'success');
                trackAppEvent('convert_pdf_to_images', { format: format, scale: scale });
            } catch (err) {
                console.error(err);
                showToast('Failed to convert PDF pages to images.', 'error');
            } finally {
                hideLoader();
            }
        });
    }


    // ==========================================================================
    // --- 13. IMAGE TEXT EXTRACTOR (OCR) LOGIC ---
    // ==========================================================================
    const ocrFileInput = document.getElementById('ocr-file-input');
    const ocrDropZone = document.getElementById('ocr-drop-zone');
    const ocrPreviewContainer = document.getElementById('ocr-preview-container');
    const ocrFilenameLabel = document.getElementById('ocr-filename-label');
    const ocrPreviewImg = document.getElementById('ocr-preview-img');
    const btnClearOcr = document.getElementById('btn-clear-ocr');
    const btnRunOcr = document.getElementById('btn-run-ocr');
    const btnCopyOcr = document.getElementById('btn-copy-ocr');
    const btnDownloadOcr = document.getElementById('btn-download-ocr');
    const ocrResultText = document.getElementById('ocr-result-text');
    const ocrUploadTrigger = document.querySelector('.btn-ocr-upload-trigger');

    if (ocrUploadTrigger) ocrUploadTrigger.addEventListener('click', () => ocrFileInput.click());
    if (ocrFileInput) ocrFileInput.addEventListener('change', (e) => handleOcrFile(e.target.files[0]));

    if (ocrDropZone) {
        ocrDropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            ocrDropZone.classList.add('dragover');
        });
        ocrDropZone.addEventListener('dragleave', () => {
            ocrDropZone.classList.remove('dragover');
        });
        ocrDropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            ocrDropZone.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) handleOcrFile(e.dataTransfer.files[0]);
        });
    }

    if (btnClearOcr) {
        btnClearOcr.addEventListener('click', () => {
            ocrLoadedFile = null;
            ocrFileInput.value = '';
            ocrPreviewImg.src = '';
            ocrResultText.value = '';
            ocrPreviewContainer.style.display = 'none';
            ocrDropZone.style.display = 'flex';
            btnRunOcr.disabled = true;
            btnCopyOcr.disabled = true;
            btnDownloadOcr.disabled = true;
            showToast('OCR workspace cleared.', 'info');
        });
    }

    async function handleOcrFile(file) {
        if (!file) return;

        showLoader('Loading file', 'Rendering file preview for scanner...');
        ocrResultText.value = '';
        btnCopyOcr.disabled = true;
        btnDownloadOcr.disabled = true;
        
        try {
            ocrFilenameLabel.textContent = `${file.name} (${Math.round(file.size / 1024)} KB)`;
            
            if (file.type === 'application/pdf') {
                const arrayBuffer = await file.arrayBuffer();
                const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
                const pdf = await loadingTask.promise;
                
                // Read page 1 for OCR preview
                const page = await pdf.getPage(1);
                const viewport = page.getViewport({ scale: 1.5 });
                const canvas = document.createElement('canvas');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                const ctx = canvas.getContext('2d');
                await page.render({ canvasContext: ctx, viewport: viewport }).promise;

                const dataUrl = canvas.toDataURL('image/png');
                ocrPreviewImg.src = dataUrl;
                ocrLoadedFile = { type: 'pdf', name: file.name, data: dataUrl };
            } else if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (evt) => {
                    ocrPreviewImg.src = evt.target.result;
                    ocrLoadedFile = { type: 'image', name: file.name, data: evt.target.result };
                };
                reader.readAsDataURL(file);
            } else {
                showToast('Unsupported file type. Upload images or PDF.', 'error');
                hideLoader();
                return;
            }

            ocrDropZone.style.display = 'none';
            ocrPreviewContainer.style.display = 'block';
            btnRunOcr.disabled = false;
            showToast('File loaded. Click Start to extract text.', 'info');
        } catch (err) {
            console.error(err);
            showToast('Failed to load file for OCR.', 'error');
        } finally {
            hideLoader();
        }
    }

    if (btnRunOcr) {
        btnRunOcr.addEventListener('click', async () => {
            if (!ocrLoadedFile) return;

            showLoader('Extracting Text', 'Starting Tesseract OCR engine...');
            ocrResultText.value = 'Preparing local recognition engine...';

            try {
                const language = document.getElementById('ocr-language').value; // eng, spa, fra, deu, chi_sim
                
                // Perform OCR via tesseract CDN library
                const result = await Tesseract.recognize(
                    ocrLoadedFile.data,
                    language,
                    {
                        logger: m => {
                            if (m.status === 'recognizing text') {
                                updateLoaderProgress(Math.round(m.progress * 100));
                                loaderMessage.textContent = `Scanning pixels: ${Math.round(m.progress * 100)}% complete`;
                            }
                        }
                    }
                );

                const extractedText = result.data.text;
                ocrResultText.value = extractedText || 'No clear text detected in the image.';
                
                if (extractedText) {
                    btnCopyOcr.disabled = false;
                    btnDownloadOcr.disabled = false;
                    showToast('Text extracted successfully!', 'success');
                    trackAppEvent('extract_ocr_text', { language: language, char_length: extractedText.length });
                } else {
                    showToast('OCR complete, but no text was found.', 'warning');
                }
            } catch (err) {
                console.error(err);
                ocrResultText.value = 'Text extraction failed. Make sure characters are clear and file is valid.';
                showToast('OCR engine encountered an error.', 'error');
            } finally {
                hideLoader();
            }
        });
    }

    if (btnCopyOcr) {
        btnCopyOcr.addEventListener('click', () => {
            if (!ocrResultText.value) return;
            navigator.clipboard.writeText(ocrResultText.value);
            showToast('Extracted text copied to clipboard!', 'success');
        });
    }

    if (btnDownloadOcr) {
        btnDownloadOcr.addEventListener('click', () => {
            if (!ocrResultText.value) return;
            const blob = new Blob([ocrResultText.value], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = ocrLoadedFile ? `${ocrLoadedFile.name.split('.')[0]}_extracted.txt` : 'extracted_text.txt';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast('Text file downloaded.', 'success');
        });
    }


    // ==========================================================================
    // --- 14. MARKDOWN TO PDF EDITOR LOGIC ---
    // ==========================================================================
    const markdownTextarea = document.getElementById('markdown-textarea');
    const markdownPreviewHtml = document.getElementById('markdown-preview-html');
    const markdownPreviewContainer = document.getElementById('markdown-preview-container');
    const markdownFontSelect = document.getElementById('markdown-font');
    const markdownMarginSelect = document.getElementById('markdown-margin');
    const btnRunMarkdown = document.getElementById('btn-run-markdown');
    const btnCompileMarkdown = document.getElementById('btn-compile-markdown');
    const btnExportMarkdownImg = document.getElementById('btn-export-markdown-img');
    
    // Sample Templates Triggers
    const templateResume = document.getElementById('template-md-resume');
    const templateMemo = document.getElementById('template-md-memo');
    const templateProposal = document.getElementById('template-md-proposal');

    const sampleProposalMD = `# PROPOSAL FOR STUDENT ERP SYSTEM

**Submitted To**  
**Government Medical College, Mirzapur**  

**Submitted By**  
**CYPASSION TECHNOLOGIES PRIVATE LIMITED**  

---

## Company Profile

CYPASSION Technologies Private Limited is a leading Software Development and Digital Transformation company specializing in Educational ERP Solutions, College Management Systems, University Portals, Medical College Automation, Website Development, Mobile Applications, and Institutional Digitalization.

Our mission is to help educational institutions streamline their academic and administrative processes through modern, secure, and scalable technology solutions.

With extensive experience in serving Government Colleges, Medical Colleges, Engineering Colleges, Universities, and Polytechnic Institutes, we have successfully delivered solutions that improve efficiency, transparency, and data management.

---

## Implementation Details

Below is a proposed implementation schedule for the Student ERP System:

| Phase | Description | Duration | Status |
|---|---|---|---|
| Phase 1 | Requirements Analysis & Database Schema Design | 2 Weeks | Completed |
| Phase 2 | Core Modules (Admissions, Fees, Exams) Development | 4 Weeks | In Progress |
| Phase 3 | Portal Integration (Student, Teacher, Parent) | 3 Weeks | Planned |
| Phase 4 | System Testing, Security Auditing, Deployment | 2 Weeks | Planned |

---

*For any queries regarding this proposal, please contact our support desk.*
`;

    const sampleResumeMD = `# JANE SMITH
**Location**: San Francisco, CA | **Email**: jane.smith@example.com | **Phone**: (555) 123-4567

---

## PROFESSIONAL SUMMARY
Results-driven software engineer with 5+ years of experience specializing in frontend web application design, performance tuning, and client-side utilities.

## WORK EXPERIENCE
### **Senior Frontend Engineer** | Pixel Lab (2022 - Present)
- Developed secure, client-side photo and PDF compilers.
- Re-architected rendering engines, increasing image compilation speed by 50%.
- Designed responsive fluid bento grid dashboard layouts.

### **Frontend Developer** | DevCraft Studio (2020 - 2022)
- Built interactive dashboard systems and live editor preview columns.
- Collaborated with design teams to structure customized CSS layouts.

## EDUCATION
### **B.S. in Computer Science** | Stanford University (2016 - 2020)
`;

    const sampleMemoMD = `# MEMORANDUM

**TO:** Release Engineering Team  
**FROM:** Product Lead  
**DATE:** June 25, 2026  
**SUBJECT:** Release of NexEditor Lab Version 1.2  

---

Please be advised that the new suite of local document editors has completed QA verification.

### Key Workspaces Loaded:
1. **PDF Page Organizer** (Split and Merge documents offline)
2. **PDF to Image Converter** (Save pages to PNG/JPEG ZIPs)
3. **Image Text Extractor** (Client-side Tesseract OCR scanner)
4. **Markdown to PDF Editor** (Interactive markup typesetting engine)

All systems have compiled successfully. No security or script regressions detected.

*Thank you for your cooperation.*
`;

    // Initialize markdown editor template on load
    if (markdownTextarea) {
        markdownTextarea.value = sampleMemoMD;
        compileMarkdown();
        
        // Debounce preview update
        let debounceTimer;
        markdownTextarea.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => compileMarkdown(), 150);
        });
    }

    if (markdownFontSelect && markdownPreviewContainer) {
        markdownFontSelect.addEventListener('change', (e) => {
            // Remove previous font classes
            markdownPreviewContainer.classList.remove('font-inter', 'font-playfair', 'font-outfit', 'font-mono');
            markdownPreviewContainer.classList.add(e.target.value);
            compileMarkdown();
        });
    }

    if (markdownMarginSelect && markdownPreviewContainer) {
        markdownMarginSelect.addEventListener('change', (e) => {
            // Remove previous margin classes
            markdownPreviewContainer.classList.remove('margin-small', 'margin-med', 'margin-large');
            markdownPreviewContainer.classList.add(e.target.value);
            compileMarkdown();
        });
    }

    function updateMarkdownPreview() {
        if (!markdownTextarea || !markdownPreviewHtml) return;
        const text = markdownTextarea.value;
        
        try {
            // Use CDN marked.js library to compile markdown to HTML safely
            markdownPreviewHtml.innerHTML = marked.parse(text);
        } catch (err) {
            console.error(err);
            markdownPreviewHtml.innerHTML = `<span class="text-danger">Failed to compile markdown text.</span>`;
        }
    }

    function updateMarkdownStyles() {
        const previewContainer = document.getElementById('markdown-preview-container');
        if (!previewContainer) return;

        // Font Size
        const fontSizeSelect = document.getElementById('markdown-font-size');
        if (fontSizeSelect) {
            previewContainer.style.fontSize = fontSizeSelect.value;
        }

        // Line Spacing
        const lineSpacingSelect = document.getElementById('markdown-line-spacing');
        if (lineSpacingSelect) {
            previewContainer.style.lineHeight = lineSpacingSelect.value;
        }

        // Top Accent Line
        const accentColorSelect = document.getElementById('markdown-accent-color');
        const accentThicknessSelect = document.getElementById('markdown-accent-thickness');
        const topAccentEl = document.getElementById('markdown-top-accent');
        
        let activeAccentColor = '#10b981'; // default emerald
        if (topAccentEl) {
            if (accentColorSelect && accentColorSelect.value !== 'none') {
                activeAccentColor = accentColorSelect.value;
                topAccentEl.style.backgroundColor = activeAccentColor;
                topAccentEl.style.display = 'block';
                if (accentThicknessSelect) {
                    topAccentEl.style.height = accentThicknessSelect.value;
                }
            } else {
                topAccentEl.style.display = 'none';
            }
        }

        // Letterhead Header
        const enableHeaderCheck = document.getElementById('markdown-enable-header');
        const headerBlockEl = document.getElementById('markdown-header-block');
        const headerSettingsGroup = document.getElementById('markdown-header-settings-group');
        
        if (enableHeaderCheck && headerBlockEl) {
            if (enableHeaderCheck.checked) {
                headerBlockEl.style.display = 'block';
                if (headerSettingsGroup) headerSettingsGroup.style.display = 'block';
                
                // Company Name
                const companyNameInput = document.getElementById('markdown-header-name');
                const companyNameEl = document.getElementById('markdown-header-company');
                if (companyNameInput && companyNameEl) {
                    companyNameEl.textContent = companyNameInput.value;
                }
                
                // Company Name Color
                const companyColorSelect = document.getElementById('markdown-header-color');
                if (companyColorSelect && companyNameEl) {
                    if (companyColorSelect.value === 'match') {
                        companyNameEl.style.color = (accentColorSelect && accentColorSelect.value !== 'none') ? activeAccentColor : '#10b981';
                    } else {
                        companyNameEl.style.color = companyColorSelect.value;
                    }
                }
                
                // Info/Details
                const headerDetailsInput = document.getElementById('markdown-header-details');
                const headerInfoEl = document.getElementById('markdown-header-info');
                if (headerDetailsInput && headerInfoEl) {
                    headerInfoEl.textContent = headerDetailsInput.value;
                }
            } else {
                headerBlockEl.style.display = 'none';
                if (headerSettingsGroup) headerSettingsGroup.style.display = 'none';
            }
        }

        // Divider Lines (hr)
        const dividerColorSelect = document.getElementById('markdown-divider-color');
        const dividerThicknessSelect = document.getElementById('markdown-divider-thickness');
        const hrElements = previewContainer.querySelectorAll('#markdown-preview-html hr');
        
        if (hrElements.length > 0) {
            let hrColor = '#e2e8f0'; // default grey
            let hrThickness = '1px'; // default
            
            if (dividerColorSelect && dividerColorSelect.value !== 'default') {
                if (dividerColorSelect.value === 'match') {
                    hrColor = (accentColorSelect && accentColorSelect.value !== 'none') ? activeAccentColor : '#10b981';
                } else {
                    hrColor = dividerColorSelect.value;
                }
            }
            if (dividerThicknessSelect) {
                hrThickness = dividerThicknessSelect.value;
            }
            
            hrElements.forEach(hr => {
                hr.style.border = 'none';
                hr.style.height = hrThickness;
                hr.style.backgroundColor = hrColor;
                hr.style.borderRadius = parseInt(hrThickness) > 2 ? '2px' : '0px';
            });
        }
    }

    function renderPageBreakIndicators() {
        const previewContainer = document.getElementById('markdown-preview-container');
        if (!previewContainer) return;
        
        // Remove existing page-break indicators
        const existingIndicators = previewContainer.querySelectorAll('.page-break-indicator');
        existingIndicators.forEach(el => el.remove());
        
        // Letter format aspect ratio: 11 / 8.5
        const width = previewContainer.offsetWidth || 700;
        const pageHeight = Math.round(width * (11 / 8.5));
        
        const containerHeight = previewContainer.scrollHeight;
        const pagesCount = Math.ceil(containerHeight / pageHeight);
        
        // Render dashed lines at page boundaries
        for (let i = 1; i < pagesCount; i++) {
            const topPos = i * pageHeight;
            const indicator = document.createElement('div');
            indicator.className = 'page-break-indicator';
            indicator.style.position = 'absolute';
            indicator.style.left = '0';
            indicator.style.right = '0';
            indicator.style.top = `${topPos}px`;
            indicator.style.borderTop = '2px dashed #f43f5e';
            indicator.style.zIndex = '10';
            indicator.style.pointerEvents = 'none';
            indicator.style.margin = '0';
            indicator.style.padding = '0';
            
            // Label tag on the right side
            const label = document.createElement('span');
            label.textContent = `Page ${i} / Page ${i + 1} Split`;
            label.style.position = 'absolute';
            label.style.right = '10px';
            label.style.top = '-10px';
            label.style.backgroundColor = '#f43f5e';
            label.style.color = '#ffffff';
            label.style.fontSize = '0.65rem';
            label.style.fontWeight = '700';
            label.style.padding = '2px 6px';
            label.style.borderRadius = '3px';
            label.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
            
            indicator.appendChild(label);
            previewContainer.appendChild(indicator);
        }
    }

    function compileMarkdown(showSuccessToast = false) {
        updateMarkdownPreview();
        updateMarkdownStyles();
        // Give a tiny timeout for DOM rendering, then draw page breaks
        setTimeout(renderPageBreakIndicators, 50);
        
        if (showSuccessToast) {
            showToast('Document compiled successfully!', 'success');
        }
    }

    // Bind styling listeners
    const markdownStyleControls = [
        'markdown-font-size', 'markdown-line-spacing', 'markdown-accent-color', 
        'markdown-accent-thickness', 'markdown-enable-header', 'markdown-header-name', 
        'markdown-header-color', 'markdown-header-details',
        'markdown-divider-color', 'markdown-divider-thickness'
    ];
    markdownStyleControls.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', () => compileMarkdown());
            el.addEventListener('input', () => compileMarkdown());
        }
    });

    window.insertMarkdown = function(prefix, suffix = '') {
        if (!markdownTextarea) return;
        const start = markdownTextarea.selectionStart;
        const end = markdownTextarea.selectionEnd;
        const text = markdownTextarea.value;
        const before = text.substring(0, start);
        const selected = text.substring(start, end);
        const after = text.substring(end);
        
        markdownTextarea.value = before + prefix + selected + suffix + after;
        markdownTextarea.focus();
        markdownTextarea.selectionStart = start + prefix.length;
        markdownTextarea.selectionEnd = start + prefix.length + selected.length;
        
        compileMarkdown();
    };

    if (btnCompileMarkdown) {
        btnCompileMarkdown.addEventListener('click', () => {
            compileMarkdown(true);
        });
    }

    if (templateResume) {
        templateResume.addEventListener('click', () => {
            markdownTextarea.value = sampleResumeMD;
            const enableHeaderCheck = document.getElementById('markdown-enable-header');
            if (enableHeaderCheck) enableHeaderCheck.checked = false;
            compileMarkdown();
            showToast('Resume template loaded.', 'success');
        });
    }

    if (templateMemo) {
        templateMemo.addEventListener('click', () => {
            markdownTextarea.value = sampleMemoMD;
            const enableHeaderCheck = document.getElementById('markdown-enable-header');
            if (enableHeaderCheck) enableHeaderCheck.checked = false;
            compileMarkdown();
            showToast('Business Memo template loaded.', 'success');
        });
    }

    if (templateProposal) {
        templateProposal.addEventListener('click', () => {
            markdownTextarea.value = sampleProposalMD;
            
            // Enable header and set accent
            const enableHeaderCheck = document.getElementById('markdown-enable-header');
            if (enableHeaderCheck) enableHeaderCheck.checked = true;
            
            const accentColorSelect = document.getElementById('markdown-accent-color');
            if (accentColorSelect) accentColorSelect.value = '#10b981';
            
            const accentThicknessSelect = document.getElementById('markdown-accent-thickness');
            if (accentThicknessSelect) accentThicknessSelect.value = '10px';
            
            const companyNameInput = document.getElementById('markdown-header-name');
            if (companyNameInput) companyNameInput.value = 'CyPassion Technologies Private Limited';
            
            const companyColorSelect = document.getElementById('markdown-header-color');
            if (companyColorSelect) companyColorSelect.value = 'match';
            
            const headerDetailsInput = document.getElementById('markdown-header-details');
            if (headerDetailsInput) {
                headerDetailsInput.value = `EC-66, Chandanvan\nMathura 281001\n(91) 9761444113, 8979744113\nGSTIN : 09AALCC5515C1ZT`;
            }
            
            compileMarkdown();
            showToast('Project Proposal template loaded with letterhead.', 'success');
        });
    }

    if (btnRunMarkdown) {
        btnRunMarkdown.addEventListener('click', () => {
            if (!markdownPreviewHtml) return;
            
            showLoader('Printing PDF', 'Formatting and compiling document pages...');
            
            // Set margin specifications based on selected setting
            let paddingInches = 0.5; // Small
            if (markdownPreviewContainer.classList.contains('margin-med')) paddingInches = 0.75;
            if (markdownPreviewContainer.classList.contains('margin-large')) paddingInches = 1.0;

            const markdownFilenameInput = document.getElementById('markdown-filename');
            let filename = markdownFilenameInput ? markdownFilenameInput.value.trim() : 'markdown_document.pdf';
            if (!filename) filename = 'markdown_document.pdf';
            if (!filename.toLowerCase().endsWith('.pdf')) filename += '.pdf';

            const opt = {
                margin: paddingInches,
                filename: filename,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true, letterRendering: true },
                jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
                pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
            };

            // Temporarily hide page break indicators before saving
            const indicators = markdownPreviewContainer.querySelectorAll('.page-break-indicator');
            indicators.forEach(el => el.style.display = 'none');

            // Use html2pdf bundles (already present in page context)
            html2pdf().from(markdownPreviewContainer).set(opt).save()
                .then(() => {
                    // Restore indicators
                    indicators.forEach(el => el.style.display = 'block');
                    showToast('Document printed successfully!', 'success');
                    const mdFontSelect = document.getElementById('markdown-font');
                    const selectedFont = mdFontSelect ? mdFontSelect.value : 'font-inter';
                    trackAppEvent('compile_markdown_pdf', { font: selectedFont });
                })
                .catch(err => {
                    // Restore indicators
                    indicators.forEach(el => el.style.display = 'block');
                    console.error(err);
                    showToast('Failed to compile Markdown PDF.', 'error');
                })
                .finally(() => {
                    hideLoader();
                });
        });
    }

    if (btnExportMarkdownImg) {
        btnExportMarkdownImg.addEventListener('click', () => {
            if (!markdownPreviewHtml) return;

            showLoader('Exporting Page', 'Generating PNG image...');

            // Temporarily hide page break indicators before capturing
            const indicators = markdownPreviewContainer.querySelectorAll('.page-break-indicator');
            indicators.forEach(el => el.style.display = 'none');

            // Set background color to white to ensure the mock paper matches exactly
            const origBackground = markdownPreviewContainer.style.backgroundColor;
            markdownPreviewContainer.style.backgroundColor = '#ffffff';

            const markdownFilenameInput = document.getElementById('markdown-filename');
            let filename = markdownFilenameInput ? markdownFilenameInput.value.trim() : 'markdown_page.png';
            if (!filename) filename = 'markdown_page.png';
            
            // Convert .pdf extension to .png if it exists
            if (filename.toLowerCase().endsWith('.pdf')) {
                filename = filename.substring(0, filename.length - 4) + '.png';
            } else if (!filename.toLowerCase().endsWith('.png')) {
                filename += '.png';
            }

            // We use html2canvas which is bundled inside html2pdf.js context
            const renderCanvas = window.html2canvas || (window.html2pdf ? window.html2pdf.html2canvas : null);

            if (!renderCanvas) {
                showToast('Renderer engine not loaded. Please try again.', 'error');
                indicators.forEach(el => el.style.display = 'block');
                markdownPreviewContainer.style.backgroundColor = origBackground;
                hideLoader();
                return;
            }

            renderCanvas(markdownPreviewContainer, {
                scale: 2, // 2x scale for crisp text resolution
                useCORS: true,
                backgroundColor: '#ffffff',
                logging: false
            }).then(canvas => {
                const imgData = canvas.toDataURL('image/png');

                const a = document.createElement('a');
                a.href = imgData;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);

                // Restore styles and indicators
                indicators.forEach(el => el.style.display = 'block');
                markdownPreviewContainer.style.backgroundColor = origBackground;
                
                hideLoader();
                showToast('Page saved as PNG image successfully!', 'success');
                trackAppEvent('export_markdown_image');
            }).catch(err => {
                console.error(err);
                indicators.forEach(el => el.style.display = 'block');
                markdownPreviewContainer.style.backgroundColor = origBackground;
                hideLoader();
                showToast('Failed to save page as image.', 'error');
            });
        });
    }

    // ==========================================================================
    // --- 13. PDF MERGER WORKSPACE LOGIC ---
    // ==========================================================================
    const mergeFileInput = document.getElementById('merge-file-input');
    const mergeDropZone = document.getElementById('merge-drop-zone');
    const mergeManager = document.getElementById('merge-manager');
    const mergeList = document.getElementById('merge-list');
    const mergeFilesCount = document.getElementById('merge-files-count');
    const btnClearMerge = document.getElementById('btn-clear-merge');
    const btnRunMerge = document.getElementById('btn-run-merge');
    const mergeUploadTriggerBtns = document.querySelectorAll('.btn-merge-upload-trigger');
    const mergeFilenameInput = document.getElementById('merge-filename');

    if (mergeUploadTriggerBtns) {
        mergeUploadTriggerBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (mergeFileInput) mergeFileInput.click();
            });
        });
    }

    if (mergeFileInput) {
        mergeFileInput.addEventListener('change', (e) => {
            handleMergeFiles(e.target.files);
        });
    }

    if (mergeDropZone) {
        mergeDropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            mergeDropZone.classList.add('dragover');
        });
        mergeDropZone.addEventListener('dragleave', () => {
            mergeDropZone.classList.remove('dragover');
        });
        mergeDropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            mergeDropZone.classList.remove('dragover');
            handleMergeFiles(e.dataTransfer.files);
        });
    }

    if (btnClearMerge) {
        btnClearMerge.addEventListener('click', () => {
            mergeQueue = [];
            if (mergeSortable) {
                mergeSortable.destroy();
                mergeSortable = null;
            }
            if (mergeList) mergeList.innerHTML = '';
            if (mergeManager) mergeManager.style.display = 'none';
            if (mergeDropZone) mergeDropZone.style.display = 'flex';
            if (btnRunMerge) btnRunMerge.disabled = true;
            if (mergeFileInput) mergeFileInput.value = '';
            showToast('Merge queue cleared.', 'info');
        });
    }

    async function handleMergeFiles(files) {
        const pdfFiles = Array.from(files).filter(f => f.type === 'application/pdf');
        if (pdfFiles.length === 0) {
            showToast('Please upload valid PDF files.', 'error');
            return;
        }

        let addedCount = 0;
        let limitReached = false;

        showLoader('Loading PDFs', 'Reading document metadata...');
        
        for (let i = 0; i < pdfFiles.length; i++) {
            if (mergeQueue.length >= 20) {
                limitReached = true;
                break;
            }
            
            const file = pdfFiles[i];
            const id = 'merge-file-' + Date.now() + '-' + Math.round(Math.random() * 1000);
            
            try {
                const arrayBuffer = await file.arrayBuffer();
                
                // Get page count using PDFLib
                const doc = await PDFLib.PDFDocument.load(arrayBuffer);
                const pageCount = doc.getPageCount();
                const fileSizeStr = (file.size / (1024 * 1024)).toFixed(2) + ' MB';
                
                mergeQueue.push({
                    id: id,
                    name: file.name,
                    size: fileSizeStr,
                    pages: pageCount,
                    arrayBuffer: arrayBuffer
                });
                
                addedCount++;
            } catch (err) {
                console.error(err);
                showToast(`Failed to load ${file.name}`, 'error');
            }
        }

        hideLoader();
        
        if (addedCount > 0) {
            showToast(`Added ${addedCount} PDF file(s) to merge list.`, 'success');
        }
        
        if (limitReached) {
            showToast('Maximum limit of 20 PDF files reached. Excess files skipped.', 'warning');
        }

        if (mergeFileInput) mergeFileInput.value = '';
        renderMergeList();
    }

    function renderMergeList() {
        if (!mergeList) return;
        mergeList.innerHTML = '';
        
        if (mergeQueue.length === 0) {
            if (mergeManager) mergeManager.style.display = 'none';
            if (mergeDropZone) mergeDropZone.style.display = 'flex';
            if (btnRunMerge) btnRunMerge.disabled = true;
            return;
        }

        if (mergeDropZone) mergeDropZone.style.display = 'none';
        if (mergeManager) mergeManager.style.display = 'block';
        if (btnRunMerge) btnRunMerge.disabled = mergeQueue.length < 2;

        if (mergeFilesCount) {
            mergeFilesCount.textContent = `${mergeQueue.length} ${mergeQueue.length === 1 ? 'File' : 'Files'} Loaded (Max 20)`;
        }

        mergeQueue.forEach((file, idx) => {
            const card = document.createElement('div');
            card.className = 'merge-file-card';
            card.setAttribute('data-id', file.id);

            card.innerHTML = `
                <div class="drag-handle" title="Drag to reorder">
                    <i data-lucide="grip-vertical"></i>
                </div>
                <div class="file-badge">${idx + 1}</div>
                <div class="file-icon">
                    <i data-lucide="file-text"></i>
                </div>
                <div class="file-info">
                    <div class="file-name" title="${file.name}">${file.name}</div>
                    <div class="file-meta">
                        <span>${file.size}</span>
                        <div class="file-meta-dot"></div>
                        <span>${file.pages} ${file.pages === 1 ? 'page' : 'pages'}</span>
                    </div>
                </div>
                <button class="btn-delete-file" title="Remove file">
                    <i data-lucide="trash-2"></i>
                </button>
            `;

            // Attach delete handler
            card.querySelector('.btn-delete-file').addEventListener('click', (e) => {
                e.stopPropagation();
                mergeQueue = mergeQueue.filter(f => f.id !== file.id);
                renderMergeList();
                showToast('File removed from merge queue.', 'info');
            });

            mergeList.appendChild(card);
        });

        lucide.createIcons();

        // Setup SortableJS for drag-and-drop reordering of files
        if (mergeSortable) {
            mergeSortable.destroy();
        }

        mergeSortable = new Sortable(mergeList, {
            animation: 200,
            handle: '.drag-handle',
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            onEnd: () => {
                // Sync queue array with new DOM order
                const reordered = [];
                const cards = mergeList.querySelectorAll('.merge-file-card');
                cards.forEach((card, newIdx) => {
                    const id = card.getAttribute('data-id');
                    const fileObj = mergeQueue.find(f => f.id === id);
                    if (fileObj) reordered.push(fileObj);
                    
                    // Update index badges in DOM directly
                    card.querySelector('.file-badge').textContent = newIdx + 1;
                });
                mergeQueue = reordered;
            }
        });
    }

    if (btnRunMerge) {
        btnRunMerge.addEventListener('click', async () => {
            if (mergeQueue.length < 2) {
                showToast('Please add at least 2 PDF files to merge.', 'error');
                return;
            }

            let filename = mergeFilenameInput ? mergeFilenameInput.value.trim() : 'merged_document.pdf';
            if (!filename) filename = 'merged_document.pdf';
            if (!filename.toLowerCase().endsWith('.pdf')) filename += '.pdf';

            showLoader('Merging PDFs', 'Initializing compilation...');
            
            try {
                // Create output PDF
                const mergedPdf = await PDFLib.PDFDocument.create();
                
                for (let i = 0; i < mergeQueue.length; i++) {
                    const file = mergeQueue[i];
                    updateLoaderProgress(Math.round((i / mergeQueue.length) * 100));
                    loaderMessage.textContent = `Merging file ${i + 1} of ${mergeQueue.length}: ${file.name}`;
                    
                    // Load the document bytes
                    const doc = await PDFLib.PDFDocument.load(file.arrayBuffer);
                    
                    // Copy all pages
                    const pagesToCopy = Array.from({ length: doc.getPageCount() }, (_, index) => index);
                    const copiedPages = await mergedPdf.copyPages(doc, pagesToCopy);
                    
                    // Append pages to target doc
                    copiedPages.forEach(page => {
                        mergedPdf.addPage(page);
                    });
                }
                
                updateLoaderProgress(95);
                loaderMessage.textContent = 'Saving merged document...';
                await new Promise(r => setTimeout(r, 100)); // micro-sleep for progress animation
                
                const finalBytes = await mergedPdf.save();
                const blob = new Blob([finalBytes], { type: 'application/pdf' });
                const downloadUrl = URL.createObjectURL(blob);
                
                const a = document.createElement('a');
                a.href = downloadUrl;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(downloadUrl);
                
                updateLoaderProgress(100);
                showToast('PDFs merged successfully!', 'success');
                trackAppEvent('merge_pdfs', { totalFiles: mergeQueue.length });
            } catch (err) {
                console.error(err);
                showToast('Failed to merge PDF files.', 'error');
            } finally {
                hideLoader();
            }
        });
    }

    // License Modal Event Listeners
    const licenseModal = document.getElementById('license-modal');
    const licenseTextContent = document.getElementById('license-text-content');
    const viewLicenseBtn = document.getElementById('view-license-btn');
    const viewLicenseBtnMobile = document.getElementById('view-license-btn-mobile');
    const closeLicenseBtn = document.getElementById('close-license-btn');
    const btnCloseLicenseBottom = document.getElementById('btn-close-license-bottom');

    const LICENSE_TEXT = `Copyright (c) 2026 Yash Pathak. All rights reserved.

Project: NexEditor Lab (Premium PDF & Photo Workspace)
Author: Yash Pathak

All rights to this software, including the source code, design assets, and compiled assets, are sole property of the author.

Permission is hereby granted to use, copy, modify, and merge this code solely for private and educational use by the author or designated clients of Yash Pathak.

Unauthorized public distribution, commercial resale, or hosting of this software as a paid service without explicit written permission from the author is strictly prohibited.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHOR OR COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;

    function openLicenseModal(e) {
        if (e) e.preventDefault();
        if (licenseTextContent) {
            licenseTextContent.textContent = LICENSE_TEXT;
        }
        if (licenseModal) {
            licenseModal.classList.add('active');
        }
    }

    function closeLicenseModal(e) {
        if (e) e.preventDefault();
        if (licenseModal) {
            licenseModal.classList.remove('active');
        }
    }

    if (viewLicenseBtn) {
        viewLicenseBtn.addEventListener('click', openLicenseModal);
    }
    if (viewLicenseBtnMobile) {
        viewLicenseBtnMobile.addEventListener('click', openLicenseModal);
    }
    if (closeLicenseBtn) {
        closeLicenseBtn.addEventListener('click', closeLicenseModal);
    }
    if (btnCloseLicenseBottom) {
        btnCloseLicenseBottom.addEventListener('click', closeLicenseModal);
    }

    // Initialize themes
    initTheme();

    // Check initial view from hash
    const initialHash = window.location.hash.replace('#', '');
    if (initialHash) {
        switchView(initialHash, false);
    } else {
        switchView('dashboard-view', false);
    }

    // Auto-update editor contents to check initial layout
    lucide.createIcons();
