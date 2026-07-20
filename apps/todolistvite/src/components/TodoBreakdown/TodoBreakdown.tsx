import { memo, useEffect } from "react"
import { Badge } from "@acme/ui/badge"
import { Button } from "@acme/ui/button"
import { useBreakdown } from "../../hooks/useBreakdown/useBreakdown"

// Inline streaming panel: breaks a todo into subtasks that appear token by token.
// Auto-runs on mount (the parent shows it in response to a "Break down" click).
const TodoBreakdown = ({
  title,
  onAddSubtask,
}: {
  title: string
  onAddSubtask?: (subtask: string) => void
}) => {
  const { status, items, partial, error, run } = useBreakdown()

  useEffect(() => { run(title) }, [title, run])

  return (
    <div
      className="mt-2 rounded-[var(--radius-md)] border p-3"
      style={{ borderColor: "rgb(var(--border))", background: "rgb(var(--surface-subtle))" }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-medium" style={{ color: "rgb(var(--text-muted))" }}>
          Subtasks
        </span>
        {status === "streaming" && (
          <span className="text-xs animate-pulse" style={{ color: "rgb(var(--brand-accent))" }}>
            streaming…
          </span>
        )}
      </div>

      {error ? (
        <p className="text-xs" style={{ color: "rgb(var(--feedback-error))" }}>{error}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((item, i) => (
            <li key={i} className="flex items-center justify-between gap-2">
              <span className="text-sm" style={{ color: "rgb(var(--text))" }}>{item}</span>
              {onAddSubtask && status === "done" && (
                <Button size="sm" variant="ghost" onClick={() => onAddSubtask(item)}>+ add</Button>
              )}
            </li>
          ))}
          {/* The line currently streaming, shown with a cursor. */}
          {partial && (
            <li className="text-sm" style={{ color: "rgb(var(--text-muted))" }}>
              {partial}<span className="animate-pulse">▌</span>
            </li>
          )}
          {status === "streaming" && items.length === 0 && !partial && (
            <li className="text-sm" style={{ color: "rgb(var(--text-muted))" }}>thinking…</li>
          )}
        </ul>
      )}

      {status === "done" && onAddSubtask && items.length > 0 && (
        <div className="mt-2">
          <Badge variant="muted">{items.length} subtasks</Badge>
        </div>
      )}
    </div>
  )
}

export default memo(TodoBreakdown)
