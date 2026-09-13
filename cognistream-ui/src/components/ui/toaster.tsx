import { useToast } from "../../hooks/use-toast";

export function Toaster() {
  const { toasts } = useToast();

  if (!toasts.length) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full">
      {toasts.map(({ id, title, description, variant }) => (
        <div
          key={id}
          className={`p-4 rounded-md shadow-md border text-sm ${
            variant === "destructive"
              ? "bg-red-600 text-white border-red-700"
              : "bg-slate-900 text-white border-slate-800"
          }`}
        >
          {title && <div className="font-semibold">{title}</div>}
          {description && <div className="text-xs opacity-90 mt-1">{description}</div>}
        </div>
      ))}
    </div>
  );
}