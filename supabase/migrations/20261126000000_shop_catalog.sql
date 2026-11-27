-- Keep both legacy catalog slots and the five equipment slots used by the app.
alter table public.cosmetic_items drop constraint cosmetic_items_slot_check;
alter table public.cosmetic_items add constraint cosmetic_items_slot_check
  check (slot in ('hat','outfit','top','bottom','shoes','accessory','background'));

-- Reconcile the six coin-shop items with their original shop categories and artwork.
update public.cosmetic_items as item
set category = look.category, style_key = look.slug,
    primary_color = look.primary_color, accent_color = look.accent_color
from (values
  ('everyday-training-tee', 'clothing',    '#7d6b91', '#493b58'),
  ('hydration-buddy',       'accessories', '#00a99a', '#175c57'),
  ('off-duty-cap',          'clothing',    '#4e721d', '#314810'),
  ('find-your-flow-mat',    'accessories', '#a38ab9', '#62516f'),
  ('garden-escape',         'backgrounds', '#b9cda1', '#68814d'),
  ('golden-hour',           'backgrounds', '#e9b191', '#b97978')
) as look(slug, category, primary_color, accent_color)
where item.slug = look.slug;
