import React from "react"
import { Badge } from "../components"

export function FormCard({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-border bg-white p-6 shadow-xs">
      <h2 className="mb-5 text-lg font-black text-slate-900">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

export function AdminField(props: {
  label: string
  value: string
  onChange?: (value: string) => void
  required?: boolean
  type?: string
  disabled?: boolean
  placeholder?: string
}) {
  return (
    <label className="field-label block text-xs font-bold uppercase tracking-wider text-slate-600">
      {props.label}
      <input
        {...props}
        onChange={(event) => props.onChange?.(event.target.value)}
        className="field mt-2 w-full disabled:bg-slate-100"
      />
    </label>
  )
}

export function SimpleTable({
  headers,
  rows,
}: {
  headers: string[]
  rows: string[][]
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-white shadow-xs">
      <table className="data-table">
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>
                  {cellIndex === row.length - 1 ? (
                    <Badge tone="blue">{cell}</Badge>
                  ) : (
                    cell
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
