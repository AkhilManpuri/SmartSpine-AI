/**
 * posture.js
 * Handles Live Video Feed, Start/Stop Detection API, and polling Live Stats
 */

let _pollingTimer = null;
let _cameraRunning = false;
let sessionActive = false;
let captureTimer = null;
let localStream = null;

// UI Elements (from index.html #view-monitor)
const liveVideo = document.getElementById('liveVideo');
const idlePrompt = document.getElementById('idleVideoPrompt');
const btnStart = document.getElementById('btnStartDetect');
const btnStop = document.getElementById('btnStopDetect');
const badgeStatus = document.getElementById('monitorStatus');
const liveStatusBadge = document.getElementById('liveStatusBadge');

const dsStatus = document.getElementById('curPostureStatus');
const dsGood = document.getElementById('curGoodTime');
const dsBad = document.getElementById('curBadTime');
const dsScore = document.getElementById('curScore');

const frameCanvas = document.createElement('canvas');

// Reset UI logic
function resetUI() {
  if (dsStatus) {
    dsStatus.textContent = '--';
    dsStatus.className = 'value text-muted';
  }
  if (dsGood) dsGood.textContent = '0s';
  if (dsBad) dsBad.textContent = '0s';
  if (dsScore) dsScore.textContent = '--';
  
  const toast = document.getElementById('toastAlert');
  if (toast) toast.style.display = 'none';
}

// Start Camera Request
async function startCamera() {
  btnStart.disabled = true;
  btnStart.textContent = 'Starting...';

  sessionActive = true;
  resetUI();

  try {
    const res = await fetch('/api/camera/start', { method: 'POST' });
    if (!res.ok) {
      throw new Error('Camera start endpoint failed');
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Browser webcam API unavailable');
    }

    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: { ideal: 'environment' }
        },
        audio: false
      });
    } catch (e) {
      localStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 }
        },
        audio: false
      });
    }

    liveVideo.srcObject = localStream;
    liveVideo.style.display = 'block';
    idlePrompt.style.display = 'none';

    await liveVideo.play();

    btnStart.style.display = 'none';
    btnStart.disabled = false;
    btnStart.textContent = '▶ Start Detection';

    btnStop.style.display = 'inline-block';
    badgeStatus.textContent = 'Live';
    badgeStatus.className = 'status-badge live';
    _cameraRunning = true;

    if (liveStatusBadge) {
      liveStatusBadge.style.display = 'block';
      liveStatusBadge.textContent = 'STARTING...';
      liveStatusBadge.className = 'live-status-badge';
    }

    startPolling();
    startFrameCapture();
  } catch (e) {
    console.error('[SpineAI] Failed to start camera', e);
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      localStream = null;
    }
    btnStart.disabled = false;
    btnStart.textContent = '▶ Start Detection';
    if (liveStatusBadge) {
      liveStatusBadge.style.display = 'block';
      liveStatusBadge.textContent = 'CAMERA DENIED';
      liveStatusBadge.className = 'live-status-badge bad';
    }
  }
}

function startFrameCapture() {
  if (captureTimer) clearInterval(captureTimer);
  captureTimer = setInterval(() => {
    if (!localStream || !liveVideo || liveVideo.readyState < 2) return;
    const width = 640;
    const height = 480;
    frameCanvas.width = width;
    frameCanvas.height = height;
    const ctx = frameCanvas.getContext('2d');
    ctx.drawImage(liveVideo, 0, 0, width, height);
    const dataUrl = frameCanvas.toDataURL('image/jpeg', 0.75);

    fetch('/api/camera/frame', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ frame: dataUrl })
    })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!data || !data.stats) return;
        const s = data.stats;
        dsStatus.textContent = s.posture || 'Detecting...';
        dsStatus.className = 'value text-green font-bold';
        if (s.posture === 'Bad Posture') {
          dsStatus.className = 'value text-red font-bold';
        }
        if (s.landmarks_detected !== undefined) {
          dsGood.textContent = s.good_duration < 60
            ? `${Math.round(s.good_duration)}s`
            : `${(s.good_duration / 60).toFixed(1)}m`;
          dsBad.textContent = s.bad_duration < 60
            ? `${Math.round(s.bad_duration)}s`
            : `${(s.bad_duration / 60).toFixed(1)}m`;
          dsScore.textContent = `${Math.round(s.posture_score)}%`;
        }
      })
      .catch(err => console.warn('[SpineAI] frame upload failed', err));
  }, 1000 / 5);
}

// Stop Camera Request
async function stopCamera() {
  btnStop.disabled = true;
  btnStop.textContent = 'Stopping...';

  sessionActive = false;
  stopPolling();
  if (captureTimer) clearInterval(captureTimer);
  captureTimer = null;

  try {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      localStream = null;
    }
    if (liveVideo) {
      liveVideo.srcObject = null;
      liveVideo.style.display = 'none';
    }

    const res = await fetch('/api/camera/stop', { method: 'POST' });
    const data = await res.json();

    // Save to backend explicitely (using the unified /api/reset endpoint which saves)
    await fetch('/api/reset', { method: 'POST' });

    idlePrompt.style.display = 'flex';

    btnStop.style.display = 'none';
    btnStop.disabled = false;
    btnStop.textContent = '⏹ Stop & Save';

    btnStart.style.display = 'inline-block';
    badgeStatus.textContent = 'Stopped';
    badgeStatus.className = 'status-badge offline';
    _cameraRunning = false;

    if (liveStatusBadge) liveStatusBadge.style.display = 'none';

    resetUI();

    // Automatically go to analytics
    setTimeout(() => {
      window.location.hash = 'analytics';
    }, 500);

  } catch (e) {
    console.error('[SpineAI] Failed to stop camera', e);
    btnStop.disabled = false;
    btnStop.textContent = '⏹ Stop & Save';
  }
}

// Poll /api/stats for live status
function startPolling() {
  _pollingTimer = setInterval(async () => {
    if (!sessionActive) return;
    try {
      const res = await fetch('/api/stats');
      const data = await res.json();
      
      const toast = document.getElementById('toastAlert');
      if (data.alert_active) {
        dsStatus.textContent = 'Bad Posture';
        dsStatus.className = 'value text-red font-bold';
        
        if (liveStatusBadge) {
          liveStatusBadge.textContent = 'BAD POSTURE';
          liveStatusBadge.className = 'live-status-badge bad';
        }

        if (toast && toast.style.display === 'none') {
          toast.style.display = 'block';
          try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioCtx.createOscillator();
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(440, audioCtx.currentTime); 
            oscillator.connect(audioCtx.destination);
            oscillator.start();
            oscillator.stop(audioCtx.currentTime + 0.3);
          } catch(e) {}
        }
      } else {
        if (toast && toast.style.display === 'block') {
          toast.style.display = 'none';
        }
        if (data.landmarks_detected) {
          dsStatus.textContent = 'Good Posture';
          dsStatus.className = 'value text-green font-bold';
          
          if (liveStatusBadge) {
            liveStatusBadge.textContent = 'GOOD POSTURE';
            liveStatusBadge.className = 'live-status-badge good';
          }
        } else {
          dsStatus.textContent = 'Detecting...';
          dsStatus.className = 'value text-muted';
          
          if (liveStatusBadge) {
            liveStatusBadge.textContent = 'DETECTING...';
            liveStatusBadge.className = 'live-status-badge';
          }
        }
      }
      
      dsGood.textContent = data.good_duration < 60 
        ? `${Math.round(data.good_duration)}s` 
        : `${(data.good_duration/60).toFixed(1)}m`;
        
      dsBad.textContent = data.bad_duration < 60 
        ? `${Math.round(data.bad_duration)}s` 
        : `${(data.bad_duration/60).toFixed(1)}m`;
        
      dsScore.textContent = `${Math.round(data.posture_score)}%`;
      
    } catch (e) {
      console.error(e);
    }
  }, 1000);
}

function stopPolling() {
  if (_pollingTimer) clearInterval(_pollingTimer);
  _pollingTimer = null;
  resetUI();
}

// Bind Events
if (btnStart) btnStart.addEventListener('click', startCamera);
if (btnStop) btnStop.addEventListener('click', stopCamera);

// Initialize default values
resetUI();
