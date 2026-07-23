begin;

do $$
declare
  conflict_trigger record;
begin
  for conflict_trigger in
    select trigger_info.tgname
    from pg_trigger trigger_info
    join pg_class table_info on table_info.oid = trigger_info.tgrelid
    join pg_namespace schema_info on schema_info.oid = table_info.relnamespace
    join pg_proc function_info on function_info.oid = trigger_info.tgfoid
    where schema_info.nspname = 'public'
      and table_info.relname = 'reservas'
      and not trigger_info.tgisinternal
      and pg_get_functiondef(function_info.oid) like '%CONFLICTO_RESERVA%'
  loop
    execute format('drop trigger if exists %I on public.reservas', conflict_trigger.tgname);
  end loop;
end
$$;

create or replace function public.agenda_check_reservation_conflict()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  conflicting_reservation public.reservas%rowtype;
  new_secondary_responsible text := nullif(to_jsonb(new)->>'responsable_2_id', '');
  new_area text := nullif(lower(trim(new.area)), '');
  new_location text := nullif(lower(regexp_replace(trim(coalesce(new.ubicacion, '')), '\s+', ' ', 'g')), '');
begin
  if lower(coalesce(new.estado, 'activa')) not in ('activa', 'no_asignado') then
    return new;
  end if;

  perform pg_advisory_xact_lock(20260723);

  select existing.*
  into conflicting_reservation
  from public.reservas existing
  where existing.id is distinct from new.id
    and lower(coalesce(existing.estado, 'activa')) in ('activa', 'no_asignado')
    and new.starts_at < existing.ends_at
    and new.ends_at > existing.starts_at
    and (
      new_area is null
      or nullif(lower(trim(existing.area)), '') is null
      or new_area = nullif(lower(trim(existing.area)), '')
      or array_remove(array[new.responsable_id::text, new_secondary_responsible], null)
         && array_remove(array[existing.responsable_id::text, nullif(to_jsonb(existing)->>'responsable_2_id', '')], null)
      or (
        new_location is not null
        and new_location = nullif(lower(regexp_replace(trim(coalesce(existing.ubicacion, '')), '\s+', ' ', 'g')), '')
      )
    )
  limit 1;

  if found then
    raise exception 'CONFLICTO_RESERVA: recurso compartido con la reserva %', conflicting_reservation.id
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function public.agenda_check_reservation_conflict() from public;

drop trigger if exists agenda_reservation_conflict on public.reservas;
create trigger agenda_reservation_conflict
before insert or update on public.reservas
for each row
execute function public.agenda_check_reservation_conflict();

commit;
