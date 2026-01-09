import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { debounceTime, Subject } from 'rxjs';
import { ApiService, User, Computer } from '../../services/api';

@Component({
  selector: 'app-ad-tools',
  imports: [CommonModule, FormsModule],
  templateUrl: './ad-tools.html',
  styleUrl: './ad-tools.css',
})
export class AdToolsComponent {
  // Tab management
  activeTab = signal<'users' | 'computers' | 'update-description' | 'last-device'>('users');

  //Copy text to clipboard
  copyText(text: string | null | undefined) {
  if (!text) {
    return;
  }

  navigator.clipboard.writeText(text).then(
    () => console.log('Copied'),
    err => console.error('Copy failed', err)
  );
}


  // Users search
  usersSearchInput = signal('');
  usersResults = signal<User[]>([]);
  selectedUser = signal<User | null>(null);
  usersLoading = signal(false);
  usersShowDropdown = signal(false);
  private usersSearchSubject = new Subject<string>();

  // Computers search
  computersSearchInput = signal('');
  computersResults = signal<Computer[]>([]);
  selectedComputer = signal<Computer | null>(null);
  computersLoading = signal(false);
  computersShowDropdown = signal(false);
  private computersSearchSubject = new Subject<string>();

  // Update Description Tab
  sourceComputerSearchInput = signal('');
  sourceComputerResults = signal<Computer[]>([]);
  selectedSourceComputer = signal<Computer | null>(null);
  sourceComputerLoading = signal(false);
  sourceComputerShowDropdown = signal(false);
  private sourceComputerSearchSubject = new Subject<string>();

  targetComputerSearchInput = signal('');
  targetComputerResults = signal<Computer[]>([]);
  selectedTargetComputer = signal<Computer | null>(null);
  targetComputerLoading = signal(false);
  targetComputerShowDropdown = signal(false);
  private targetComputerSearchSubject = new Subject<string>();

  descriptionInput = signal('');
  isUpdating = signal(false);
  updateMessage = signal('');

  // Last Device Tab
  lastDevices = signal<{ [key: string]: number }>({ SDLL: 0, SDLD: 0, DBOL: 0 });
  lastDevicesLoading = signal(false);
  lastDevicesLoaded = signal(false);


  constructor(private apiService: ApiService) {
    // Setup users live search
    this.usersSearchSubject.pipe(
      debounceTime(300)
    ).subscribe(searchTerm => {
      if (searchTerm.trim()) {
        this.usersLoading.set(true);
        this.usersShowDropdown.set(true);
        this.apiService.searchUsers(searchTerm).subscribe(
          (results) => {
            this.usersResults.set(results.slice(0, 5)); // Max 5 results
            this.usersLoading.set(false);
          },
          (error) => {
            console.error('Error searching users:', error);
            this.usersResults.set([]);
            this.usersLoading.set(false);
          }
        );
      } else {
        this.usersResults.set([]);
        this.usersShowDropdown.set(false);
      }
    });

    // Setup computers live search
    this.computersSearchSubject.pipe(
      debounceTime(300)
    ).subscribe(searchTerm => {
      if (searchTerm.trim()) {
        this.computersLoading.set(true);
        this.computersShowDropdown.set(true);
        
        this.apiService.searchComputers(searchTerm).subscribe(
          (results) => {
            this.computersResults.set(results.slice(0, 5)); // Max 5 results
            this.computersLoading.set(false);
          },
          (error) => {
            console.error('Error searching computers:', error);
            this.computersResults.set([]);
            this.computersLoading.set(false);
          }
        );
      } else {
        this.computersResults.set([]);
        this.computersShowDropdown.set(false);
      }
    });

    // Setup source computer search (for Update Description tab)
    this.sourceComputerSearchSubject.pipe(
      debounceTime(300)
    ).subscribe(searchTerm => {
      if (searchTerm.trim()) {
        this.sourceComputerLoading.set(true);
        this.sourceComputerShowDropdown.set(true);
        
        this.apiService.searchComputers(searchTerm).subscribe(
          (results) => {
            this.sourceComputerResults.set(results.slice(0, 5));
            this.sourceComputerLoading.set(false);
          },
          (error) => {
            console.error('Error searching computers:', error);
            this.sourceComputerResults.set([]);
            this.sourceComputerLoading.set(false);
          }
        );
      } else {
        this.sourceComputerResults.set([]);
        this.sourceComputerShowDropdown.set(false);
      }
    });

    // Setup target computer search (for Update Description tab)
    this.targetComputerSearchSubject.pipe(
      debounceTime(300)
    ).subscribe(searchTerm => {
      if (searchTerm.trim()) {
        this.targetComputerLoading.set(true);
        this.targetComputerShowDropdown.set(true);
        
        this.apiService.searchComputers(searchTerm).subscribe(
          (results) => {
            this.targetComputerResults.set(results.slice(0, 5));
            this.targetComputerLoading.set(false);
          },
          (error) => {
            console.error('Error searching computers:', error);
            this.targetComputerResults.set([]);
            this.targetComputerLoading.set(false);
          }
        );
      } else {
        this.targetComputerResults.set([]);
        this.targetComputerShowDropdown.set(false);
      }
    });
  }

  // Users handlers
  onUsersSearchInput(value: string) {
    this.usersSearchInput.set(value);
    this.usersSearchSubject.next(value);
  }

  selectUser(user: User) {
    this.selectedUser.set(user);
    this.usersShowDropdown.set(false);
    this.usersSearchInput.set('');
    this.usersResults.set([]);
  }

  clearUserSelection() {
    this.selectedUser.set(null);
  }

  // Enter handler for users search - selects first result
  onUsersSearchEnter() {
    const results = this.usersResults();
    if (results && results.length > 0) {
      this.selectUser(results[0]);
    }
  }

  // Computers handlers
  onComputersSearchInput(value: string) {
    this.computersSearchInput.set(value);
    this.computersSearchSubject.next(value);
  }

  selectComputer(computer: Computer) {
    this.selectedComputer.set(computer);
    this.computersShowDropdown.set(false);
    this.computersSearchInput.set('');
    this.computersResults.set([]);
  }

  clearComputerSelection() {
    this.selectedComputer.set(null);
  }

  // Update Description Tab handlers
  onSourceComputerSearch(value: string) {
    this.sourceComputerSearchInput.set(value);
    this.sourceComputerSearchSubject.next(value);
  }

  selectSourceComputer(computer: Computer) {
    this.selectedSourceComputer.set(computer);
    this.sourceComputerShowDropdown.set(false);
    this.sourceComputerSearchInput.set('');
    this.sourceComputerResults.set([]);
    // Auto-populate description input from source computer
    this.descriptionInput.set(computer['description'] || '');
    this.updateMessage.set('');
  }

  // Trigger search via button for source search
  triggerSourceSearch() {
    this.sourceComputerShowDropdown.set(true);
    this.sourceComputerSearchSubject.next(this.sourceComputerSearchInput());
  }

  // Trigger search via button for target search
  triggerTargetSearch() {
    this.targetComputerShowDropdown.set(true);
    this.targetComputerSearchSubject.next(this.targetComputerSearchInput());
  }

  // Select first computer in current computers results when Enter is pressed
  onComputersSearchEnter() {
    const results = this.computersResults();
    if (results && results.length > 0) {
      this.selectComputer(results[0]);
    }
  }

  onTargetComputerSearch(value: string) {
    this.targetComputerSearchInput.set(value);
    this.targetComputerSearchSubject.next(value);
  }

  selectTargetComputer(computer: Computer) {
    this.selectedTargetComputer.set(computer);
    this.targetComputerShowDropdown.set(false);
    this.targetComputerSearchInput.set('');
    this.targetComputerResults.set([]);
  }

  // Enter handler for source/target search boxes
  onSourceComputerSearchEnter() {
    const results = this.sourceComputerResults();
    if (results && results.length > 0) {
      this.selectSourceComputer(results[0]);
    }
  }

  onTargetComputerSearchEnter() {
    const results = this.targetComputerResults();
    if (results && results.length > 0) {
      this.selectTargetComputer(results[0]);
    }
  }

  clearSourceComputer() {
    this.selectedSourceComputer.set(null);
    this.descriptionInput.set('');
    this.updateMessage.set('');
  }

  clearTargetComputer() {
    this.selectedTargetComputer.set(null);
  }

  clearAll() {
    this.clearSourceComputer();
    this.clearTargetComputer();
    this.sourceComputerSearchInput.set('');
    this.targetComputerSearchInput.set('');
    this.sourceComputerResults.set([]);
    this.targetComputerResults.set([]);
    this.descriptionInput.set('');
    this.updateMessage.set('');
    this.isUpdating.set(false);
  }

  updateComputerDescription() {
    const targetComputer = this.selectedTargetComputer();
    const description = this.descriptionInput();

    if (!targetComputer) {
      this.updateMessage.set('Please select a target computer to update');
      return;
    }

    if (!targetComputer['name']) {
      this.updateMessage.set('Invalid target computer');
      return;
    }

    this.isUpdating.set(true);
    this.updateMessage.set('');

    this.apiService.updateComputerDescription(targetComputer['name'], description).subscribe(
      (response) => {
        this.updateMessage.set('Description updated successfully!');
        this.isUpdating.set(false);
        setTimeout(() => {
          this.clearTargetComputer();
          this.clearSourceComputer();
        }, 2000);
      },
      (error) => {
        console.error('Error updating description:', error);
        this.updateMessage.set('Error updating description: ' + (error.error?.message || error.message));
        this.isUpdating.set(false);
      }
    );
  }

  // Get object keys for card display
  getObjectKeys(obj: any): string[] {
    return obj ? Object.keys(obj) : [];
  }

  // Last Device Tab methods
  loadLastDevices() {
    if (this.lastDevicesLoaded()) {
      return; // Already loaded, don't fetch again
    }

    this.lastDevicesLoading.set(true);

    this.apiService.getLastDevices().subscribe(
      (data) => {
        this.lastDevices.set(data);
        this.lastDevicesLoading.set(false);
        this.lastDevicesLoaded.set(true);
      },
      (error) => {
        console.error('Error loading last devices:', error);
        this.lastDevicesLoading.set(false);
      }
    );
  }

  onTabChange(tab: string) {
    this.activeTab.set(tab as any);
    if (tab === 'last-device') {
      this.loadLastDevices();
    }
  }

  // Make JSON available in template
  JSON = JSON;
}
