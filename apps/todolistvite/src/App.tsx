import "./App.css";
import AddTodoListItem from "./components/AddTodoListItem/AddTodoListItem";
import SmartAddTodo from "./components/SmartAddTodo/SmartAddTodo";
import TodoList from "./components/TodoList/TodoList";
import useTodos from "./hooks/useTodos/useTodos";

function App() {
  const {
    todos,
    isLoading,
    error,
    addTodo,
    removeTodoListItem,
    markTodoListItem,
  } = useTodos();

  return (
    <>
      <section id="center">
        <SmartAddTodo addTodo={addTodo} />
        <AddTodoListItem addTodo={addTodo} />
        <TodoList
          addTodo={addTodo}
          todos={todos}
          isLoading={isLoading}
          error={error}
          removeTodoListItem={removeTodoListItem}
          markTodoListItem={markTodoListItem}
        />
      </section>
    </>
  );
}

export default App;
