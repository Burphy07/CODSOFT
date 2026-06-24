import os
import urllib.request
import pickle
import numpy as np
import cv2

class FaceEngine:
    # Model URLs from the official OpenCV Zoo
    YUNET_URL = "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx"
    SFACE_URL = "https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx"

    def __init__(self, base_dir="."):
        self.base_dir = os.path.abspath(base_dir)
        self.models_dir = os.path.join(self.base_dir, "models")
        self.database_dir = os.path.join(self.base_dir, "database")
        self.db_path = os.path.join(self.database_dir, "faces.pkl")

        # Create directories
        os.makedirs(self.models_dir, exist_ok=True)
        os.makedirs(self.database_dir, exist_ok=True)

        # Model file paths
        self.yunet_path = os.path.join(self.models_dir, "face_detection_yunet_2023mar.onnx")
        self.sface_path = os.path.join(self.models_dir, "face_recognition_sface_2021dec.onnx")

        # Download models if they don't exist
        self._ensure_models_downloaded()

        # Load face database
        self.database = self._load_database()

        # Initialize YuNet detector
        # We start with a default input size of 320x320; it must be updated dynamically based on image size
        self.detector = cv2.FaceDetectorYN.create(
            model=self.yunet_path,
            config="",
            input_size=(320, 320),
            score_threshold=0.8,
            nms_threshold=0.3,
            top_k=5000,
            backend_id=cv2.dnn.DNN_BACKEND_OPENCV,
            target_id=cv2.dnn.DNN_TARGET_CPU
        )

        # Initialize SFace recognizer
        self.recognizer = cv2.FaceRecognizerSF.create(
            model=self.sface_path,
            config="",
            backend_id=cv2.dnn.DNN_BACKEND_OPENCV,
            target_id=cv2.dnn.DNN_TARGET_CPU
        )

    def _ensure_models_downloaded(self):
        """Downloads YuNet and SFace models if they do not exist locally."""
        if not os.path.exists(self.yunet_path):
            print(f"Downloading YuNet face detector model to {self.yunet_path}...")
            urllib.request.urlretrieve(self.YUNET_URL, self.yunet_path)
            print("YuNet model downloaded successfully.")

        if not os.path.exists(self.sface_path):
            print(f"Downloading SFace face recognition model to {self.sface_path}...")
            urllib.request.urlretrieve(self.SFACE_URL, self.sface_path)
            print("SFace model downloaded successfully.")

    def _load_database(self):
        """Loads face database from pickle file."""
        if os.path.exists(self.db_path):
            try:
                with open(self.db_path, 'rb') as f:
                    return pickle.load(f)
            except Exception as e:
                print(f"Error loading face database: {e}. Starting with an empty database.")
                return {}
        return {}

    def _save_database(self):
        """Saves face database to pickle file."""
        try:
            with open(self.db_path, 'wb') as f:
                pickle.dump(self.database, f)
            return True
        except Exception as e:
            print(f"Error saving face database: {e}")
            return False

    def detect_faces(self, img, min_confidence=0.8):
        """
        Detects faces in the given image.
        Returns a list of dicts: [ { 'bbox': [x, y, w, h], 'landmarks': [[x,y],...], 'confidence': float } ]
        """
        h, w, _ = img.shape
        self.detector.setInputSize((w, h))
        self.detector.setScoreThreshold(min_confidence)
        
        retval, faces = self.detector.detect(img)
        
        results = []
        if faces is not None:
            for face in faces:
                bbox = face[0:4].astype(int).tolist()
                landmarks = face[4:14].reshape((5, 2)).astype(int).tolist()
                confidence = float(face[14])
                
                results.append({
                    "bbox": bbox,
                    "landmarks": landmarks,
                    "confidence": confidence,
                    "raw_face_array": face  # Keep raw data for alignment
                })
        return results

    def register_face(self, img, name):
        """
        Detects a face in the image, aligns it, extracts features, and registers it.
        We expect exactly one face for high-quality registration.
        """
        faces = self.detect_faces(img, min_confidence=0.8)
        if len(faces) == 0:
            return False, "No face detected in the image."
        if len(faces) > 1:
            return False, "Multiple faces detected. Please upload an image with a single face for registration."
        
        face_data = faces[0]
        # Align face and extract feature vector
        aligned = self.recognizer.alignCrop(img, face_data["raw_face_array"])
        feature = self.recognizer.feature(aligned)
        
        # SFace features are 128-dimensional float32 arrays
        if name not in self.database:
            self.database[name] = []
        
        # Store embedding
        self.database[name].append(feature)
        self._save_database()
        
        return True, f"Successfully registered face for '{name}'."

    def recognize_faces(self, img, min_confidence=0.8, match_threshold=0.363):
        """
        Detects faces in the image, extracts features, and matches them against the database.
        Returns:
            list of dicts containing bbox, landmarks, confidence, recognized name, and similarity score.
        """
        faces = self.detect_faces(img, min_confidence=min_confidence)
        results = []

        for face_data in faces:
            bbox = face_data["bbox"]
            landmarks = face_data["landmarks"]
            confidence = face_data["confidence"]
            raw_face = face_data["raw_face_array"]

            # Default prediction
            pred_name = "Unknown"
            best_score = -1.0

            # Only attempt matching if we have registered faces
            if self.database:
                aligned = self.recognizer.alignCrop(img, raw_face)
                feature = self.recognizer.feature(aligned)

                for name, stored_features in self.database.items():
                    for stored_feat in stored_features:
                        # cv2.FaceRecognizerSF.match returns cosine similarity (higher is more similar, threshold ~0.363)
                        # We copy features to prevent in-place modification bug in some cv2 versions
                        score = self.recognizer.match(feature.copy(), stored_feat.copy(), cv2.FaceRecognizerSF_FR_COSINE)
                        if score > best_score:
                            best_score = score
                            if score >= match_threshold:
                                pred_name = name

            results.append({
                "bbox": bbox,
                "landmarks": landmarks,
                "confidence": confidence,
                "name": pred_name,
                "similarity": float(best_score)
            })

        return results

    def get_registered_names(self):
        """Returns a dict of {name: num_templates}."""
        return {name: len(feats) for name, feats in self.database.items()}

    def delete_identity(self, name):
        """Deletes an identity from the database."""
        if name in self.database:
            del self.database[name]
            self._save_database()
            return True, f"Deleted '{name}' from database."
        return False, f"Identity '{name}' not found."
