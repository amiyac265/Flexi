-- Per-set strength exercise details. Preserve legacy rows and retry payloads.
create function flexi_private.normalize_workout_exercises(input jsonb) returns jsonb language plpgsql set search_path = '' as $$
declare ex jsonb; normalized_ex jsonb; set_input jsonb; normalized_sets jsonb; result jsonb := '[]';
begin
  if input ? 'exercises' and jsonb_typeof(input->'exercises') <> 'array' then raise sqlstate 'PT400' using message='Invalid exercises.'; end if;
  if jsonb_array_length(coalesce(input->'exercises','[]')) > 30 then raise sqlstate 'PT400' using message='Use at most 30 exercises.'; end if;
  for ex in select value from jsonb_array_elements(coalesce(input->'exercises','[]')) loop
    perform flexi_private.check_input(ex,array['name','sets','reps','weightKg','durationSeconds','muscleGroup','setDetails']);
    normalized_ex := jsonb_build_object('name',flexi_private.required_text(ex,'name',120));
    if ex ? 'sets' then normalized_ex := normalized_ex || jsonb_build_object('sets',flexi_private.number_value(ex,'sets',1,100)); end if;
    if ex ? 'reps' then normalized_ex := normalized_ex || jsonb_build_object('reps',flexi_private.number_value(ex,'reps',1,1000)); end if;
    if ex ? 'weightKg' then normalized_ex := normalized_ex || jsonb_build_object('weightKg',round(flexi_private.number_value(ex,'weightKg',0,2000,false),3)); end if;
    if ex ? 'durationSeconds' then normalized_ex := normalized_ex || jsonb_build_object('durationSeconds',flexi_private.number_value(ex,'durationSeconds',1,86400)); end if;
    if (ex ? 'muscleGroup') <> (ex ? 'setDetails') then raise sqlstate 'PT400' using message='Provide both muscleGroup and setDetails.'; end if;
    if ex ? 'muscleGroup' then
      normalized_ex := normalized_ex || jsonb_build_object('muscleGroup',flexi_private.enum_value(ex,'muscleGroup',array['chest','back','shoulders','biceps','triceps','legs','glutes','core']));
      if jsonb_typeof(ex->'setDetails') <> 'array' or jsonb_array_length(ex->'setDetails') not between 1 and 20 then
        raise sqlstate 'PT400' using message='Use 1–20 sets per exercise.';
      end if;
      normalized_sets := '[]';
      for set_input in select value from jsonb_array_elements(ex->'setDetails') loop
        perform flexi_private.check_input(set_input,array['reps','weightKg']);
        normalized_sets := normalized_sets || jsonb_build_array(jsonb_build_object(
          'reps',flexi_private.number_value(set_input,'reps',1,1000),
          'weightKg',round(flexi_private.number_value(set_input,'weightKg',0,2000,false),3)
        ));
      end loop;
      normalized_ex := normalized_ex || jsonb_build_object('setDetails',normalized_sets);
    end if;
    result := result || jsonb_build_array(normalized_ex);
  end loop;
  return result;
end;
$$;

create or replace function public.flexi_log_workout(p_input jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.profiles; w public.workout_logs; normalized jsonb; exercises jsonb; key text; moment timestamptz;
begin
  p := flexi_private.require_profile();
  perform flexi_private.check_input(p_input,array['requestId','title','durationMinutes','notes','exercises','activity','intensity','focusArea','performedAt','distance','distanceUnit','sport']);
  key := flexi_private.required_text(p_input,'requestId',80);
  if key !~ '^[a-zA-Z0-9_-]{8,80}$' then raise sqlstate 'PT400' using message='Invalid requestId.'; end if;
  exercises := flexi_private.normalize_workout_exercises(p_input);
  normalized := jsonb_build_object('requestId',key,'title',flexi_private.required_text(p_input,'title',120),
    'durationMinutes',flexi_private.number_value(p_input,'durationMinutes',1,1440),'notes',flexi_private.optional_notes(p_input),'exercises',exercises);
  if p_input ? 'activity' then normalized := normalized || jsonb_build_object('activity',flexi_private.enum_value(p_input,'activity',array['strength','running','walking','cycling','rowing','swimming','elliptical','stair-climber','hiking','jump-rope','yoga','sports','other'])); end if;
  if p_input ? 'intensity' then normalized := normalized || jsonb_build_object('intensity',flexi_private.enum_value(p_input,'intensity',array['light','moderate','intense'])); end if;
  if p_input ? 'focusArea' then normalized := normalized || jsonb_build_object('focusArea',flexi_private.enum_value(p_input,'focusArea',array['arms','chest','legs','full-body'])); end if;
  if p_input ? 'sport' then normalized := normalized || jsonb_build_object('sport',flexi_private.enum_value(p_input,'sport',array['basketball','soccer','football','tennis','volleyball','baseball-softball','hockey','golf','pickleball','other'])); end if;
  if (p_input ? 'distance') <> (p_input ? 'distanceUnit') then raise sqlstate 'PT400' using message='Provide both distance and distanceUnit.'; end if;
  if p_input ? 'distance' then
    normalized := normalized || jsonb_build_object('distance',round(flexi_private.number_value(p_input,'distance',0.001,10000,false),3),'distanceUnit',flexi_private.enum_value(p_input,'distanceUnit',array['mi','km','m','yd']));
  end if;
  if p_input ? 'performedAt' then
    if flexi_private.required_text(p_input,'performedAt',60) !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then raise sqlstate 'PT400' using message='Use an ISO workout time with an offset.'; end if;
    moment := (p_input->>'performedAt')::timestamptz;
    if not isfinite(moment) or moment > clock_timestamp() or moment < '1970-01-01T00:00:00Z'::timestamptz then raise sqlstate 'PT400' using message='Choose a past workout time from 1970 onward.'; end if;
    normalized := normalized || jsonb_build_object('performedAt',to_char(moment at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
  end if;
  select * into w from public.workout_logs where owner=p.id and request_id=key;
  if found then
    if w.completion_input <> normalized then raise sqlstate 'PT409' using message='This requestId was already used for a different workout.'; end if;
    return jsonb_build_object('workout',to_jsonb(w)-'completion_input','replayed',true);
  end if;
  if normalized->>'activity' = any(array['running','walking','cycling','rowing','swimming','elliptical','stair-climber','hiking','jump-rope']) and not normalized ? 'distance' then raise sqlstate 'PT400' using message='Cardio workouts require a distance.'; end if;
  if normalized->>'activity'='sports' and not normalized ? 'sport' then raise sqlstate 'PT400' using message='Sport workouts require a sport type.'; end if;
  if normalized->>'activity'='strength' and (
    jsonb_array_length(exercises)=0 or exists(
      select 1 from jsonb_array_elements(exercises) item where not (item ? 'muscleGroup' and item ? 'setDetails')
    )
  ) then raise sqlstate 'PT400' using message='Strength workouts require detailed exercises.'; end if;
  moment := coalesce(moment,clock_timestamp());
  insert into public.workout_logs(owner,request_id,title,duration_minutes,notes,exercises,completion_input,completed_at,local_date,performed_at,activity,intensity,focus_area,distance,distance_unit,sport_type)
    values(p.id,key,normalized->>'title',(normalized->>'durationMinutes')::integer,normalized->>'notes',exercises,normalized,clock_timestamp(),(moment at time zone p.timezone)::date,moment,coalesce(normalized->>'activity','other'),normalized->>'intensity',coalesce(normalized->>'focusArea','full-body'),(normalized->>'distance')::numeric,normalized->>'distanceUnit',normalized->>'sport') returning * into w;
  return jsonb_build_object('workout',to_jsonb(w)-'completion_input','replayed',false);
end;
$$;
