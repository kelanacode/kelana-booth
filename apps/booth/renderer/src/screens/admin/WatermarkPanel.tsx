import type { FrameWatermark, FrameWatermarkLogo, FrameWatermarkPosition, FrameWatermarkTone } from '@photo-booth/types';
import { NumberField, SelectField, TextField } from './fields';
import { withWatermarkDefaults } from '../../utils/watermark';

interface WatermarkPanelProps {
  watermark: FrameWatermark | undefined;
  onChange: (watermark: FrameWatermark) => void;
}

const chipClass = (active: boolean) =>
  `h-10 rounded-[10px] border-[3px] px-3 text-xs font-black uppercase tracking-[0.1em] transition-all ${
    active ? 'border-pbx-secondary bg-pbx-secondary text-white' : 'border-pbx-line bg-white text-pbx-secondary-strong hover:bg-pbx-tint'
  }`;

const LOGO_OPTIONS: Array<{ value: FrameWatermarkLogo; label: string }> = [
  { value: 'mark', label: 'Logo mark' },
  { value: 'logo', label: 'Mark + tulisan' },
  { value: 'none', label: 'Tanpa logo' },
];

/**
 * Kelana watermark presets for a frame: logo mark only, logo mark + "elana",
 * or no logo, plus Instagram / website / WhatsApp. Drawn on top of the
 * printed result, the booth preview and the GIF.
 */
export const WatermarkPanel = ({ watermark, onChange }: WatermarkPanelProps) => {
  const wm = withWatermarkDefaults(watermark);
  const set = (updates: Partial<FrameWatermark>) => onChange({ ...wm, ...updates });

  return (
    <div className="rounded-[12px] border-[3px] border-pbx-line bg-pbx-paper p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-black uppercase tracking-[0.18em] text-pbx-ink">Watermark Kelana</h2>
        <label className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.1em] text-pbx-ink">
          <input type="checkbox" checked={wm.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
          {wm.enabled ? 'On' : 'Off'}
        </label>
      </div>

      {wm.enabled && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {LOGO_OPTIONS.map((option) => (
              <button key={option.value} type="button" className={chipClass(wm.logo === option.value)} onClick={() => set({ logo: option.value })}>
                {option.label}
              </button>
            ))}
          </div>

          <div className="grid gap-2">
            <label className="flex items-center gap-2 text-xs font-bold text-pbx-ink">
              <input type="checkbox" checked={wm.showInstagram} onChange={(e) => set({ showInstagram: e.target.checked })} />
              Instagram
            </label>
            {wm.showInstagram && <TextField label="Instagram" value={wm.instagram} onChange={(instagram) => set({ instagram })} />}
            <label className="flex items-center gap-2 text-xs font-bold text-pbx-ink">
              <input type="checkbox" checked={wm.showWebsite} onChange={(e) => set({ showWebsite: e.target.checked })} />
              Website
            </label>
            {wm.showWebsite && <TextField label="Website" value={wm.website} onChange={(website) => set({ website })} />}
            <label className="flex items-center gap-2 text-xs font-bold text-pbx-ink">
              <input type="checkbox" checked={wm.showWhatsapp} onChange={(e) => set({ showWhatsapp: e.target.checked })} />
              WhatsApp
            </label>
            {wm.showWhatsapp && <TextField label="WhatsApp" value={wm.whatsapp} onChange={(whatsapp) => set({ whatsapp })} />}
          </div>

          <label className="flex items-center gap-2 text-xs font-bold text-pbx-ink">
            <input type="checkbox" checked={Boolean(wm.repeatPerStrip)} onChange={(e) => set({ repeatPerStrip: e.target.checked })} />
            Ulangi di tiap strip (frame strip ganda yang dipotong dua)
          </label>

          <div className="grid grid-cols-2 gap-2">
            <SelectField label="Posisi" value={wm.position} onChange={(v) => set({ position: v as FrameWatermarkPosition })}>
              <option value="bottom-center">Bawah tengah</option>
              <option value="bottom-left">Bawah kiri</option>
              <option value="bottom-right">Bawah kanan</option>
              <option value="top-left">Atas kiri</option>
              <option value="top-right">Atas kanan</option>
            </SelectField>
            <SelectField label="Warna" value={wm.tone} onChange={(v) => set({ tone: v as FrameWatermarkTone })}>
              <option value="light">Terang (frame gelap)</option>
              <option value="color">Berwarna (frame terang)</option>
              <option value="dark">Gelap</option>
            </SelectField>
            <NumberField
              label="Ukuran (%)"
              value={Math.round(wm.size * 1000) / 10}
              min={1}
              max={20}
              allowDecimal
              onChange={(v) => set({ size: Math.min(20, Math.max(1, v)) / 100 })}
            />
            <NumberField
              label="Opacity (%)"
              value={Math.round(wm.opacity * 100)}
              min={10}
              max={100}
              onChange={(v) => set({ opacity: Math.min(100, Math.max(10, v)) / 100 })}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default WatermarkPanel;
