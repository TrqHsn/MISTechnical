import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface User {
  [key: string]: any;
}

export interface Computer {
  [key: string]: any;
}

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private apiUrl = 'http://localhost:5001/api'; // Adjust this to your .NET API URL

  constructor(private http: HttpClient) { }

  // Users API calls
  searchUsers(searchTerm: string): Observable<User[]> {
    return this.http.get<User[]>(`${this.apiUrl}/users/search?searchTerm=${encodeURIComponent(searchTerm)}`);
  }

  getUserBySamAccountName(samAccountName: string): Observable<User> {
    return this.http.get<User>(`${this.apiUrl}/users/${encodeURIComponent(samAccountName)}`);
  }

  // Computers API calls
  searchComputers(searchTerm: string): Observable<Computer[]> {
    return this.http.get<Computer[]>(`${this.apiUrl}/computers/search?searchTerm=${encodeURIComponent(searchTerm)}`);
  }

  getComputerByName(computerName: string): Observable<Computer> {
    return this.http.get<Computer>(`${this.apiUrl}/computers/${encodeURIComponent(computerName)}`);
  }

  updateComputerDescription(computerName: string, description: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/computers/${encodeURIComponent(computerName)}/description`, JSON.stringify(description), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Devices API calls
  getLastDevices(): Observable<{ [key: string]: number }> {
    return this.http.get<{ [key: string]: number }>(`${this.apiUrl}/devices/last`);
  }

  // Unlock all locked AD user accounts
  unlockAllUsers(): Observable<{ unlocked: string[]; failed: { samAccountName: string; reason: string }[] }> {
    return this.http.post<{ unlocked: string[]; failed: { samAccountName: string; reason: string }[] }>(`${this.apiUrl}/users/unlock-all`, null);
  }
}
