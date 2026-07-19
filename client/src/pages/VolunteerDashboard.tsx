
import { useState } from 'react';
import { useZones, useTasks } from '../hooks/useData.js';
import { ZoneGrid } from '../components/ZoneGrid.js';
import { TaskList } from '../components/TaskList.js';
import { VolunteerChat } from '../components/VolunteerChat.js';
import { api } from '../api/client.js';

export function VolunteerDashboard() {
  const { data: zonesData, loading: zonesLoading } = useZones();
  const { data: tasksData, loading: tasksLoading, refetch: refetchTasks } = useTasks();
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);

  const criticalCount = zonesData?.zones.filter(z => z.status === 'critical').length ?? 0;
  const conflictCount = tasksData?.tasks.reduce((acc, t) => acc + t.conflicts.length, 0) ?? 0;

  const handleUpdateTask = async (taskId: string, status: string, assignedTo?: string) => {
    setUpdatingTaskId(taskId);
    try {
      await api.updateTask(taskId, { status, assignedTo });
      refetchTasks();
    } finally {
      setUpdatingTaskId(null);
    }
  };

  return (
    <div className="page gradient-hero">
      {/* Status bar */}
      <div className="status-bar" style={{ borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-6)', border: '1px solid var(--border)', flexWrap: 'wrap' }}>
        <div className="status-bar__item">
          <span className="live-dot" aria-hidden="true" />
          <span>Live</span>
          {zonesData && <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Tick #{zonesData.tick}</span>}
        </div>
        {criticalCount > 0 && (
          <div className="status-bar__item" role="alert" aria-live="assertive">
            <span style={{ color: 'var(--color-rose-400)', fontWeight: 600 }}>⚠️ {criticalCount} critical zone{criticalCount !== 1 ? 's' : ''}</span>
          </div>
        )}
        {conflictCount > 0 && (
          <div className="status-bar__item" role="alert">
            <span style={{ color: 'var(--color-amber-400)', fontWeight: 600 }}>⚡ {conflictCount} task conflict{conflictCount !== 1 ? 's' : ''}</span>
          </div>
        )}
        <div className="status-bar__item" style={{ marginLeft: 'auto' }}>
          <span>SoFi Stadium — FIFA World Cup 2026</span>
        </div>
      </div>

      <div className="two-col">
        {/* Left column: zones + tasks */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <section aria-label="Zone status">
            <h2 className="section-title">Zone Status</h2>
            {zonesLoading && !zonesData ? (
              <div className="zone-grid">
                {[...Array(12)].map((_, i) => <div key={i} className="skeleton" style={{ height: 100 }} />)}
              </div>
            ) : (
              <ZoneGrid zones={zonesData?.zones ?? []} />
            )}
          </section>

          <section aria-label="Priority task queue">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
              <h2 className="section-title" style={{ margin: 0 }}>Task Queue</h2>
              {tasksData && (
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                  {tasksData.tasks.length} active
                </span>
              )}
            </div>
            {tasksLoading && !tasksData ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {[...Array(4)].map((_, i) => <div key={i} className="skeleton" style={{ height: 72 }} />)}
              </div>
            ) : (
              <TaskList
                tasks={tasksData?.tasks ?? []}
                limit={15}
                onUpdateTask={handleUpdateTask}
                updatingTaskId={updatingTaskId}
              />
            )}
          </section>
        </div>

        {/* Right column: copilot chat */}
        <aside aria-label="AI Copilot">
          <h2 className="section-title">Stadium Copilot</h2>
          <div className="card" style={{ padding: 0, overflow: 'hidden', height: 600 }}>
            <VolunteerChat />
          </div>
        </aside>
      </div>
    </div>
  );
}
