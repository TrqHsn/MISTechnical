import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { debounceTime, Subject } from 'rxjs';
import { ApiService, User, Computer } from '../../services/api';

@Component({
  selector: 'app-test-api',
  imports: [CommonModule, FormsModule],
  templateUrl: './test-api.html',
  styleUrl: './test-api.css',
})
export class TestApiComponent {
  // Tab management
  activeTab = signal<'users' | 'computers'>('users');

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
  computersSearchType = signal<'name' | 'description'>('name');
  private computersSearchSubject = new Subject<string>();

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
        
        const searchObservable = this.computersSearchType() === 'name'
          ? this.apiService.searchComputers(searchTerm)
          : this.apiService.searchComputersByDescription(searchTerm);

        searchObservable.subscribe(
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

  // Get object keys for card display
  getObjectKeys(obj: any): string[] {
    return obj ? Object.keys(obj) : [];
  }

  // Make JSON available in template
  JSON = JSON;

  // Switch search type for computers
  switchComputerSearchType(type: 'name' | 'description') {
    this.computersSearchType.set(type);
    this.computersSearchInput.set('');
    this.computersResults.set([]);
    this.selectedComputer.set(null);
    this.computersShowDropdown.set(false);
  }
}
