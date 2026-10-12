import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Sparkles,
  Bot,
  User,
  Zap,
  RefreshCw,
  Dumbbell,
  CheckCircle2,
  Clock,
  ChevronRight
} from 'lucide-react';
import { Member, FreeLLMChatMessage } from '../types';

interface PulseAiCoachChatProps {
  member: Member;
}

export const PulseAiCoachChat: React.FC<PulseAiCoachChatProps> = ({ member }) => {
  const [messages, setMessages] = useState<FreeLLMChatMessage[]>([
    {
      role: 'assistant',
      content: `Hey ${member.full_name.split(' ')[0]}! 💪 I am your **Pulse AI Coach** (powered by FreeLLMAPI).

How is your training going today? Ask me about:
• Exercise form and technique corrections
• High-protein South & North Indian meal options
• Pre/post-workout meal timing
• Managing muscle soreness & recovery`,
    },
  ]);

  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [providerUsed, setProviderUsed] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const quickPrompts = [
    '🥗 High-protein veg snacks for office',
    '🏋️‍♂️ Proper Barbell Squat depth & cues',
    '⚡ Pre-workout food 45 mins before gym',
    '💧 How much water on heavy leg days?',
    '😴 How to recover faster from muscle soreness',
  ];

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || input;
    if (!text.trim() || isSending) return;

    const userMsg: FreeLLMChatMessage = { role: 'user', content: text.trim() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput('');
    setIsSending(true);

    try {
      const res = await fetch('/api/freellmapi/coach-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedMessages.map((m) => ({ role: m.role, content: m.content })),
          member_id: member.id,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setLatencyMs(data.latencyMs || 240);
        setProviderUsed(data.provider || 'gemini');
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: data.content || 'Here is what you need to know for your fitness journey!',
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: 'Sorry, I hit a temporary hiccup. Please ask again in a moment!',
          },
        ]);
      }
    } catch (e) {
      console.error('Coach chat failed', e);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Pulse AI Coach is temporarily offline. Please check back shortly!',
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-4 sm:p-5 flex flex-col h-[520px] shadow-2xl space-y-3">
      
      {/* Coach Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-md shadow-orange-500/20">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
              Pulse AI Fitness Coach
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            </h3>
            <span className="text-[10px] text-zinc-400 font-mono">
              FreeLLMAPI Smart Router • Always Free
            </span>
          </div>
        </div>

        {providerUsed && (
          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-zinc-800 text-orange-400 border border-zinc-700">
            {providerUsed} {latencyMs ? `(${latencyMs}ms)` : ''}
          </span>
        )}
      </div>

      {/* Suggested Quick Chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {quickPrompts.map((prompt, i) => (
          <button
            key={i}
            onClick={() => handleSendMessage(prompt)}
            disabled={isSending}
            className="flex-shrink-0 px-2.5 py-1 rounded-xl bg-zinc-950 border border-zinc-800 hover:border-orange-500/60 text-zinc-300 text-[11px] font-medium transition-colors"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Message Stream */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
        {messages.map((msg, index) => {
          const isUser = msg.role === 'user';
          return (
            <div
              key={index}
              className={`flex items-start space-x-2 ${isUser ? 'justify-end' : 'justify-start'}`}
            >
              {!isUser && (
                <div className="w-6 h-6 rounded-lg bg-orange-600 flex-shrink-0 flex items-center justify-center text-white mt-1 shadow-sm">
                  <Bot className="w-3.5 h-3.5" />
                </div>
              )}

              <div
                className={`p-3 rounded-2xl max-w-[85%] leading-relaxed whitespace-pre-wrap ${
                  isUser
                    ? 'bg-gradient-to-r from-orange-600 to-red-600 text-white font-medium rounded-tr-sm shadow-md'
                    : 'bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-tl-sm'
                }`}
              >
                {msg.content}
              </div>

              {isUser && (
                <div className="w-6 h-6 rounded-lg bg-zinc-800 flex-shrink-0 flex items-center justify-center text-zinc-300 mt-1">
                  <User className="w-3.5 h-3.5" />
                </div>
              )}
            </div>
          );
        })}

        {isSending && (
          <div className="flex items-center space-x-2 text-zinc-400 text-xs py-2">
            <div className="w-6 h-6 rounded-lg bg-orange-600/30 flex items-center justify-center text-orange-400">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            </div>
            <span className="font-mono text-[11px] animate-pulse">
              Pulse AI is thinking via FreeLLMAPI...
            </span>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Input Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSendMessage();
        }}
        className="pt-2 border-t border-zinc-800/80 flex items-center space-x-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask coach about form, diet, hydration..."
          disabled={isSending}
          className="flex-1 bg-zinc-950 border border-zinc-800 focus:border-orange-500 rounded-xl px-3.5 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={isSending || !input.trim()}
          className="p-2.5 rounded-xl bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white transition-all disabled:opacity-50 shadow-md shadow-orange-600/30"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>

    </div>
  );
};
