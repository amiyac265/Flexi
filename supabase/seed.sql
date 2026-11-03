-- Optional starter catalog. Safe to repeat; never overwrites editor changes.
-- No accounts, fake activity, or fictional news are seeded.
insert into public.cosmetic_items(slug,name,description,slot,minimum_level)
values
  ('starter-headband','Starter Headband','A cosmetic for your first workout companion.','hat',1),
  ('training-cape','Training Cape','Unlock by reaching character level 5.','accessory',5)
on conflict (slug) do nothing;
insert into public.training_content(slug,title,kind,summary,body,status,published_at)
values ('logging-your-first-workout','Logging your first workout','tutorial',
  'Record a completed workout to track your progress.',
  'Enter a workout title and duration, then save. Your first completed workout on each local day earns 100 XP. Planning a calendar entry alone does not earn XP.',
  'published',now())
on conflict (slug) do nothing;
