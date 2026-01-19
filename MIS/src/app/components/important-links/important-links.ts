import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LinksService } from '../../services/links.service';

@Component({
  selector: 'app-important-links',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './important-links.html',
  styleUrl: './important-links.css',
})
export class ImportantLinksComponent {
  links;

  constructor(private linksService: LinksService) {
    this.links = this.linksService.getLinkSignal();
  }

  openLink(url: string) {
    this.linksService.openLink(url);
  }
}
