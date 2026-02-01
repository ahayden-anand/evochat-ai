
import React, { useState, useEffect, useRef } from 'react';
import { Message } from '../types';
import { geminiService, decodeBase64, decodeAudioData } from '../services/geminiService';

interface MessageBubbleProps {
  message: Message;
  groundingUrls?: string[];
  autoPlay?: boolean;
  onEdit?: (newContent: string) => void;
  isTyping?: boolean;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message, groundingUrls, autoPlay, onEdit, isTyping }) => {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const [isPlaying, setIsPlaying] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const audioContextRef = useRef<AudioContext | null>(null);
  
  const timeString = React.useMemo(() => {
    try {
      const date = typeof message.timestamp === 'string' ? new Date(message.timestamp) : message.timestamp;
      return date instanceof Date && !isNaN(date.getTime()) ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "";
    } catch { return ""; }
  }, [message.timestamp]);

  const handlePlayTTS = async () => {
    if (isPlaying || !message.content || isUser || isSystem) return;
    setIsPlaying(true);
    try {
      const audioBase64 = await geminiService.textToSpeech(message.content);
      const audioBytes = decodeBase64(audioBase64);
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      audioContextRef.current = ctx;
      const audioBuffer = await decodeAudioData(audioBytes, ctx, 24000, 1);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.onended = () => { setIsPlaying(false); ctx.close(); };
      source.start();
    } catch (e) {
      console.error(e);
      setIsPlaying(false);
    }
  };

  const handleSave = () => {
    if (editContent.trim() && editContent !== message.content && onEdit) {
      onEdit(editContent.trim());
    }
    setIsEditing(false);
  };

  useEffect(() => {
    if (autoPlay && !isUser && !isSystem && message.content && !message.isStreaming && !message.generatedImageUrl) {
      handlePlayTTS();
    }
    return () => { if (audioContextRef.current) audioContextRef.current.close(); };
  }, [autoPlay, message.isStreaming]);

  if (isSystem) return null;

  const isErrorMessage = message.content.includes("required") || message.content.includes("permission") || message.content.includes("error");

  return (
    <div className={`flex w-full mb-14 group ${isUser ? 'justify-end' : 'justify-start'} animate-slide-up`}>
      <div className={`relative max-w-[92%] md:max-w-[85%] rounded-[2.2rem] px-8 py-7 shadow-sm border transition-all ${isUser ? 'bg-slate-900 text-white rounded-tr-none' : isErrorMessage ? 'bg-red-50 text-red-900 border-red-100 rounded-tl-none' : 'bg-white border-slate-100 text-slate-800 rounded-tl-none'}`}>
        
        {isUser && !isEditing && (
          <button onClick={() => !isTyping && setIsEditing(true)} className="absolute -left-14 top-2 opacity-0 group-hover:opacity-100 transition-opacity p-3 text-slate-300 hover:text-slate-900 hover:bg-slate-50 rounded-xl">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
          </button>
        )}

        {!isUser && (
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className={`w-7 h-7 rounded-xl flex items-center justify-center shadow-sm ${isErrorMessage ? 'bg-red-500' : 'bg-slate-900'}`}><span className="text-[9px] font-black text-white">EVO</span></div>
              <div className="flex flex-col">
                <span className={`text-[9px] font-black uppercase tracking-[0.25em] ${isErrorMessage ? 'text-red-400' : 'text-slate-400'}`}>{message.mode === 'thinking' ? 'Deep Reasoning Mode' : 'Excellence Output'}</span>
                {message.isStreaming && <span className="text-[8px] font-bold text-indigo-500 animate-pulse tracking-widest uppercase">Synthesizing...</span>}
              </div>
            </div>
            {!message.isStreaming && (
              <button onClick={handlePlayTTS} className={`p-2 rounded-xl transition-all ${isPlaying ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-200 hover:text-slate-400 hover:bg-slate-50'}`}>
                 <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14" /></svg>
              </button>
            )}
          </div>
        )}

        {isEditing ? (
          <div className="flex flex-col gap-4 min-w-[300px] md:min-w-[500px]">
            <textarea 
              value={editContent} 
              onChange={(e) => setEditContent(e.target.value)} 
              className="w-full bg-slate-800 text-white border-none rounded-2xl p-5 text-lg focus:ring-2 focus:ring-indigo-500/50 outline-none resize-none min-h-[150px]"
              autoFocus
            />
            <div className="flex gap-3 justify-end">
              <button onClick={() => setIsEditing(false)} className="px-5 py-2 text-[10px] font-black uppercase text-slate-400 hover:text-white tracking-widest">Discard</button>
              <button onClick={handleSave} className="px-6 py-2.5 bg-white text-slate-900 rounded-xl text-[10px] font-black uppercase shadow-xl tracking-widest">Regenerate Analysis</button>
            </div>
          </div>
        ) : (
          <>
            {message.attachments && message.attachments.length > 0 && (
              <div className="flex flex-wrap gap-4 mb-6">
                {message.attachments.map((att, i) => (
                  <div key={i} className="rounded-2xl overflow-hidden border border-slate-100 max-w-[320px] shadow-lg bg-slate-50 transition-transform hover:scale-[1.02]">
                    {att.type === 'image' ? <img src={att.url} alt="Reference" className="w-full h-auto object-cover max-h-80" /> : <video src={att.url} className="w-full h-auto" controls />}
                  </div>
                ))}
              </div>
            )}

            {message.generatedImageUrl && (
              <div className="mb-6 rounded-[2rem] overflow-hidden border border-slate-200 shadow-2xl relative group">
                <img src={message.generatedImageUrl} alt="AI Synthesis" className="w-full h-auto" />
                <a href={message.generatedImageUrl} download className="absolute bottom-5 right-5 bg-white/95 backdrop-blur-md px-6 py-3 rounded-2xl text-[10px] font-black uppercase opacity-0 group-hover:opacity-100 transition-all shadow-2xl tracking-widest hover:bg-slate-900 hover:text-white">Download PNG</a>
              </div>
            )}

            <div className={`text-[16px] md:text-[18px] leading-relaxed whitespace-pre-wrap font-medium tracking-tight ${isUser ? 'text-white' : 'text-slate-800 opacity-90'}`}>
              {message.content}
              {message.isStreaming && <span className="inline-block w-2 h-5 ml-2 bg-indigo-500/40 animate-pulse rounded-full align-middle" />}
            </div>

            {groundingUrls && groundingUrls.length > 0 && (
              <div className="mt-8 pt-6 border-t border-slate-50">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-4">Verification Sources</span>
                <div className="flex flex-wrap gap-3">
                  {groundingUrls.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-indigo-600 font-bold bg-indigo-50/50 border border-indigo-100 hover:bg-indigo-100 px-4 py-2 rounded-xl transition-all flex items-center gap-2 group/link">
                      <svg className="w-3.5 h-3.5 transition-transform group-hover/link:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                      {new URL(url).hostname.replace('www.', '')}
                    </a>
                  ))}
                </div>
              </div>
            )}
            <div className={`text-[9px] mt-6 opacity-30 font-black tracking-widest uppercase flex items-center gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              {timeString}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default MessageBubble;
