"""
app.py
Flask application – multi-page SpineAI:
  GET  /            → home page
  GET  /detection   → live detection page
  GET  /reports     → reports page
  GET  /video_feed  → MJPEG stream
  GET  /api/stats   → live session stats JSON
  POST /api/reset   → end session (saves to Firestore/local), reset stats
  GET  /api/exercises → exercise recommendations
  GET  /api/reports   → session history from Firestore (or local JSON)
"""

import cv2
import threading
import time
import os
import base64
import numpy as np
from flask import Flask, Response, render_template, jsonify, request, session, redirect, url_for, flash
from posture_detector import PostureDetector
from utils import (
    SessionStats, ExerciseRecommender,
    save_to_firestore, fetch_sessions_from_firestore,
    save_session_local, fetch_sessions_local,
    register_user, authenticate_user,
    validate_registration,
)

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = Flask(__name__)
app.secret_key = os.environ.get("SMARTSPINE_SECRET_KEY") or os.urandom(24)


@app.before_request
def enforce_auth_rules():
    public_paths = {
        '/', '/login', '/logout', '/register', '/health', '/static/', '/favicon.ico'
    }
    if request.path.startswith('/static/'):
        return None
    if request.path in public_paths:
        return None
    if request.path.startswith('/api'):
        if not session.get('user'):
            return jsonify({"status": "error", "message": "Authentication required."}), 401
    if request.path == '/dashboard':
        if not session.get('user'):
            return redirect(url_for('login'))

# ---------------------------------------------------------------------------
# Shared state
# ---------------------------------------------------------------------------

_lock              = threading.Lock()
_frame_lock        = threading.Lock()
_session_stats     = SessionStats()
_detector          = None
_camera_active     = False
_latest_frame      = None
_raw_frame         = None

# ---------------------------------------------------------------------------
# Browser-based webcam inference path for AWS EC2 Linux. The browser
# obtains the webcam via getUserMedia() and posts JPEG frames to the API.
# ---------------------------------------------------------------------------

# Keep the old MJPEG stream route available for local compatibility but no
# longer require the server to hold OpenCV webcam threads.
def _make_blank_frame() -> bytes:
    img = np.zeros((480, 640, 3), dtype=np.uint8)
    cv2.putText(img, "Camera initialising...",
                (80, 240), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (200, 200, 200), 2)
    _, buf = cv2.imencode(".jpg", img)
    return buf.tobytes()


def _gen_frames():
    blank = _make_blank_frame()
    last_sent = None
    while True:
        with _lock:
            frame = _latest_frame
        if frame is None:
            frame = blank
            time.sleep(0.05)
        elif frame is last_sent:
            time.sleep(0.005)
            continue
        last_sent = frame
        yield (
            b"--frame\r\n"
            b"Content-Type: image/jpeg\r\n\r\n" +
            frame + b"\r\n"
        )


def _decode_base64_frame(frame_data):
    """Decode a browser-provided JPEG data URL or plain base64 image."""
    try:
        if frame_data.startswith("data:image"):
            frame_data = frame_data.split(",", 1)[1]
        imgbytes = base64.b64decode(frame_data)
        np_arr = np.frombuffer(imgbytes, dtype=np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if frame is None:
            return None
        return frame
    except Exception:
        return None


@app.route("/health")
def health():
    return jsonify({"status": "ok", "service": "smartspine-ai"})


# ---------------------------------------------------------------------------
# Page routes
# ---------------------------------------------------------------------------

@app.route("/")
def home():
    return render_template("home.html")

@app.route("/register", methods=["GET", "POST"])
def register():
    errors = []
    if request.method == "POST":
        name = request.form.get("name", "").strip()
        email = request.form.get("email", "").strip()
        password = request.form.get("password", "")
        confirm_password = request.form.get("confirm_password", "")

        errors = validate_registration(name, email, password, confirm_password)
        if not errors:
            user, reg_errors = register_user(name, email, password)
            if reg_errors:
                errors.extend(reg_errors)
            elif user:
                session["user"] = user
                return redirect(url_for("dashboard"))

    return render_template("register.html", errors=errors)

@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")
        user = authenticate_user(email, password)
        if user:
            session["user"] = {"name": user.get("name", "SmartSpine User"), "email": user.get("email", email)}
            return redirect(url_for("dashboard"))
        return render_template("login.html", error="Invalid email or password.")
    return render_template("login.html")

@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))

@app.route("/dashboard")
def dashboard():
    user = session.get("user")
    if not user:
        return redirect(url_for("login"))
    return render_template("index.html", user=user)

# ---------------------------------------------------------------------------
# API routes
# ---------------------------------------------------------------------------

@app.route("/video_feed")
def video_feed():
    return Response(
        _gen_frames(),
        mimetype="multipart/x-mixed-replace; boundary=frame"
    )


@app.route("/api/camera/frame", methods=["POST"])
def api_camera_frame():
    """Browser uploads webcam JPEG frames and the server runs MediaPipe inference."""
    payload = request.get_json(silent=True) or {}
    frame_data = payload.get("frame") or payload.get("image")
    if not frame_data:
        return jsonify({"status": "error", "message": "No frame received."}), 400

    frame = _decode_base64_frame(frame_data)
    if frame is None:
        return jsonify({"status": "error", "message": "Frame decode failed."}), 400

    global _detector
    if _detector is None:
        try:
            _detector = PostureDetector()
        except Exception as exc:
            return jsonify({"status": "error", "message": str(exc)}), 500

    annotated, posture, angles, lm_ok = _detector.process_frame(frame)
    with _lock:
        _session_stats.update(posture, angles, lm_ok)

    # Keep the legacy MJPEG route available, but update the latest image only
    # when the route is used. Browser side uses getUserMedia and the frame API.
    _, buffer = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 75])
    with _lock:
        _latest_frame = buffer.tobytes()

    data = _session_stats.to_dict()
    return jsonify({
        "status": "ok",
        "posture": posture,
        "landmarks_detected": lm_ok,
        "angles": angles,
        "stats": data,
    })


@app.route("/api/camera/start", methods=["POST"])
def api_camera_start():
    """Marks the browser-managed camera session active without using server CV capture."""
    global _camera_active
    _camera_active = True
    return jsonify({"status": "started", "active": _camera_active})


@app.route("/api/camera/stop", methods=["POST"])
def api_camera_stop():
    """Ends browser-managed camera session and returns a session snapshot."""
    global _camera_active
    _camera_active = False
    with _lock:
        snapshot = _session_stats.to_dict()
    with _lock:
        _latest_frame = None
    return jsonify({"status": "stopped", "snapshot": snapshot})


@app.route("/api/stats")
def api_stats():
    with _lock:
        data = _session_stats.to_dict()
    return jsonify(data)


@app.route("/api/reset", methods=["POST"])
def api_reset():
    with _lock:
        snapshot = _session_stats.to_dict()

    user = session.get("user") or {}
    user_email = user.get("email")

    # Try Firestore first, fall back to local JSON
    saved = save_to_firestore(snapshot, user if user_email else None)
    if not saved:
        try:
            save_session_local(snapshot, user if user_email else None)
        except Exception as e:
            print(f"[WARN] Local save failed: {e}")

    with _lock:
        _session_stats.reset()

    return jsonify({"status": "reset", "saved_to_firebase": saved})


@app.route("/api/exercises")
def api_exercises():
    with _lock:
        bad_streaks = _session_stats.bad_streak_count
    exercises = ExerciseRecommender.recommend(bad_streaks)
    return jsonify(exercises)


@app.route("/api/sessions")
@app.route("/api/reports")
def api_sessions():
    """
    Return sessions for the logged-in user only.
    Canonical endpoint: /api/sessions
    /api/reports is kept as a backward-compatible alias.

    Response:
      { "sessions": [...], "source": "firestore" | "local", "count": N }
    """
    user = session.get("user") or {}
    user_email = user.get("email")
    sessions = []
    source = "firestore"

    if user_email:
        sessions = fetch_sessions_from_firestore(limit=50, user_email=user_email)
    if not sessions:
        if user_email:
            sessions = fetch_sessions_local(limit=50, user_email=user_email)
        else:
            sessions = fetch_sessions_local(limit=50)
        source = "local"

    print(f"[API] /api/sessions → {len(sessions)} session(s) from {source}")
    return jsonify({"sessions": sessions, "source": source, "count": len(sessions)})


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("=" * 60)
    print(" AI Powered Smart Spine & Bone Health Monitor")
    print(" Open http://127.0.0.1:5000 in your browser")
    print(" Camera will start when you open Live Detection.")
    print("=" * 60)
    app.run(host="0.0.0.0", port=5000, debug=False, threaded=True)
