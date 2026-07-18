import React from 'react';
import type { Task } from '../api/client.js';

const TYPE_ICONS: Record<string, string> = {
  'medical-response':  '🚑',
  'security-response': '🛡️',
  'escort':            '♿',
  'crowd-reroute':     '🔄',
  'gate-rebalance':    '🚪',
  'facilities':        '🔧',
};

function getPriorityClass(p: number): string {
  if (p <= 5)  return 'p1';
  if (p <= 10) return 'p2';
  if (p <= 20) return 'p3';
  if (p <= 30) return 'p4';
  if (p <= 50) return 'mid';
  return 'low';
}

function formatAge(isoDate: string): string {
  const secs = Math.round((Date.now() - new Date(isoDate).getTime()) / 1000);
  if (secs < 60)   return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

interface Props { tasks: Task[]; limit?: number; }

export function TaskList({ tasks, limit = 20 }: Props) {
  const visible = tasks.slice(0, limit);

  if (visible.length === 0) {
    return (
      <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: '2rem', marginBottom: 'var(--space-2)' }}>✅</div>
        <p>No active tasks</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--list-gap)' }} role="list" aria-label="Task queue">
      {visible.map(task => (
        <article key={task.taskId} className="task-card" role="listitem" aria-label={`Priority ${task.priority}: ${task.type}`}>
          {/* Priority badge */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <span
              className={`priority-badge priority-badge--${getPriorityClass(task.priority)}`}
              aria-label={`Priority ${task.priority}`}
            >
              {task.priority}
            </span>
          </div>

          {/* Type icon + body */}
          <div className="task-card__body">
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
              <span
                className={`task-card__type-icon task-card__type-icon--${task.type}`}
                aria-hidden="true"
              >
                {TYPE_ICONS[task.type] ?? '📋'}
              </span>
              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)' }}>
                {task.type.replace(/-/g, ' ')}
              </span>
              {task.conflicts.length > 0 && (
                <span
                  className="status-pill"
                  style={{ background: 'rgba(244,63,94,0.15)', color: 'var(--color-rose-400)' }}
                  title={`${task.conflicts.length} conflict(s) detected`}
                  role="alert"
                >
                  ⚡ {task.conflicts.length} conflict
                </span>
              )}
            </div>
            <p className="task-card__reasoning">{task.reasoning}</p>
            <div className="task-card__meta">
              <span className="task-card__location">📍 {task.zoneId.replace(/-/g, ' ')}</span>
              {task.assignedTo && <span>👤 {task.assignedTo}</span>}
              <span>{formatAge(task.createdAt)}</span>
            </div>
          </div>

          {/* Status pill */}
          <div>
            <span className={`status-pill status-pill--${task.status}`}>
              {task.status}
            </span>
          </div>
        </article>
      ))}

      {tasks.length > limit && (
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textAlign: 'center', padding: 'var(--space-2)' }}>
          +{tasks.length - limit} more tasks
        </p>
      )}
    </div>
  );
}
