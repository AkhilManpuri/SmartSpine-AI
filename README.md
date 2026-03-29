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

## How to Run

1. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

2. **Add serviceAccountKey.json**
   Place your Firebase `serviceAccountKey.json` inside the root directory.
   *(Note: The app will fallback to local storage if Firebase is not configured).*

3. **Run the application**
   ```bash
   python app.py
   ```

4. **Open the browser**
   Navigate to [http://127.0.0.1:5000](http://127.0.0.1:5000)

## Screenshots
*(Add your screenshots here)*
- `[Placeholder: Home Page]`
- `[Placeholder: Live Detection]`
- `[Placeholder: Analytics Dashboard]`

## Future Improvements
- Mobile application for tracking posture on the go.
- Stretches and exercises integration with video tutorials.
- Multi-user authentication via Firebase Auth.
