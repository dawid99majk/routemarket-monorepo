-- Odebranie roli anon prawa wykonania funkcji zapisujących.
--
-- Supabase ma domyślne uprawnienia nadające EXECUTE na nowych funkcjach w schemacie
-- public rolom anon, authenticated i service_role. REVOKE ... FROM PUBLIC tego nie
-- zdejmuje, bo to osobne, jawne nadanie — w ACL widać było anon=X/postgres.
--
-- Bez tego niezalogowany gość mógł wywołać rm_podbij_kopie i nabijać licznik kopii
-- dowolnej publicznej tablicy. Nie jest to katastrofa, ale to ścieżka zapisu otwarta
-- na internet, a od dzisiaj internet ma tu dostęp.

BEGIN;

REVOKE EXECUTE ON FUNCTION rm_podbij_kopie(uuid) FROM anon;

-- Funkcje triggerowe z podniesionymi uprawnieniami też zamykamy. Wywołane wprost
-- i tak by się wywróciły na braku kontekstu triggera, ale nie ma powodu, żeby
-- ktokolwiek z zewnątrz mógł je choćby spróbować uruchomić.
REVOKE EXECUTE ON FUNCTION rm_przelicz_polubienia()        FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION rm_dotknij_tablice()            FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION rm_dotknij_tablice_z_dziecka()  FROM anon, authenticated;

COMMIT;
