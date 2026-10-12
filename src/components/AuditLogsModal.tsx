import React, { useState, useEffect } from 'react';
import { EmptySearch } from './ui/EmptySearch';
import { AuditLogRecord, Profile } from '../types';
import { ShieldCheck, History, Filter, Search } from 'lucide-react';
import { safeFetchJson } from '../lib/apiUtils';

interface AuditLogsModalProps {
  currentProfile: Profile;
  onClose: () => void;
}

export const AuditLogsModal: React.FC<AuditLogsModalProps> = ({ currentProfile, onClose }) => {
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const fetchAuditLogs = async () => {
    setLoading(true);
    try {
      const data = await safeFetchJson<AuditLogRecord[]>('/api/audit-logs', undefined, []);
      if (data) {
        setLogs(data);
      }
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditLogs();
  }, []);

  const filteredLogs = logs.filter(l => {
    if (!search) return true;
    const q = search.toLowerCase();
    return [l.action, l.user_name, (l as any).actor_id, l.entity_id, l.entity_type].some((v) => String(v ?? '').toLowerCase().includes(q));
  });

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-900 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-white">ENTERPRISE AUDIT TRAIL LOGS</h3>
              <p className="text-xs text-zinc-400 font-mono">Immutable audit records of all staff, owner & system actions</p>
            </div>
          </div>

          <button onClick={onClose} className="p-2 text-zinc-400 hover:text-white bg-zinc-800 rounded-xl">
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4 overflow-y-auto">
          
          <div className="flex items-center space-x-2">
            <input
              type="text"
              placeholder="Search audit action, user name or ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {filteredLogs.length === 0 ? (
              <EmptySearch what="audit entries" query={search} onClear={() => setSearch('')} emptyHint="Actions like logins, PIN changes and exports appear here." />
            ) : (
              filteredLogs.map((log) => (
                <div key={log.id} className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 bg-indigo-950 text-indigo-300 font-mono font-black text-[10px] rounded uppercase border border-indigo-800">
                      {log.action}
                    </span>
                    <span className="text-[10px] font-mono text-zinc-400">{new Date(log.created_at).toLocaleString()}</span>
                  </div>

                  <div className="flex justify-between text-zinc-300 pt-1">
                    <span>By: <strong className="text-white">{log.user_name}</strong> ({log.user_role})</span>
                    <span className="text-zinc-400 font-mono text-[10px]">Entity: {log.entity_type} #{log.entity_id}</span>
                  </div>

                  {(log.old_value || log.new_value) && (
                    <div className="p-2 bg-zinc-900/80 rounded-lg text-[10px] font-mono text-zinc-400 space-y-0.5 border border-zinc-800/60">
                      {log.old_value && <div>- Prev: {JSON.stringify(log.old_value)}</div>}
                      {log.new_value && <div>+ New: {JSON.stringify(log.new_value)}</div>}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 bg-zinc-950 border-t border-zinc-800 text-right">
          <button onClick={onClose} className="px-5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold rounded-xl">
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
