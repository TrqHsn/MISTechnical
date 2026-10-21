import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, OnDestroy, ViewChild, computed, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject, catchError, debounceTime, distinctUntilChanged, firstValueFrom, of, switchMap, takeUntil } from 'rxjs';
import { ApiService, User } from '../../services/api';

type NotificationCategory = 'Archive Mail' | 'Mailbox';

@Component({
  selector: 'app-mail-storage-notification',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './mail-storage-notification.component.html',
  styleUrl: './mail-storage-notification.component.css'
})
export class MailStorageNotificationComponent implements OnDestroy {
  private bodyEditorElement?: ElementRef<HTMLElement>;

  @ViewChild('bodyEditor')
  set bodyEditor(element: ElementRef<HTMLElement> | undefined) {
    this.bodyEditorElement = element;
    if (element) {
      element.nativeElement.innerHTML = this.htmlBody();
    }
  }

  get bodyEditor(): ElementRef<HTMLElement> | undefined {
    return this.bodyEditorElement;
  }

  private readonly initialBodyHtml = `<div>Hi,</div>
<div><br></div>
<div><b>With regards</b></div>
<div><a href="https://teams.microsoft.com/l/chat/0/0?users=Tareque.Hasan%40dewhirst.com"><img src="/signature/teams-icon.png" width="19" height="20" alt="Microsoft Teams" style="vertical-align: middle;"></a> <b><a href="https://teams.microsoft.com/l/chat/0/0?users=Tareque.Hasan%40dewhirst.com">Tareque Hasan</a></b> | <b>Executive, MIS</b></div>
<div>🏢 Shanta Industries Limited | Plot No 198 &amp; 201/220 &amp; 223/156 &amp; 177 | DEPZ Extension Area | Ganakbari, Savar | Dhaka | Bangladesh.</div>
<div>🌐 <a href="http://www.dewhirst.com/">www.dewhirst.com</a> &nbsp;| 📧 <a href="mailto:tareque.hasan@dewhirst.com">tareque.hasan@dewhirst.com</a></div>
<div><br></div>`;

  readonly mandatoryCc = 'ridoan.zahan@dewhirst.com';
  searchInput = signal('');
  searchResults = signal<User[]>([]);
  searchLoading = signal(false);
  searchError = signal('');
  dropdownOpen = signal(false);
  selectedUser = signal<User | null>(null);
  userLoading = signal(false);
  selectedUserError = signal('');
  category = signal<NotificationCategory>('Archive Mail');
  includeManagerInCc = signal(true);
  htmlBody = signal(this.initialBodyHtml);
  bodyHasContent = signal(true);
  generating = signal(false);
  generated = signal(false);
  generationError = signal('');
  previewOpen = signal(false);

  readonly subject = computed(() =>
    this.category() === 'Archive Mail'
      ? 'Archive mailbox nearly full'
      : 'Mailbox storage nearly full'
  );

  readonly ccAddresses = computed(() => {
    const cc = [this.mandatoryCc];
    const managerEmail = this.selectedUser()?.managerEmail?.trim();
    if (
      this.includeManagerInCc() &&
      managerEmail &&
      !cc.some(address => address.toLowerCase() === managerEmail.toLowerCase())
    ) {
      cc.push(managerEmail);
    }
    return cc;
  });

  private readonly searchSubject = new Subject<string>();
  private readonly destroy$ = new Subject<void>();
  private savedEditorRange: Range | null = null;

  constructor(private readonly apiService: ApiService) {
    this.searchSubject.pipe(
      debounceTime(350),
      distinctUntilChanged(),
      switchMap(searchTerm => {
        if (searchTerm.length < 2) {
          this.searchLoading.set(false);
          return of([] as User[]);
        }
        return this.apiService.searchUsers(searchTerm).pipe(
          catchError(error => {
            this.searchError.set(this.getErrorMessage(error, 'Unable to search Active Directory.'));
            return of([] as User[]);
          })
        );
      }),
      takeUntil(this.destroy$)
    ).subscribe(users => {
      this.searchLoading.set(false);
      this.searchResults.set(users);
    });
  }

  onSearchInput(value: string): void {
    this.searchInput.set(value);
    this.dropdownOpen.set(true);
    this.searchError.set('');
    this.searchResults.set([]);
    this.searchLoading.set(value.trim().length >= 2);
    this.searchSubject.next(value.trim());
  }

  selectUser(searchResult: User): void {
    const samAccountName = searchResult.samAccountName || searchResult['sAMAccountName'];
    if (!samAccountName) {
      this.selectedUserError.set('This search result is missing its account name. Select another result.');
      return;
    }

    this.dropdownOpen.set(false);
    this.searchInput.set('');
    this.searchResults.set([]);
    this.searchError.set('');
    this.selectedUserError.set('');
    this.userLoading.set(true);
    this.selectedUser.set(null);
    this.clearGenerationState();

    this.apiService.getUserBySamAccountName(samAccountName).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: user => {
        this.selectedUser.set(user);
        this.userLoading.set(false);
      },
      error: error => {
        this.userLoading.set(false);
        this.selectedUserError.set(this.getErrorMessage(error, 'Unable to load the selected user and manager details.'));
      }
    });
  }

  setCategory(value: string): void {
    if (value === 'Archive Mail' || value === 'Mailbox') {
      this.category.set(value);
      this.generated.set(false);
    }
  }

  setEditorBody(): void {
    const editor = this.bodyEditor?.nativeElement;
    const body = editor?.innerHTML || '';
    this.htmlBody.set(body);
    this.bodyHasContent.set(!!editor?.innerText.trim());
    this.generated.set(false);
    this.generationError.set('');
  }

  format(command: string, value?: string): void {
    const editor = this.bodyEditor?.nativeElement;
    if (!editor) return;
    editor.focus();
    if (this.savedEditorRange) {
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(this.savedEditorRange);
    }
    document.execCommand(command, false, value);
    this.setEditorBody();
    this.saveEditorSelection();
  }

  insertLink(): void {
    const link = typeof window !== 'undefined'
      ? window.prompt('Enter a web or email link')
      : null;
    if (link?.trim()) {
      this.format('createLink', link.trim());
    }
  }

  async generateEml(): Promise<void> {
    const user = this.selectedUser();
    const samAccountName = user?.samAccountName || user?.['sAMAccountName'];
    if (!user || !samAccountName || !user.email || !this.bodyHasContent()) return;
    if (this.includeManagerInCc() && !user.managerEmail) return;

    this.generating.set(true);
    this.generationError.set('');
    this.generated.set(false);
    try {
      const blob = await firstValueFrom(this.apiService.generateMailStorageNotification({
        samAccountName,
        category: this.category(),
        htmlBody: this.htmlBody(),
        includeManagerInCc: this.includeManagerInCc()
      }));

      const now = new Date();
      const filename = `${samAccountName}_MailboxCleanup_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}.eml`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.generated.set(true);
    } catch (error) {
      this.generationError.set(await this.getAsyncErrorMessage(error, 'Unable to generate the EML draft.'));
    } finally {
      this.generating.set(false);
    }
  }

  closePreview(): void {
    this.previewOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  closePreviewOnEscape(): void {
    this.closePreview();
  }

  @HostListener('document:selectionchange')
  saveEditorSelection(): void {
    const editor = this.bodyEditor?.nativeElement;
    const selection = typeof window !== 'undefined' ? window.getSelection() : null;
    const anchor = selection?.anchorNode;
    if (editor && selection?.rangeCount && anchor && (anchor === editor || editor.contains(anchor))) {
      this.savedEditorRange = selection.getRangeAt(0).cloneRange();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private clearGenerationState(): void {
    this.previewOpen.set(false);
    this.generated.set(false);
    this.generationError.set('');
  }

  private getErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      const response = error.error as { message?: string; error?: string; title?: string } | null;
      return response?.message || response?.error || response?.title || error.message || fallback;
    }
    return error instanceof Error ? error.message : fallback;
  }

  private async getAsyncErrorMessage(error: unknown, fallback: string): Promise<string> {
    if (error instanceof HttpErrorResponse && error.error instanceof Blob) {
      try {
        const response = JSON.parse(await error.error.text()) as {
          message?: string;
          error?: string;
          title?: string;
        };
        return response.message || response.error || response.title || error.message || fallback;
      } catch {
        return error.message || fallback;
      }
    }
    return this.getErrorMessage(error, fallback);
  }
}