import sys
import os
import cv2

# Add workspace directory to path
sys.path.append(os.path.abspath(os.path.dirname(__file__)))
from backend.face_engine import FaceEngine

def main():
    print("="*60)
    print("           FaceAI Vision Engine - Desktop Webcam Mode")
    print("="*60)
    
    # Initialize Engine (uses workspace directory)
    engine = FaceEngine(base_dir=os.path.abspath(os.path.dirname(__file__)))
    
    # Alert about DB status
    db = engine.get_registered_names()
    if not db:
        print("\n[!] WARNING: Face database is currently empty.")
        print("    Please run the web app (run.py) to register templates,")
        print("    or register faces programmatically to see recognized names.\n")
    else:
        print(f"\n[+] Loaded {len(db)} registered identity templates:")
        for name, count in db.items():
            print(f"    - {name} ({count} sample templates)")
        print()

    print("[+] Initializing webcam (device 0)...")
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("[!] ERROR: Could not open webcam device. Check if another app is using it.")
        return

    # Set camera resolution properties to reasonable default for performance
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

    print("\n[+] Stream active! Press 'q' in the window to quit.\n")

    # Define color mappings
    landmark_colors = [
        (248, 189, 56), # Right eye (BGR: Cyan-like)
        (248, 189, 56), # Left eye
        (252, 132, 192),# Nose tip (BGR: Purple-like)
        (94, 63, 244),  # Right mouth (BGR: Red-like)
        (94, 63, 244)   # Left mouth
    ]

    while True:
        ret, frame = cap.read()
        if not ret:
            print("[!] Fail to read frame from webcam.")
            break

        # SFace/YuNet run faster on slightly downscaled or original frames
        # Run detection and recognition
        # We use a balanced confidence of 0.8 and match threshold of 0.363
        faces = engine.recognize_faces(frame, min_confidence=0.8, match_threshold=0.363)

        for face in faces:
            x, y, w, h = face["bbox"]
            name = face["name"]
            similarity = face["similarity"]
            confidence = face["confidence"]

            # Choose color: Green for known, Red for unknown
            is_known = name != "Unknown"
            color = (0, 185, 96) if is_known else (43, 75, 239) # BGR values for Green/Red
            
            # Draw corner brackets (futuristic overlay style)
            line_thickness = 2
            bracket_len = max(10, int(w * 0.15))
            
            # Top-left corner
            cv2.line(frame, (x, y), (x + bracket_len, y), color, line_thickness)
            cv2.line(frame, (x, y), (x, y + bracket_len), color, line_thickness)
            
            # Top-right corner
            cv2.line(frame, (x + w, y), (x + w - bracket_len, y), color, line_thickness)
            cv2.line(frame, (x + w, y), (x + w, y + bracket_len), color, line_thickness)
            
            # Bottom-left corner
            cv2.line(frame, (x, y + h), (x + bracket_len, y + h), color, line_thickness)
            cv2.line(frame, (x, y + h), (x, y + h - bracket_len), color, line_thickness)
            
            # Bottom-right corner
            cv2.line(frame, (x + w, y + h), (x + w - bracket_len, y + h), color, line_thickness)
            cv2.line(frame, (x + w, y + h), (x + w, y + h - bracket_len), color, line_thickness)

            # Draw Landmarks
            if "landmarks" in face:
                for idx, pt in enumerate(face["landmarks"]):
                    cv2.circle(frame, (pt[0], pt[1]), 3, landmark_colors[idx], -1)

            # Draw Label Tag
            label_score = similarity if is_known else confidence
            label_text = f"{name} ({int(label_score * 100)}%)"
            
            # Calculate text size and position
            font = cv2.FONT_HERSHEY_SIMPLEX
            font_scale = 0.5
            font_thickness = 1
            (text_w, text_h), baseline = cv2.getTextSize(label_text, font, font_scale, font_thickness)
            
            # Draw label box background
            cv2.rectangle(frame, (x, y - text_h - 10), (x + text_w + 10, y), color, -1)
            # Draw text on top (in black/dark blue)
            cv2.putText(frame, label_text, (x + 5, y - 5), font, font_scale, (19, 9, 6), font_thickness, cv2.LINE_AA)

        # Show Output FPS
        cv2.imshow("FaceAI Vision Engine - Desktop Mode", frame)

        # Key check
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    # Cleanup
    cap.release()
    cv2.destroyAllWindows()
    print("[+] Webcam stream terminated.")

if __name__ == "__main__":
    main()
