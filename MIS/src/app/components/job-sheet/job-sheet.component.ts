import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription, debounceTime } from 'rxjs';
import { ApiService } from '../../services/api';

@Component({
  selector: 'app-job-sheet',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './job-sheet.component.html',
  styleUrls: ['./job-sheet.component.css'],
})
export class JobSheetComponent implements OnDestroy {
  // Basic form model — kept simple and reactive via two-way binding
  ticket = '';
  username = '';
  name = '';
  designation = '';
  production = '';
  department = '';
  site = '';
  assetNo = '';

  complain = '';
  findings = '';
  solutions = '';

  items: Array<{ part: string; partNo: string; qty: number; price: number }> = [];

  jobStatus = '';
  followUpDate = '';
  agreedBy = '';

  raisedBy = '';
  requestedBy = '';
  verifiedBy = '';

  // Users live search state (for username input)
  usersSearchInput = '';
  usersResults: any[] = [];
  usersLoading = false;
  usersShowDropdown = false;
  private usersSearchSubject = new Subject<string>();
  private usersSearchSubscription?: Subscription;

  addItem() {
    this.items.push({ part: '', partNo: '', qty: 1, price: 0 });
  }

  removeItem(i: number) {
    this.items.splice(i, 1);
  }

  constructor(private apiService: ApiService) {
    // Setup live search for username input
    this.usersSearchSubscription = this.usersSearchSubject.pipe(
      debounceTime(250)
    ).subscribe((term) => {
      if (term && term.trim()) {
        this.usersLoading = true;
        this.usersShowDropdown = true;
        this.apiService.searchUsers(term).subscribe(
          (results) => {
            this.usersResults = results.slice(0, 8);
            this.usersLoading = false;
          },
          (err) => {
            console.error('Error searching users', err);
            this.usersResults = [];
            this.usersLoading = false;
          }
        );
      } else {
        this.usersResults = [];
        this.usersShowDropdown = false;
      }
    });
  }

  ngOnDestroy(): void {
    this.usersSearchSubscription?.unsubscribe();
  }

  onUsernameInput(value: string) {
    this.username = value;
    this.usersSearchInput = value;
    this.usersSearchSubject.next(value);
  }

  onUsernameEnter() {
    if (this.usersResults && this.usersResults.length > 0) {
      this.selectUser(this.usersResults[0]);
    }
  }

  onUsernameBlur() {
    setTimeout(() => { this.usersShowDropdown = false; }, 150);
  }

  clearUserSelection() {
    this.username = '';
    this.name = '';
    this.designation = '';
    this.production = '';
    this.department = '';
    this.site = '';
    this.usersResults = [];
    this.usersShowDropdown = false;
  }

  selectUser(user: any) {
    // Support various JSON property casings returned by API
    const sam = user['samAccountName'] || user['SamAccountName'] || user['sAMAccountName'] || user['sAMaccountname'] || user['sAMAccountname'] || '';
    const displayName = user['displayName'] || user['DisplayName'] || user['displayname'] || user['displayname'] || '';
    const title = user['title'] || user['Title'] || '';
    const company = user['company'] || user['Company'] || '';
    const dept = user['department'] || user['Department'] || '';
    const site = user['site'] || user['Site'] || '';

    this.username = sam;
    this.name = displayName;
    this.designation = title;
    this.production = company;
    this.department = dept;
    this.site = site;

    this.usersResults = [];
    this.usersShowDropdown = false;
    this.usersSearchInput = sam;
  }
}
