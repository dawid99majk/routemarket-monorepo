import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@routemarket/frontend';

export const CzestePytania = () => (
  <Accordion type="single" collapsible defaultValue="p1" className="max-w-lg">
    <AccordionItem value="p1">
      <AccordionTrigger>Skąd biorą się miejsca?</AccordionTrigger>
      <AccordionContent className="text-muted-foreground">
        Z OpenStreetMap — mają realne współrzędne i godziny otwarcia, nie pochodzą z wyobraźni modelu.
      </AccordionContent>
    </AccordionItem>
    <AccordionItem value="p2">
      <AccordionTrigger>Czy muszę znać daty wyjazdu?</AccordionTrigger>
      <AccordionContent className="text-muted-foreground">
        Nie. Tablica czeka, a plan powstaje wtedy, kiedy będziesz gotowy.
      </AccordionContent>
    </AccordionItem>
    <AccordionItem value="p3">
      <AccordionTrigger>Co dostaję na koniec?</AccordionTrigger>
      <AccordionContent className="text-muted-foreground">
        Plan dni z godzinami, przebieg trasy po chodnikach, plik GPX i przewodnik.
      </AccordionContent>
    </AccordionItem>
  </Accordion>
);
