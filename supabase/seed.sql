-- Optional starter catalog. Safe to repeat; never overwrites editor changes.
-- No accounts, fake activity, or fictional news are seeded.
insert into public.cosmetic_items(slug,name,description,slot,minimum_level,category,style_key,primary_color,accent_color)
values
  ('starter-headband','Starter Headband','A cosmetic for your first workout companion.','hat',1,'accessories','pulse-headband','#d8fb73','#4e721d'),
  ('training-cape','Training Cape','Unlock by reaching character level 5.','accessory',5,'special','training-cape','#7d6b91','#e8dff0'),
  ('moss-training-tee','Moss Training Tee','A fresh look for your daily movement.','top',1,'clothing','training-tee','#7e9d55','#e3eccf'),
  ('trail-shorts','Trail Shorts','Keep moving in a comfortable pair of shorts.','bottom',2,'clothing','trail-shorts','#5d647a','#d5dcf1'),
  ('cloud-trainers','Cloud Trainers','A little spring in every step.','shoes',2,'clothing','cloud-trainers','#e6dfcf','#7d6b91'),
  ('quiet-grove','Quiet Grove','A calm place for your buddy to recharge.','background',3,'backgrounds','quiet-grove','#dfe9cf','#b7d5c3')
on conflict (slug) do nothing;
insert into public.training_content(slug,title,kind,summary,body,status,published_at)
values ('logging-your-first-workout','Logging your first workout','tutorial',
  'Record a completed workout to track your progress.',
  'Enter a workout title and duration, then save. Your first completed workout on each local day earns 100 XP. Planning a calendar entry alone does not earn XP.',
  'published',now())
on conflict (slug) do nothing;
