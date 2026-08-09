import { Tabs, TabsList, TabsTrigger, TabsContent } from '@routemarket/frontend';

export const DniWyjazdu = () => (
  <Tabs defaultValue="d1" className="max-w-lg">
    <TabsList>
      <TabsTrigger value="d1">Dzień 1</TabsTrigger>
      <TabsTrigger value="d2">Dzień 2</TabsTrigger>
      <TabsTrigger value="d3">Dzień 3</TabsTrigger>
    </TabsList>
    <TabsContent value="d1" className="text-sm text-muted-foreground pt-3">
      Rynek, Hala Targowa, Ostrów Tumski — 4,1 km, około 5 godzin ze zwiedzaniem.
    </TabsContent>
    <TabsContent value="d2" className="text-sm text-muted-foreground pt-3">
      Hala Stulecia, Park Szczytnicki, ZOO — dzień po wschodniej stronie miasta.
    </TabsContent>
    <TabsContent value="d3" className="text-sm text-muted-foreground pt-3">
      Dzień lżejszy: Wyspa Słodowa i bulwary nad Odrą.
    </TabsContent>
  </Tabs>
);
