import { useEffect, useState } from 'react';
import { SessionRecord } from '../types';
import { fetchRecentSessions } from '../lib/session';
import { getAllQueuedSessions } from '../lib/idb';

interface Props {
  isOnline: boolean;
}

export default function SessionsDashboard({ isOnline }: Props) {
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [queued, setQueued] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [remote, local] = await Promise.all([
        fetchRecentSessions(),
        getAllQueuedSessions(),
      ]);
      setSessions(remote);
      setQueued(local.length);
      setLoading(false);
    }
    load();
  }, [isOnline]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-gray-400 uppercase tracking-widest">Session Sync</h2>
        {queued > 0 && (
          <span className="text-xs text-amber-400 bg-amber-900/40 px-2 py-0.5 rounded-full">
            {queued} queued offline
          </span>
        )}
      </div>

      {loading ? (
        <p className="text-xs text-gray-600">Loading sessions...</p>
      ) : sessions.length === 0 ? (
        <div className="border border-gray-800 rounded-lg p-6 text-center text-gray-600 text-xs">
          No synced sessions yet. Install and play a guide to see events here.
        </div>
      ) : (
        <div className="border border-gray-800 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="border-b border-gray-800 bg-gray-900">
              <tr>
                <th className="text-left px-4 py-2 text-gray-500 font-normal">Event</th>
                <th className="text-left px-4 py-2 text-gray-500 font-normal">Pack</th>
                <th className="text-left px-4 py-2 text-gray-500 font-normal">Block</th>
                <th className="text-left px-4 py-2 text-gray-500 font-normal">Synced</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s, i) => (
                <tr key={i} className="border-b border-gray-800/50 last:border-0 hover:bg-gray-900/50">
                  <td className="px-4 py-2">
                    <span className={`px-1.5 py-0.5 rounded font-mono ${
                      s.event === 'installed' ? 'bg-blue-900/40 text-blue-400' :
                      s.event === 'completed' ? 'bg-green-900/40 text-green-400' :
                      'bg-gray-800 text-gray-400'
                    }`}>
                      {s.event}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-400">{s.packs?.title || s.pack_id}</td>
                  <td className="px-4 py-2 text-gray-400">{s.blocks?.title || s.block_id}</td>
                  <td className="px-4 py-2 text-gray-600 font-mono">
                    {s.synced_at ? new Date(s.synced_at).toLocaleTimeString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
