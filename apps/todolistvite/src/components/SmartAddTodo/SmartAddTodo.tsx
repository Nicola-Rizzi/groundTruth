import { memo, useState } from "react"
import { Input } from "@acme/ui/input"
import { Button } from "@acme/ui/button"
import { Badge } from "@acme/ui/badge"
import { useSmartAdd } from "../../hooks/useSmartAdd/useSmartAdd"
import type { ParsedTodo } from "../../ai/types"

// Map the parsed priority to a real Badge variant. These names come straight
// from the design system (get_component_api("Badge")): high→accent (amber,
// attention), medium→default, low→muted. Using real variants, not guesses.
const PRIORITY_VARIANT: Record<ParsedTodo["priority"], "accent" | "default" | "muted"> = {
  high: "accent",
  medium: "default",
  low: "muted",
}

const SmartAddTodo = ({ addTodo }: { addTodo: (title: string) => void }) => {
  const [text, setText] = useState("")
  const { status, result, error, parse, reset } = useSmartAdd()

  const handleParse = async (e: { preventDefault(): void }) => {
    e.preventDefault()
    if (!text.trim()) return
    await parse(text.trim())
  }

  const handleAdd = () => {
    if (!result) return
    addTodo(result.title)
    setText("")
    reset()
  }

  const showPreview = result !== null
  const rejected = result !== null && !result.isTask

  return (
    <div className="w-full max-w-lg mx-auto">
      <form onSubmit={handleParse} className="flex gap-2 items-start">
        <div className="flex-1">
          <Input
            type="text"
            value={text}
            onChange={(e) => { setText(e.target.value); if (result || error) reset() }}
            placeholder='Try: "call the dentist next Tuesday, urgent"'
            variant={error ? "error" : "default"}
          />
          {error && (
            <p className="mt-1 text-xs" style={{ color: "rgb(var(--feedback-error))" }}>{error}</p>
          )}
        </div>
        <Button variant="accent" type="submit" disabled={status === "parsing" || !text.trim()}>
          {status === "parsing" ? "Reading…" : "Parse with AI"}
        </Button>
      </form>

      {showPreview && (
        <div
          className="mt-3 rounded-[var(--radius-md)] border p-4"
          style={{ borderColor: "rgb(var(--border))", background: "rgb(var(--surface-subtle))" }}
        >
          {rejected ? (
            <p className="text-sm" style={{ color: "rgb(var(--text-muted))" }}>
              That doesn't look like a task. Try rephrasing it as something to do.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium" style={{ color: "rgb(var(--text))" }}>{result.title}</span>
                <Badge variant={PRIORITY_VARIANT[result.priority]}>{result.priority}</Badge>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {result.dueDate && <Badge variant="outline">due {result.dueDate}</Badge>}
                {result.tags.map((tag) => (
                  <Badge key={tag} variant="muted">{tag}</Badge>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <Button variant="default" onClick={handleAdd}>Add to list</Button>
                <Button variant="ghost" onClick={() => { setText(""); reset() }}>Discard</Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default memo(SmartAddTodo)
