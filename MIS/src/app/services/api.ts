import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface User {
  [key: string]: any;
}

export interface Computer {
  [key: string]: any;
}

export interface SmbItem {
  name: string;
  fullPath: string;
  isDirectory: boolean;
  size: number | null;
  lastModified: string;
  extension: string;
  isHidden: boolean;
  isSystem: boolean;
  type: string;
}

export interface SmbBrowseResponse {
  path: string;
  items: SmbItem[];
}

// Dynamically determine API base URL from current hostname
const getApiBaseUrl = (): string => {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    return `http://${hostname}:5001/api`;
  }
  return 'http://localhost:5001/api';
};

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private apiUrl = getApiBaseUrl();

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

  // Update user attributes by userPrincipalName (UPN)
  updateUserAttributes(userPrincipalName: string, payload: { department?: string; title?: string; manager?: string }): Observable<any> {
    return this.http.put(`${this.apiUrl}/users/${encodeURIComponent(userPrincipalName)}/attributes`, payload);
  }

  browseSmb(path: string): Observable<SmbBrowseResponse> {
    return this.http.get<SmbBrowseResponse>(`${this.apiUrl}/smb/browse?path=${encodeURIComponent(path)}`);
  }

  getSmbFileDownloadUrl(path: string): string {
    return `${this.apiUrl}/smb/download/file?path=${encodeURIComponent(path)}`;
  }

  getSmbFolderDownloadUrl(path: string): string {
    return `${this.apiUrl}/smb/download/folder?path=${encodeURIComponent(path)}`;
  }
}
