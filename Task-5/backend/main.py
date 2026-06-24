import os
import sys
import numpy as np
import cv2
from fastapi import FastAPI, UploadFile, File, Form, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware

# Add the workspace root to Python path so we can import backend.face_engine
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from backend.face_engine import FaceEngine

app = FastAPI(title="FaceAI Vision Engine")

# Allow CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize the face engine
# Points to workspace root
WORKSPACE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
engine = FaceEngine(base_dir=WORKSPACE_DIR)

@app.post("/api/detect")
async def detect_faces(file: UploadFile = File(...), min_confidence: float = 0.8):
    try:
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            raise HTTPException(status_code=400, detail="Invalid image file.")
        
        results = engine.detect_faces(img, min_confidence=min_confidence)
        # Remove raw_face_array since it's not JSON serializable
        for res in results:
            if "raw_face_array" in res:
                del res["raw_face_array"]
                
        return {
            "success": True,
            "width": img.shape[1],
            "height": img.shape[0],
            "faces": results
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/register")
async def register_face(file: UploadFile = File(...), name: str = Form(...)):
    if not name or name.strip() == "":
        raise HTTPException(status_code=400, detail="Name cannot be empty.")
    try:
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            raise HTTPException(status_code=400, detail="Invalid image file.")
        
        success, message = engine.register_face(img, name.strip())
        if not success:
            raise HTTPException(status_code=400, detail=message)
            
        return {"success": True, "message": message}
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/recognize")
async def recognize_faces(
    file: UploadFile = File(...), 
    min_confidence: float = 0.8, 
    match_threshold: float = 0.363
):
    try:
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            raise HTTPException(status_code=400, detail="Invalid image file.")
        
        results = engine.recognize_faces(
            img, 
            min_confidence=min_confidence, 
            match_threshold=match_threshold
        )
        return {
            "success": True,
            "width": img.shape[1],
            "height": img.shape[0],
            "faces": results
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/registered-faces")
async def get_registered_faces():
    try:
        return {"success": True, "faces": engine.get_registered_names()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/registered-faces/{name}")
async def delete_face(name: str):
    try:
        success, message = engine.delete_identity(name)
        if not success:
            raise HTTPException(status_code=404, detail=message)
        return {"success": True, "message": message}
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.websocket("/ws/stream")
async def websocket_stream(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            # Receive parameters or binary data
            # The client sends binary frame data
            data = await websocket.receive_bytes()
            
            # Decode frame
            nparr = np.frombuffer(data, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if img is None:
                await websocket.send_json({"error": "Invalid frame data", "faces": []})
                continue
            
            # Run recognition with default/balanced settings
            # Using 0.75 min_confidence for webcam to detect quicker, and 0.363 match_threshold
            results = engine.recognize_faces(img, min_confidence=0.75, match_threshold=0.363)
            
            # Prepare serializable response
            faces_to_send = []
            for face in results:
                faces_to_send.append({
                    "bbox": face["bbox"],
                    "landmarks": face["landmarks"],
                    "confidence": face["confidence"],
                    "name": face["name"],
                    "similarity": face["similarity"]
                })
            
            await websocket.send_json({
                "faces": faces_to_send
            })
            
    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"WebSocket error: {e}")
        try:
            await websocket.send_json({"error": str(e), "faces": []})
        except:
            pass

# Serve frontend static assets
frontend_dir = os.path.join(WORKSPACE_DIR, "frontend")
if os.path.exists(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
else:
    # If frontend folder isn't created yet, we define a fallback route
    @app.get("/")
    async def root_fallback():
        return {"message": "Server is running, but frontend files are still being written."}
