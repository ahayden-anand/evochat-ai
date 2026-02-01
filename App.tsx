
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Message, ChatSession, ChatMode, Attachment } from './types';
import { geminiService } from './services/geminiService';
import MessageBubble from './components/MessageBubble';
import ChatInput from './components/ChatInput';
import { APP_TITLE, APP_SUBTITLE } from './constants';

const STORAGE_KEY = 'evochat_pro_v9_stable';

const ChatContainer: React.FC = () => {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 1024);
  const [isTyping, setIsTyping] = useState(false);
  const [isAudioEnabled, setIsAudioEnabled] = useState(false);
  const [showKeyPrompt, setShowKeyPrompt] = useState(false);
  const [groundingMap, setGroundingMap] = useState<Record<string, string[]>>({});
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const createNewChat = useCallback(() => {
    const newId = Date.now().toString();
    const newSession: ChatSession = {
      id: newId,
      title: "New Session",
      updatedAt: Date.now(),
      messages: [{
        id: 'welcome-' + newId,
        role: 'assistant',
        content: "EvoChat is ready. How can I assist you today?",
        timestamp: new Date(),
        mode: 'standard'
      }]
    };
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newId);
    if (window.innerWidth < 1024) setIsSidebarOpen(false);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.length > 0) {
          setSessions(parsed);
          setCurrentSessionId(parsed[0].id);
        } else createNewChat();
      } catch { createNewChat(); }
    } else createNewChat();
  }, [createNewChat]);

  useEffect(() => {
    if (sessions.length > 0) localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  }, [sessions]);

  const currentSession = useMemo(() => sessions.find(s => s.id === currentSessionId), [sessions, currentSessionId]);
  const messages = useMemo(() => currentSession?.messages || [], [currentSession]);

  const executeAIRequest = async (text: string, attachments: Attachment[], mode: ChatMode, history: Message[], assistantId: string) => {
    setIsTyping(true);
    try {
      if (mode === 'creative') {
        const imageUrl = await geminiService.generateImage(text, attachments);
        setSessions(prev => prev.map(s => s.id === currentSessionId ? { 
          ...s, 
          messages: s.messages.map(m => m.id === assistantId ? { ...m, content: "Image generation complete.", generatedImageUrl: imageUrl, isStreaming: false } : m) 
        } : s));
      } else {
        let fullContent = '';
        const generator = geminiService.streamChatResponse(history, mode, attachments);
        for await (const responseObj of generator) {
          const chunk = responseObj as any;
          fullContent += chunk.text || "";
          
          const groundingChunks = chunk.candidates?.[0]?.groundingMetadata?.groundingChunks;
          if (groundingChunks) {
            const urls = groundingChunks.map((c: any) => c.web?.uri || c.maps?.uri).filter(Boolean);
            if (urls.length > 0) setGroundingMap(prev => ({ ...prev, [assistantId]: [...new Set([...(prev[assistantId] || []), ...urls])] }));
          }
          
          setSessions(prev => prev.map(s => s.id === currentSessionId ? { ...s, messages: s.messages.map(m => m.id === assistantId ? { ...m, content: fullContent } : m) } : s));
        }
        setSessions(prev => prev.map(s => s.id === currentSessionId ? { ...s, messages: s.messages.map(m => m.id === assistantId ? { ...m, isStreaming: false } : m) } : s));
      }
    } catch (error: any) {
      console.error(error);
      const isKeyError = error.message === 'KEY_PERMISSION_REQUIRED';
      setSessions(prev => prev.map(s => s.id === currentSessionId ? { ...s, messages: s.messages.map(m => m.id === assistantId ? { ...m, content: isKeyError ? "Permission denied. The selected model requires a project key with active billing enabled. Please use Standard mode or update your API key." : "An error occurred during synthesis. Please try again.", isStreaming: false } : m) } : s));
      if (isKeyError) setShowKeyPrompt(true);
    } finally { setIsTyping(false); }
  };

  const handleSendMessage = async (text: string, attachments: Attachment[], mode: ChatMode) => {
    if (!currentSessionId) return;
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text, attachments, timestamp: new Date() };
    const assistantId = (Date.now() + 1).toString();
    const assistantMsg: Message = { id: assistantId, role: 'assistant', content: '', timestamp: new Date(), isStreaming: true, mode };

    const newHistory = [...messages, userMsg];
    setSessions(prev => prev.map(s => s.id === currentSessionId ? {
      ...s,
      title: s.messages.length <= 1 ? (text.slice(0, 30) || "Conversation") : s.title,
      updatedAt: Date.now(),
      messages: [...s.messages, userMsg, assistantMsg]
    } : s));

    executeAIRequest(text, attachments, mode, newHistory, assistantId);
  };

  const handleEditMessage = async (messageId: string, newContent: string) => {
    if (!currentSessionId || isTyping) return;
    const idx = messages.findIndex(m => m.id === messageId);
    if (idx === -1) return;

    const historyBefore = messages.slice(0, idx);
    const editedMsg: Message = { ...messages[idx], content: newContent, timestamp: new Date() };
    const assistantId = (Date.now() + 1).toString();
    const assistantMsg: Message = { id: assistantId, role: 'assistant', content: '', timestamp: new Date(), isStreaming: true, mode: 'standard' };

    setSessions(prev => prev.map(s => s.id === currentSessionId ? {
      ...s,
      updatedAt: Date.now(),
      messages: [...historyBefore, editedMsg, assistantMsg]
    } : s));

    executeAIRequest(newContent, editedMsg.attachments || [], 'standard', [...historyBefore, editedMsg], assistantId);
  };

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  return (
    <div className="flex h-screen bg-white overflow-hidden font-sans">
      {isSidebarOpen && window.innerWidth < 1024 && (
        <div className="fixed inset-0 bg-slate-900/10 backdrop-blur-sm z-40 animate-fade-in" onClick={() => setIsSidebarOpen(false)} />
      )}

      {/* Sidebar Navigation */}
      <aside className={`${isSidebarOpen ? 'translate-x-0 w-80' : '-translate-x-full w-0'} transition-all duration-500 bg-white border-r border-slate-100 flex flex-col z-50 h-full fixed lg:relative`}>
        <div className="p-8 border-b border-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-4">
             <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center shadow-lg"><span className="text-white text-xs font-black">EVO</span></div>
             <div className="flex flex-col">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{APP_SUBTITLE}</span>
                <span className="text-lg font-black text-slate-900 tracking-tight">{APP_TITLE}</span>
             </div>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden p-2 text-slate-400">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-6">
          <button onClick={createNewChat} className="w-full py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl hover:bg-black transition-all flex items-center justify-center gap-3 active:scale-95">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4" /></svg>
            New Chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-10 custom-scrollbar space-y-1">
          {sessions.sort((a,b) => b.updatedAt - a.updatedAt).map(s => (
            <div key={s.id} onClick={() => { setCurrentSessionId(s.id); if(window.innerWidth < 1024) setIsSidebarOpen(false); }} className={`p-4 rounded-xl cursor-pointer transition-all ${currentSessionId === s.id ? 'bg-slate-50 text-slate-900 font-bold' : 'text-slate-500 hover:bg-slate-50'}`}>
              <span className="text-[12px] truncate block uppercase tracking-tight">{s.title}</span>
            </div>
          ))}
        </div>
      </aside>

      {/* Main Intelligence Workspace */}
      <div className="flex-1 flex flex-col relative h-full bg-white">
        <header className="h-20 flex items-center justify-between px-8 border-b border-slate-50 glass-header sticky top-0 z-40">
          <div className="flex items-center gap-6">
            {!isSidebarOpen && (
              <button onClick={() => setIsSidebarOpen(true)} className="p-2.5 bg-slate-900 text-white rounded-xl shadow-lg active:scale-95">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 6h16M4 12h16M4 18h16" /></svg>
              </button>
            )}
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Active Session</span>
              <span className="text-sm font-black text-slate-800 uppercase tracking-tight max-w-[200px] md:max-w-md truncate">{currentSession?.title}</span>
            </div>
          </div>

          <button onClick={() => setIsAudioEnabled(!isAudioEnabled)} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl border transition-all ${isAudioEnabled ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-400 border-slate-100'}`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M12 9v6m-4-2h4" /></svg>
            <span className="text-[10px] font-black uppercase tracking-[0.1em] hidden sm:block">Audio</span>
          </button>
        </header>

        <main className="flex-1 overflow-y-auto custom-scrollbar px-6 md:px-12 pt-16 pb-48">
          <div className="max-w-4xl mx-auto">
            {messages.map((msg) => (
              <MessageBubble 
                key={msg.id} 
                message={msg} 
                groundingUrls={groundingMap[msg.id]}
                autoPlay={isAudioEnabled}
                onEdit={msg.role === 'user' ? (content) => handleEditMessage(msg.id, content) : undefined}
                isTyping={isTyping}
              />
            ))}
            {isTyping && (
               <div className="flex justify-start mb-10 animate-slide-up">
                  <div className="bg-white border border-slate-100 rounded-3xl p-6 flex items-center gap-4 shadow-sm">
                     <div className="flex gap-1.5"><div className="w-2 h-2 bg-slate-900 rounded-full animate-bounce" /><div className="w-2 h-2 bg-slate-600 rounded-full animate-bounce [animation-delay:-0.1s]" /><div className="w-2 h-2 bg-slate-300 rounded-full animate-bounce [animation-delay:-0.2s]" /></div>
                     <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Generating...</span>
                  </div>
               </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </main>
        
        <div className="absolute bottom-0 left-0 right-0 bg-white/80 backdrop-blur-sm pt-4 pb-10 px-6">
          <ChatInput onSendMessage={handleSendMessage} disabled={isTyping} />
        </div>
      </div>

      {showKeyPrompt && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/10 backdrop-blur-md animate-fade-in">
          <div className="bg-white rounded-3xl p-12 max-w-lg w-full shadow-2xl animate-slide-up border border-slate-100">
            <h3 className="text-3xl font-black text-slate-900 mb-6 tracking-tighter uppercase">Authorized Key Required</h3>
            <p className="text-slate-500 mb-10 text-lg leading-relaxed font-medium">To use advanced reasoning (Thinking mode), a paid project API key is required. Standard chat is always available.</p>
            <button onClick={async () => { await (window as any).aistudio.openSelectKey(); setShowKeyPrompt(false); }} className="w-full py-6 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-[0.2em] shadow-xl hover:bg-black transition-all active:scale-95">Select Project Key</button>
            <button onClick={() => setShowKeyPrompt(false)} className="w-full mt-4 text-slate-400 font-bold uppercase tracking-widest text-[10px]">Continue with Standard Mode</button>
          </div>
        </div>
      )}
    </div>
  );
};

const App: React.FC = () => (<ChatContainer />);
export default App;
