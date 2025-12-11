import os, redis, json, time, subprocess, tempfile, threading, traceback
from concurrent.futures import ThreadPoolExecutor
from rembg import remove, new_session

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379")
TMP_DIR = "/shared/tmp"
QUEUE = "job_queue"

print(f"[INIT] Connecting to Redis at {REDIS_URL}", flush=True)
r = redis.Redis.from_url(REDIS_URL, decode_responses=True)

print("[INIT] Loading rembg model session (u2netp)...", flush=True)
try:
    SESSION = new_session(model_name="u2netp")
    print("[INIT] Model session created successfully.", flush=True)
except Exception as e:
    print("[INIT][ERROR] Failed to load model:", e, flush=True)
    traceback.print_exc()

# ----------------  cleanup  ---------------- #
def clean_old_files(max_minutes: int = 60):
    while True:
        try:
            now = time.time()
            for name in os.listdir(TMP_DIR):
                path = os.path.join(TMP_DIR, name)
                age = (now - os.stat(path).st_mtime) / 60
                if age > max_minutes:
                    try:
                        if os.path.isdir(path):
                            print(f"🧹 [CLEANUP] Removing old dir: {path}", flush=True)
                            for root, dirs, files in os.walk(path, topdown=False):
                                for f in files:
                                    os.remove(os.path.join(root, f))
                                for d in dirs:
                                    os.rmdir(os.path.join(root, d))
                            os.rmdir(path)
                        else:
                            print(f"🧹 [CLEANUP] Removing old file: {path}", flush=True)
                            os.remove(path)
                    except Exception as ce:
                        print(f"[CLEANUP][ERROR] {path}: {ce}", flush=True)
        except Exception as e:
            print(f"[CLEANUP] Loop error: {e}", flush=True)
        time.sleep(3000)

# ----------------  video / image  ---------------- #
def process_frame(frame_path: str):
    try:
        print(f"[FRAME] Removing background for {frame_path}", flush=True)
        with open(frame_path, "rb") as f:
            data = f.read()
        result = remove(data, session=SESSION)
        with open(frame_path, "wb") as f:
            f.write(result)
    except Exception as e:
        print(f"⚠️ [FRAME][ERROR] {os.path.basename(frame_path)}: {e}", flush=True)
        traceback.print_exc()

def process_video(input_path: str, output_path: str):
    try:
        print(f"[VIDEO] Extracting frames from {input_path}", flush=True)
        with tempfile.TemporaryDirectory(dir=TMP_DIR) as frames_dir:
            subprocess.run(
                ["ffmpeg", "-y", "-hide_banner", "-i", input_path,
                 f"{frames_dir}/frame_%06d.png"],
                check=True,
            )
            frame_files = [os.path.join(frames_dir, f)
                           for f in sorted(os.listdir(frames_dir))
                           if f.endswith(".png")]
            print(f"🧠 [VIDEO] {len(frame_files)} frames will be processed...", flush=True)
            with ThreadPoolExecutor(max_workers=4) as ex:
                list(ex.map(process_frame, frame_files))
            print("[VIDEO] Re-merging frames + audio", flush=True)
            cmd_merge = [
                "ffmpeg", "-y", "-hide_banner", "-framerate", "30",
                "-i", f"{frames_dir}/frame_%06d.png",
                "-i", input_path,
                "-map", "0:v:0", "-map", "1:a?",
                "-c:v", "libx264", "-pix_fmt", "yuv420p",
                "-c:a", "copy",
                output_path
            ]
            subprocess.run(cmd_merge, check=True)
            print(f"✅ [VIDEO] Finished {output_path}", flush=True)
    except Exception as e:
        print(f"[VIDEO][ERROR] {e}", flush=True)
        traceback.print_exc()

def process_image(input_path: str, output_path: str):
    try:
        print(f"[IMG] Processing image {input_path} -> {output_path}", flush=True)
        with open(input_path, "rb") as f:
            result = remove(f.read(), session=SESSION)
        with open(output_path, "wb") as f:
            f.write(result)
        print(f"✅ [IMG] Done {output_path}", flush=True)
    except Exception as e:
        print(f"[IMG][ERROR] {e}", flush=True)
        traceback.print_exc()

# ----------------  main worker thread  ---------------- #
print("Worker started, queue listener + cleanup active", flush=True)
threading.Thread(target=clean_old_files, daemon=True).start()

while True:
    try:
        job = r.brpop(QUEUE, timeout=10)
        if not job:
            continue
        print(f"[QUEUE] Job pulled: {job}", flush=True)
        data = json.loads(job[1])
        job_id = data.get("jobId")
        input_path = data.get("inputPath")
        mime = data.get("mime", "")
        print(f"[JOB] Start {job_id} type={mime} input={input_path}", flush=True)
        state_key = f"job:{job_id}"
        r.hset(state_key, mapping={"status": "processing"})
        out_path = ""
        if mime.startswith("video/") or input_path.lower().endswith((".mp4", ".mov", ".mkv")):
            out_path = f"{TMP_DIR}/{job_id}_processed.mp4"
            process_video(input_path, out_path)
        else:
            out_path = f"{TMP_DIR}/{job_id}_processed.png"
            process_image(input_path, out_path)
        r.hset(state_key, mapping={"status": "done"})
        print(f"[JOB] ✅ Completed {job_id} -> {out_path}", flush=True)
    except Exception as e:
        print("❌ [WORKER][ERROR]:", e, flush=True)
        traceback.print_exc()
        time.sleep(2)