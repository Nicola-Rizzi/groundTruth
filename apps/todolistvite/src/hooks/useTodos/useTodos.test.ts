import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import useTodos from './useTodos';

beforeEach(() => {
  // The hook makes two kinds of calls: GET (initial load) and POST (addTodo).
  // A mock that answers [] to both silently breaks addTodo — the POST response
  // is what the hook prepends to the list, so it must echo the created todo
  // (with a server-assigned id), exactly like the real endpoint.
  vi.stubGlobal('fetch', vi.fn(async (_url, opts) => {
    if (opts?.method === 'POST') {
      const body = JSON.parse(opts.body as string);
      return { ok: true, json: async () => ({ id: 201, ...body }) };
    }
    return { ok: true, json: async () => [] };
  }));
});

describe('useTodos', () => {
  it('addTodo appends a new item to the list', async () => {
    const { result } = renderHook(() => useTodos());

    await act(async () => {
      result.current.addTodo('Buy milk');
    });

    expect(result.current.todos).toHaveLength(1);
    expect(result.current.todos[0].title).toBe('Buy milk');
  });

  it('addTodo attaches priority/dueDate locally — the API has nowhere to persist them', async () => {
    const { result } = renderHook(() => useTodos());

    await act(async () => {
      result.current.addTodo('Call the dentist', { priority: 'high', dueDate: '2026-07-22' });
    });

    expect(result.current.todos[0]).toMatchObject({ priority: 'high', dueDate: '2026-07-22' });
  });

  it('addTodo surfaces a failed POST as an error instead of adding a garbage item', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })));
    const { result } = renderHook(() => useTodos());

    await act(async () => {
      await result.current.addTodo('Buy milk');
    });

    expect(result.current.todos).toHaveLength(0);
    expect(result.current.error).toBeTruthy();
  });

  it('markTodoListItem flips completed locally and PATCHes the server', async () => {
    const { result } = renderHook(() => useTodos());
    await act(async () => {
      await result.current.addTodo('Buy milk');
    });
    expect(result.current.todos[0].completed).toBe(false);

    await act(async () => {
      result.current.markTodoListItem(result.current.todos[0].id);
    });

    expect(result.current.todos[0].completed).toBe(true);
    const patchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(
      ([, opts]) => opts?.method === 'PATCH'
    );
    expect(patchCall).toBeDefined();
    expect(JSON.parse(patchCall![1].body)).toEqual({ completed: true });
  });
});
