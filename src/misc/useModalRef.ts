import { MutableRefObject, useEffect, useRef } from "react";

export function useModalRef(
  open: boolean,
  closeOnOutsideClick?: boolean,
  allowCancel?: boolean
): MutableRefObject<HTMLDialogElement | null> {
  const ref = useRef<HTMLDialogElement | null>(null);

  let reopen = async () => {
    // We do this in a timeout so it runs after the modal has actually closed.
    setTimeout(() => ref.current?.showModal());
  };

  useEffect(() => {
    const onCancel = () => reopen();
    if (open) {
      if (ref.current && !ref.current?.open) {
        ref.current?.showModal();
        if (allowCancel !== undefined && !allowCancel) {
          ref.current?.addEventListener("cancel", onCancel);
        }
      }
      if (closeOnOutsideClick) {
        const handleClickOutside = (e: MouseEvent) => {
          const target = e.target as HTMLDialogElement | null;
          if (!target) return;

          const { top, left, width, height } = target.getBoundingClientRect();
          const clickedInDialog =
            top <= e.clientY &&
            e.clientY <= top + height &&
            left <= e.clientX &&
            e.clientX <= left + width;

          if (!clickedInDialog) {
            target.close();
          }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => {
          document.removeEventListener("mousedown", handleClickOutside);
          ref.current?.removeEventListener("cancel", onCancel);
        };
      }
      return () => {
        ref.current?.removeEventListener("cancel", onCancel);
      };
    } else {
      ref.current?.close();
      ref.current?.removeEventListener("cancel", onCancel);
    }
    return () => {
      ref.current?.removeEventListener("cancel", onCancel);
    };
  }, [open, closeOnOutsideClick]);

  return ref;
}
