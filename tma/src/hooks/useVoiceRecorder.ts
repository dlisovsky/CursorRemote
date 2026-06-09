import { useCallback, useEffect, useRef, useState } from "react";

export function useVoiceRecorder() {
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (!recording) {
      setElapsedMs(0);
      return;
    }
    const started = Date.now();
    const id = setInterval(() => setElapsedMs(Date.now() - started), 200);
    return () => clearInterval(id);
  }, [recording]);

  const stop = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRef.current;
      if (!recorder || recorder.state === "inactive") {
        setRecording(false);
        resolve(null);
        return;
      }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        chunksRef.current = [];
        mediaRef.current = null;
        setRecording(false);
        resolve(blob.size > 0 ? blob : null);
      };
      recorder.stop();
      recorder.stream.getTracks().forEach((t) => t.stop());
    });
  }, []);

  const start = useCallback(async () => {
    if (recording) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.start();
    mediaRef.current = recorder;
    setRecording(true);
  }, [recording]);

  const toggle = useCallback(async () => {
    if (recording) return stop();
    await start();
    return null;
  }, [recording, start, stop]);

  return { recording, elapsedMs, start, stop, toggle };
}
