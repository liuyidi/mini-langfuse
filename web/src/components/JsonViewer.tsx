type Props = { value: unknown };

export default function JsonViewer({ value }: Props) {
  if (value == null) return <span className="text-neutral-400 text-sm">null</span>;
  let str: string;
  try {
    str = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  } catch {
    str = String(value);
  }
  return (
    <pre className="text-xs font-mono whitespace-pre-wrap break-words bg-neutral-50 border border-neutral-200 rounded p-3 overflow-auto max-h-96">
      {str}
    </pre>
  );
}
