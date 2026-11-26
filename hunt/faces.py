"""Face check: does this frame show the star?

Uses OpenCV's YuNet (finds faces) and SFace (compares them), small free models that run on any CPU.
Reference faces come from TMDB portraits of the star (several ages) plus anything you drop into
films/<name>/refs/ (a photo from the exact era helps a lot for young/old looks).
"""
from __future__ import annotations

import os
from pathlib import Path

import numpy as np

MODELS = Path(__file__).resolve().parent.parent / ".models"
_GH = "https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models"
_HF = "https://huggingface.co/opencv"
URLS = {  # first that works wins
    "yunet": [f"{_GH}/face_detection_yunet/face_detection_yunet_2023mar.onnx",
              f"{_HF}/face_detection_yunet/resolve/main/face_detection_yunet_2023mar.onnx"],
    "sface": [f"{_GH}/face_recognition_sface/face_recognition_sface_2021dec.onnx",
              f"{_HF}/face_recognition_sface/resolve/main/face_recognition_sface_2021dec.onnx"],
}
MATCH = 0.36   # cosine similarity: SFace's published same-person threshold is 0.363
MIN_FACE = 48  # px; smaller faces are too blurry to compare


def _model(name):
    import requests
    MODELS.mkdir(exist_ok=True)
    p = MODELS / Path(URLS[name][0]).name
    if p.exists() and p.stat().st_size > 100_000:
        return str(p)
    err = None
    for url in URLS[name]:
        try:
            r = requests.get(url, timeout=180)
            r.raise_for_status()
            if len(r.content) < 100_000:
                raise RuntimeError("got a pointer file, not the model")
            p.write_bytes(r.content)
            return str(p)
        except Exception as e:
            err = e
    raise RuntimeError(f"could not download the {name} face model: {err}")


class Faces:
    def __init__(self):
        import cv2
        self.cv2 = cv2
        self.det = cv2.FaceDetectorYN.create(_model("yunet"), "", (320, 320), 0.85, 0.3, 50)
        self.rec = cv2.FaceRecognizerSF.create(_model("sface"), "")
        self.refs: list[np.ndarray] = []

    def _faces(self, img):
        h, w = img.shape[:2]
        scale = 1.0
        if max(h, w) > 1280:
            scale = 1280 / max(h, w)
            img = self.cv2.resize(img, (int(w * scale), int(h * scale)))
            h, w = img.shape[:2]
        self.det.setInputSize((w, h))
        _, faces = self.det.detect(img)
        out = []
        for f in faces if faces is not None else []:
            if min(f[2], f[3]) < MIN_FACE * scale:
                continue
            out.append((img, f))
        return out, scale

    def embed_all(self, img):
        """[(feature, box_in_original_pixels)] for every usable face in a BGR image."""
        faces, scale = self._faces(img)
        res = []
        for im, f in faces:
            aligned = self.rec.alignCrop(im, f)
            feat = self.rec.feature(aligned)
            res.append((feat, (f[0] / scale, f[1] / scale, f[2] / scale, f[3] / scale)))
        return res

    def add_ref(self, img) -> bool:
        faces = self.embed_all(img)
        if len(faces) != 1:  # a reference must show exactly one face
            return False
        self.refs.append(faces[0][0])
        return True

    def best(self, img):
        """(score, box) of the face closest to the star, or (0, None)."""
        top, box = 0.0, None
        for feat, b in self.embed_all(img):
            s = max((float(self.rec.match(feat, r, self.cv2.FaceRecognizerSF_FR_COSINE)) for r in self.refs), default=0.0)
            if s > top:
                top, box = s, b
        return top, box


def load_bgr(data: bytes):
    import cv2
    arr = np.frombuffer(data, np.uint8)
    return cv2.imdecode(arr, cv2.IMREAD_COLOR)


def available():
    try:
        import cv2
        return hasattr(cv2, "FaceDetectorYN") and os.environ.get("HUNT_NO_FACES") != "1"
    except Exception:
        return False
