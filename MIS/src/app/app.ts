import { Component, signal } from '@angular/core';
import { RouterOutlet, RouterLink } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('MIS');

  buttons = [
    { name: 'Label Sticker', id: 'sticker' },
    { name: 'WRANTY', id: 'wranty' },
    { name: 'Jobsheet', id: 'jobsheet' },
    { name: 'OS form', id: 'oif' },
    { name: 'AD Tools', id: 'testapi' }
  ];
}
