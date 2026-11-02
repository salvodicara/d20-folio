import { useId, type TextareaHTMLAttributes } from "react";

/** A labelled box for long text, with optional error text below (the Field's sibling). */
export function TextArea({
  label,
  hideLabel,
  error,
  ...area
}: {
  label: string;
  /** The label is already on screen just above: keep it for screen readers only. */
  hideLabel?: boolean;
  error?: string;
} & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  const note = error ? `${id}-err` : undefined;
  return (
    <div className="f-field">
      <label className={hideLabel ? "f-sr" : "f-lbl"} htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        className="f-in f-area"
        aria-invalid={error ? true : undefined}
        aria-describedby={note}
        {...area}
      />
      {error && (
        <div id={note} className="f-err" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
