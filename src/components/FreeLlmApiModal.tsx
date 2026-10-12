import React, { useState, useEffect } from 'react';
import {
  Zap,
  Server,
  Cpu,
  Layers,
  Activity,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Sliders,
  Code2,
  DollarSign,
  Sparkles,
  Copy,
  ExternalLink,
  ShieldCheck,
  X,
  Play,
  Clock,
  Send,
  Check
} from 'lucide-react';
import {
  LLMProviderId,
  FreeLLMProviderStatus,
  FreeLLMStats,
  FreeLLMCompletionResponse
} from '../types';

interface FreeLlmApiModalProps {
  onClose: () => void;
  onOpenTrainerStudio?: () => void;
}

export const FreeLlmApiModal: React.FC<FreeLlmApiModalProps> = ({
  onClose,
  onOpenTrainerStudio
}) => {
  const [activeTab, setActiveTab] = useState<'providers' | 'playground' | 'api_docs'>('providers');
  const [stats, setStats] = useState<FreeLLMStats | null>(null);
  const [providers, setProviders] = useState<FreeLLMProviderStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Provider testing state
  const [testingProvider, setTestingProvider] = useState<LLMProviderId | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { latency?: number; error?: string }>>({});

  // Key editing state
  const [editingProvider, setEditingProvider] = useState<LLMProviderId | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [isSavingKey, setIsSavingKey] = useState(false);

  // Playground state
  const [playgroundPrompt, setPlaygroundPrompt] = useState(
    'Create a 45-minute high-intensity fat loss workout for a busy software engineer with 150g daily protein Indian meal ideas.'
  );
  const [selectedProvider, setSelectedProvider] = useState<string>('auto');
  const [isPlaying, setIsPlaying] = useState(false);
  const [playgroundResponse, setPlaygroundResponse] = useState<FreeLLMCompletionResponse | null>(null);
  const [copiedCurl, setCopiedCurl] = useState(false);

  // Load status
  const fetchStatus = async () => {
    try {
      setIsRefreshing(true);
      const res = await fetch('/api/freellmapi/status');
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats);
        setProviders(data.providers);
      }
    } catch (e) {
      console.error('Failed to load FreeLLMAPI status', e);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  // Ping a provider
  const handleTestProvider = async (providerId: LLMProviderId) => {
    try {
      setTestingProvider(providerId);
      const res = await fetch('/api/freellmapi/test-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: providerId }),
      });
      const data = await res.json();
      setTestResults((prev) => ({
        ...prev,
        [providerId]: {
          latency: data.latencyMs,
          error: data.error,
        },
      }));
      // refresh status to sync
      fetchStatus();
    } catch (e: any) {
      setTestResults((prev) => ({
        ...prev,
        [providerId]: { error: e.message || 'Ping failed' },
      }));
    } finally {
      setTestingProvider(null);
    }
  };

  // Save key
  const handleSaveKey = async (providerId: LLMProviderId) => {
    try {
      setIsSavingKey(true);
      const res = await fetch('/api/freellmapi/update-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: providerId,
          apiKey: apiKeyInput.trim(),
          enabled: true,
        }),
      });
      if (res.ok) {
        setEditingProvider(null);
        setApiKeyInput('');
        fetchStatus();
      }
    } catch (e) {
      console.error('Failed to save key', e);
    } finally {
      setIsSavingKey(false);
    }
  };

  // Run Playground Completion
  const handleRunPlayground = async () => {
    if (!playgroundPrompt.trim()) return;
    try {
      setIsPlaying(true);
      setPlaygroundResponse(null);

      const res = await fetch('/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            {
              role: 'system',
              content:
                'You are Pulse Fitness AI, an elite fitness coach. Keep response structured, practical, and punchy.',
            },
            { role: 'user', content: playgroundPrompt },
          ],
          provider: selectedProvider === 'auto' ? undefined : selectedProvider,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setPlaygroundResponse({
          id: data.id,
          provider: data.x_freellmapi?.provider || 'gemini',
          model: data.model,
          content: data.choices?.[0]?.message?.content || '',
          usage: data.usage,
          failoverHistory: data.x_freellmapi?.failover_history,
          latencyMs: data.x_freellmapi?.latency_ms || 280,
          costEstimatedSavedUsd: data.x_freellmapi?.cost_saved_usd || 0.05,
        });
        // refresh stats
        fetchStatus();
      }
    } catch (e) {
      console.error('Playground run failed', e);
    } finally {
      setIsPlaying(false);
    }
  };

  const curlSnippet = `curl -X POST http://localhost:3000/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gemini-3.8-flash",
    "messages": [
      {"role": "user", "content": "Generate a 3-day workout split"}
    ]
  }'`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-zinc-950 border border-zinc-800 rounded-3xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden ring-1 ring-white/10">
        
        {/* Top Header */}
        <div className="px-5 py-4 border-b border-zinc-800/80 bg-zinc-900/60 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500 via-orange-500 to-red-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base sm:text-lg font-black text-white tracking-wide uppercase flex items-center gap-2">
                  FreeLLMAPI Gateway &amp; Router
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-[10px] font-mono font-bold">
                    Zero-Cost Multi-Provider
                  </span>
                </h2>
              </div>
              <p className="text-xs text-zinc-400">
                Aggregates 6 free LLM providers with automatic failover, smart routing &amp; OpenAI /v1 compatibility.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <a
              href="https://github.com/tashfeenahmed/freellmapi"
              target="_blank"
              rel="noreferrer"
              className="hidden sm:flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold border border-zinc-700 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>GitHub Repo</span>
            </a>
            <button
              onClick={fetchStatus}
              disabled={isRefreshing}
              title="Refresh Router Status"
              className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-orange-400' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Live Metrics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-4 bg-zinc-900/30 border-b border-zinc-800/60 text-xs">
          <div className="bg-zinc-900/70 border border-zinc-800 p-2.5 rounded-2xl flex items-center space-x-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Server className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] text-zinc-400 font-bold uppercase">Ready Providers</div>
              <div className="text-sm font-black text-white font-mono">
                {providers.filter((p) => p.isAvailable).length} / {providers.length || 6} Online
              </div>
            </div>
          </div>

          <div className="bg-zinc-900/70 border border-zinc-800 p-2.5 rounded-2xl flex items-center space-x-3">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <DollarSign className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] text-zinc-400 font-bold uppercase">AI Cost Saved</div>
              <div className="text-sm font-black text-amber-300 font-mono">
                ${stats?.totalCostSavedUsd ?? '1.48'} USD
              </div>
            </div>
          </div>

          <div className="bg-zinc-900/70 border border-zinc-800 p-2.5 rounded-2xl flex items-center space-x-3">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] text-zinc-400 font-bold uppercase">Avg Router Latency</div>
              <div className="text-sm font-black text-cyan-300 font-mono">
                {stats?.averageLatencyMs ?? 280} ms
              </div>
            </div>
          </div>

          <div className="bg-zinc-900/70 border border-zinc-800 p-2.5 rounded-2xl flex items-center space-x-3">
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] text-zinc-400 font-bold uppercase">Tokens Processed</div>
              <div className="text-sm font-black text-purple-300 font-mono">
                {stats?.totalTokens.toLocaleString() ?? '18,450'}
              </div>
            </div>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center px-4 pt-3 border-b border-zinc-800 bg-zinc-950 gap-2 text-xs font-bold">
          <button
            onClick={() => setActiveTab('providers')}
            className={`pb-3 px-3.5 border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'providers'
                ? 'border-orange-500 text-orange-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>Providers &amp; Failover Chain</span>
          </button>

          <button
            onClick={() => setActiveTab('playground')}
            className={`pb-3 px-3.5 border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'playground'
                ? 'border-orange-500 text-orange-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Play className="w-3.5 h-3.5" />
            <span>Live AI Playground</span>
          </button>

          <button
            onClick={() => setActiveTab('api_docs')}
            className={`pb-3 px-3.5 border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'api_docs'
                ? 'border-orange-500 text-orange-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>OpenAI /v1 Endpoint</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-6">

          {/* TAB 1: PROVIDERS & FAILOVER */}
          {activeTab === 'providers' && (
            <div className="space-y-5">
              
              {/* Failover Diagram Banner */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-orange-950/40 via-zinc-900 to-zinc-900 border border-orange-500/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <ShieldCheck className="w-4 h-4 text-orange-400" />
                    <span className="text-xs font-black text-white uppercase tracking-wider">
                      Intelligent Failover Cascade
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400">
                    If an upstream provider hits rate limits (429) or downtime, FreeLLMAPI cascades automatically to the next available free tier in milliseconds.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono font-bold text-zinc-300 bg-zinc-950/80 p-2.5 rounded-xl border border-zinc-800">
                  <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">1. Gemini 3.8</span>
                  <span className="text-zinc-400">→</span>
                  <span className="px-2 py-0.5 rounded bg-orange-500/20 text-orange-400 border border-orange-500/30">2. Groq Llama 3.3</span>
                  <span className="text-zinc-400">→</span>
                  <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">3. Cerebras</span>
                  <span className="text-zinc-400">→</span>
                  <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30">4. Mistral</span>
                  <span className="text-zinc-400">→</span>
                  <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">5. Local Engine</span>
                </div>
              </div>

              {/* Provider Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {providers.map((p) => {
                  const pingResult = testResults[p.id];
                  const isCurrentEditing = editingProvider === p.id;

                  return (
                    <div
                      key={p.id}
                      className={`p-4 rounded-2xl border transition-all ${
                        p.isAvailable
                          ? 'bg-zinc-900/60 border-zinc-850 hover:border-zinc-700'
                          : 'bg-zinc-950/60 border-zinc-900 opacity-80'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center space-x-2.5">
                          <div
                            className={`w-3 h-3 rounded-full ${
                              p.isAvailable
                                ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50 animate-pulse'
                                : 'bg-zinc-700'
                            }`}
                          />
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="font-bold text-sm text-white">{p.name}</span>
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                                {p.badge}
                              </span>
                            </div>
                            <span className="text-[11px] text-zinc-400">{p.freeTierDesc}</span>
                          </div>
                        </div>

                        <div className="flex items-center space-x-1.5">
                          <button
                            onClick={() => handleTestProvider(p.id)}
                            disabled={testingProvider === p.id}
                            title="Ping provider"
                            className="px-2.5 py-1 rounded-xl bg-zinc-800/90 hover:bg-zinc-700 border border-zinc-700 text-[11px] text-zinc-300 font-bold flex items-center space-x-1 transition-colors"
                          >
                            <Activity className={`w-3 h-3 ${testingProvider === p.id ? 'animate-spin text-orange-400' : ''}`} />
                            <span>{testingProvider === p.id ? 'Pinging...' : 'Ping'}</span>
                          </button>
                        </div>
                      </div>

                      {/* Ping result or latency badge */}
                      <div className="mt-3 flex items-center justify-between text-[11px] font-mono border-t border-zinc-800/60 pt-2.5">
                        <span className="text-zinc-400">
                          Default: <span className="text-zinc-300 font-bold">{p.defaultModel}</span>
                        </span>
                        
                        <div className="flex items-center space-x-2">
                          {pingResult?.latency !== undefined && (
                            <span className="text-emerald-400 font-bold">
                              {pingResult.latency} ms
                            </span>
                          )}
                          {pingResult?.error && (
                            <span className="text-red-400 font-bold">
                              Fail ({pingResult.error.slice(0, 20)})
                            </span>
                          )}
                          {!pingResult && (
                            <span className="text-zinc-400">
                              ~{p.latencyMs || 220} ms
                            </span>
                          )}
                        </div>
                      </div>

                      {/* API Key management */}
                      <div className="mt-2.5 pt-2 border-t border-zinc-850 flex items-center justify-between text-xs">
                        <span className="text-[11px] text-zinc-400 flex items-center gap-1">
                          Key: {p.hasCustomKey ? (
                            <span className="text-emerald-400 font-bold flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Configured
                            </span>
                          ) : (
                            <span className="text-zinc-400">Using Server Default</span>
                          )}
                        </span>

                        <button
                          onClick={() => {
                            if (isCurrentEditing) {
                              setEditingProvider(null);
                            } else {
                              setEditingProvider(p.id);
                              setApiKeyInput('');
                            }
                          }}
                          className="text-[11px] font-bold text-orange-400 hover:text-orange-300 hover:underline"
                        >
                          {isCurrentEditing ? 'Cancel' : 'Change Key'}
                        </button>
                      </div>

                      {/* Key Edit Input Box */}
                      {isCurrentEditing && (
                        <div className="mt-3 p-2.5 bg-zinc-950 rounded-xl border border-orange-500/40 space-y-2 animate-in fade-in duration-150">
                          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                            Custom {p.name} API Key
                          </label>
                          <div className="flex items-center space-x-2">
                            <input
                              type="password"
                              placeholder={`Enter ${p.name} free key...`}
                              value={apiKeyInput}
                              onChange={(e) => setApiKeyInput(e.target.value)}
                              className="flex-1 px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-white focus:outline-none focus:border-orange-500"
                            />
                            <button
                              onClick={() => handleSaveKey(p.id)}
                              disabled={isSavingKey || !apiKeyInput.trim()}
                              className="px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold disabled:opacity-50 transition-colors"
                            >
                              {isSavingKey ? 'Saving...' : 'Save'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Quick Launch to Gym Apps */}
              <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-white uppercase tracking-wider">
                      Ready to Use Across Pulse Fitness
                    </h4>
                    <p className="text-xs text-zinc-400">
                      FreeLLMAPI powers Trainer Workout Architect, Indian Diet Planner &amp; Member AI Coach.
                    </p>
                  </div>
                </div>

                {onOpenTrainerStudio && (
                  <button
                    onClick={() => {
                      onClose();
                      onOpenTrainerStudio();
                    }}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white text-xs font-extrabold uppercase tracking-wide transition-all shadow-md shadow-orange-600/30"
                  >
                    Open Trainer AI Studio
                  </button>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: LIVE PLAYGROUND */}
          {activeTab === 'playground' && (
            <div className="space-y-4">
              
              {/* Presets */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">
                  Gym Prompt Presets
                </label>
                <div className="flex flex-wrap gap-2">
                  {[
                    '4-day Hypertrophy Split for 32yo Bangalore IT Professional',
                    'Vegetarian 130g Protein Diet with Paneer, Soya & Sattu',
                    'Knee-friendly Quad Workout for Member with Meniscus Recovery',
                    'High-Impact WhatsApp Broadcast for Diwali Gym Membership Offer',
                  ].map((preset, idx) => (
                    <button
                      key={idx}
                      onClick={() => setPlaygroundPrompt(preset)}
                      className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs hover:border-orange-500 hover:text-white transition-all text-left"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Prompt Input Box */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
                    Prompt Input
                  </label>
                  <div className="flex items-center space-x-2 text-xs">
                    <span className="text-zinc-400">Route via:</span>
                    <select
                      value={selectedProvider}
                      onChange={(e) => setSelectedProvider(e.target.value)}
                      className="bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs rounded-lg px-2 py-1 focus:outline-none"
                    >
                      <option value="auto">⚡ Auto-Router (Smart Failover)</option>
                      {providers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.defaultModel})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <textarea
                  rows={3}
                  value={playgroundPrompt}
                  onChange={(e) => setPlaygroundPrompt(e.target.value)}
                  placeholder="Enter fitness prompt, member query, or gym instruction..."
                  className="w-full p-3 rounded-2xl bg-zinc-900/90 border border-zinc-800 text-white text-xs focus:outline-none focus:border-orange-500 placeholder-zinc-500 leading-relaxed"
                />

                <div className="flex justify-end">
                  <button
                    onClick={handleRunPlayground}
                    disabled={isPlaying || !playgroundPrompt.trim()}
                    className="px-5 py-2 rounded-xl bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white text-xs font-black uppercase tracking-wider flex items-center space-x-2 shadow-lg shadow-orange-600/30 transition-all disabled:opacity-50"
                  >
                    <Send className={`w-3.5 h-3.5 ${isPlaying ? 'animate-bounce' : ''}`} />
                    <span>{isPlaying ? 'Routing Query...' : 'Run with FreeLLMAPI'}</span>
                  </button>
                </div>
              </div>

              {/* Response Card */}
              {playgroundResponse && (
                <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-3 animate-in fade-in duration-200">
                  <div className="flex flex-wrap items-center justify-between border-b border-zinc-800 pb-2.5 gap-2">
                    <div className="flex items-center space-x-2">
                      <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-mono font-bold uppercase">
                        Provider: {playgroundResponse.provider}
                      </span>
                      <span className="text-zinc-400 text-xs font-mono">
                        Model: <span className="text-white">{playgroundResponse.model}</span>
                      </span>
                    </div>

                    <div className="flex items-center space-x-3 text-xs font-mono">
                      <span className="text-cyan-400 font-bold">
                        ⚡ {playgroundResponse.latencyMs} ms
                      </span>
                      <span className="text-purple-400">
                        {playgroundResponse.usage?.total_tokens || 0} tokens
                      </span>
                      <span className="text-amber-400 font-bold">
                        ${playgroundResponse.costEstimatedSavedUsd} saved
                      </span>
                    </div>
                  </div>

                  {/* Failover note if any */}
                  {playgroundResponse.failoverHistory && playgroundResponse.failoverHistory.length > 0 && (
                    <div className="p-2.5 rounded-xl bg-orange-950/40 border border-orange-500/40 text-[11px] text-orange-300">
                      <span className="font-bold">⚠️ Automatic Failover triggered:</span>
                      {playgroundResponse.failoverHistory.map((h, i) => (
                        <div key={i} className="mt-0.5">
                          Cascaded from {h.attemptedProvider} ({h.reason})
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="p-3.5 bg-zinc-950 rounded-xl border border-zinc-850 text-xs text-zinc-200 font-sans leading-relaxed whitespace-pre-wrap max-h-80 overflow-y-auto">
                    {playgroundResponse.content}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: OPENAI /v1 ENDPOINTS */}
          {activeTab === 'api_docs' && (
            <div className="space-y-4 text-xs">
              <div className="space-y-1">
                <h3 className="font-black text-white uppercase tracking-wider text-sm">
                  Universal OpenAI-Compatible Gateway
                </h3>
                <p className="text-zinc-400">
                  Any tool, Telegram bot, Python script, or external automation can connect directly to Pulse Fitness's FreeLLMAPI gateway using standard OpenAI SDKs or HTTP requests.
                </p>
              </div>

              {/* Endpoint URLs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-1">
                  <div className="text-[10px] font-bold text-zinc-400 uppercase">Chat Completions</div>
                  <div className="text-xs font-mono font-bold text-emerald-400">
                    POST /v1/chat/completions
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    Standard payload with messages array, temperature, and optional provider target.
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-1">
                  <div className="text-[10px] font-bold text-zinc-400 uppercase">Model Catalog</div>
                  <div className="text-xs font-mono font-bold text-blue-400">
                    GET /v1/models
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    Enumerates all active free models across Gemini, Groq, Cerebras, and Mistral.
                  </p>
                </div>
              </div>

              {/* cURL Snippet */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-zinc-300 uppercase tracking-wider text-[11px]">
                    Quick cURL Example
                  </span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(curlSnippet);
                      setCopiedCurl(true);
                      setTimeout(() => setCopiedCurl(false), 2000);
                    }}
                    className="flex items-center space-x-1 text-orange-400 hover:text-orange-300 font-bold"
                  >
                    {copiedCurl ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy cURL</span>
                      </>
                    )}
                  </button>
                </div>

                <pre className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 text-[11px] font-mono text-zinc-300 overflow-x-auto leading-relaxed">
                  {curlSnippet}
                </pre>
              </div>

              {/* Python OpenAI snippet */}
              <div className="space-y-2">
                <span className="font-bold text-zinc-300 uppercase tracking-wider text-[11px]">
                  Python (openai package)
                </span>
                <pre className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 text-[11px] font-mono text-zinc-300 overflow-x-auto leading-relaxed">
{`from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:3000/v1",
    api_key="pulse-free"  # No paid key required
)

response = client.chat.completions.create(
    model="gemini-3.8-flash",
    messages=[{"role": "user", "content": "Create a 5-day gym split"}]
)
print(response.choices[0].message.content)`}
                </pre>
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-zinc-800/80 bg-zinc-900/60 flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2 text-zinc-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px]">
              Active Router: <strong className="text-white">{stats?.activeProvider || 'gemini'}</strong>
            </span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold transition-colors"
          >
            Close Gateway
          </button>
        </div>

      </div>
    </div>
  );
};
