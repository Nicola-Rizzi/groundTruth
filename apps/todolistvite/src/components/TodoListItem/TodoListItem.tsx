import { memo, useState } from "react"
import type { Todo } from "../../types"
import { Card } from "@acme/ui/card"
import { Badge } from "@acme/ui/badge"
import { Button } from "@acme/ui/button"
import TodoBreakdown from "../TodoBreakdown/TodoBreakdown"

const TodoListItem = ({
  todoItem,
  removeTodoListItem,
  markTodoListItem,
  addTodo,
}: {
  todoItem: Todo
  removeTodoListItem: (id: number) => void
  markTodoListItem: (id: number) => void
  addTodo?: (title: string) => void
}) => {
  const [showBreakdown, setShowBreakdown] = useState(false)

  return (
    <Card
      variant="default"
      padding="sm"
      className="flex-col gap-2 w-full max-w-lg mx-auto"
    >
      <div className="flex flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-sm truncate" style={{ color: todoItem.completed ? "rgb(var(--text-muted))" : "rgb(var(--text))",
            textDecoration: todoItem.completed ? "line-through" : "none" }}>
            {todoItem.title}
          </span>
          <Badge variant={todoItem.completed ? "success" : "muted"}>
            {todoItem.completed ? "done" : "pending"}
          </Badge>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button size="sm" variant="ghost" onClick={() => setShowBreakdown((v) => !v)}>
            {showBreakdown ? "Hide" : "Break down"}
          </Button>
          <Button
            size="sm"
            variant={todoItem.completed ? "outline" : "default"}
            onClick={() => markTodoListItem(todoItem.id)}
          >
            {todoItem.completed ? "Undo" : "Complete"}
          </Button>
          <Button size="sm" variant="destructive" onClick={() => removeTodoListItem(todoItem.id)}>
            Remove
          </Button>
        </div>
      </div>

      {showBreakdown && (
        <TodoBreakdown title={todoItem.title} onAddSubtask={addTodo} />
      )}
    </Card>
  )
}

export default memo(TodoListItem)
