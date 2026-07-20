import { memo, useState } from "react"
import { Input } from "@acme/ui/input"
import { Button } from "@acme/ui/button"

const AddTodoListItem = ({ addTodo }: { addTodo: (todo: string) => void }) => {
  const [todo, setTodo] = useState("")
  const [error, setError] = useState("")

  const handleSubmit = (e: { preventDefault(): void }) => {
    e.preventDefault()
    if (!todo.trim()) {
      setError("Todo can't be empty.")
      return
    }
    addTodo(todo.trim())
    setTodo("")
    setError("")
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 items-start w-full max-w-lg mx-auto">
      <div className="flex-1">
        <Input
          type="text"
          value={todo}
          onChange={(e) => { setTodo(e.target.value); setError("") }}
          placeholder="Add a new todo…"
          variant={error ? "error" : "default"}
        />
        {error && <p className="mt-1 text-xs" style={{ color: "rgb(var(--feedback-error))" }}>{error}</p>}
      </div>
      <Button variant="default" type="submit">Add</Button>
    </form>
  )
}

export default memo(AddTodoListItem)
