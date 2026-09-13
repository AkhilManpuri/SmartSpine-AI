"""
firebase_config.py
Initialises Firebase Admin SDK and exposes the Firestore client `db`.
Supports local dev credentials from serviceAccountKey.json and
production-safe credentials via FIREBASE_CREDENTIALS_JSON.
"""

import os
import json
import logging

db = None          # Firestore client (None if Firebase is unavailable)
_firebase_ok = False

_KEY_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                          "serviceAccountKey.json")

try:
    import firebase_admin
    from firebase_admin import credentials, firestore

    cred = None
    cred_json = os.environ.get("FIREBASE_CREDENTIALS_JSON")
    if cred_json:
        try:
            cred = credentials.Certificate(json.loads(cred_json))
        except Exception as parse_err:
            logging.warning(f"[Firebase] ⚠️  FIREBASE_CREDENTIALS_JSON could not be parsed: {parse_err}")
    elif os.path.exists(_KEY_PATH):
        cred = credentials.Certificate(_KEY_PATH)

    if cred:
        firebase_admin.initialize_app(cred)
        _client = firestore.client()

        try:
            list(_client.collections())
            db = _client
            _firebase_ok = True
            print("[Firebase] ✅ Connected to Firestore successfully.")
        except Exception as probe_err:
            logging.warning(
                f"[Firebase] ⚠️  Firestore database not ready: {probe_err}\n"
                "  → Go to https://console.firebase.google.com → "
                "Firestore Database → Create database.\n"
                "  Sessions will be saved locally until Firestore is set up."
            )
    else:
        logging.warning(
            "[Firebase] ⚠️  Firebase credentials were not found.\n"
            "  Set FIREBASE_CREDENTIALS_JSON in the environment or add\n"
            "  serviceAccountKey.json only for local development."
        )

except ImportError:
    logging.warning("[Firebase] firebase-admin not installed. Run: pip install firebase-admin")
except Exception as e:
    logging.warning(f"[Firebase] Initialisation failed: {e}")


def is_available() -> bool:
    return _firebase_ok
