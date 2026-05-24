import { type RouteProject, type ProjectRepository } from "../../atlas-core/src/index.js";
import { type AtlasWorkflowService } from "./workflow-service.js";
import { createInterface } from "node:readline/promises";

export type AgentResponse = {
  message: string;
  nextStep?: string;
  data?: any;
};

export class InteractiveAgent {
  constructor(
    private readonly project: RouteProject,
    private readonly service: AtlasWorkflowService,
    private readonly repository: ProjectRepository
  ) {}

  async runConversationLoop(): Promise<void> {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });

    console.log(`\n--- Witaj w kreatorze RouteMarket dla trasy: ${this.project.title} ---`);
    console.log(`Region: ${this.project.region}, Kategoria: ${this.project.category}\n`);

    let conversationActive = true;
    let context = "initial";

    while (conversationActive) {
      const prompt = await this.getAgentPrompt(context);
      const answer = await rl.question(`[Agent]: ${prompt}\n[User]: `);

      if (answer.toLowerCase() === "koniec" || answer.toLowerCase() === "exit") {
        conversationActive = false;
        break;
      }

      const result = await this.processUserResponse(answer, context);
      console.log(`\n[Agent]: ${result.message}\n`);

      if (result.nextStep === "generate_route") {
        await this.handleGpxGeneration(result.data);
        conversationActive = false;
      } else {
        context = result.nextStep || context;
      }
    }

    rl.close();
  }

  private async getAgentPrompt(context: string): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return "Opowiedz mi o preferencjach dotyczących trasy (noclegi, trudność, konkretne miejsca). Wpisz 'koniec' aby wyjść.";
    }

    // AI-powered prompt generation
    const model = process.env.GEMINI_MODEL ?? "gemini-3.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    
    const body = {
      contents: [{ role: "user", parts: [{ text: `Jesteś asystentem RouteMarket. Rozmawiasz z twórcą trasy "${this.project.title}" (${this.project.category}, ${this.project.region}). Kontekst: ${context}. Zadaj jedno krótkie, konkretne pytanie dopytujące o szczegóły trasy (np. preferowany nocleg, trudność, konkretne punkty orientacyjne).` }] }]
    };

    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json() as any;
      return data.candidates?.[0]?.content?.parts?.[0]?.text || "Jakie są Twoje preferencje co do trasy?";
    } catch {
      return "Opowiedz mi o szczegółach trasy.";
    }
  }

  private async processUserResponse(answer: string, context: string): Promise<AgentResponse> {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    
    // Save answer as a note input
    await this.service.addNoteText(this.project.id, {
      fileName: `user_preference_${Date.now()}.md`,
      content: `User Preference (${context}): ${answer}`
    });

    if (!apiKey) {
      if (answer.toLowerCase().includes("trasa") || answer.toLowerCase().includes("generuj")) {
        return { message: "Rozpoczynam generowanie trasy...", nextStep: "generate_route", data: { preferences: answer } };
      }
      return { message: "Zrozumiałem. Czy chcesz dodać coś jeszcze?", nextStep: "asking_more" };
    }

    // AI-powered response processing
    const model = process.env.GEMINI_MODEL ?? "gemini-3.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const body = {
      contents: [{ role: "user", parts: [{ text: `Użytkownik powiedział: "${answer}". Kontekst: ${context}. Jeśli użytkownik podał wystarczająco dużo szczegółów i chce wygenerować trasę, zwróć JSON: {"message": "Zrozumiałem, generuję trasę...", "nextStep": "generate_route"}. W przeciwnym razie podziękuj i zasugeruj kolejny krok w JSON.` }] }],
      generationConfig: { responseMimeType: "application/json" }
    };

    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json() as any;
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{"message": "Dziękuję."}';
      return JSON.parse(text);
    } catch {
      return { message: "Dziękuję, zapisałem Twoje uwagi." };
    }
  }

  private async handleGpxGeneration(data: any): Promise<void> {
    console.log("[System]: Rozpoczynam automatyczne generowanie i walidację GPX...");
    
    try {
      const pois = await this.service.getProject(this.project.id).then(p => this.repository.loadPois(p.id));
      const waypoints = pois
        .filter(p => p.lat !== 0 && p.lng !== 0)
        .slice(0, 10) // Limit waypoints for GraphHopper
        .map(p => ({ lat: p.lat, lng: p.lng }));

      if (waypoints.length < 2) {
        console.warn("[System]: Za mało punktów POI z koordynatami do wygenerowania trasy. Spróbuj dodać więcej punktów.");
        return;
      }

      const { GraphHopperRoutingProvider } = await import("../../atlas-gis/src/index.js");
      const provider = new GraphHopperRoutingProvider();
      
      const profile = this.project.category === "motorcycle" ? "motorcycle" : 
                    (this.project.category === "hiking" ? "hiking" : "bike");

      console.log(`[System]: Wyznaczam trasę dla profilu: ${profile}...`);
      const route = await provider.getRoute(waypoints, profile as any);

      const gpx = this.convertToGpx(route);
      await this.service.addGpxText(this.project.id, {
        fileName: "route.gpx",
        content: gpx,
        note: "Automatically generated from agent conversation and POIs"
      });

      console.log(`[System]: Wygenerowano trasę o długości ${route.distanceKm} km.`);
      console.log("[System]: Plik route.gpx został zapisany i jest gotowy do walidacji.");
      
    } catch (err) {
      console.error("[System]: Błąd podczas generowania GPX:", err);
    }
  }

  private convertToGpx(route: any): string {
    const pts = route.points.map((p: any) => `      <trkpt lat="${p.lat}" lon="${p.lng}"></trkpt>`).join("\n");
    return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="RouteMarket Atlas Agent" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${this.project.title}</name>
    <trkseg>
${pts}
    </trkseg>
  </trk>
</gpx>`;
  }
}
