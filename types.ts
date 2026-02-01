
export type Role = 'user' | 'assistant' | 'system';

export type ChatMode = 'standard' | 'thinking' | 'fast' | 'creative';

export interface Attachment {
  mimeType: string;
  data: string; // base64
  url: string; // blob url for preview
  type: 'image' | 'video' | 'audio';
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  timestamp: Date | string;
  isStreaming?: boolean;
  attachments?: Attachment[];
  generatedImageUrl?: string;
  audioData?: string; // base64 for TTS
  mode?: ChatMode;
}

export interface ChatSession {
  id: string;
  messages: Message[];
  title: string;
  updatedAt: number;
}
