import React, { useState } from 'react';
import {
  Megaphone,
  Sparkles,
  Zap,
  Copy,
  Check,
  X,
  Share2,
  Globe2,
  Calendar,
  Building2,
  Send
} from 'lucide-react';
import { Branch } from '../types';

interface OwnerAiBroadcastModalProps {
  branches: Branch[];
  activeBranchId: string;
  onClose: () => void;
}

export const OwnerAiBroadcastModal: React.FC<OwnerAiBroadcastModalProps> = ({
  branches,
  activeBranchId,
  onClose,
}) => {
  const [topic, setTopic] = useState('Diwali 20% Annual Membership Renewal & Transformation Challenge');
  const [campaignType, setCampaignType] = useState('Festive Promotion');
  const [targetAudience, setTargetAudience] = useState('All Active & Expired Members');
  const [selectedBranchId, setSelectedBranchId] = useState(
    activeBranchId === 'all' ? branches[0]?.id || '' : activeBranchId
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedResult, setGeneratedResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const presets = [
    {
      label: 'Diwali Renewal Blast',
      topic: 'Diwali 20% discount on Annual VIP passes + 2 personal training sessions free',
      type: 'Festive Promotion',
    },
    {
      label: 'Holiday Hours Alert',
      topic: 'Gym open from 6am - 12pm on festival day; regular hours resume following day',
      type: 'Operational Notice',
    },
    {
      label: 'New Year 60-Day Challenge',
      topic: 'Pulse Fitness 60-Day Body Transformation Challenge with ₹50,000 in cash prizes',
      type: 'Member Challenge',
    },
    {
      label: 'Maintenance Notification',
      topic: 'Steam bath and sauna routine maintenance this Wednesday from 11 AM - 3 PM',
      type: 'Gym Maintenance',
    },
  ];

  const handleGenerate = async () => {
    if (!topic.trim()) return;
    try {
      setIsGenerating(true);
      setGeneratedResult(null);

      const res = await fetch('/api/freellmapi/broadcast-writer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          campaignType,
          targetAudience,
          branch_id: selectedBranchId,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setGeneratedResult(data.content || '');
      }
    } catch (e) {
      console.error('Failed to generate broadcast', e);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-zinc-950 border border-zinc-800 rounded-3xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden ring-1 ring-white/10">
        
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-800 bg-zinc-900/60 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500 to-red-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
              <Megaphone className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base sm:text-lg font-black text-white tracking-wide uppercase">
                  AI Broadcast &amp; Campaign Writer
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-orange-500/20 border border-orange-500/40 text-orange-400 text-[10px] font-mono font-bold flex items-center gap-1">
                  <Zap className="w-3 h-3" /> FreeLLMAPI
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Generate high-converting WhatsApp &amp; In-App broadcasts in English, Kannada, and Hindi.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4 text-xs">
          
          {/* Quick Presets */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
              Quick Campaign Templates
            </label>
            <div className="flex flex-wrap gap-2">
              {presets.map((preset, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setTopic(preset.topic);
                    setCampaignType(preset.type);
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:border-orange-500 hover:text-white transition-all text-left font-medium"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Form Controls */}
          <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-bold text-zinc-400 uppercase text-[10px]">Campaign Category</label>
                <select
                  value={campaignType}
                  onChange={(e) => setCampaignType(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-1.5 text-white focus:outline-none focus:border-orange-500"
                >
                  <option value="Festive Promotion">Festive Offer &amp; Renewal Promo</option>
                  <option value="Operational Notice">Gym Hours &amp; Holiday Schedule</option>
                  <option value="Member Challenge">Transformation / Fitness Challenge</option>
                  <option value="Gym Maintenance">Equipment / Steam Bath Maintenance</option>
                  <option value="Daily Motivation">Daily Fitness &amp; Discipline Motivation</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-zinc-400 uppercase text-[10px]">Target Gym Branch</label>
                <select
                  value={selectedBranchId}
                  onChange={(e) => setSelectedBranchId(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-1.5 text-white focus:outline-none focus:border-orange-500"
                >
                  <option value="all">🏢 All 3 Branches (HQ Broadcast)</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      📍 {b.name.replace('Pulse Fitness - ', '')}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-bold text-zinc-400 uppercase text-[10px]">
                Topic &amp; Key Details to Include
              </label>
              <textarea
                rows={2}
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="What is this broadcast about? (e.g., Dates, discount percentages, special trainer sessions)..."
                className="w-full p-2.5 rounded-xl bg-zinc-950 border border-zinc-700 text-white text-xs focus:outline-none focus:border-orange-500"
              />
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleGenerate}
                disabled={isGenerating || !topic.trim()}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white font-black uppercase tracking-wider flex items-center space-x-2 shadow-lg shadow-orange-600/30 transition-all disabled:opacity-50"
              >
                <Sparkles className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
                <span>{isGenerating ? 'Generating Broadcasts...' : 'Generate Multi-Lingual Copy'}</span>
              </button>
            </div>
          </div>

          {/* Generated Result */}
          {generatedResult && (
            <div className="p-4 rounded-2xl bg-zinc-900 border border-orange-500/40 space-y-3 animate-in fade-in duration-200">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                <span className="font-bold text-white uppercase text-xs flex items-center gap-1.5">
                  <Globe2 className="w-4 h-4 text-emerald-400" />
                  Broadcast Drafts (English, Kannada &amp; Hindi)
                </span>

                <button
                  onClick={() => {
                    navigator.clipboard.writeText(generatedResult);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="px-3 py-1 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold flex items-center space-x-1.5 transition-colors"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Copied All</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Drafts</span>
                    </>
                  )}
                </button>
              </div>

              <div className="p-3.5 bg-zinc-950 rounded-xl border border-zinc-800 text-xs text-zinc-200 leading-relaxed whitespace-pre-wrap max-h-80 overflow-y-auto font-sans">
                {generatedResult}
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-zinc-800 bg-zinc-900/60 flex items-center justify-between text-xs">
          <span className="text-zinc-500">
            Powered by FreeLLMAPI smart router cascade • Zero API bills.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold transition-colors"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
