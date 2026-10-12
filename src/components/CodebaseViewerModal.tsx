import React, { useState, useEffect } from 'react';
import {
  X,
  FileDown,
  FileText,
  Search,
  Copy,
  Check,
  Code2,
  FolderOpen,
  ExternalLink,
  Eye,
  Terminal,
  Layers,
  Sparkles,
  Download
} from 'lucide-react';
import { toast } from '../lib/toast';

interface CodebaseFileItem {
  index: number;
  path: string;
  size: number;
  linesCount: number;
  category: string;
}

interface CodebaseViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CodebaseViewerModal({ isOpen, onClose }: CodebaseViewerModalProps) {
  const [activeTab, setActiveTab] = useState<'explorer' | 'pdf' | 'combined'>('explorer');
  const [manifest, setManifest] = useState<{ totalFiles: number; totalLines: number; files: CodebaseFileItem[] } | null>(null);
  const [selectedFile, setSelectedFile] = useState<string>('server.ts');
  const [fileContent, setFileContent] = useState<{ path: string; linesCount: number; content: string; lines: string[] } | null>(null);
  const [combinedSnippet, setCombinedSnippet] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [loading, setLoading] = useState(false);
  const [copiedFile, setCopiedFile] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingTxt, setDownloadingTxt] = useState(false);

  // Fetch Manifest
  useEffect(() => {
    if (!isOpen) return;

    fetch('/api/codebase/manifest')
      .then(res => res.json())
      .then(data => {
        setManifest(data);
        if (data.files && data.files.length > 0 && !selectedFile) {
          setSelectedFile(data.files[0].path);
        }
      })
      .catch(err => {
        console.error('Failed to load codebase manifest:', err);
      });
  }, [isOpen]);

  // Fetch selected file content
  useEffect(() => {
    if (!isOpen || !selectedFile) return;

    setLoading(true);
    fetch(`/api/codebase/file?path=${encodeURIComponent(selectedFile)}`)
      .then(res => {
        if (!res.ok) throw new Error('File not found');
        return res.json();
      })
      .then(data => {
        setFileContent(data);
      })
      .catch(err => {
        console.error('Failed to load file content:', err);
        setFileContent(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isOpen, selectedFile]);

  // Load preview for combined view
  useEffect(() => {
    if (activeTab === 'combined' && !combinedSnippet) {
      fetch('/pulse-fitness-entire-codebase.txt')
        .then(res => res.text())
        .then(text => {
          setCombinedSnippet(text);
        })
        .catch(err => {
          console.error('Failed to load combined text:', err);
        });
    }
  }, [activeTab, combinedSnippet]);

  if (!isOpen) return null;

  // Direct safe Blob Download for PDF (Bypasses iframe sandbox pop-up blocks)
  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);
    toast.info('Preparing PDF download (988 pages)...');
    try {
      const res = await fetch('/pulse-fitness-entire-codebase.pdf');
      if (!res.ok) throw new Error('Failed to fetch PDF file');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = 'pulse-fitness-entire-codebase.pdf';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }, 2000);
      toast.success('Codebase PDF downloaded successfully!');
    } catch (err) {
      console.error(err);
      // Fallback: direct window location
      window.location.href = '/api/download-codebase-pdf';
    } finally {
      setDownloadingPdf(false);
    }
  };

  // Direct safe Blob Download for TXT
  const handleDownloadTxt = async () => {
    setDownloadingTxt(true);
    toast.info('Downloading complete codebase text file...');
    try {
      const res = await fetch('/pulse-fitness-entire-codebase.txt');
      if (!res.ok) throw new Error('Failed to fetch TXT file');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = 'pulse-fitness-entire-codebase.txt';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }, 2000);
      toast.success('Codebase text file downloaded!');
    } catch (err) {
      console.error(err);
      window.location.href = '/api/download-codebase-txt';
    } finally {
      setDownloadingTxt(false);
    }
  };

  const handleCopyFileContent = () => {
    if (!fileContent) return;
    navigator.clipboard.writeText(fileContent.content);
    setCopiedFile(true);
    toast.success(`Copied ${fileContent.path} (${fileContent.linesCount} lines) to clipboard!`);
    setTimeout(() => setCopiedFile(false), 2000);
  };

  const handleCopyCombinedContent = () => {
    if (!combinedSnippet) return;
    navigator.clipboard.writeText(combinedSnippet);
    setCopiedAll(true);
    toast.success('Entire 25,364-line codebase copied to clipboard!');
    setTimeout(() => setCopiedAll(false), 2500);
  };

  const filteredFiles = (manifest?.files || []).filter(f => {
    const matchesSearch = f.path.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat = selectedCategory === 'All' || f.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  const categories = ['All', 'Server Backend', 'Components', 'Business Logic (Lib)', 'Hooks', 'TypeScript Types', 'Configuration', 'Database Migrations', 'Scripts'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-4 overflow-hidden">
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-7xl h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Top Header */}
        <div className="px-5 py-3.5 border-b border-zinc-800 bg-zinc-900/80 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-red-600 to-amber-600 flex items-center justify-center text-white shadow-lg shadow-red-600/20">
              <Code2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  Pulse Fitness — Complete Source Code Repository
                </h2>
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  100% Line by Line
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                {manifest ? `${manifest.totalFiles} files · ${manifest.totalLines.toLocaleString()} total code lines · Zero omissions` : 'Loading codebase manifest...'}
              </p>
            </div>
          </div>

          {/* Action Downloads & Close */}
          <div className="flex items-center space-x-2">
            <button
              onClick={handleDownloadPdf}
              disabled={downloadingPdf}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition shadow-md shadow-red-600/20 cursor-pointer disabled:opacity-50"
              title="Download 988-page formatted PDF with line numbers"
            >
              <FileDown className="w-4 h-4" />
              <span>{downloadingPdf ? 'Downloading PDF...' : 'Download PDF'}</span>
            </button>

            <button
              onClick={handleDownloadTxt}
              disabled={downloadingTxt}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700 transition cursor-pointer disabled:opacity-50"
              title="Download entire code as single text file (.txt)"
            >
              <Download className="w-4 h-4 text-zinc-400" />
              <span>{downloadingTxt ? 'Downloading TXT...' : 'Download TXT'}</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white transition"
              title="Close viewer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation Strip */}
        <div className="px-5 py-2 border-b border-zinc-800 bg-zinc-900/40 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setActiveTab('explorer')}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === 'explorer'
                  ? 'bg-zinc-800 text-white shadow-sm border border-zinc-700'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
              }`}
            >
              <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
              <span>File Explorer ({manifest?.totalFiles || 109})</span>
            </button>

            <button
              onClick={() => setActiveTab('combined')}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === 'combined'
                  ? 'bg-zinc-800 text-white shadow-sm border border-zinc-700'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5 text-blue-400" />
              <span>Complete Concatenated Text (All in One)</span>
            </button>

            <button
              onClick={() => setActiveTab('pdf')}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === 'pdf'
                  ? 'bg-zinc-800 text-white shadow-sm border border-zinc-700'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
              }`}
            >
              <Eye className="w-3.5 h-3.5 text-red-400" />
              <span>Embedded PDF Viewer</span>
            </button>
          </div>

          <div className="hidden md:flex items-center space-x-3 text-xs text-zinc-500">
            <span>A4 Monospace 6.2pt</span>
            <span>•</span>
            <span>Zebra Stripe Highlight</span>
            <span>•</span>
            <span>988 Pages</span>
          </div>
        </div>

        {/* Tab 1: File Explorer */}
        {activeTab === 'explorer' && (
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            {/* Left Sidebar: File List */}
            <div className="w-full md:w-80 lg:w-96 border-b md:border-b-0 md:border-r border-zinc-800 bg-zinc-950 flex flex-col shrink-0 h-48 md:h-auto">
              {/* Search & Filter */}
              <div className="p-3 border-b border-zinc-800/80 space-y-2 shrink-0">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search file name or path..."
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-red-500"
                  />
                </div>

                <div className="flex items-center space-x-1 overflow-x-auto pb-1 scrollbar-none">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-2 py-0.5 rounded-md text-[11px] whitespace-nowrap transition ${
                        selectedCategory === cat
                          ? 'bg-red-600 text-white font-semibold'
                          : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Files Scroll List */}
              <div className="flex-1 overflow-y-auto divide-y divide-zinc-900/60 p-1.5">
                {filteredFiles.map((file) => {
                  const isSelected = selectedFile === file.path;
                  return (
                    <button
                      key={file.path}
                      onClick={() => setSelectedFile(file.path)}
                      className={`w-full text-left px-3 py-2 rounded-xl text-xs transition flex items-center justify-between group ${
                        isSelected
                          ? 'bg-red-600/15 border border-red-500/30 text-red-200 font-medium'
                          : 'hover:bg-zinc-900/80 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <div className="truncate mr-2">
                        <div className="flex items-center space-x-1.5">
                          <span className="text-[10px] text-zinc-500 font-mono">[{String(file.index).padStart(3, '0')}]</span>
                          <span className="truncate font-mono">{file.path}</span>
                        </div>
                        <span className="text-[10px] text-zinc-500">{file.category}</span>
                      </div>
                      <span className="text-[10px] text-zinc-500 font-mono shrink-0">
                        {file.linesCount.toLocaleString()} lines
                      </span>
                    </button>
                  );
                })}

                {filteredFiles.length === 0 && (
                  <div className="p-6 text-center text-xs text-zinc-500">
                    No files found matching "{searchQuery}"
                  </div>
                )}
              </div>
            </div>

            {/* Right Pane: Code Viewer */}
            <div className="flex-1 flex flex-col bg-[#090d16] overflow-hidden">
              {/* Code Header Bar */}
              <div className="px-4 py-2 border-b border-zinc-800 bg-zinc-900/60 flex items-center justify-between shrink-0">
                <div className="flex items-center space-x-2 truncate">
                  <Terminal className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-xs font-mono font-bold text-zinc-200 truncate">{selectedFile}</span>
                  {fileContent && (
                    <span className="text-[11px] text-zinc-500 font-mono">
                      ({fileContent.linesCount.toLocaleString()} lines)
                    </span>
                  )}
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  <button
                    onClick={handleCopyFileContent}
                    className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700 transition"
                  >
                    {copiedFile ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-zinc-400" />}
                    <span>{copiedFile ? 'Copied!' : 'Copy File'}</span>
                  </button>
                </div>
              </div>

              {/* Code Content Container */}
              <div className="flex-1 overflow-auto p-3 font-mono text-[11px] leading-5 selection:bg-red-600 selection:text-white">
                {loading ? (
                  <div className="flex items-center justify-center h-full text-zinc-500 text-xs">
                    Loading code content...
                  </div>
                ) : fileContent ? (
                  <div className="min-w-max">
                    {fileContent.lines.map((line, idx) => (
                      <div key={idx} className="flex hover:bg-zinc-800/40 px-1 rounded">
                        <span className="w-12 shrink-0 text-right pr-4 text-zinc-600 select-none">
                          {idx + 1}
                        </span>
                        <span className="text-zinc-300 whitespace-pre">{line || ' '}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-zinc-500 text-xs">
                    Select a file on the left to view code line-by-line.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Combined Text View */}
        {activeTab === 'combined' && (
          <div className="flex-1 flex flex-col bg-[#090d16] overflow-hidden">
            <div className="px-4 py-2 border-b border-zinc-800 bg-zinc-900/60 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2">
                <Layers className="w-4 h-4 text-blue-400" />
                <span className="text-xs font-bold text-zinc-200">
                  Concatenated Repository File (109 Files • 25,364 Lines)
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleCopyCombinedContent}
                  className="flex items-center space-x-1.5 px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700 transition"
                >
                  {copiedAll ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-zinc-400" />}
                  <span>{copiedAll ? 'Copied Entire Codebase!' : 'Copy Entire Codebase'}</span>
                </button>
                <button
                  onClick={handleDownloadTxt}
                  className="flex items-center space-x-1.5 px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download .txt File</span>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4 font-mono text-[11px] leading-5 text-zinc-300 whitespace-pre selection:bg-red-600 selection:text-white">
              {combinedSnippet ? (
                combinedSnippet
              ) : (
                <div className="flex items-center justify-center h-full text-zinc-500 text-xs">
                  Loading entire repository text...
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Embedded PDF Viewer */}
        {activeTab === 'pdf' && (
          <div className="flex-1 flex flex-col bg-zinc-900 overflow-hidden relative">
            <div className="px-4 py-2 border-b border-zinc-800 bg-zinc-950 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <span className="text-xs text-zinc-400">
                Displaying 988-page generated document (1.47 MB). If your browser does not render PDFs in iframes, click Download PDF.
              </span>
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleDownloadPdf}
                  className="flex items-center space-x-1.5 px-3 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  <span>Download PDF Document</span>
                </button>
              </div>
            </div>

            <div className="flex-1 w-full h-full relative bg-zinc-950">
              <object
                data="/api/view-codebase-pdf"
                type="application/pdf"
                className="w-full h-full border-none"
              >
                <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                  <FileDown className="w-12 h-12 text-red-400 mb-3" />
                  <p className="text-sm font-semibold text-white mb-1">
                    Direct Browser PDF Preview is Not Supported on This Device
                  </p>
                  <p className="text-xs text-zinc-400 max-w-md mb-4">
                    Your current browser or iframe sandbox blocks inline PDF streaming. You can download the PDF directly or read the entire codebase in the File Explorer tab!
                  </p>
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={handleDownloadPdf}
                      className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition shadow-lg shadow-red-600/20"
                    >
                      Download PDF to Device
                    </button>
                    <button
                      onClick={() => setActiveTab('explorer')}
                      className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700 transition"
                    >
                      View in File Explorer
                    </button>
                  </div>
                </div>
              </object>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
