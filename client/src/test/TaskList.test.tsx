import { describe, it, expect } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import { TaskList } from '../components/TaskList.js';
import type { Task } from '../api/client.js';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    taskId: 'task-001',
    priority: 10,
    type: 'medical-response',
    location: 'Gate A',
    zoneId: 'gate-a',
    reasoning: 'High-severity medical incident at Gate A — dispatch medical team immediately',
    status: 'open',
    conflicts: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('TaskList', () => {
  it('shows empty state when no tasks', () => {
    render(<TaskList tasks={[]} />);
    expect(screen.getByText(/no active tasks/i)).toBeInTheDocument();
  });

  it('renders a task card with priority badge', () => {
    render(<TaskList tasks={[makeTask()]} />);
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it('renders the task reasoning text', () => {
    render(<TaskList tasks={[makeTask()]} />);
    expect(screen.getByText(/dispatch medical team/i)).toBeInTheDocument();
  });

  it('renders task type label', () => {
    render(<TaskList tasks={[makeTask()]} />);
    expect(screen.getByText(/medical response/i)).toBeInTheDocument();
  });

  it('shows conflict alert when task has conflicts', () => {
    const taskWithConflict = makeTask({ conflicts: ['conflict-1'] });
    render(<TaskList tasks={[taskWithConflict]} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/conflict/i)).toBeInTheDocument();
  });

  it('shows open status pill', () => {
    render(<TaskList tasks={[makeTask({ status: 'open' })]} />);
    expect(screen.getByText('open')).toBeInTheDocument();
  });

  it('shows assigned status pill', () => {
    render(<TaskList tasks={[makeTask({ status: 'assigned', assignedTo: 'vol-001' })]} />);
    expect(screen.getByText('assigned')).toBeInTheDocument();
  });

  it('shows +N more tasks when over limit', () => {
    const tasks = Array.from({ length: 5 }, (_, i) =>
      makeTask({ taskId: `task-${i}`, priority: i + 1 })
    );
    render(<TaskList tasks={tasks} limit={3} />);
    expect(screen.getByText(/\+2 more tasks/)).toBeInTheDocument();
  });

  it('renders correct type icon for escort tasks', () => {
    render(<TaskList tasks={[makeTask({ type: 'escort' })]} />);
    expect(screen.getByText(/escort/i)).toBeInTheDocument();
  });

  it('renders multiple tasks', () => {
    const tasks = [
      makeTask({ taskId: 't1', type: 'medical-response' }),
      makeTask({ taskId: 't2', type: 'escort' }),
      makeTask({ taskId: 't3', type: 'crowd-reroute' }),
    ];
    render(<TaskList tasks={tasks} />);
    const items = screen.getAllByRole('listitem');
    expect(items.length).toBe(3);
  });

  it('calls onUpdateTask when lifecycle action is clicked', async () => {
    const user = userEvent.setup();
    const calls: Array<[string, string, string | undefined]> = [];
    render(
      <TaskList
        tasks={[makeTask({ status: 'open' })]}
        onUpdateTask={(taskId, status, assignedTo) => calls.push([taskId, status, assignedTo])}
      />
    );

    await user.click(screen.getByRole('button', { name: /start/i }));
    expect(calls).toEqual([['task-001', 'in-progress', 'vol-001']]);
  });
});
