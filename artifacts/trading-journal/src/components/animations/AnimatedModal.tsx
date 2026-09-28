/**
 * AnimatedModal — backdrop + dialog/sheet animations via Motion.dev.
 *
 * Two layout modes:
 *   - "dialog"  — centered overlay (scale-up from center)
 *   - "sheet"   — bottom sheet (slides up from bottom edge)
 *
 * GPU-safe: backdrop uses opacity, content uses transform + opacity.
 * Respects prefers-reduced-motion.
 */
import { motion, AnimatePresence } from "motion/react";
import { createPortal } from "react-dom";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import {
  backdropVariants,
  dialogVariants,
  sheetVariants,
} from "@/animations/motion";

interface AnimatedModalProps {
  open?:        boolean;
  /** Alias for `open`, for call sites that pass `isOpen` */
  isOpen?:      boolean;
  onClose:      () => void;
  children:     React.ReactNode;
  /** Optional title — rendered as a simple header when provided */
  title?:       string;
  /** "dialog" (centered) or "sheet" (bottom drawer). Default: "dialog" */
  mode?:        "dialog" | "sheet";
  /** Extra classes on the inner content panel */
  panelClassName?: string;
  panelStyle?:  React.CSSProperties;
  /** zIndex for the overlay. Default: 1000 */
  zIndex?:      number;
  /** Blur + dim backdrop. Default: true */
  backdrop?:    boolean;
}

export function AnimatedModal({
  open,
  isOpen,
  onClose,
  children,
  title,
  mode           = "dialog",
  panelClassName,
  panelStyle,
  zIndex         = 1000,
  backdrop       = true,
}: AnimatedModalProps) {
  const reduced = useReducedMotion();
  const isVisible = open ?? isOpen ?? false;

  const content = (
    <AnimatePresence>
      {isVisible && (
        <>
          {/* Backdrop */}
          {backdrop && (
            <motion.div
              key="modal-backdrop"
              variants={reduced ? undefined : backdropVariants}
              initial={reduced ? { opacity: 1 } : "hidden"}
              animate="visible"
              exit={reduced ? undefined : "exit"}
              onClick={onClose}
              style={{
                position:             "fixed",
                inset:                0,
                zIndex,
                background:           "rgba(0,0,0,0.58)",
                backdropFilter:       "blur(4px)",
                WebkitBackdropFilter: "blur(4px)",
              }}
            />
          )}

          {/* Panel
              Dialogs are centered by a non-animated fixed flex wrapper.  This
              keeps Motion's scale/y transform free for the enter/exit animation
              instead of fighting an inline translate(-50%, -50%) transform. */}
          {mode === "dialog" ? (
            <div
              key="modal-dialog-center"
              style={{
                position: "fixed",
                inset: 0,
                zIndex: zIndex + 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "none",
              }}
            >
              <motion.div
                key="modal-panel"
                variants={reduced ? undefined : dialogVariants}
                initial={reduced ? undefined : "hidden"}
                animate="visible"
                exit={reduced ? undefined : "exit"}
                style={{
                  position: "relative",
                  pointerEvents: "auto",
                  maxWidth: "min(94vw, 980px)",
                  maxHeight: "92vh",
                  willChange: "transform, opacity",
                  ...panelStyle,
                }}
                className={panelClassName}
              >
                {title && (
                  <div style={{ padding: "14px 16px 0", fontSize: 14, fontWeight: 700, color: "white" }}>
                    {title}
                  </div>
                )}
                {children}
              </motion.div>
            </div>
          ) : (
            <motion.div
              key="modal-panel"
              variants={reduced ? undefined : sheetVariants}
              initial={reduced ? undefined : "hidden"}
              animate="visible"
              exit={reduced ? undefined : "exit"}
              style={{
                position: "fixed",
                zIndex: zIndex + 1,
                bottom: 0,
                left: 0,
                right: 0,
                willChange: "transform, opacity",
                ...panelStyle,
              }}
              className={panelClassName}
            >
              {title && (
                <div style={{ padding: "14px 16px 0", fontSize: 14, fontWeight: 700, color: "white" }}>
                  {title}
                </div>
              )}
              {children}
            </motion.div>
          )}
        </>
      )}
    </AnimatePresence>
  );

  return createPortal(content, document.body);
}
