# SmartSpine AI 🦴

## Description
AI-powered posture monitoring system using computer vision.

## Problem Statement
Poor posture is a leading cause of back pain, musculoskeletal disorders, and long-term spinal issues. Many people who work or study at desks unknowingly develop "text neck" or slouching habits. Current solutions often require expensive wearables or specialized ergonomic furniture. SmartSpine AI solves this by utilizing your existing webcam and advanced computer vision to provide accessible, real-time posture correction natively in your browser.

## Features
- **Real-time posture detection**: Continuous monitoring of body landmarks to detect slouching and shoulder imbalances instantly without any wearables.
- **Instant posture alerts**: Receive corrective visual and audio nudges the moment poor posture is detected.
- **Analytics dashboard**: Visual reports tracking your good vs. bad posture distributions and trends over time.
- **Session history tracking**: Keep a historical log of your sessions including durations and calculated scores.
- **Health score calculation**: A composite 100-point score evaluating your consistency, frequency, and improvement trends.

## Tech Stack
- **Computer Vision & Backend**: MediaPipe, OpenCV, Python, Flask
- **Database**: Firebase Firestore (with local JSON fallback support)
- **Frontend**: HTML, CSS, JavaScript, Chart.js

## Local setup

1. **Create and activate a virtual environment**
   ```bash
   python -m venv .venv
   .\.venv\Scripts\activate
   ```

2. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Set required environment variables locally**
   ```bash
   set SMARTSPINE_ENV=development
   set SMARTSPINE_SECRET_KEY=replace-with-a-local-secret
   set FIREBASE_CREDENTIALS_JSON={"type":"service_account",...}
   ```

   For local development, `serviceAccountKey.json` may still be used as a fallback credential file.

4. **Run the application locally**
   ```bash
   python app.py
   ```

5. **Open the browser**
   Navigate to http://127.0.0.1:5000

## Browser webcam requirements

The application is designed for browser-originated webcam capture with `getUserMedia()` and frame upload to the Flask backend for local MediaPipe/OpenCV posture inference. The server must not depend on a directly attached physical webcam. Browsers must allow camera permission. A Linux EC2 instance must use the browser-based webcam flow rather than a server-side `cv2.VideoCapture(0)` fallback.

## Required environment variables

- `SMARTSPINE_ENV` — set to `development` locally or `production` on AWS.
- `SMARTSPINE_SECRET_KEY` — Flask session secret, required in production.
- `FIREBASE_CREDENTIALS_JSON` — JSON service-account credential string for secure Firebase credentials in production.

## AWS EC2 deployment overview

This repository is suitable for an AWS EC2 Linux deployment using Gunicorn behind a reverse proxy such as Nginx or an Application Load Balancer. The app must be served by a production WSGI server instead of `app.run()`.

```
python app.py
```

Use a Gunicorn launch command such as:

```bash
gunicorn --bind 0.0.0.0:5000 app:app
```

## Required Linux packages on EC2

Install the OS packages that support OpenCV and MediaPipe wheels before deployment:

```bash
sudo yum update -y
sudo yum install -y python3-devel gcc gcc-c++ libgl1 libglib2.0-0
```

On Ubuntu/Debian-based Linux, the equivalent is:

```bash
sudo apt-get update
sudo apt-get install -y python3-dev build-essential libgl1 libglib2.0-0
```

## Firebase / Firestore

Firestore is the intended production persistence mechanism. The app supports a Firebase Admin credential object from environment variables and falls back locally to `stats.json` only when `SMARTSPINE_ENV` is not production. Credentials must never be committed to source control.

## Screenshots
*(Add your screenshots here)*
- `[Placeholder: Home Page]`
- `[Placeholder: Live Detection]`
- `[Placeholder: Analytics Dashboard]`

## Future Improvements
- Mobile application for tracking posture on the go.
- Stretches and exercises integration with video tutorials.
- Multi-user authentication via Firebase Auth.
Akhil