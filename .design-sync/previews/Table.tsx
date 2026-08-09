import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableCaption } from '@routemarket/frontend';

export const PlanDnia = () => (
  <Table className="max-w-2xl">
    <TableCaption>Dzień 1 — 4,1 km, 5 godzin</TableCaption>
    <TableHeader>
      <TableRow>
        <TableHead className="w-20">Godzina</TableHead>
        <TableHead>Miejsce</TableHead>
        <TableHead className="w-24 text-right">Czas</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow><TableCell className="font-mono text-xs">10:00</TableCell><TableCell>Rynek</TableCell><TableCell className="text-right">45 min</TableCell></TableRow>
      <TableRow><TableCell className="font-mono text-xs">11:00</TableCell><TableCell>Hala Targowa</TableCell><TableCell className="text-right">40 min</TableCell></TableRow>
      <TableRow><TableCell className="font-mono text-xs">12:15</TableCell><TableCell>Ostrów Tumski</TableCell><TableCell className="text-right">60 min</TableCell></TableRow>
      <TableRow><TableCell className="font-mono text-xs">13:30</TableCell><TableCell>Przerwa na obiad</TableCell><TableCell className="text-right">60 min</TableCell></TableRow>
    </TableBody>
  </Table>
);
