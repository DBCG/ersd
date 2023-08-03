import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { IPerson, Person } from '../../../../../libs/ersdlib/src/lib/person';
import { HttpClient } from '@angular/common/http';
import { getErrorString } from '../../../../../libs/ersdlib/src/lib/get-error-string';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { AdminEditPersonComponent } from './edit-person/edit-person.component';
import { AuthService } from '../auth.service';
import { IUploadRequest } from '../../../../../libs/ersdlib/src/lib/upload-request';
import { IEmailRequest } from '../../../../../libs/ersdlib/src/lib/email-request';
import { firstValueFrom } from 'rxjs/internal/firstValueFrom';

@Component({
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.css']
})

export class AdminComponent implements OnInit {
  public users: Person[] = [];
  public message: string;
  public messageIsError: boolean;
  public bundleFile: File;
  public bundleFileContent: string;
  public bundleUploadMessage: string;
  public emailRequest: IEmailRequest = {
    subject: '',
    message: ''
  };
  public excelFile: File = null;
  public excelFileContent: string;
  public active = 1

  @ViewChild('bundleUploadFile') bundleUploadField: ElementRef;
  @ViewChild('excelUploadFile') excelUploadField: ElementRef;

  constructor(private httpClient: HttpClient,
              private modalService: NgbModal,
              private authService: AuthService) { }

  async sendEmail() {
    if (!this.emailRequest.subject || !this.emailRequest.message) {
      return;
    }

    if (!confirm('Are you sure you want to send this email to all users?')) {
      return;
    }

    this.message = null;
    this.messageIsError = false;

    try {
      await firstValueFrom(this.httpClient.post('/api/user/email', this.emailRequest));
      this.message = 'Successfully sent email to all users';
      window.scrollTo(0, 0);
    } catch (err) {
      this.message = getErrorString(err);
      this.messageIsError = true;
      window.scrollTo(0, 0);
    }
  }

  editUser(user: IPerson) {
    const modalRef = this.modalService.open(AdminEditPersonComponent, { size: 'lg' });
    modalRef.componentInstance.id = user.id;
  }

  handleBundleFileInput(files: FileList) {
    if (files.length !== 1) {
      this.bundleFile = null;
      return;
    }

    this.bundleFile = files.item(0);

    const fileReader = new FileReader();
    fileReader.onload = () => {
      this.bundleFileContent = <string> fileReader.result;
    };
    fileReader.readAsText(this.bundleFile);
  }

  handleExcelFileInput(files: FileList) {
    if (files.length !== 1) {
      this.bundleFile = null;
      return;
    }

    this.excelFile = files.item(0);

    const fileReader = new FileReader();
    fileReader.onload = () => {
      this.excelFileContent = <string> fileReader.result;
      this.excelFileContent = this.excelFileContent.substring(this.excelFileContent.indexOf('base64,') + 7);
    };
    fileReader.readAsDataURL(this.excelFile);
  }

  async uploadExcel() {
    const request: IUploadRequest = {
      fileContent: this.excelFileContent,
      fileName: this.excelFile.name
    };
    try {
      await firstValueFrom(this.httpClient.post('/api/upload/excel', request));
      this.message = 'Successfully uploaded!';
      this.messageIsError = false;
      this.excelUploadField.nativeElement.value = '';
      this.excelFile = null;
      this.excelFileContent = null;
    } catch (err) {
      this.message = getErrorString(err);
      this.messageIsError = true;
    }
  }

 async  uploadBundle() {
    if (!this.bundleFile || !this.bundleUploadMessage) {
      return;
    }

    if (!confirm('Are you sure you want to upload the selected resource/file?')) {
      return;
    }

    this.message = null;
    this.messageIsError = false;

    if (!this.bundleFile.name.endsWith('.json') && !this.bundleFile.name.endsWith('.xml')) {
      this.message = 'Unknown file type for uploaded file ' + this.bundleFile.name;
      this.messageIsError = true;
      window.scrollTo(0, 0);
      return;
    }

    const request: IUploadRequest = {
      fileContent: this.bundleFileContent,
      fileName: this.bundleFile.name,
      message: this.bundleUploadMessage
    };

    try {
      await firstValueFrom(this.httpClient.post('/api/upload/bundle', request));
      this.message = 'Successfully uploaded!';
      this.messageIsError = false;
      this.bundleUploadField.nativeElement.value = '';
      this.bundleUploadMessage = null;
      this.bundleFile = null;
      this.bundleFileContent = null;
    } catch (err) {
      this.message = getErrorString(err);
      this.messageIsError = true;
    }
  }

  async deleteUser(user: Person) {
    const currentUserPersonId = this.authService.person ? this.authService.person.id : null;

    if (currentUserPersonId === user.id) {
      this.message = 'You cannot delete yourself!';
      this.messageIsError = true;
      window.scrollTo(0, 0);
      return;
    }

    if (!confirm(`Are you sure you want to delete the user with email ${user.email}?`)) {
      return;
    }

    try {
      await firstValueFrom(this.httpClient.delete('/api/user/' + user.id));
      const index = this.users.indexOf(user);
      if (index >= 0) {
        this.users.splice(index, 1);
      }
    } catch (err) {
      this.message = getErrorString(err);
      this.messageIsError = true;
    }
  }

  async ngOnInit() {

    try {
      const users = await firstValueFrom(this.httpClient.get<IPerson[]>('/api/user'));
      this.users = users.map((user) => new Person(user));
    } catch (err) {
      this.message = getErrorString(err);
      this.messageIsError = true;
    }
  }
}
