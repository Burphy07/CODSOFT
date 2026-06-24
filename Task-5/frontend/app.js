// Configuration & Globals
const API_BASE = `${window.location.protocol}//${window.location.host}`;
const WS_BASE = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;

let activeTab = 'tab-detect';
let registeredFaces = {};

// Webcam States
let webcamStream = null;
let ws = null;
let streamActive = false;
let isProcessingFrame = false;
let lastFrameTime = performance.now();
let fpsInterval = null;
let currentFps = 0;

// Canvas Drawing Variables
const landmarkColors = [
    '#38bdf8', // Right eye (cyan)
    '#38bdf8', // Left eye (cyan)
    '#c084fc', // Nose tip (purple)
    '#f43f5e', // Right mouth (red)
    '#f43f5e'  // Left mouth (red)
];

document.addEventListener("DOMContentLoaded", () => {
    // Initialize Lucide Icons
    lucide.createIcons();

    // Tab Navigation
    initTabs();

    // Setup Server Healthcheck & Database lists
    checkServerStatus();

    // Setup File Upload Drop Zones
    initUploadZone('detect-upload-zone', 'detect-file-input', handleDetectUpload);
    initUploadZone('recognize-upload-zone', 'recognize-file-input', handleRecognizeUpload);
    initUploadZone('register-upload-zone', 'register-file-input', handleRegisterPreview);

    // Form Submissions
    document.getElementById('register-form').addEventListener('submit', handleRegisterSubmit);
    document.getElementById('btn-clear-register-img').addEventListener('click', clearRegisterImage);

    // Setup Webcam Controls
    document.getElementById('btn-webcam-toggle').addEventListener('click', toggleWebcam);

    // Slider value binding
    bindSlider('detect-confidence', 'detect-conf-val', '%');
    bindSlider('recognize-threshold', 'recognize-thresh-val', '', (val) => (val / 100).toFixed(2));
});

// Toast System
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'info';
    if (type === 'success') icon = 'check-circle';
    if (type === 'error') icon = 'alert-triangle';

    toast.innerHTML = `
        <i data-lucide="${icon}"></i>
        <span>${message}</span>
    `;
    container.appendChild(toast);
    lucide.createIcons({ attrs: { class: 'toast-icon' } });

    // Remove after 4 seconds
    setTimeout(() => {
        toast.style.animation = 'slideInRight 0.3s cubic-bezier(0.25, 0.8, 0.25, 1) reverse forwards';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// Server Health check & Status Check
async function checkServerStatus() {
    const statusDot = document.getElementById('server-status-dot');
    const statusText = document.getElementById('server-status-text');

    try {
        const response = await fetch(`${API_BASE}/api/registered-faces`);
        if (response.ok) {
            const data = await response.json();
            statusDot.className = 'status-dot online';
            statusText.innerText = 'Online';
            updateRegisteredFacesList(data.faces);
        } else {
            statusDot.className = 'status-dot offline';
            statusText.innerText = 'Error';
            showToast('Server returned an error status.', 'error');
        }
    } catch (err) {
        statusDot.className = 'status-dot offline';
        statusText.innerText = 'Offline';
        showToast('Cannot connect to backend server. Make sure the server is running.', 'error');
    }
}

// Bind Slider Inputs
function bindSlider(sliderId, displayId, suffix = '', valMapper = (val) => val) {
    const slider = document.getElementById(sliderId);
    const display = document.getElementById(displayId);
    
    slider.addEventListener('input', (e) => {
        display.innerText = valMapper(e.target.value) + suffix;
    });
}

// Tab Switching
function initTabs() {
    const navButtons = document.querySelectorAll('.nav-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');
            
            // If leaving webcam tab, stop stream
            if (activeTab === 'tab-webcam' && tabId !== 'tab-webcam') {
                stopWebcamStream();
            }

            navButtons.forEach(b => b.classList.remove('active'));
            tabContents.forEach(tc => tc.classList.remove('active'));

            btn.classList.add('active');
            document.getElementById(tabId).classList.add('active');
            activeTab = tabId;
        });
    });
}

// Upload Area Handlers
function initUploadZone(zoneId, inputId, onFileSelect) {
    const zone = document.getElementById(zoneId);
    const input = document.getElementById(inputId);

    zone.addEventListener('click', () => input.click());

    zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('dragover');
    });

    ['dragleave', 'drop'].forEach(eventName => {
        zone.addEventListener(eventName, () => zone.classList.remove('dragover'));
    });

    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        if (e.dataTransfer.files.length) {
            input.files = e.dataTransfer.files;
            onFileSelect(e.dataTransfer.files[0]);
        }
    });

    input.addEventListener('change', () => {
        if (input.files.length) {
            onFileSelect(input.files[0]);
        }
    });
}

// DRAWING OVERLAYS ON CANVAS
function drawImageAndOverlays(canvasId, placeholderId, imageFile, faces, drawLabels = false) {
    const canvas = document.getElementById(canvasId);
    const placeholder = document.getElementById(placeholderId);
    const ctx = canvas.getContext('2d');
    
    const img = new Image();
    img.onload = () => {
        placeholder.classList.add('hidden');
        canvas.classList.remove('hidden');

        // Set dimensions
        canvas.width = img.width;
        canvas.height = img.height;
        
        // Draw original image
        ctx.drawImage(img, 0, 0);

        // Draw faces overlays
        faces.forEach((face, index) => {
            const [x, y, w, h] = face.bbox;
            
            // Pick Box Color
            let boxColor = '#00f2fe'; // Default neon cyan
            if (drawLabels) {
                boxColor = face.name === 'Unknown' ? '#ef4444' : '#10b981'; // Red or Green
            }

            // Draw bounding box corners (Futuristic brackets style)
            ctx.strokeStyle = boxColor;
            ctx.lineWidth = Math.max(3, Math.round(canvas.width / 250));
            
            // Draw bracket corners
            const len = Math.max(10, Math.round(w * 0.15));
            // Top Left
            ctx.beginPath();
            ctx.moveTo(x, y + len); ctx.lineTo(x, y); ctx.lineTo(x + len, y);
            ctx.stroke();
            // Top Right
            ctx.beginPath();
            ctx.moveTo(x + w - len, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + len);
            ctx.stroke();
            // Bottom Left
            ctx.beginPath();
            ctx.moveTo(x, y + h - len); ctx.lineTo(x, y + h); ctx.lineTo(x + len, y + h);
            ctx.stroke();
            // Bottom Right
            ctx.beginPath();
            ctx.moveTo(x + w - len, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + h - len);
            ctx.stroke();

            // Draw semi-transparent background fill on hover/detect
            ctx.fillStyle = boxColor + '10'; // 10% opacity
            ctx.fillRect(x, y, w, h);

            // Draw facial landmarks (eyes, nose, mouth corners)
            if (face.landmarks) {
                face.landmarks.forEach((pt, ptIdx) => {
                    ctx.beginPath();
                    ctx.arc(pt[0], pt[1], Math.max(3, Math.round(canvas.width / 180)), 0, 2 * Math.PI);
                    ctx.fillStyle = landmarkColors[ptIdx];
                    ctx.shadowColor = landmarkColors[ptIdx];
                    ctx.shadowBlur = 10;
                    ctx.fill();
                    ctx.shadowBlur = 0; // Reset shadow
                });
            }

            // Draw text labels
            if (drawLabels) {
                const label = `${face.name} (${Math.round((face.similarity || face.confidence) * 100)}%)`;
                const fontSize = Math.max(12, Math.round(canvas.width / 40));
                ctx.font = `600 ${fontSize}px var(--font-outfit)`;
                
                const textWidth = ctx.measureText(label).width;
                const padX = 8;
                const padY = 6;
                
                // Draw Label Background
                ctx.fillStyle = boxColor;
                ctx.fillRect(x, y - fontSize - padY * 2, textWidth + padX * 2, fontSize + padY * 2);
                
                // Draw Text
                ctx.fillStyle = '#060913';
                ctx.fillText(label, x + padX, y - padY);
            }
        });
    };
    img.src = URL.createObjectURL(imageFile);
}

// 1. FACE DETECTION FLOW
async function handleDetectUpload(file) {
    const confVal = document.getElementById('detect-confidence').value / 100;
    
    // Show Loading
    showToast('Detecting faces...', 'info');

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch(`${API_BASE}/api/detect?min_confidence=${confVal}`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) throw new Error('API server returned error.');

        const data = await response.json();
        
        if (data.success) {
            // Render canvas
            drawImageAndOverlays('detect-canvas', 'detect-placeholder', file, data.faces, false);
            
            // Populate meta details
            document.getElementById('detect-meta').classList.remove('hidden');
            document.getElementById('detect-count').innerText = data.faces.length;
            document.getElementById('detect-resolution').innerText = `${data.width} x ${data.height}`;
            showToast(`Found ${data.faces.length} face(s).`, 'success');
        } else {
            showToast('Face detection failed.', 'error');
        }
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// 2. FACE RECOGNITION FLOW
async function handleRecognizeUpload(file) {
    const confSlider = document.getElementById('recognize-threshold').value;
    const threshVal = (confSlider / 100).toFixed(2);
    
    showToast('Running facial recognition...', 'info');

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch(`${API_BASE}/api/recognize?match_threshold=${threshVal}`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) throw new Error('API server returned error.');

        const data = await response.json();
        
        if (data.success) {
            drawImageAndOverlays('recognize-canvas', 'recognize-placeholder', file, data.faces, true);
            
            // Populate results meta list
            const metaContainer = document.getElementById('recognize-meta');
            const listContainer = document.getElementById('recognize-matches-list');
            listContainer.innerHTML = '';
            metaContainer.classList.remove('hidden');

            if (data.faces.length === 0) {
                listContainer.innerHTML = '<div class="match-item"><span class="match-name">No faces detected.</span></div>';
            } else {
                data.faces.forEach((face, idx) => {
                    const isKnown = face.name !== 'Unknown';
                    const icon = isKnown ? 'check-circle-2' : 'alert-circle';
                    const badgeClass = isKnown ? 'match-score' : 'match-score unknown';
                    
                    listContainer.innerHTML += `
                        <div class="match-item">
                            <span class="match-name">
                                <i data-lucide="${icon}" style="color: ${isKnown ? '#10b981' : '#ef4444'}; width: 16px; height: 16px;"></i>
                                Face #${idx + 1}: ${face.name}
                            </span>
                            <span class="${badgeClass}">
                                Cos: ${(face.similarity).toFixed(3)}
                            </span>
                        </div>
                    `;
                });
                lucide.createIcons();
            }
            showToast('Facial recognition complete.', 'success');
        }
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// 3. FACE REGISTRATION FLOW
function handleRegisterPreview(file) {
    const zone = document.getElementById('register-upload-zone');
    const previewContainer = document.getElementById('register-preview-container');
    const previewImg = document.getElementById('register-preview-img');

    zone.classList.add('hidden');
    previewContainer.classList.remove('hidden');
    previewImg.src = URL.createObjectURL(file);
}

function clearRegisterImage() {
    const zone = document.getElementById('register-upload-zone');
    const previewContainer = document.getElementById('register-preview-container');
    const input = document.getElementById('register-file-input');

    input.value = '';
    previewContainer.classList.add('hidden');
    zone.classList.remove('hidden');
}

async function handleRegisterSubmit(e) {
    e.preventDefault();
    const nameInput = document.getElementById('register-name');
    const fileInput = document.getElementById('register-file-input');

    if (!fileInput.files.length) {
        showToast('Please select a photo.', 'error');
        return;
    }

    const name = nameInput.value.trim();
    const file = fileInput.files[0];

    showToast(`Registering template for ${name}...`, 'info');
    document.getElementById('btn-register-submit').disabled = true;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', name);

    try {
        const response = await fetch(`${API_BASE}/api/register`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        
        if (response.ok && data.success) {
            showToast(data.message, 'success');
            
            // Reset form
            nameInput.value = '';
            clearRegisterImage();
            
            // Reload DB list
            checkServerStatus();
        } else {
            showToast(data.detail || 'Registration failed.', 'error');
        }
    } catch (err) {
        showToast('Failed to connect to server during registration.', 'error');
    } finally {
        document.getElementById('btn-register-submit').disabled = false;
    }
}

// 4. DATABASE LIST MANAGEMENT
function updateRegisteredFacesList(faces) {
    registeredFaces = faces;
    
    // Update DB counts header
    const totalTemplates = Object.values(faces).reduce((a, b) => a + b, 0);
    document.getElementById('db-count-text').innerText = `${totalTemplates} templates (${Object.keys(faces).length} identities)`;

    const tbody = document.getElementById('db-list-body');
    tbody.innerHTML = '';

    const keys = Object.keys(faces);
    if (keys.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="empty-table">No face profiles registered yet.</td></tr>';
        return;
    }

    keys.forEach(name => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${name}</strong></td>
            <td><span class="highlight-text">${faces[name]} sample(s)</span></td>
            <td>
                <button class="btn-icon btn-danger btn-delete-identity" data-name="${name}">
                    <i data-lucide="trash-2"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    lucide.createIcons();

    // Hook delete buttons
    document.querySelectorAll('.btn-delete-identity').forEach(btn => {
        btn.addEventListener('click', async () => {
            const name = btn.getAttribute('data-name');
            if (confirm(`Are you sure you want to delete all face profiles for "${name}"?`)) {
                await deleteIdentity(name);
            }
        });
    });
}

async function deleteIdentity(name) {
    try {
        const response = await fetch(`${API_BASE}/api/registered-faces/${encodeURIComponent(name)}`, {
            method: 'DELETE'
        });
        const data = await response.json();
        if (response.ok && data.success) {
            showToast(data.message, 'success');
            checkServerStatus(); // Refresh table
        } else {
            showToast(data.detail || 'Delete failed.', 'error');
        }
    } catch (err) {
        showToast('Network error during deletion.', 'error');
    }
}

// 5. WEBCAM WS STREAM CONTROLLER
const webcamVideo = document.getElementById('webcam-video');
const webcamCanvas = document.getElementById('webcam-canvas');
const webcamCtx = webcamCanvas.getContext('2d');
const webcamPlaceholder = document.getElementById('webcam-placeholder');
const webcamToggleBtn = document.getElementById('btn-webcam-toggle');

// Create a hidden offscreen canvas to scale and capture frames
const hiddenCanvas = document.createElement('canvas');
const hiddenCtx = hiddenCanvas.getContext('2d');
hiddenCanvas.width = 480;  // Scale down for network transmission optimization
hiddenCanvas.height = 360;

function toggleWebcam() {
    if (streamActive) {
        stopWebcamStream();
    } else {
        startWebcamStream();
    }
}

async function startWebcamStream() {
    webcamToggleBtn.disabled = true;
    showToast('Initializing camera...', 'info');

    try {
        webcamStream = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480, frameRate: { ideal: 30 } }
        });
        
        webcamVideo.srcObject = webcamStream;
        
        // Hide placeholder and show canvas
        webcamPlaceholder.classList.add('hidden');
        webcamCanvas.classList.remove('hidden');
        
        // Wait for video load
        webcamVideo.onloadedmetadata = () => {
            webcamCanvas.width = webcamVideo.videoWidth;
            webcamCanvas.height = webcamVideo.videoHeight;
            
            // Connect WebSocket
            connectWebSocket();
        };

    } catch (err) {
        console.error(err);
        showToast('Failed to access webcam. Please verify camera permissions.', 'error');
        webcamToggleBtn.disabled = false;
    }
}

function stopWebcamStream() {
    streamActive = false;
    
    // Clear intervals
    if (fpsInterval) clearInterval(fpsInterval);
    document.getElementById('webcam-fps').classList.add('hidden');

    // Close WS
    if (ws) {
        ws.close();
        ws = null;
    }

    // Stop Camera Tracks
    if (webcamStream) {
        webcamStream.getTracks().forEach(track => track.stop());
        webcamStream = null;
    }

    webcamVideo.srcObject = null;
    isProcessingFrame = false;

    // Reset Buttons
    webcamToggleBtn.className = 'btn-primary btn-success';
    webcamToggleBtn.innerHTML = '<i data-lucide="play"></i><span>Start Webcam Stream</span>';
    webcamToggleBtn.disabled = false;

    // Clear Canvas and show placeholder
    webcamCtx.clearRect(0, 0, webcamCanvas.width, webcamCanvas.height);
    webcamCanvas.classList.add('hidden');
    webcamPlaceholder.classList.remove('hidden');

    lucide.createIcons();
    showToast('Webcam stream stopped.', 'info');
}

function connectWebSocket() {
    const wsUrl = `${WS_BASE}/ws/stream`;
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        streamActive = true;
        isProcessingFrame = false;
        
        // Update Buttons
        webcamToggleBtn.className = 'btn-primary btn-danger';
        webcamToggleBtn.innerHTML = '<i data-lucide="square"></i><span>Stop Webcam Stream</span>';
        webcamToggleBtn.disabled = false;
        lucide.createIcons();
        
        // Clear log
        const log = document.getElementById('webcam-log');
        log.innerHTML = '';
        
        // Setup FPS Monitor
        document.getElementById('webcam-fps').classList.remove('hidden');
        setupFpsCounter();

        showToast('WebSocket connection established. Starting analysis...', 'success');
        
        // Begin Frame Capture Loop
        sendNextFrame();
    };

    ws.onmessage = (event) => {
        isProcessingFrame = false;
        
        try {
            const data = JSON.parse(event.data);
            
            // Draw current camera frame & overlay detection boundaries
            drawWebcamOverlays(data.faces);
            
            // Log matching faces in sidebar
            logDetectedFaces(data.faces);
        } catch (err) {
            console.error('WS Message parsing error', err);
        }
        
        // Pace frame rate
        if (streamActive) {
            requestAnimationFrame(sendNextFrame);
        }
    };

    ws.onclose = () => {
        if (streamActive) {
            showToast('WebSocket connection lost.', 'error');
            stopWebcamStream();
        }
    };

    ws.onerror = (err) => {
        console.error(err);
        showToast('WebSocket error encountered.', 'error');
    };
}

function sendNextFrame() {
    if (!streamActive || !ws || ws.readyState !== WebSocket.OPEN) return;
    if (isProcessingFrame) return; // Prevent network overlap congestion

    // Render current frame to offscreen scaling canvas
    hiddenCtx.drawImage(webcamVideo, 0, 0, hiddenCanvas.width, hiddenCanvas.height);
    
    isProcessingFrame = true;
    hiddenCanvas.toBlob((blob) => {
        if (blob && streamActive && ws && ws.readyState === WebSocket.OPEN) {
            ws.send(blob);
            
            // FPS calculation
            const now = performance.now();
            currentFps = Math.round(1000 / (now - lastFrameTime));
            lastFrameTime = now;
        } else {
            isProcessingFrame = false;
        }
    }, 'image/jpeg', 0.6); // Stream raw frame at 60% quality compression
}

function drawWebcamOverlays(faces) {
    if (!streamActive) return;

    // Draw the latest video frame to user-facing display canvas
    webcamCtx.drawImage(webcamVideo, 0, 0, webcamCanvas.width, webcamCanvas.height);

    const drawLandmarksEnabled = document.getElementById('webcam-draw-landmarks').checked;
    if (!drawLandmarksEnabled) return;

    // Scale factors: hidden Canvas is 480x360, displaying on webcamCanvas (e.g. 640x480 or 1280x720)
    const scaleX = webcamCanvas.width / hiddenCanvas.width;
    const scaleY = webcamCanvas.height / hiddenCanvas.height;

    faces.forEach((face, idx) => {
        const x = face.bbox[0] * scaleX;
        const y = face.bbox[1] * scaleY;
        const w = face.bbox[2] * scaleX;
        const h = face.bbox[3] * scaleY;
        const isKnown = face.name !== 'Unknown';
        const color = isKnown ? '#10b981' : '#ef4444'; // Green or Red
        
        // Draw brackets bounding box
        webcamCtx.strokeStyle = color;
        webcamCtx.lineWidth = 3;
        const len = Math.max(8, Math.round(w * 0.15));
        
        webcamCtx.beginPath();
        webcamCtx.moveTo(x, y + len); webcamCtx.lineTo(x, y); webcamCtx.lineTo(x + len, y);
        webcamCtx.stroke();
        
        webcamCtx.beginPath();
        webcamCtx.moveTo(x + w - len, y); webcamCtx.lineTo(x + w, y); webcamCtx.lineTo(x + w, y + len);
        webcamCtx.stroke();
        
        webcamCtx.beginPath();
        webcamCtx.moveTo(x, y + h - len); webcamCtx.lineTo(x, y + h); webcamCtx.lineTo(x + len, y + h);
        webcamCtx.stroke();
        
        webcamCtx.beginPath();
        webcamCtx.moveTo(x + w - len, y + h); webcamCtx.lineTo(x + w, y + h); webcamCtx.lineTo(x + w, y + h - len);
        webcamCtx.stroke();

        // Soft gradient tint
        webcamCtx.fillStyle = color + '0B'; // 4% opacity
        webcamCtx.fillRect(x, y, w, h);

        // Draw landmarks
        if (face.landmarks) {
            face.landmarks.forEach((pt, ptIdx) => {
                const ptX = pt[0] * scaleX;
                const ptY = pt[1] * scaleY;
                webcamCtx.beginPath();
                webcamCtx.arc(ptX, ptY, 4, 0, 2 * Math.PI);
                webcamCtx.fillStyle = landmarkColors[ptIdx];
                webcamCtx.fill();
            });
        }

        // Draw text bar overlay
        const label = `${face.name} [${Math.round((face.similarity || face.confidence) * 100)}%]`;
        webcamCtx.font = '600 13px var(--font-outfit)';
        const textWidth = webcamCtx.measureText(label).width;
        
        webcamCtx.fillStyle = color;
        webcamCtx.fillRect(x, y - 24, textWidth + 12, 24);
        
        webcamCtx.fillStyle = '#060913';
        webcamCtx.fillText(label, x + 6, y - 8);
    });
}

// Side detection event logging helper
let loggedIdentities = {}; // Prevent excessive logs spamming
function logDetectedFaces(faces) {
    const log = document.getElementById('webcam-log');
    if (faces.length === 0) return;

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    faces.forEach(face => {
        const name = face.name;
        const score = face.similarity || face.confidence;
        
        // Log if identity has not been seen in last 5 seconds to keep log clean
        const lastSeen = loggedIdentities[name];
        if (!lastSeen || (now.getTime() - lastSeen) > 5000) {
            loggedIdentities[name] = now.getTime();

            // Create log entry
            const isKnown = name !== 'Unknown';
            const item = document.createElement('div');
            item.className = `log-item ${isKnown ? '' : 'unknown'}`;
            item.innerHTML = `
                <span><strong>${name}</strong> recognized (${Math.round(score * 100)}%)</span>
                <span class="log-time">${timeStr}</span>
            `;

            // Prep container
            const placeholder = log.querySelector('.log-placeholder');
            if (placeholder) placeholder.remove();

            // Insert on top
            log.insertBefore(item, log.firstChild);

            // Cap logs at 10 items
            if (log.children.length > 10) {
                log.removeChild(log.lastChild);
            }
        }
    });
}

function setupFpsCounter() {
    const display = document.getElementById('webcam-fps');
    fpsInterval = setInterval(() => {
        if (streamActive) {
            display.innerText = `${currentFps} FPS`;
        }
    }, 1000);
}
