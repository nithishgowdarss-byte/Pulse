import React, { useEffect, useState } from 'react';
import { renderBanner, ensureBannerFonts, shareText, type RenderableBanner } from '../lib/bannerRenderer';

interface ApiBanner extends Omit<RenderableBanner, 'branches'> { id: string; branch_ids: string[] }

/** Active offers & events for members (read-only), rendered locally to images. */
export const MemberOffers: React.FC = () => {
  const [items, setItems] = useState<{ id: string; src: string; text: string; alt: string }[]>([]);
  useEffect(() => {
    (async () => {
      const [bRes, brRes] = await Promise.all([fetch('/api/banners'), fetch('/api/branches')]);
      if (!bRes.ok) return;
      const list: ApiBanner[] = await bRes.json();
      const branches = brRes.ok ? await brRes.json() : [];
      await ensureBannerFonts();
      setItems(list.slice(0, 10).map((b) => {
        const rb: RenderableBanner = { ...b, branches: branches.filter((x: any) => b.branch_ids.includes(x.id)).map((x: any) => ({ name: x.name, phone: x.phone })) };
        const c = document.createElement('canvas');
        renderBanner(c, rb, 'post');
        return { id: b.id, src: c.toDataURL('image/png'), text: shareText(rb), alt: b.copy.headline };
      }));
    })().catch(() => {});
  }, []);
  if (!items.length) return null;
  return (
    <div className="space-y-2" data-testid="member-offers">
      <h4 className="text-xs font-black text-zinc-300 uppercase tracking-wider">Offers & Events</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {items.map((i) => (
          <figure key={i.id} className="rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-900">
            <img src={i.src} alt={i.alt} className="w-full aspect-square object-cover" />
            <figcaption className="p-2 flex justify-end">
              <a href={`https://wa.me/?text=${encodeURIComponent(i.text)}`} target="_blank" rel="noopener noreferrer" className="text-[11px] font-bold text-emerald-400">Share on WhatsApp</a>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
};
