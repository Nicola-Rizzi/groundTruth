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
});
