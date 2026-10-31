import { useEffect, useRef, type ReactNode } from 'react';
let locks=0;let scrollPosition=0;let previousStyle='';
export function Modal({ children, onClose, label, className = '' }: { children: ReactNode; onClose: () => void; label: string; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const dialog = ref.current!; dialog.showModal();
    if(locks++===0){scrollPosition=window.scrollY;previousStyle=document.body.getAttribute('style')??'';Object.assign(document.body.style,{position:'fixed',top:`-${scrollPosition}px`,left:'0',right:'0',width:'100%',overflow:'hidden'});}
    return () => { dialog.close();if(--locks===0){document.body.setAttribute('style',previousStyle);window.scrollTo({top:scrollPosition,behavior:'instant'});} };
  }, []);
  return <dialog ref={ref} className={`modal ${className}`} aria-label={label}
    onCancel={e => { e.preventDefault(); close.current(); }}
    onClick={e => { if (e.target === e.currentTarget) close.current(); }}>
    <div className="modal-surface">{children}</div>
  </dialog>;
}
