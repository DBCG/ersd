import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../auth.service';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '../config.service';




interface PayloadDownload {
  url: string;
}

@Component({
  selector: 'change-preview',
  templateUrl: './change-preview.component.html',
  styleUrls: ['./change-preview.component.css']
})
export class ChangePreviewComponent implements OnInit {
  @ViewChild('modalAcknowledgement') modalAcknowledgement: ElementRef;
  request: any = {}
  version = 'ersdv2-draft'
  bundleType = ''
  contentType = 'json'
  markdownContentV2: string = '';
  markdownContentV3: string = '';
  draftVersion : string = '';
  isDisabled: boolean = true;
  checkboxChecked: boolean = false;
  filesExist: boolean = false;
  loading: boolean = true;



  constructor(
    private httpClient: HttpClient,
    public authService: AuthService,
    public configService: ConfigService
  ) { }

  ngOnInit() {
    this.fetchMarkdown();
  }  

  setVersion(e) { 
    this.version = e.target.value 
  } // eRSD (eCR) V1 or V2



  async fetchMarkdown() {
    try {
      const data: any = await firstValueFrom(this.httpClient.get('/api/ersd/markdown'));
  
      const file1Exists = data.markdownFile1 !== null && data.markdownFile1 !== undefined;
      const file2Exists = data.markdownFile2 !== null && data.markdownFile2 !== undefined;
  
      this.filesExist = file1Exists || file2Exists;
  
      if (file1Exists) {
        this.markdownContentV2 = data.markdownFile1;
      }
  
      if (file2Exists) {
        this.markdownContentV3 = data.markdownFile2;
      }
    } catch (error) {
      console.error('Error fetching Markdown:', error);
      // Handle error if needed
    }
    finally {
      this.loading = false;
    }
  }
  

  
  fetchMarkdownx() {
   
    this.httpClient.get('/api/ersd/markdown')
      .subscribe((data: any) => {
        this.markdownContentV2 = data?.markdownFile1;
        this.markdownContentV3 = data?.markdownFile2;  

      }, (error: any) => {
        console.error('Error fetching Markdown:', error);
        // Handle error if needed
      });
  }

  ngAfterViewInit() {
    this.modalAcknowledgement.nativeElement.addEventListener('hidden.bs.modal', () => {
      this.resetIsDisabled();
    });
  }

  async getReleasePreview(e) {
    const button = e.target as HTMLButtonElement;
    this.draftVersion = `${this.version}-${button.name}`;
  
    const urls = {
      'ersdv2-draft-json': 'api/download/change-preview-json',
      'ersdv2-draft-xml': 'api/download/change-preview-xml',
      'ersdv3-draft-json': 'api/download/change-preview-json',
      'ersdv3-draft-xml': 'api/download/change-preview-xml',
      // Add more versions here if needed
    };
  
    const url = `${urls[this.draftVersion]}?version=${this.version}`;

    if (!url) {
      console.error('Invalid draft version:', this.draftVersion);
      return;
    }
  
    try {
      const data = await firstValueFrom(this.httpClient.post(url, this.request)) as PayloadDownload;
      const modal = this.modalAcknowledgement.nativeElement;
      
      modal.classList.remove('show');

      document.body.classList.remove('modal-open');
      
      document.querySelector('.modal-backdrop').remove();

      modal.setAttribute('aria-hidden', 'true');
      await this.downloadS3(data);

      
    } catch (err) {
      console.error(err);
    }
  }
  

  async downloadS3(data: PayloadDownload) {
    var a = document.createElement('a');
    a.href = data.url;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.parentNode.removeChild(a);
  }


  async setAcknowledgement(event: Event) {
    this.checkboxChecked = (event.target as HTMLInputElement).checked;
    this.isDisabled = !this.checkboxChecked;
  }

  // Function to reset isDisabled when the modal is hidden
  resetIsDisabled() {
    this.isDisabled = true;
    // Access the checkbox element and uncheck it
    const checkboxElement = document.getElementById('checkboxAgreement') as HTMLInputElement;
    if (checkboxElement) {
      checkboxElement.checked = false;
      this.checkboxChecked = false;
    }
  }


}
