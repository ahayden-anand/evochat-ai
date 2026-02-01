
import React, { useState, useRef, useEffect } from 'react';
import { ChatMode, Attachment } from '../types';
import { geminiService } from '../services/geminiService';

interface ChatInputProps {
  onSendMessage: (text: string, attachments: Attachment[], mode: ChatMode) => void;
  disabled: boolean;
}

const ChatInput: React.FC<ChatInputProps> = ({ onSendMessage, disabled }) => {
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<ChatMode>('standard');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if ((input.trim() || attachments.length > 0) && !disabled) {
      onSendMessage(input.trim(), attachments, mode);
      setInput('');
      setAttachments([]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newAttachments: Attachment[] = [];
    for (const file of Array.from(files)) {
      const reader = new FileReader();
      const promise = new Promise<void>((resolve) => {
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          const type = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'audio';
          newAttachments.push({ mimeType: file.type, data: base64, url: URL.createObjectURL(file), type: type as any });
          resolve();
        };
      });
      reader.readAsDataURL(file);
      await promise;
    }
    setAttachments(prev => [...prev, ...newAttachments]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const toggleRecording = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;
        audioChunksRef.current = [];
        recorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);
        recorder.onstop = async () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          setIsTranscribing(true);
          try {
            const reader = new FileReader();
            reader.onload = async () => {
              const base64 = (reader.result as string).split(',')[1];
              const transcription = await geminiService.transcribeAudio(base64, 'audio/webm');
              setInput(prev => (prev + " " + transcription).trim());
              setIsTranscribing(false);
            };
            reader.readAsDataURL(audioBlob);
          } catch (err) { setIsTranscribing(false); }
          stream.getTracks().forEach(t => t.stop());
        };
        recorder.start();
        setIsRecording(true);
      } catch (err) { console.error("Mic access denied", err); }
    }
  };

  return (
    <div className="max-w-4xl mx-auto w-full">
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-4 px-6">
          {attachments.map((att, i) => (
            <div key={i} className="relative w-20 h-20 rounded-2xl overflow-hidden border-2 border-white shadow-xl bg-white group">
              {att.type === 'image' ? <img src={att.url} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center bg-slate-50 text-[10px] font-black uppercase text-slate-400">{att.type}</div>}
              <button onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))} className="absolute top-1 right-1 bg-slate-900 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white border-2 border-slate-100 rounded-[2.5rem] shadow-2xl p-4 transition-all focus-within:border-slate-300">
        <div className="flex items-center gap-3 px-4 pb-3 mb-2 border-b border-slate-50 overflow-x-auto no-scrollbar">
          {[
            { id: 'standard', label: 'Synthesis', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
            { id: 'thinking', label: 'Reasoning', icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z' },
            { id: 'fast', label: 'Instant', icon: 'M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z' },
            { id: 'creative', label: 'Vision', icon: 'M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z' }
          ].map((m) => (
            <button key={m.id} onClick={() => setMode(m.id as any)} className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${mode === m.id ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d={m.icon} /></svg>
              {m.label}
            </button>
          ))}
        </div>

        <div className="flex items-end gap-2 pr-2">
          <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} multiple />
          <button onClick={() => fileInputRef.current?.click()} className="p-4 text-slate-400 hover:text-slate-900 transition-all active:scale-90"><svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4" /></svg></button>
          <button onClick={toggleRecording} className={`p-4 transition-all rounded-full ${isRecording ? 'text-red-500 bg-red-50' : isTranscribing ? 'text-indigo-500 animate-pulse' : 'text-slate-400 hover:text-slate-900'}`}><svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3zM19 10v1a7 7 0 01-14 0v-1M12 19v4m-4 0h8" /></svg></button>
          <textarea ref={textareaRef} rows={1} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder="Command Excellence..." disabled={disabled || isTranscribing} className="flex-1 bg-transparent border-none focus:ring-0 text-slate-800 placeholder-slate-300 resize-none py-4 font-medium text-lg" />
          <button onClick={handleSubmit} disabled={(!input.trim() && attachments.length === 0) || disabled} className={`p-5 rounded-3xl transition-all m-1 transform active:scale-95 ${input.trim() || attachments.length > 0 ? 'bg-slate-900 text-white shadow-2xl' : 'bg-slate-50 text-slate-200'}`}><svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg></button>
        </div>
      </div>
      <p className="text-center text-[9px] font-black text-slate-300 uppercase tracking-[0.3em] mt-6 opacity-60">Architected for Excellence Intelligence</p>
    </div>
  );
};

export default ChatInput;
