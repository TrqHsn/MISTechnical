import { Component, signal, effect, HostListener, Output, EventEmitter, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UniversalSearchService, SearchItem } from '../../services/universal-search.service';

@Component({
  selector: 'app-universal-search',
  imports: [CommonModule, FormsModule],
  templateUrl: './universal-search.html',
  styleUrl: './universal-search.css',
})
export class UniversalSearchComponent {
  @Input() appButtons: { name: string; id: string }[] = [];
  @Output() actionTriggered = new EventEmitter<string>();

  isOpen = signal(false);
  searchQuery = signal('');
  categories = signal<Map<string, SearchItem[]>>(new Map());
  quickAccessItems = signal<SearchItem[]>([]);
  selectedIndex = signal(0);
  flatResults = signal<SearchItem[]>([]);

  constructor(private searchService: UniversalSearchService) {
    // Update quick access and search results when query or buttons change
    effect(() => {
      const query = this.searchQuery();
      const buttons = this.appButtons;
      
      if (buttons.length > 0) {
        const result = this.searchService.searchItems(query, buttons);
        this.categories.set(result.categories);
        
        // Flatten results for keyboard navigation
        const flat: SearchItem[] = [];
        result.categories.forEach((items: SearchItem[]) => flat.push(...items));
        this.flatResults.set(flat);
        this.selectedIndex.set(0);
        
        // Update quick access items
        if (!this.quickAccessItems().length) {
          this.quickAccessItems.set(this.searchService.getQuickAccessItems(buttons));
        }
      }
    });
  }

  open() {
    this.isOpen.set(true);
    this.searchQuery.set('');
    setTimeout(() => {
      document.getElementById('universal-search-input')?.focus();
    }, 100);
  }

  close() {
    this.isOpen.set(false);
    this.searchQuery.set('');
    this.selectedIndex.set(0);
  }

  @HostListener('document:keydown.escape')
  onEscapePress() {
    if (this.isOpen()) {
      this.close();
    }
  }

  onSearchInput(value: string) {
    this.searchQuery.set(value);
  }

  navigateToItem(item: SearchItem) {
    // Handle Actions category differently - emit event instead of navigate
    if (item.category === 'Actions') {
      this.actionTriggered.emit(item.id);
      this.close();
    } else {
      this.searchService.navigateTo(item);
      this.close();
    }
  }

  onKeyDown(event: KeyboardEvent) {
    const results = this.flatResults();
    if (results.length === 0) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.selectedIndex.set((this.selectedIndex() + 1) % results.length);
        this.scrollToSelected();
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.selectedIndex.set((this.selectedIndex() - 1 + results.length) % results.length);
        this.scrollToSelected();
        break;
      case 'Enter':
        event.preventDefault();
        if (results[this.selectedIndex()]) {
          this.navigateToItem(results[this.selectedIndex()]);
        }
        break;
    }
  }

  private scrollToSelected() {
    setTimeout(() => {
      const selected = document.querySelector('.search-result-item.selected');
      selected?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 0);
  }

  getCategoryKeys(): string[] {
    return Array.from(this.categories().keys());
  }

  getItemsForCategory(category: string): SearchItem[] {
    return this.categories().get(category) || [];
  }

  isItemSelected(item: SearchItem): boolean {
    const results = this.flatResults();
    const index = results.indexOf(item);
    return index === this.selectedIndex() && index !== -1;
  }
}
