import type { WatermarkLogoStyle, WatermarkPiece, WatermarkPieceKind } from '@photo-booth/types';
import { ColorField, NumberField, SelectField, TextField } from './fields';
import { isContactKind, PIECE_KIND_LABELS } from '../../utils/watermarkPieces';

interface WatermarkPanelProps {
  pieces: WatermarkPiece[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onAdd: (kind: WatermarkPieceKind) => void;
  onUpdate: (id: string, patch: Partial<WatermarkPiece>) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  /** Set when the frame still has the old single preset watermark. */
  hasLegacy?: boolean;
  onRemoveLegacy?: () => void;
}

const ADD_KINDS: WatermarkPieceKind[] = ['mark', 'logo', 'instagram', 'website', 'whatsapp', 'text'];

const chipClass = (active: boolean) =>
  `h-9 rounded-[10px] border-[3px] px-3 text-[0.68rem] font-black uppercase tracking-[0.08em] transition-all ${
    active ? 'border-[#a855f7] bg-[#a855f7] text-white' : 'border-pbx-line bg-white text-pbx-secondary-strong hover:bg-pbx-tint'
  }`;

const smallBtn =
  'h-9 rounded-[10px] border-[3px] border-pbx-line bg-white px-3 text-[0.68rem] font-black uppercase tracking-[0.08em] text-pbx-secondary-strong hover:bg-pbx-tint';

/**
 * Watermark pieces: each element (logo mark, full logo, Instagram, website,
 * WhatsApp, free text) is its own piece, placed on the canvas like a photo
 * area (drag, corner-resize, rotate handle) with its own color.
 */
export const WatermarkPanel = ({
  pieces,
  activeId,
  onSelect,
  onAdd,
  onUpdate,
  onDuplicate,
  onDelete,
  hasLegacy,
  onRemoveLegacy,
}: WatermarkPanelProps) => {
  const active = pieces.find((piece) => piece.id === activeId) ?? null;
  const set = (patch: Partial<WatermarkPiece>) => active && onUpdate(active.id, patch);
  const isLogo = active && (active.kind === 'mark' || active.kind === 'logo');

  return (
    <div className="rounded-[12px] border-[3px] border-pbx-line bg-pbx-paper p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-black uppercase tracking-[0.18em] text-pbx-ink">Watermark Kelana</h2>
        <span className="rounded-[8px] border-2 border-[#a855f7] bg-[#f3e8ff] px-2 py-0.5 text-xs font-black text-[#7e22ce]">
          {pieces.length}
        </span>
      </div>

      {hasLegacy && (
        <div className="mb-3 rounded-[10px] border-2 border-dashed border-pbx-line p-2 text-xs text-pbx-ink">
          Frame ini masih punya watermark versi lama (preset).{' '}
          <button type="button" className="font-black underline" onClick={onRemoveLegacy}>
            Hapus
          </button>
        </div>
      )}

      <p className="mb-2 text-[0.7rem] font-bold uppercase tracking-[0.1em] text-pbx-secondary-strong">Tambah</p>
      <div className="mb-3 flex flex-wrap gap-2">
        {ADD_KINDS.map((kind) => (
          <button key={kind} type="button" className={smallBtn} onClick={() => onAdd(kind)}>
            + {PIECE_KIND_LABELS[kind]}
          </button>
        ))}
      </div>

      {pieces.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {pieces.map((piece, index) => (
            <button key={piece.id} type="button" className={chipClass(piece.id === activeId)} onClick={() => onSelect(piece.id)}>
              {index + 1}. {PIECE_KIND_LABELS[piece.kind]}
            </button>
          ))}
        </div>
      )}

      {active ? (
        <div className="space-y-3">
          {!isLogo && <TextField label="Teks" value={active.text} onChange={(text) => set({ text })} />}

          {isLogo ? (
            <div className="grid grid-cols-2 gap-2">
              <SelectField
                label="Warna logo"
                value={active.logoStyle ?? 'brand'}
                onChange={(v) => set({ logoStyle: v as WatermarkLogoStyle })}
              >
                <option value="brand">Warna asli</option>
                <option value="brand-light">Asli terang (frame gelap)</option>
                <option value="solid">Satu warna</option>
              </SelectField>
              {active.logoStyle === 'solid' && <ColorField label="Warna" value={active.color} onChange={(color) => set({ color })} />}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <ColorField label="Warna" value={active.color} onChange={(color) => set({ color })} />
              <div className="flex flex-col justify-end gap-1">
                {isContactKind(active.kind) && (
                  <label className="flex items-center gap-2 text-xs font-bold text-pbx-ink">
                    <input type="checkbox" checked={Boolean(active.showIcon)} onChange={(e) => set({ showIcon: e.target.checked })} />
                    Ikon
                  </label>
                )}
                <label className="flex items-center gap-2 text-xs font-bold text-pbx-ink">
                  <input type="checkbox" checked={Boolean(active.bold)} onChange={(e) => set({ bold: e.target.checked })} />
                  Tebal
                </label>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label="Opacity (%)"
              value={Math.round(active.opacity * 100)}
              min={5}
              max={100}
              onChange={(v) => set({ opacity: Math.min(100, Math.max(5, v)) / 100 })}
            />
            <NumberField label="Rotasi (°)" value={active.rotation ?? 0} min={0} max={359} onChange={(v) => set({ rotation: ((v % 360) + 360) % 360 })} />
            <NumberField label="X" value={active.x} onChange={(x) => set({ x })} />
            <NumberField label="Y" value={active.y} onChange={(y) => set({ y })} />
            <NumberField
              label="Lebar"
              value={active.width}
              min={12}
              onChange={(width) => {
                // Keep the proportions when typing a width.
                const ratio = active.width / Math.max(1, active.height);
                set({ width: Math.max(12, width), height: Math.round(Math.max(12, width) / ratio) });
              }}
            />
            <NumberField label="Tinggi" value={active.height} min={8} onChange={(height) => set({ height: Math.max(8, height) })} />
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" className={smallBtn} onClick={() => onDuplicate(active.id)}>
              Duplikat
            </button>
            <button
              type="button"
              className="h-9 rounded-[10px] border-[3px] border-pbx-ui-brand bg-white px-3 text-[0.68rem] font-black uppercase tracking-[0.08em] text-pbx-brand-strong hover:bg-pbx-tint"
              onClick={() => onDelete(active.id)}
            >
              Hapus
            </button>
          </div>
          <p className="text-[0.68rem] text-pbx-secondary-strong">
            Geser di kanvas untuk memindah, tarik sudut untuk ubah ukuran, tarik bulatan atas untuk memutar.
          </p>
        </div>
      ) : (
        pieces.length > 0 && <p className="text-xs text-pbx-secondary-strong">Pilih potongan di atas atau klik di kanvas.</p>
      )}
    </div>
  );
};

export default WatermarkPanel;
