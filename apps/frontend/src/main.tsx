import { createRoot } from "react-dom/client";
import { supabase } from "@/integrations/supabase/client";
import { sledzZapisy, sledzRejestracje, zapamietajWejscie } from "@/lib/zdarzenia";
import App from "./App.tsx";
import "./index.css";
import "./i18n";

// Pomiar: zapisy tablic/miejsc/planów, rejestracja i parametry kampanii z wejścia.
// Nic z tego nie wysyła danych bez zgody — patrz lib/zdarzenia.ts.
zapamietajWejscie();
sledzZapisy(supabase);
sledzRejestracje(supabase);

createRoot(document.getElementById("root")!).render(<App />);
