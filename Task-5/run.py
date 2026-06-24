import os
import sys
import time
import webbrowser
import threading

def open_browser():
    """Waits for uvicorn to start, then opens the default browser."""
    time.sleep(1.5)
    print("\n[+] Launching web browser to http://127.0.0.1:8000 ...")
    webbrowser.open("http://127.0.0.1:8000")

def check_dependencies():
    """Performs a basic check to ensure dependencies are installed."""
    missing = []
    
    try:
        import fastapi
    except ImportError:
        missing.append("fastapi")
        
    try:
        import uvicorn
    except ImportError:
        missing.append("uvicorn")
        
    try:
        import cv2
    except ImportError:
        missing.append("opencv-python")
        
    try:
        import numpy
    except ImportError:
        missing.append("numpy")
        
    if missing:
        print("[!] Missing required libraries:", ", ".join(missing))
        print("[+] Installing missing dependencies via requirements.txt...")
        import subprocess
        try:
            subprocess.run([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"], check=True)
            print("[+] Dependency installation successful.\n")
        except subprocess.CalledProcessError as e:
            print(f"[!] ERROR: Dependency installation failed with code {e.returncode}.")
            print("    Please run: pip install -r requirements.txt manually.")
            sys.exit(1)

def main():
    print("="*60)
    print("           FaceAI Vision Engine - Server Launcher")
    print("="*60)
    
    # 1. Dependency sanity check
    check_dependencies()

    # 2. Add current directory to python path
    sys.path.append(os.path.abspath(os.path.dirname(__file__)))

    # 3. Start web browser launch timer
    threading.Thread(target=open_browser, daemon=True).start()

    # 4. Boot server
    import uvicorn
    print("[+] Starting FastAPI server on http://127.0.0.1:8000 ...")
    print("[+] Model files will download on the first request if they are not already present.")
    print("[+] Press Ctrl+C in this terminal to stop the server.\n")
    
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8000, reload=True)

if __name__ == "__main__":
    main()
