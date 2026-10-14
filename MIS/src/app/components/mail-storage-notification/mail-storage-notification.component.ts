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

  private readonly initialBodyHtml = `<p>Hi,</p><p><br></p>
<table width="400" style="border-collapse: collapse; font-family: Calibri, sans-serif;">
  <tr>
    <td style="padding: 5px 0 10px 0;">
      <span style="font-size: 28px; color: #C00000;">ᝰ✍🏻</span>
      <b style="color: #C00000; font-size: 13px;">Regards,</b>
      <br>
      <b style="font-family: 'Courier New'; font-size: 24px; color: #007177;">Tareque Hasan</b>
    </td>
  </tr>
  <tr>
    <td style="background-color: #EAEAEA; padding: 5px;">
      <table width="100%" style="border-collapse: collapse;">
        <tr>
          <td style="font-family: 'Courier New'; font-size: 18px; color: #444;">
            <b>Executive || MIS</b>
          </td>
          <td align="right">
            <a href="https://teams.microsoft.com/l/chat/0/0?users=tareque.hasan@dewhirst.com"
               style="text-decoration: none; font-family: 'Courier New'; font-size: 14px; color: #444;">💬 | Chat</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding-top: 10px; font-size: 12px; font-family: 'Courier New'; color: #828282;">
      email:
      <a href="mailto:tareque.hasan@dewhirst.com" style="color: #467886;">tareque.hasan@dewhirst.com</a>
      <br>
      Shanta Denims Limited, Savar, Dhaka 1349, Bangladesh
    </td>
  </tr>
</table>`;

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
  htmlBody = signal('');
  bodyHasContent = signal(false);
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
    this.resetComposition();

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

  startNextUser(): void {
    this.previewOpen.set(false);
    this.selectedUser.set(null);
    this.searchInput.set('');
    this.searchResults.set([]);
    this.searchError.set('');
    this.selectedUserError.set('');
    this.dropdownOpen.set(false);
    this.userLoading.set(false);
    this.resetComposition();
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

  private resetComposition(): void {
    this.previewOpen.set(false);
    this.category.set('Archive Mail');
    this.includeManagerInCc.set(true);
    this.htmlBody.set(this.initialBodyHtml);
    this.bodyHasContent.set(true);
    this.generated.set(false);
    this.generating.set(false);
    this.generationError.set('');
    this.savedEditorRange = null;
    if (this.bodyEditor) this.bodyEditor.nativeElement.innerHTML = this.initialBodyHtml;
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
