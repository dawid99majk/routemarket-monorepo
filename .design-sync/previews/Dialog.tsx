import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Button, Input, Label } from '@routemarket/frontend';

export const NowaTablica = () => (
  <Dialog open>
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Nowy wyjazd</DialogTitle>
        <DialogDescription>
          Tablica to miejsce na wszystko, co chcesz zobaczyć. Nie musisz mieć jeszcze dat.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3 py-2">
        <div className="space-y-1.5">
          <Label htmlFor="nazwa">Nazwa</Label>
          <Input id="nazwa" defaultValue="Wrocław z dziećmi" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="miasto">Miasto</Label>
          <Input id="miasto" placeholder="np. Wrocław" />
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost">Anuluj</Button>
        <Button>Utwórz tablicę</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
