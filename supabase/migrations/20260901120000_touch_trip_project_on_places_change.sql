-- Powod niespojnosci "inna tablica aktywna w Odkrywaj, inna w Twoich wyjazdach":
-- trip_projects.updated_at nigdy nie byl dotykany przy dodawaniu/usuwaniu miejsc
-- (trip_project_places to osobna tabela) -- zmienial go WYLACZNIE reczny edit
-- samego wyjazdu (nazwa, daty, fill_percent) w TripProjects.tsx. A wlasnie po
-- tym polu Discover.tsx (domyslna tablica) i TripPlans.tsx ("ostatnio uzywane",
-- karta na gorze) wybieraja, ktora tablica pokazac jako aktywna -- wiec obie
-- strony patrzyly na pole, ktore najczestsza czynnosc (dopiecie miejsca) w ogole
-- nie zmienia, i migeta w rozjezdzie po pierwszym dniu uzywania.
create or replace function public.touch_trip_project_on_places_change()
returns trigger
language plpgsql
as $$
begin
  update public.trip_projects
    set updated_at = now()
    where id = coalesce(new.project_id, old.project_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists trip_project_places_touch_project on public.trip_project_places;
create trigger trip_project_places_touch_project
  after insert or update or delete on public.trip_project_places
  for each row execute function public.touch_trip_project_on_places_change();
