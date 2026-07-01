"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Paperclip, Mic, Square, Play, Pause, Trash2, FileText, Download, Check, Loader2 } from 'lucide-react';
import api from '@/lib/api';

export interface TaskFile {
  filename: string;
  stored_filename: string;
  file_size: number;
  url: string;
}

export interface VoiceNote {
  stored_filename: string;
  url: string;
}

interface TaskAttachmentManagerProps {
  onFilesChanged?: (files: TaskFile[]) => void;
  onVoiceNoteChanged?: (voiceNote: VoiceNote | null) => void;
  initialFiles?: TaskFile[];
  initialVoiceNote?: VoiceNote | null;
  readOnly?: boolean;
}

export default function TaskAttachmentManager({
  onFilesChanged,
  onVoiceNoteChanged,
  initialFiles = [],
  initialVoiceNote = null,
  readOnly = false,
}: TaskAttachmentManagerProps) {
  const [files, setFiles] = useState<TaskFile[]>(initialFiles);
  const [voiceNote, setVoiceNote] = useState<VoiceNote | null>(initialVoiceNote);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordTime, setRecordTime] = useState(0);
  const [isPlayingRecord, setIsPlayingRecord] = useState(false);
  const [playingFileUrl, setPlayingFileUrl] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setFiles(initialFiles);
  }, [initialFiles]);

  useEffect(() => {
    setVoiceNote(initialVoiceNote);
  }, [initialVoiceNote]);

  // Audio recording timer
  useEffect(() => {
    if (recording) {
      timerRef.current = setInterval(() => {
        setRecordTime((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setRecordTime(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [recording]);

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Start recording voice note
  const startRecording = async () => {
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      alert("Microphone access is blocked on insecure connections. Please access the application using a secure connection (HTTPS) or via 'http://localhost:3000' to enable voice recording popup.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await uploadVoiceNote(audioBlob);
        
        // Stop all audio tracks to release microphone lock icon in browser
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setRecording(true);
    } catch (err) {
      console.error('Failed to access microphone:', err);
      alert('Could not access microphone. Please allow microphone permissions.');
    }
  };

  // Stop recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  // Upload recorded audio
  const uploadVoiceNote = async (audioBlob: Blob) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', audioBlob, 'voice_note.webm');

      const res = await api.post('/tasks/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const newVoice: VoiceNote = {
        stored_filename: res.data.stored_filename,
        url: res.data.url,
      };

      setVoiceNote(newVoice);
      if (onVoiceNoteChanged) {
        onVoiceNoteChanged(newVoice);
      }
    } catch (err) {
      console.error('Failed to upload voice note:', err);
      alert('Failed to upload voice note. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  // Handle document upload
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setUploading(true);
    try {
      const newFiles: TaskFile[] = [...files];
      for (let i = 0; i < e.target.files.length; i++) {
        const file = e.target.files[i];
        const formData = new FormData();
        formData.append('file', file);

        const res = await api.post('/tasks/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        newFiles.push({
          filename: file.name,
          stored_filename: res.data.stored_filename,
          file_size: res.data.file_size,
          url: res.data.url,
        });
      }

      setFiles(newFiles);
      if (onFilesChanged) {
        onFilesChanged(newFiles);
      }
    } catch (err) {
      console.error('Failed to upload files:', err);
      alert('Failed to upload one or more files. Please verify the connection.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Remove uploaded file
  const removeFile = (idx: number) => {
    const updated = files.filter((_, i) => i !== idx);
    setFiles(updated);
    if (onFilesChanged) {
      onFilesChanged(updated);
    }
  };

  // Remove voice note
  const removeVoiceNote = () => {
    setVoiceNote(null);
    if (onVoiceNoteChanged) {
      onVoiceNoteChanged(null);
    }
    if (isPlayingRecord) {
      handleVoicePlayToggle(null);
    }
  };

  // Custom audio preview controller
  const handleVoicePlayToggle = (url: string | null) => {
    if (!url) {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
      }
      setIsPlayingRecord(false);
      setPlayingFileUrl(null);
      return;
    }

    if (playingFileUrl === url) {
      if (isPlayingRecord) {
        audioPlayerRef.current?.pause();
        setIsPlayingRecord(false);
      } else {
        audioPlayerRef.current?.play();
        setIsPlayingRecord(true);
      }
    } else {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.src = getFullDownloadUrl(url);
        audioPlayerRef.current.play()
          .then(() => {
            setIsPlayingRecord(true);
            setPlayingFileUrl(url);
          })
          .catch((e) => console.error("Audio playback error:", e));
      }
    }
  };

  const getFullDownloadUrl = (url: string) => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    const base = api.defaults.baseURL || 'http://localhost:8000';
    return `${base}${url}`;
  };

  return (
    <div className="w-full space-y-3.5 bg-slate-50/70 border border-slate-100 rounded-xl p-3.5 shadow-sm">
      {/* Hidden audio component */}
      <audio
        ref={audioPlayerRef}
        onEnded={() => {
          setIsPlayingRecord(false);
          setPlayingFileUrl(null);
        }}
        className="hidden"
      />

      {/* READONLY DISPLAY */}
      {readOnly ? (
        <div className="space-y-2">
          {/* Voice note view */}
          {voiceNote && (
            <div className="flex items-center gap-3 bg-white border border-slate-100 rounded-lg p-2.5 shadow-xs">
              <button
                type="button"
                onClick={() => handleVoicePlayToggle(voiceNote.url)}
                className="w-8 h-8 rounded-full bg-indigo-50 hover:bg-indigo-100 flex items-center justify-center text-indigo-600 cursor-pointer transition-colors"
                title="Play explanation"
              >
                {isPlayingRecord && playingFileUrl === voiceNote.url ? (
                  <Pause className="w-4 h-4 fill-indigo-600" />
                ) : (
                  <Play className="w-4 h-4 fill-indigo-600 ml-0.5" />
                )}
              </button>
              <div className="flex-1">
                <p className="text-[11px] font-bold text-slate-700">Voice Roster/Explanation</p>
                <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden mt-1">
                  <div 
                    className={`h-full bg-indigo-600 ${isPlayingRecord && playingFileUrl === voiceNote.url ? 'w-full transition-all duration-[10s] ease-linear' : 'w-0'}`} 
                  />
                </div>
              </div>
            </div>
          )}

          {/* Files view */}
          {files.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Attached Documents ({files.length}):</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {files.map((file, idx) => (
                  <a
                    key={idx}
                    href={getFullDownloadUrl(file.url)}
                    download={file.filename}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-100 hover:border-indigo-200 hover:shadow-xs group transition-all"
                  >
                    <div className="flex items-center gap-2 overflow-hidden mr-2">
                      <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      <div className="overflow-hidden">
                        <p className="text-xs font-semibold text-slate-700 truncate group-hover:text-indigo-600" title={file.filename}>
                          {file.filename}
                        </p>
                        <p className="text-[9px] font-bold text-slate-400">{formatFileSize(file.file_size)}</p>
                      </div>
                    </div>
                    <Download className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 flex-shrink-0" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {!voiceNote && files.length === 0 && (
            <p className="text-xs font-semibold text-slate-400 italic">No files or voice notes attached.</p>
          )}
        </div>
      ) : (
        /* EDITABLE VIEW */
        <div className="space-y-3">
          {/* Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* File upload button */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              multiple
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || recording}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-lg hover:border-slate-300 disabled:opacity-50 cursor-pointer shadow-xs transition-colors"
            >
              <Paperclip className="w-3.5 h-3.5 text-slate-500" />
              Attach Documents
            </button>

            {/* Mic recording controls */}
            {recording ? (
              <button
                type="button"
                onClick={stopRecording}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg cursor-pointer shadow-xs animate-pulse transition-colors"
              >
                <Square className="w-3.5 h-3.5 fill-white" />
                Stop Recording ({formatTime(recordTime)})
              </button>
            ) : (
              <button
                type="button"
                onClick={startRecording}
                disabled={uploading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 rounded-lg disabled:opacity-50 cursor-pointer shadow-xs transition-colors"
              >
                <Mic className="w-3.5 h-3.5 text-indigo-600" />
                Record Voice Note
              </button>
            )}

            {/* Loading Indicator */}
            {uploading && (
              <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Uploading assets...
              </div>
            )}
          </div>

          {/* Voice note preview card */}
          {voiceNote && (
            <div className="flex items-center justify-between bg-white border border-indigo-50/60 rounded-xl p-2.5 shadow-xs">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleVoicePlayToggle(voiceNote.url)}
                  className="w-8 h-8 rounded-full bg-indigo-50 hover:bg-indigo-100 flex items-center justify-center text-indigo-600 cursor-pointer transition-colors"
                  title="Play recorded note"
                >
                  {isPlayingRecord && playingFileUrl === voiceNote.url ? (
                    <Pause className="w-4 h-4 fill-indigo-600" />
                  ) : (
                    <Play className="w-4 h-4 fill-indigo-600 ml-0.5" />
                  )}
                </button>
                <div>
                  <p className="text-xs font-bold text-slate-800 flex items-center gap-1">
                    Voice Note Ready
                    <Check className="w-3 h-3 text-emerald-500 stroke-[3]" />
                  </p>
                  <p className="text-[10px] font-bold text-slate-400">Explanation attached</p>
                </div>
              </div>
              <button
                type="button"
                onClick={removeVoiceNote}
                className="w-7 h-7 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-rose-600 flex items-center justify-center cursor-pointer transition-colors"
                title="Remove voice note"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Uploaded files queue */}
          {files.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Attached files ({files.length}):</p>
              <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
                {files.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 rounded-xl bg-white border border-slate-100 hover:border-slate-200 shadow-2xs group transition-all"
                  >
                    <a
                      href={getFullDownloadUrl(file.url)}
                      download={file.filename}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 overflow-hidden pr-2 flex-1 hover:text-indigo-600 transition-colors"
                    >
                      <FileText className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                      <div className="overflow-hidden">
                        <p className="text-xs font-semibold text-slate-700 truncate group-hover:text-indigo-600" title={file.filename}>
                          {file.filename}
                        </p>
                        <p className="text-[9px] font-bold text-slate-400">{formatFileSize(file.file_size)}</p>
                      </div>
                    </a>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <a
                        href={getFullDownloadUrl(file.url)}
                        download={file.filename}
                        target="_blank"
                        rel="noreferrer"
                        className="w-7 h-7 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-indigo-600 flex items-center justify-center cursor-pointer transition-colors"
                        title="Download file"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                      <button
                        type="button"
                        onClick={() => removeFile(idx)}
                        className="w-7 h-7 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-rose-600 flex items-center justify-center cursor-pointer transition-colors"
                        title="Remove file"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
