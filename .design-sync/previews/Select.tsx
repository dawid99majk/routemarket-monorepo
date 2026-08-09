import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem, Label } from '@routemarket/frontend';

export const WyborTablicy = () => (
  <div className="space-y-1.5 max-w-xs">
    <Label>Dodaj do tablicy</Label>
    <Select defaultValue="wroclaw">
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="wroclaw">Wrocław z dziećmi</SelectItem>
        <SelectItem value="tirana">Tirana, długi weekend</SelectItem>
        <SelectItem value="kruja">Krujë — jeden dzień</SelectItem>
      </SelectContent>
    </Select>
  </div>
);
