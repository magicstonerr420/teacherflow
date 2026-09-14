import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** "learningObjective" -> "Learning objective" */
function humanize(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A simple, generic editor for any generated lesson section.
 * Text becomes a text box, lists become one-item-per-line boxes, and nested
 * blocks (stages, slides, questions) become small cards — so a teacher can
 * fix any wording without regenerating the lesson.
 */
export function SectionEditor({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (next: unknown) => void;
}) {
  if (typeof value === "string") {
    const long = value.length > 70 || value.includes("\n");
    return long ? (
      <Textarea
        rows={Math.min(10, Math.max(2, Math.ceil(value.length / 80)))}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    ) : (
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    );
  }

  if (typeof value === "number") {
    return (
      <Input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
    );
  }

  if (typeof value === "boolean") {
    return (
      <select
        className="border-input bg-background h-9 rounded-md border px-3 text-sm"
        value={value ? "yes" : "no"}
        onChange={(e) => onChange(e.target.value === "yes")}
      >
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
    );
  }

  if (Array.isArray(value)) {
    const allStrings = value.every((v) => typeof v === "string");
    if (allStrings) {
      return (
        <div className="space-y-1">
          <Textarea
            rows={Math.min(12, Math.max(2, value.length + 1))}
            value={(value as string[]).join("\n")}
            onChange={(e) =>
              onChange(
                e.target.value
                  .split("\n")
                  .map((line) => line.trim())
                  .filter((line) => line.length > 0),
              )
            }
          />
          <p className="text-muted-foreground text-xs">One item per line.</p>
        </div>
      );
    }
    return (
      <div className="space-y-3">
        {value.map((entry, i) => (
          <div key={i} className="bg-muted/40 rounded-lg border p-3">
            <p className="text-muted-foreground mb-2 text-xs font-semibold uppercase">Item {i + 1}</p>
            <SectionEditor
              value={entry}
              onChange={(next) => {
                const copy = [...value];
                copy[i] = next;
                onChange(copy);
              }}
            />
          </div>
        ))}
      </div>
    );
  }

  if (isPlainObject(value)) {
    return (
      <div className="space-y-4">
        {Object.entries(value).map(([key, child]) => (
          <div key={key} className="space-y-1.5">
            <Label className="text-xs tracking-wide uppercase">{humanize(key)}</Label>
            <SectionEditor
              value={child}
              onChange={(next) => onChange({ ...value, [key]: next })}
            />
          </div>
        ))}
      </div>
    );
  }

  return null;
}
