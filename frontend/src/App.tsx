import { useState, useRef, useEffect } from "react";
import "./App.css";

interface JobInfo {
  id: string;
  status: string;
  type?: string;
  error?: string;
}

const BASE_URL = "/api";

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [job, setJob] = useState<JobInfo | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [dragCounter, setDragCounter] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleFiles = (files: FileList | null) => {
    if (!files || !files[0]) return;
    setFile(files[0]);
    setJob(null);
    setResultUrl(null);
  };

  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      e.preventDefault();
      setDragCounter((c) => c + 1);
    };
    const onDragLeave = (e: DragEvent) => {
      e.preventDefault();
      setDragCounter((c) => Math.max(c - 1, 0));
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      setDragCounter(0);
      if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files);
    };
    const onDragOver = (e: DragEvent) => e.preventDefault();

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    window.addEventListener("dragover", onDragOver);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("dragover", onDragOver);
    };
  }, []);

  const uploadFile = async () => {
    if (!file) return;
    const data = new FormData();
    data.append("media", file);

    const res = await fetch(`${BASE_URL}/process`, { method: "POST", body: data });
    const json = await res.json();
    if (json.id) setJob({ id: json.id, status: "queued" });
  };

  useEffect(() => {
    if (!job?.id) return;
    const int = setInterval(async () => {
      const res = await fetch(`${BASE_URL}/status/${job.id}`);
      const data: JobInfo = await res.json();
      setJob((old) => (old ? { ...old, ...data } : data));
      if (data.status === "done" || data.status === "failed") {
        clearInterval(int);
        if (data.status === "done") setResultUrl(`${BASE_URL}/result/${job.id}`);
      }
    }, 500);
    return () => clearInterval(int);
  }, [job?.id]);

  const openFileDialog = () => inputRef.current?.click();

  const statusText =
    job?.status === "queued"
      ? "Job Scheduled..."
      : job?.status === "processing"
      ? "Processing, Please wait..."
      : job?.status === "done"
      ? "Done!"
      : job?.status === "failed"
      ? `Failed, try again later`
      : "";

  const showOverlay = dragCounter > 0;

  return (
    <div className="app">
      <h1>Background Remover</h1>

      {/* === Global Overlay === */}
      {showOverlay && (
        <div className="overlay">
          <div className="overlay-text">You can drop the file</div>
        </div>
      )}

      {/* === Dropzone (klikli alan) === */}
      <div className="dropzone" onClick={openFileDialog}>
        {file ? (
          <>
            <p>{file.name}</p>
            <small>You can change the file</small>
          </>
        ) : (
          <>
            <p>Drag your file here</p>
            <p>
              or <span className="link">select by clicking here</span>
            </p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      <button className="button" disabled={!file} onClick={uploadFile}>
        Send
      </button>

      {job && (
        <div className="status">
          <p>{statusText}</p>
        </div>
      )}

      {resultUrl && (
        <div className="result">
          {job?.type?.startsWith("video") ? (
            <video
              key={resultUrl}
              src={resultUrl}
              controls
              playsInline
              preload="metadata"
              className="preview"
            />
          ) : (
            <img src={resultUrl} alt="Processed" className="preview" />
          )}
          <a className="button secondary"
             href={`${resultUrl}?download=1`}
             download
          >
            Download
          </a>
        </div>
      )}
    </div>
  );
}

export default App;