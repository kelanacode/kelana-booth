import React, { useState } from 'react';
import type { BoothTheme } from '@photo-booth/types';
import { withAlpha } from '../../lib/appearance';

const HomeIcon: React.FC = () => (
  <svg
    viewBox="0 0 24 24"
    width="22"
    height="22"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.25"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
  </svg>
);

/**
 * Back to the start screen with a fresh session, on every booth screen but the
 * start screen. It sits above the screens (z-90) but under their pop-ups, and
 * outside the capture screen's tap-to-shoot area, so tapping it never fires or
 * blocks a shot; a shot already on its way still finishes (the camera service
 * queues it first). It never keeps focus, and it asks first so a guest's stray
 * tap does not end their session.
 */
export const BoothHomeButton: React.FC<{ theme: BoothTheme; onReset: () => void }> = ({ theme, onReset }) => {
  const [asking, setAsking] = useState(false);

  return (
    <>
      <button
        type="button"
        title="Kembali ke layar awal"
        aria-label="Kembali ke layar awal"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setAsking(true)}
        className="fixed bottom-3 left-3 z-[90] flex h-11 w-11 items-center justify-center rounded-full border-2 backdrop-blur-sm transition-transform hover:scale-110 active:scale-95 sm:bottom-5 sm:left-5"
        style={{
          backgroundColor: withAlpha(theme.deep, 0.55),
          borderColor: withAlpha('#ffffff', 0.6),
          color: '#ffffff',
        }}
      >
        <HomeIcon />
      </button>

      {asking && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pb-home-title"
          className="fixed inset-0 z-[400] flex items-center justify-center p-4"
          style={{ backgroundColor: withAlpha(theme.deep, 0.7) }}
          onClick={() => setAsking(false)}
        >
          <div
            className="w-full max-w-sm rounded-[16px] border-[3px] p-6 text-center shadow-xl"
            style={{ backgroundColor: theme.card, color: theme.cardForeground, borderColor: theme.secondary }}
            onClick={(event) => event.stopPropagation()}
          >
            <p id="pb-home-title" className="text-xl font-black uppercase tracking-[-0.01em]">
              Kembali ke layar awal?
            </p>
            <p className="mt-2 text-sm font-semibold opacity-80">
              Sesi ini akan diakhiri. Unggahan dan cetakan yang sudah berjalan tetap dilanjutkan.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setAsking(false)}
                className="flex-1 rounded-full border-[3px] px-4 py-3 text-sm font-black uppercase"
                style={{ borderColor: theme.cardForeground }}
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  setAsking(false);
                  onReset();
                }}
                className="flex-1 rounded-full px-4 py-3 text-sm font-black uppercase"
                style={{ backgroundColor: theme.primary, color: theme.primaryForeground }}
              >
                Ya, kembali
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
