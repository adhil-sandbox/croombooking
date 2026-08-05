import { useEffect, useRef, useState } from 'react';

let listeners = [];
let toastId = 0;

export function toast(msg, type = '') {
  const id = ++toastId;
  listeners.forEach(fn => fn({ id, msg, type }));
}

export function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const handler = (t) => {
      setToasts(prev => [...prev, t]);
      setTimeout(() => setToasts(prev => prev.filter(x => x.id !== t.id)), 4200);
    };
    listeners.push(handler);
    return () => { listeners = listeners.filter(fn => fn !== handler); };
  }, []);

  return (
    <div className="toast-wrap">
      {toasts.map(t => (
        <div key={t.id} className={`toast${t.type ? ' ' + t.type : ''}`}>
          {t.msg}
        </div>
      ))}
    </div>
  );
}
