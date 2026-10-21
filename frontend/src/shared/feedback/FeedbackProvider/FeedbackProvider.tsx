import * as Dialog from '@radix-ui/react-dialog';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircleIcon, InfoIcon, WarningCircleIcon, XIcon } from '@phosphor-icons/react';
import type { PropsWithChildren } from 'react';
import { Button } from '@/shared/ui/Button';
import { FeedbackContext } from '../context';
import type { FeedbackController, ModalContext, ModalDescriptor, ToastInput } from '../types';

function Toast({ toast, dismiss }: { toast: ToastInput; dismiss: (id: string) => void }) {
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState(document.hidden);
  useEffect(() => {
    const update = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  const remaining = useRef(toast.duration === undefined ? 6000 : toast.duration);
  useEffect(() => {
    if (paused || hidden || remaining.current === null) return;
    const start = performance.now();
    const timer = window.setTimeout(() => dismiss(toast.id), remaining.current);
    return () => {
      window.clearTimeout(timer);
      if (remaining.current !== null)
        remaining.current = Math.max(0, remaining.current - (performance.now() - start));
    };
  }, [paused, hidden, dismiss, toast.id]);
  const Icon =
    toast.tone === 'success'
      ? CheckCircleIcon
      : toast.tone === 'warning' || toast.tone === 'error'
        ? WarningCircleIcon
        : InfoIcon;
  return (
    <div
      className={`toast toast--${toast.tone || 'info'}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setPaused(false);
      }}
    >
      <Icon size={21} />
      <div>
        <strong>{toast.title}</strong>
        {toast.description && <p>{toast.description}</p>}
      </div>
      <button
        className="icon-button"
        aria-label={`Đóng thông báo ${toast.title}`}
        onClick={() => dismiss(toast.id)}
      >
        <XIcon size={16} />
      </button>
    </div>
  );
}
export function FeedbackProvider({ children }: PropsWithChildren) {
  const [modal, setModal] = useState<ModalDescriptor | null>(null);
  const activeEpoch = useRef(0);
  const opener = useRef<HTMLElement | null>(null);
  const modalRef = useRef<ModalDescriptor | null>(null);
  const [submitBlocked, setSubmitBlocked] = useState(false);
  const [pending, setPendingState] = useState(false);
  const pendingRef = useRef(false);
  const dirty = useRef(false);
  const [discard, setDiscard] = useState(false);
  const [closeHint, setCloseHint] = useState('');
  const [toasts, setToasts] = useState<ToastInput[]>([]);
  const cancelDiscard = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (discard) cancelDiscard.current?.focus();
  }, [discard]);
  const close = useCallback(() => {
    if (pendingRef.current) return;
    activeEpoch.current += 1;
    modalRef.current = null;
    dirty.current = false;
    setModal(null);
    setDiscard(false);
    setCloseHint('');
  }, []);
  const requestClose = useCallback(() => {
    if (pendingRef.current) {
      setCloseHint('Thao tác đang được xử lý. Vui lòng chờ phản hồi.');
      return;
    }
    if (dirty.current) {
      setDiscard(true);
      return;
    }
    close();
  }, [close]);
  const setPending = useCallback((value: boolean) => {
    pendingRef.current = value;
    setPendingState(value);
    if (!value) setCloseHint('');
  }, []);
  const setDirty = useCallback((value: boolean) => {
    dirty.current = value;
  }, []);
  const dismiss = useCallback(
    (id: string) => setToasts((items) => items.filter((item) => item.id !== id)),
    [],
  );
  const controller = useMemo<FeedbackController>(
    () => ({
      openModal(descriptor) {
        if (modalRef.current) return false;
        activeEpoch.current += 1;
        opener.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
        modalRef.current = descriptor;
        pendingRef.current = false;
        dirty.current = false;
        setPendingState(false);
        setSubmitBlocked(false);
        setDiscard(false);
        setCloseHint('');
        setModal(descriptor);
        return true;
      },
      notify(toast) {
        setToasts((items) =>
          items.some((item) => item.id === toast.id) ? items : [...items, toast].slice(-20),
        );
      },
      dismiss,
      reset() {
        pendingRef.current = false;
        activeEpoch.current += 1;
        modalRef.current = null;
        dirty.current = false;
        setPendingState(false);
        setSubmitBlocked(false);
        setModal(null);
        setToasts([]);
        setDiscard(false);
      },
    }),
    [dismiss],
  );
  const modalEpoch = activeEpoch.current;
  const scopedActions = useMemo(() => {
    const valid = () => modalEpoch === activeEpoch.current;
    return {
      close: () => {
        if (valid()) close();
      },
      requestClose: () => {
        if (valid()) requestClose();
      },
      setPending: (value: boolean) => {
        if (valid()) setPending(value);
      },
      setDirty: (value: boolean) => {
        if (valid()) setDirty(value);
      },
      setSubmitBlocked: (value: boolean) => {
        if (valid()) setSubmitBlocked(value);
      },
    };
  }, [modalEpoch, close, requestClose, setPending, setDirty]);
  const context: ModalContext = {
    ...scopedActions,
    formId: `modal-form-${modal?.id || 'none'}`,
    pending,
    submitBlocked,
  };

  return (
    <FeedbackContext.Provider value={controller}>
      {children}
      <Dialog.Root
        open={modal !== null}
        onOpenChange={(open) => {
          if (!open) requestClose();
        }}
      >
        {modal && (
          <Dialog.Portal>
            <Dialog.Overlay className="modal-overlay" />
            <Dialog.Content
              className={`modal modal--${modal.size || 'md'}`}
              aria-describedby={modal.description ? `modal-description-${modal.id}` : undefined}
              onEscapeKeyDown={(event) => {
                event.preventDefault();
                if (discard) setDiscard(false);
                else requestClose();
              }}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                opener.current?.focus();
              }}
              onPointerDownOutside={(event) => {
                event.preventDefault();
                if (event.target instanceof Node && opener.current?.contains(event.target)) return;
                requestClose();
              }}
            >
              <header className="modal__header">
                <div>
                  <Dialog.Title>{modal.title}</Dialog.Title>
                  {modal.description && (
                    <Dialog.Description id={`modal-description-${modal.id}`}>
                      {modal.description}
                    </Dialog.Description>
                  )}
                </div>
                <button className="icon-button" aria-label="Đóng hộp thoại" onClick={requestClose}>
                  <XIcon size={20} />
                </button>
              </header>
              <div hidden={discard} className="modal__body">
                {modal.renderContent(context)}
              </div>
              {discard ? (
                <div className="modal__body">
                  <h3>Bỏ các thay đổi chưa lưu?</h3>
                  <p className="muted">Thông tin vừa nhập sẽ không được lưu.</p>
                  <div className="modal__actions">
                    <Button ref={cancelDiscard} onClick={() => setDiscard(false)}>
                      Tiếp tục chỉnh sửa
                    </Button>
                    <Button variant="danger" onClick={close}>
                      Bỏ thay đổi
                    </Button>
                  </div>
                </div>
              ) : (
                modal.renderFooter && (
                  <footer className="modal__footer">{modal.renderFooter(context)}</footer>
                )
              )}
              {closeHint && (
                <p className="modal__hint" role="status">
                  {closeHint}
                </p>
              )}
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </Dialog.Root>
      <div
        className="toast-host"
        role="status"
        aria-live="polite"
        aria-atomic="false"
        aria-label="Thông báo"
      >
        {toasts.slice(0, 3).map((toast) => (
          <Toast key={toast.id} toast={toast} dismiss={dismiss} />
        ))}
      </div>
    </FeedbackContext.Provider>
  );
}
