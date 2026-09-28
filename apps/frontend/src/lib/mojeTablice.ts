/**
 * Warunek listy „moje tablice” dla `.or()`: własne i udostępnione mi.
 *
 * Uprawnienia w bazie przepuszczają też cudze tablice publiczne (galeria
 * Inspiracji), więc każda lista „moich” musi je odsiać sama — bez tego nowe
 * konto widziało cudze publiczne wyjazdy jako swoje, a zapis na nie odbijał
 * się od uprawnień. Tablica udostępniona mi jest prywatna, więc przechodzi.
 */
export const mojeTablice = (uid: string) => `user_id.eq.${uid},is_public.eq.false`;
