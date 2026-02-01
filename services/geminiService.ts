
import { GoogleGenAI, GenerateContentResponse, Modality } from "@google/genai";
import { SYSTEM_INSTRUCTION } from "../constants";
import { Message, ChatMode, Attachment } from "../types";

export function decodeBase64(base64: string): Uint8Array {
  try {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  } catch (e) {
    console.error("Base64 decoding failed", e);
    return new Uint8Array(0);
  }
}

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

export class GeminiService {
  private getClient() {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) throw new Error("AUTH_KEY_MISSING");
    return new GoogleGenAI({ apiKey });
  }

  async *streamChatResponse(history: Message[], mode: ChatMode = 'standard', attachments: Attachment[] = []) {
    try {
      const ai = this.getClient();
      const formattedHistory = history.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [
          { text: msg.content || "" },
          ...(msg.attachments?.map(att => ({
            inlineData: { mimeType: att.mimeType, data: att.data }
          })) || [])
        ]
      }));

      const userMessage = formattedHistory.pop();
      const chatHistory = formattedHistory;
      
      // Use Flash for standard/fast modes to ensure stability
      let model = 'gemini-3-flash-preview'; 
      if (mode === 'thinking') {
        model = 'gemini-3-pro-preview';
      }

      const config: any = {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.7,
        tools: [{ googleSearch: {} }],
      };

      if (mode === 'thinking') {
        config.thinkingConfig = { thinkingBudget: 16384 };
      }

      const chat = ai.chats.create({ model, config, history: chatHistory });
      const currentParts: any[] = [{ text: (userMessage?.parts[0] as any)?.text || "" }];
      
      if (attachments.length > 0) {
        attachments.forEach(att => {
          currentParts.push({ inlineData: { mimeType: att.mimeType, data: att.data } });
        });
      }

      const result = await chat.sendMessageStream({ message: { parts: currentParts } as any });
      for await (const chunk of result) {
        yield chunk as GenerateContentResponse;
      }
    } catch (error: any) {
      this.handleError(error);
    }
  }

  async generateImage(prompt: string, attachments: Attachment[] = []) {
    try {
      const ai = this.getClient();
      const model = 'gemini-2.5-flash-image';
      const parts: any[] = [{ text: prompt }];
      
      attachments?.forEach(att => {
        if (att.type === 'image') {
          parts.push({ inlineData: { data: att.data, mimeType: att.mimeType } });
        }
      });

      const response = await ai.models.generateContent({
        model,
        contents: { parts },
        config: {
          imageConfig: { aspectRatio: "1:1" }
        },
      });

      const candidate = (response as any).candidates?.[0];
      if (!candidate?.content?.parts) throw new Error("EMPTY_IMAGE_RESPONSE");
      
      for (const part of candidate.content.parts) {
        if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
      }
      throw new Error("NO_IMAGE_DATA");
    } catch (error: any) {
      this.handleError(error);
    }
  }

  async textToSpeech(text: string, voice: string = 'Kore'): Promise<string> {
    try {
      const ai = this.getClient();
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
          },
        },
      });
      const data = (response as any).candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!data) throw new Error("TTS_DATA_MISSING");
      return data;
    } catch (error: any) {
      this.handleError(error);
    }
  }

  async transcribeAudio(audioBase64: string, mimeType: string): Promise<string> {
    try {
      const ai = this.getClient();
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [
            { inlineData: { data: audioBase64, mimeType } },
            { text: "Accurately transcribe the audio content." }
          ]
        }
      });
      return response.text || "";
    } catch (error: any) {
      this.handleError(error);
    }
  }

  private handleError(error: any): never {
    const message = error.message || "";
    if (message.includes("403") || message.includes("permission denied")) {
      throw new Error("KEY_PERMISSION_REQUIRED");
    }
    if (message.includes("quota")) throw new Error("RATE_LIMIT_EXCEEDED");
    throw new Error(message || "UNEXPECTED_AI_ERROR");
  }
}

export const geminiService = new GeminiService();
