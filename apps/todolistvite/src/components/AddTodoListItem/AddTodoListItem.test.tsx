import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import AddTodoListItem from './AddTodoListItem';

describe('AddTodoListItem', () => {
  it('calls addTodo with the correct value when button is clicked', async () => {
    const addTodo = vi.fn();
    render(<AddTodoListItem addTodo={addTodo} />);

    await userEvent.type(screen.getByRole('textbox'), 'Buy milk');
    await userEvent.click(screen.getByRole('button', { name: /add/i }));

    expect(addTodo).toHaveBeenCalledWith('Buy milk');
  });
});
