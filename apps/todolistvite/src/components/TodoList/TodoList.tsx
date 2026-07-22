import type { Todo } from "../../types";
import TodoListItem from "../TodoListItem/TodoListItem";

interface TodoListProps {
  todos: Todo[];
  isLoading: boolean;
  error: string | null;
  removeTodoListItem: (e: number) => void;
  markTodoListItem: (e: number) => void;
  addTodo?: (title: string, extra?: Pick<Todo, "priority" | "dueDate">) => void;
}

const TodoList = ({
  todos,
  isLoading,
  error,
  removeTodoListItem,
  markTodoListItem,
  addTodo,
}: TodoListProps) => {
  if (isLoading) return <p>is loading......</p>;
  if (error) return <p>{error}</p>;

  return (
    <ul>
      {todos.map((todo) => (
        <li key={todo.id}>
          <TodoListItem
            todoItem={todo}
            removeTodoListItem={removeTodoListItem}
            markTodoListItem={markTodoListItem}
            addTodo={addTodo}
          />
        </li>
      ))}
    </ul>
  );
};

export default TodoList;
