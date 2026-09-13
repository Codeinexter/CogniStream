import * as React from "react";

export interface ToastProps {
  id?: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  variant?: "default" | "destructive";
}

let count = 0;
const listeners: Array<(toasts: ToastProps[]) => void> = [];
let memoryToasts: ToastProps[] = [];

function notify() {
  listeners.forEach((listener) => listener([...memoryToasts]));
}

export function toast({ title, description, variant = "default" }: ToastProps) {
  const id = (++count).toString();
  const newToast = { id, title, description, variant };
  memoryToasts = [newToast];
  notify();

  setTimeout(() => {
    memoryToasts = memoryToasts.filter((t) => t.id !== id);
    notify();
  }, 4000);
}

export function useToast() {
  const [toasts, setToasts] = React.useState<ToastProps[]>(memoryToasts);

  React.useEffect(() => {
    listeners.push(setToasts);
    return () => {
      const index = listeners.indexOf(setToasts);
      if (index > -1) listeners.splice(index, 1);
    };
  }, []);

  return { toasts, toast };
}